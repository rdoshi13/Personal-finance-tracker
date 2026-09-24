const mongoose = require('mongoose');

/**
 * One credit card statement's own figures, as the issuer printed them. The Cards
 * view reads balance, due date and interest from here rather than summing
 * transactions: history before the first imported statement is missing, so a
 * balance derived from rows would start from zero and be wrong.
 *
 * Money follows the Transaction convention of plain 2dp Numbers, except that
 * these keep the statement's signs -- `payments` is negative, as printed -- so
 * previousBalance + payments + purchases + cashAdvances + balanceTransfers + fees
 * + interest = newBalance. The import route refuses a statement where it does not.
 */
const money = { type: Number, required: true };

const CardStatementSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            // No standalone index here: userId is the leading key of the compound
            // index below, and MongoDB uses an index prefix for queries on userId alone.
        },
        issuer: { type: String, required: true, trim: true },
        productName: { type: String, trim: true },
        last4: { type: String, required: true, match: /^\d{4}$/ },
        // The same string the statement's transactions carry, e.g. 'Chase ••1301'.
        sourceAccount: { type: String, required: true, trim: true },
        openingDate: { type: Date, required: true },
        closingDate: { type: Date, required: true },
        dueDate: { type: Date },
        previousBalance: money,
        payments: money,
        purchases: money,
        cashAdvances: money,
        balanceTransfers: money,
        fees: money,
        interest: money,
        newBalance: money,
        minimumPayment: { type: Number },
        creditLimit: { type: Number },
        purchaseApr: { type: Number },
    },
    {
        timestamps: true,
    }
);

// One snapshot per statement. Re-importing the same PDF upserts onto it.
// Note: run `npm run indexes:reconcile` against each environment after deploy --
// autoIndex does not reliably complete on Vercel.
CardStatementSchema.index({ userId: 1, last4: 1, closingDate: -1 }, { unique: true });

module.exports = mongoose.model('CardStatement', CardStatementSchema);
