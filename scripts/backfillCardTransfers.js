require('dotenv').config();
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const { buildImportHash, cleanChaseTransactionName } = require('../lib/transactionImport');

/**
 * Retypes credit card payments already in the database as 'transfer', so history
 * matches what the importer now produces. Paying the card from checking is not
 * spending -- the card purchases are -- so until this runs, every card payment is
 * counted twice.
 *
 * Matches outflows in the 'Credit Card Payment' category, plus manual payments
 * ("07/20 Payment To Chase Card Ending IN 1301") that the importer used to file
 * under Misc with the date in the name. Those are also renamed to what the
 * importer now produces, 'Chase Card Payment'.
 *
 * Renaming has a trap: buildImportHash() includes the name, so a renamed row
 * would no longer match its own statement line, and re-importing that statement
 * would duplicate it. So the hash is recomputed too -- but only when the stored
 * hash is exactly what the old fields produce, which proves the row came from an
 * import and has not been edited since. Anything else is reported, not guessed at.
 *
 * Changes totals on purpose: these rows leave expense and every aggregate built on
 * it. Idempotent -- rows already typed 'transfer' are not matched. Pass --dry to
 * see what would change without writing.
 */
const MANUAL_PAYMENT = /Payment To Chase Card Ending IN \d{4}/i;

/** What one row becomes. Pure, so the hash rule is testable without a database. */
const planRow = (t) => {
    const renamed = MANUAL_PAYMENT.test(t.description || '')
        ? cleanChaseTransactionName(t.description)
        : t.name;
    const update = { type: 'transfer', category: 'Credit Card Payment', name: renamed };
    let note = '';

    if (renamed !== t.name && t.importHash) {
        const fields = { date: t.date, amount: t.amount, sourceAccount: t.sourceAccount };
        if (buildImportHash({ ...fields, name: t.name }) === t.importHash) {
            update.importHash = buildImportHash({ ...fields, name: renamed });
            note = 'hash recomputed';
        } else {
            note = 'hash left alone: edited since import, re-importing its statement may duplicate it';
        }
    }

    return { t, update, note };
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

    const plan = candidates.map(planRow);

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

    let updated = 0;
    for (const { t, update } of plan) {
        try {
            // Guarded on the type so a concurrent edit is not overwritten.
            const result = await Transaction.updateOne({ _id: t._id, type: 'expense' }, { $set: update });
            updated += result.modifiedCount;
        } catch (error) {
            if (error?.code !== 11000) throw error;
            console.log(`  skipped ${t._id}: its new import hash already belongs to another row`);
        }
    }

    console.log(`\nRetyped ${updated} transaction(s).`);
    await mongoose.disconnect();
};

module.exports = { planRow };

// Required by the tests for planRow; only run when invoked directly.
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
