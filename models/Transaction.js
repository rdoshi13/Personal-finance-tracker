// models/Transaction.js
const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
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

TransactionSchema.index({ userId: 1, date: -1 });
TransactionSchema.index(
    { userId: 1, importHash: 1 },
    {
        unique: true,
        partialFilterExpression: { importHash: { $exists: true, $type: 'string', $ne: '' } },
    }
);

module.exports = mongoose.model('Transaction', TransactionSchema);
