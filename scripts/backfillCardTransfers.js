require('dotenv').config();
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const ImportBatch = require('../models/ImportBatch');
const { buildImportHash, cleanChaseTransactionName } = require('../lib/transactionImport');

/**
 * Retypes credit card payments already in the database as 'transfer', so history
 * matches what the importer now produces. Paying the card from checking is not
 * spending -- the card purchases are -- so until this runs, every card payment is
 * counted twice.
 *
 * Matches outflows in the 'Credit Card Payment' category, plus manual payments
 * ("07/20 Payment To Chase Card Ending IN 1301") that the importer used to file
 * under Misc with the date in the name.
 *
 * Renaming has a trap: buildImportHash() includes the name, so the stored hash has
 * to stay equal to what re-importing the same file would now produce, or that
 * re-import duplicates the row. Two consequences:
 *
 * - only rows imported from a PDF are renamed to 'Chase Card Payment', because only
 *   the PDF path cleans names. The CSV path keeps the raw text as the name, now and
 *   before, so a CSV row keeps its name and its hash. The source is read from the
 *   row's ImportBatch filename; when that is unknown the name is left and reported;
 * - a PDF row is renamed, and its hash recomputed, only when the stored hash is
 *   exactly what the old fields produce -- proof the name is the importer's, not
 *   one the user typed. An edited row keeps its name and is reported.
 *
 * If a statement was re-imported after the importer changed but before this ran,
 * the renamed hash already belongs to the newer row. The retype still happens --
 * the old row must stop counting as spending -- and the pair is reported as a
 * duplicate to delete.
 *
 * Changes totals on purpose: these rows leave expense and every aggregate built on
 * it. Idempotent -- rows already typed 'transfer' are not matched. Pass --dry to
 * see what would change without writing.
 */
const MANUAL_PAYMENT = /Payment To Chase Card Ending IN \d{4}/i;

/**
 * What one row becomes. Pure, so the rename and hash rules are testable without a
 * database. `source` is the import file's kind: 'pdf', 'csv', or null if unknown.
 */
const planRow = (t, source = null) => {
    const update = { type: 'transfer', category: 'Credit Card Payment', name: t.name };
    const isManualPayment = MANUAL_PAYMENT.test(t.description || '');
    if (!isManualPayment) return { t, update, note: '' };

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

const sourceOf = (filename) => {
    const name = String(filename || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.csv')) return 'csv';
    return null;
};

/**
 * Writes one planned row. Returns 'updated', 'duplicate' (retyped, but the renamed
 * hash belongs to another row), or 'unchanged' (no longer an expense -- edited
 * concurrently). Exported for the integration tests.
 */
const applyRow = async ({ t, update }) => {
    // Guarded on the type so a concurrent edit is not overwritten.
    const filter = { _id: t._id, type: 'expense' };

    try {
        const result = await Transaction.updateOne(filter, { $set: update });
        return result.modifiedCount ? 'updated' : 'unchanged';
    } catch (error) {
        if (error?.code !== 11000) throw error;
    }

    const result = await Transaction.updateOne(filter, {
        $set: { type: update.type, category: update.category },
    });
    return result.modifiedCount ? 'duplicate' : 'unchanged';
};

const run = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not configured');
    }

    const dryRun = process.argv.includes('--dry');

    await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });

    const candidates = await Transaction.find({
        type: 'expense',
        $or: [
            { category: 'Credit Card Payment' },
            { description: { $regex: MANUAL_PAYMENT.source, $options: 'i' } },
        ],
    }).sort({ date: 1 }).lean();

    if (candidates.length === 0) {
        console.log('No card payments typed as expense. Nothing to do.');
        await mongoose.disconnect();
        return;
    }

    const batchIds = [...new Set(candidates.map((t) => t.importBatchId).filter(Boolean).map(String))];
    const batches = await ImportBatch.find({ _id: { $in: batchIds } }).select('filename').lean();
    const filenameOf = new Map(batches.map((b) => [String(b._id), b.filename]));
    const plan = candidates.map((t) => planRow(t, sourceOf(filenameOf.get(String(t.importBatchId)))));

    const total = plan.reduce((sum, { t }) => sum + Math.round(t.amount * 100), 0) / 100;
    console.log(`${plan.length} row(s) to retype as 'transfer' ($${total.toFixed(2)} leaves spending):`);
    plan.forEach(({ t, update, note }) => {
        const rename = update.name !== t.name ? `  -> ${update.name}` : '';
        console.log(
            `  ${new Date(t.date).toISOString().slice(0, 10)}  $${String(t.amount).padEnd(8)}` +
            `  ${String(t.name).slice(0, 44)}${rename}${note ? `  [${note}]` : ''}`
        );
    });

    if (dryRun) {
        console.log('\n--dry: nothing written.');
        await mongoose.disconnect();
        return;
    }

    let retyped = 0;
    for (const entry of plan) {
        const outcome = await applyRow(entry);
        if (outcome !== 'unchanged') retyped += 1;
        if (outcome === 'duplicate') {
            const other = await Transaction.findOne({ userId: entry.t.userId, importHash: entry.update.importHash })
                .select('_id').lean();
            console.log(
                `  duplicate: ${entry.t._id} was retyped but kept its name; ${other?._id} is the same` +
                ' payment from a later re-import. Delete one of them.'
            );
        }
        if (outcome === 'unchanged') console.log(`  skipped ${entry.t._id}: no longer an expense`);
    }

    console.log(`\nRetyped ${retyped} transaction(s).`);
    await mongoose.disconnect();
};

module.exports = { applyRow, planRow, sourceOf };

// Required by the tests; only run when invoked directly.
if (require.main === module) {
    run().catch(async (error) => {
        console.error('Backfill failed:', error.message);
        try {
            await mongoose.disconnect();
        } catch (disconnectError) {
            console.error('Disconnect failed:', disconnectError.message);
        }
        process.exit(1);
    });
}
