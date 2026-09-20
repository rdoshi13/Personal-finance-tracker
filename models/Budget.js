const mongoose = require('mongoose');

const BudgetSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            // No standalone index here: userId is the leading key of the compound
            // index below, and MongoDB uses an index prefix for queries on userId alone.
        },
        category: {
            type: String,
            required: true,
            trim: true,
        },
        monthlyLimit: {
            type: Number,
            required: true,
            min: 0,
        },
    },
    {
        timestamps: true,
    }
);

// A category has at most one cap per user. Absence of a document means "no cap",
// which the UI renders as relative spend rather than spend-against-budget.
BudgetSchema.index({ userId: 1, category: 1 }, { unique: true });

module.exports = mongoose.model('Budget', BudgetSchema);
