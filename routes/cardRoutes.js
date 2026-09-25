const express = require('express');
const CardStatement = require('../models/CardStatement');

const router = express.Router();

// Statement snapshots, newest first. The transactions themselves come through
// /api/transactions like any other row; these are the figures only the statement
// knows -- balance, due date, minimum payment, limit, interest.
router.get('/statements', async (req, res) => {
    try {
        const statements = await CardStatement.find({ userId: req.user.id })
            .sort({ closingDate: -1 })
            .select('-userId -__v')
            .lean();

        return res.status(200).json({ statements });
    } catch (error) {
        console.error('Failed to load card statements:', error);
        return res.status(500).json({ message: 'Failed to load card statements' });
    }
});

module.exports = router;
