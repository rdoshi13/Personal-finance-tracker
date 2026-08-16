const express = require('express');
const Budget = require('../models/Budget');

const router = express.Router();

const sanitize = (budget) => ({
    category: budget.category,
    monthlyLimit: budget.monthlyLimit,
});

router.get('/', async (req, res) => {
    try {
        const budgets = await Budget.find({ userId: req.user.id }).sort({ category: 1 }).lean();
        return res.status(200).json({ budgets: budgets.map(sanitize) });
    } catch (error) {
        console.error('Failed to load budgets:', error);
        return res.status(500).json({ message: 'Failed to load budgets' });
    }
});

// Upsert a single cap. A limit of 0 (or null) removes it, which the UI renders as
// "no cap" rather than "cap of zero".
router.put('/', async (req, res) => {
    try {
        const category = String(req.body?.category || '').trim();
        const rawLimit = req.body?.monthlyLimit;

        if (!category) {
            return res.status(400).json({ message: 'Category is required' });
        }

        if (rawLimit === null || rawLimit === '' || Number(rawLimit) === 0) {
            await Budget.deleteOne({ userId: req.user.id, category });
            return res.status(200).json({ category, monthlyLimit: 0, removed: true });
        }

        const monthlyLimit = Number(rawLimit);
        if (!Number.isFinite(monthlyLimit) || monthlyLimit < 0) {
            return res.status(400).json({ message: 'Monthly limit must be a positive number' });
        }

        const budget = await Budget.findOneAndUpdate(
            { userId: req.user.id, category },
            { $set: { monthlyLimit } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        return res.status(200).json(sanitize(budget));
    } catch (error) {
        console.error('Failed to save budget:', error);
        return res.status(500).json({ message: 'Failed to save budget' });
    }
});

module.exports = router;
