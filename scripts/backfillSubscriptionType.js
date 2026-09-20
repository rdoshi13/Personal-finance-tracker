require('dotenv').config();
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const { SUBSCRIPTION_CATEGORIES } = require('../lib/transactionImport');

/**
 * Retypes outflows already sitting in a subscription category from 'expense' to
 * 'subscription', so history matches what the importer now produces.
 *
 * Safe on the numbers: OUTFLOW_TYPES buckets 'expense' and 'subscription'
 * identically, so no total, quest, budget or chart figure changes. Only the
 * Subscriptions view reads the distinction.
 *
 * Idempotent -- rows already typed 'subscription' are not matched. Pass --dry to
 * see what would change without writing.
 */
const run = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not configured');
    }

    const dryRun = process.argv.includes('--dry');

    await mongoose.connect(process.env.MONGO_URI);

    const filter = { type: 'expense', category: { $in: SUBSCRIPTION_CATEGORIES } };
    const candidates = await Transaction.find(filter).select('name category amount date').lean();

    if (candidates.length === 0) {
        console.log('No expense rows in a subscription category. Nothing to do.');
        await mongoose.disconnect();
        return;
    }

    console.log(`${candidates.length} row(s) to retype as 'subscription':`);
    candidates.forEach((t) => {
        console.log(
            `  ${new Date(t.date).toISOString().slice(0, 10)}  ${String(t.category).padEnd(14)}` +
            `  ${String(t.name).slice(0, 34).padEnd(36)} $${t.amount}`
        );
    });

    if (dryRun) {
        console.log('\n--dry: nothing written.');
        await mongoose.disconnect();
        return;
    }

    const result = await Transaction.updateMany(filter, { $set: { type: 'subscription' } });
    console.log(`\nRetyped ${result.modifiedCount} transaction(s).`);
    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error('Backfill failed:', error.message);
    try {
        await mongoose.disconnect();
    } catch (disconnectError) {
        console.error('Disconnect failed:', disconnectError.message);
    }
    process.exit(1);
});
