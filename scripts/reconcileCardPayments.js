require('dotenv').config();
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const ImportBatch = require('../models/ImportBatch');
const { buildImportHash, cleanChaseTransactionName } = require('../lib/transactionImport');
const { matchCardPayments, pairCardPayments } = require('../lib/transferMatch');

/**
 * Brings stored card payments in line with the rule in lib/transferMatch.js: a
 * checking-side card payment is an expense until it is paired with its card
 * statement's own payment row, and a transfer only while paired. Replaces
 * backfill:card-transfers, which made every card payment a transfer outright and
 * so dropped the card spending of every month without an imported statement.
 *
 * Three steps, each idempotent:
 *
 * 1. Card payments from checking get the 'Credit Card Payment' category, and
 *    manual ones ("07/20 Payment To Chase Card Ending IN 1301", once filed under
 *    Misc with the date in the name) get the name the importer now gives them,
 *    'Chase Card Payment'. Renaming has a trap: buildImportHash() includes the
 *    name, and the stored hash must stay what re-importing the same file produces,
 *    or that re-import duplicates the row. So:
 *    - only PDF-imported rows are renamed, because only the PDF path cleans names;
 *      the source is read from the row's ImportBatch filename;
 *    - a PDF row is renamed, and rehashed, only when its stored hash proves the
 *      name is still the importer's. An edited row keeps the user's name;
 *    - if the renamed hash already belongs to a newer re-import of the same line,
 *      only the category is set, and the pair is reported as a duplicate.
 * 2. Checking-side card payments typed 'transfer' with no partner become expenses
 *    again. That undoes backfill:card-transfers where it was run.
 * 3. The matcher runs for every affected user, pairing what can be paired and
 *    making those debits transfers.
 *
 * Pass --dry to see the plan without writing.
 */
const CARD_PAYMENT = 'Credit Card Payment';
const MANUAL_PAYMENT = /Payment To Chase Card Ending IN \d{4}/i;
const ANY_CARD_PAYMENT = /Payment To Chase Card Ending IN \d{4}|Chase Credit Crd Autopay/i;

/**
 * What step 1 does to one row. Pure, so the rename and hash rules are testable
 * without a database. `source` is the import file's kind: 'pdf', 'csv' or null.
 */
const planRow = (t, source = null) => {
    const update = { category: CARD_PAYMENT, name: t.name };
    if (!MANUAL_PAYMENT.test(t.description || '')) return { t, update, note: '' };

    if (source !== 'pdf') {
        const note = source === null && t.importBatchId
            ? 'name kept: import file unknown, so a rename could not be matched to a re-import'
            : '';
        return { t, update, note };
    }

    const renamed = cleanChaseTransactionName(t.description);
    if (renamed === t.name) return { t, update, note: '' };

    // Rename only a name the importer wrote. An edited row keeps the user's name.
    const fields = { date: t.date, amount: t.amount, sourceAccount: t.sourceAccount };
    if (!t.importHash || buildImportHash({ ...fields, name: t.name }) !== t.importHash) {
        return { t, update, note: 'name kept: edited since import' };
    }

    return {
        t,
        update: { ...update, name: renamed, importHash: buildImportHash({ ...fields, name: renamed }) },
        note: 'renamed, hash recomputed',
    };
};

const isNoOp = ({ t, update }) => t.category === update.category && t.name === update.name && !update.importHash;

const sourceOf = (filename) => {
    const name = String(filename || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.csv')) return 'csv';
    return null;
};

/**
 * Writes one planned row. Returns 'updated', 'duplicate' (category set, but the
 * renamed hash belongs to another row), or 'unchanged' (edited concurrently).
 * Exported for the integration tests.
 */
const applyRow = async ({ t, update }) => {
    // Guarded on the name so a concurrent edit is not overwritten.
    const filter = { _id: t._id, name: t.name };

    try {
        const result = await Transaction.updateOne(filter, { $set: update });
        return result.modifiedCount ? 'updated' : 'unchanged';
    } catch (error) {
        if (error?.code !== 11000) throw error;
    }

    const result = await Transaction.updateOne(filter, { $set: { category: update.category } });
    return result.modifiedCount ? 'duplicate' : 'unchanged';
};

const day = (date) => new Date(date).toISOString().slice(0, 10);

const run = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not configured');
    }

    const dryRun = process.argv.includes('--dry');
    await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });

    // --- 1. categorise and rename ---------------------------------------------
    const candidates = await Transaction.find({
        type: { $in: ['expense', 'transfer'] },
        accountType: { $ne: 'credit_card' },
        description: { $regex: ANY_CARD_PAYMENT.source, $options: 'i' },
    }).sort({ date: 1 }).lean();

    const batchIds = [...new Set(candidates.map((t) => t.importBatchId).filter(Boolean).map(String))];
    const batches = await ImportBatch.find({ _id: { $in: batchIds } }).select('filename').lean();
    const filenameOf = new Map(batches.map((b) => [String(b._id), b.filename]));
    const plan = candidates
        .map((t) => planRow(t, sourceOf(filenameOf.get(String(t.importBatchId)))))
        .filter((entry) => !isNoOp(entry) || entry.note);

    console.log(`1. ${plan.length} card payment(s) from checking to categorise or rename:`);
    plan.forEach(({ t, update, note }) => {
        const rename = update.name !== t.name ? `  -> ${update.name}` : '';
        console.log(`   ${day(t.date)}  $${String(t.amount).padEnd(8)}  ${String(t.name).slice(0, 44)}${rename}${note ? `  [${note}]` : ''}`);
    });

    // --- 2. unpaired transfers back to expenses --------------------------------
    const orphanFilter = {
        category: CARD_PAYMENT,
        type: 'transfer',
        accountType: { $ne: 'credit_card' },
        linkedTransactionId: { $exists: false },
    };
    const orphans = await Transaction.find(orphanFilter).sort({ date: 1 }).lean();
    console.log(`2. ${orphans.length} unpaired card payment(s) typed transfer, back to expense:`);
    orphans.forEach((t) => console.log(`   ${day(t.date)}  $${String(t.amount).padEnd(8)}  ${t.name}`));

    // --- 3. what the matcher can pair once 1 and 2 are applied ------------------
    const planned = new Map(plan.map(({ t, update }) => [String(t._id), { ...t, ...update }]));
    const users = [...new Set([...candidates, ...orphans].map((t) => String(t.userId)))];
    const cardRows = await Transaction.find({
        userId: { $in: users }, accountType: 'credit_card', type: 'transfer', category: CARD_PAYMENT,
        linkedTransactionId: { $exists: false },
    }).lean();
    const bankRows = [...candidates, ...orphans]
        .map((t) => planned.get(String(t._id)) || t)
        .filter((t) => t.category === CARD_PAYMENT && !t.linkedTransactionId);
    const pairable = users.reduce((count, user) => count + pairCardPayments(
        cardRows.filter((t) => String(t.userId) === user),
        bankRows.filter((t) => String(t.userId) === user)
    ).length, 0);
    console.log(`3. The matcher can then pair ${pairable} payment(s), making those checking debits transfers.`);

    if (dryRun) {
        console.log('\n--dry: nothing written.');
        await mongoose.disconnect();
        return;
    }

    let updated = 0;
    for (const entry of plan) {
        const outcome = await applyRow(entry);
        if (outcome !== 'unchanged') updated += 1;
        if (outcome === 'duplicate') {
            const other = await Transaction.findOne({ userId: entry.t.userId, importHash: entry.update.importHash })
                .select('_id').lean();
            console.log(
                `  duplicate: ${entry.t._id} was categorised but kept its name; ${other?._id} is the same` +
                ' payment from a later re-import. Delete one of them.'
            );
        }
        if (outcome === 'unchanged') console.log(`  skipped ${entry.t._id}: edited while this ran`);
    }
    const reverted = await Transaction.updateMany(orphanFilter, { $set: { type: 'expense' } });

    let paired = 0;
    for (const user of users) paired += await matchCardPayments(new mongoose.Types.ObjectId(user));

    console.log(`\nCategorised ${updated}, reverted ${reverted.modifiedCount} to expense, paired ${paired}.`);
    await mongoose.disconnect();
};

module.exports = { applyRow, planRow, sourceOf };

// Required by the tests; only run when invoked directly.
if (require.main === module) {
    run().catch(async (error) => {
        console.error('Reconcile failed:', error.message);
        try {
            await mongoose.disconnect();
        } catch (disconnectError) {
            console.error('Disconnect failed:', disconnectError.message);
        }
        process.exit(1);
    });
}
