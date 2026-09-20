const mongoose = require('mongoose');

/**
 * Per-user overrides for subscriptions, which are otherwise derived from
 * transaction history rather than stored. Today that is only "I cancelled this",
 * which cannot be inferred: a subscription with no recent charge looks identical
 * whether it lapsed or was deliberately ended.
 *
 * `key` is the normalised subscription name produced by the client's
 * detectSubscriptions, not a transaction id -- the override has to survive the
 * individual charges it was derived from being edited or deleted.
 */
const SubscriptionStateSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        key: {
            type: String,
            required: true,
            trim: true,
        },
        cancelledAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// One override per subscription per user. Absence means "not cancelled".
SubscriptionStateSchema.index({ userId: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('SubscriptionState', SubscriptionStateSchema);
