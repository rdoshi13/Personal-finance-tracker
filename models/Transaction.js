// models/Transaction.js
const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        // No standalone index here: userId is the leading key of the compound
        // index below, and MongoDB uses an index prefix for queries on userId alone.
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    type: {
        type: String,
        required: true,
        enum: ['income', 'expense', 'subscription'], // restricts to these types
    },
    category: {
        type: String,
        required: true,
        default: 'Uncategorized',
        trim: true,
    },
    amount: {
        type: Number,
        required: true,
        // Amounts are stored as magnitudes, with direction carried by `type`. Every
        // aggregate in the app relies on that -- summarize(), the /summary pipeline,
        // quests, budgets and the charts all add amounts and subtract by type. A
        // negative amount would silently invert its own contribution to all of them,
        // so it is rejected here rather than in each caller.
        min: [0.01, 'Amount must be greater than zero'],
        max: [1e12, 'Amount is out of range'],
    },
    date: {
        type: Date,
        required: true,
        default: Date.now,
    },
    description: {
        type: String,
    },
    importHash: {
        type: String,
        trim: true,
    },
    importBatchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ImportBatch',
    },
    sourceAccount: {
        type: String,
        trim: true,
    },
});

// Keyset pagination sorts on (date desc, _id desc); without _id in the index Mongo
// falls back to a blocking in-memory sort, which has a 32MB ceiling.
// Note: changing this does not change the database. Run `npm run indexes:reconcile`
// against each environment -- autoIndex does not reliably complete on Vercel.
TransactionSchema.index({ userId: 1, date: -1, _id: -1 });
TransactionSchema.index(
    { userId: 1, importHash: 1 },
    {
        unique: true,
        // markDuplicateRows() in transactionRoutes already skips hashes it finds,
        // so this index is the backstop for the gap between that read and the
        // insert -- two concurrent imports of one file otherwise both pass it.
        // $gt: '' rather than $ne: '' -- MongoDB rejects $ne in a partial filter
        // ($ne desugars to $not, which is unsupported), so the declaration
        // silently failed to create and the backstop was never actually there.
        // For strings '' is the minimum, so $gt: '' means non-empty.
        partialFilterExpression: { importHash: { $exists: true, $type: 'string', $gt: '' } },
    }
);

module.exports = mongoose.model('Transaction', TransactionSchema);
