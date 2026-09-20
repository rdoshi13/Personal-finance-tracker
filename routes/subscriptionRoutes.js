const express = require('express');
const SubscriptionState = require('../models/SubscriptionState');

const router = express.Router();

const MAX_KEY_LENGTH = 200;

// Subscriptions themselves are derived client-side from transaction history. Only
// the cancellation override is stored, because it is the one thing history cannot
// tell you: a lapsed subscription and a cancelled one look the same.
router.get('/', async (req, res) => {
    try {
        const states = await SubscriptionState.find({ userId: req.user.id })
            .select('key cancelledAt')
            .lean();

        return res.status(200).json({
            cancelled: states.map((state) => ({
                key: state.key,
                cancelledAt: state.cancelledAt,
            })),
        });
    } catch (error) {
        console.error('Failed to load subscription states:', error);
        return res.status(500).json({ message: 'Failed to load subscription states' });
    }
});

// Upsert or clear one override. `cancelled: false` removes the document, so
// absence consistently means "not cancelled" rather than there being two ways to
// say the same thing.
router.put('/', async (req, res) => {
    try {
        const key = String(req.body?.key || '').trim();

        if (!key) {
            return res.status(400).json({ message: 'Subscription key is required' });
        }

        if (key.length > MAX_KEY_LENGTH) {
            return res.status(400).json({ message: 'Subscription key is too long' });
        }

        if (req.body?.cancelled === false) {
            await SubscriptionState.deleteOne({ userId: req.user.id, key });
            return res.status(200).json({ key, cancelled: false });
        }

        const state = await SubscriptionState.findOneAndUpdate(
            { userId: req.user.id, key },
            { $setOnInsert: { cancelledAt: new Date() } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        return res.status(200).json({
            key: state.key,
            cancelled: true,
            cancelledAt: state.cancelledAt,
        });
    } catch (error) {
        if (error?.code === 11000) {
            // Raced with another write of the same key; the end state is what was asked for.
            return res.status(200).json({ key: String(req.body?.key || '').trim(), cancelled: true });
        }

        console.error('Failed to save subscription state:', error);
        return res.status(500).json({ message: 'Failed to save subscription state' });
    }
});

module.exports = router;
