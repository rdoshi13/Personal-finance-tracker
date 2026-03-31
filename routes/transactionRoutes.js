// routes/transactionRoutes.js
const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');

const normalizeUpdatePayload = (payload) => {
    const normalizedPayload = { ...payload };

    if (Object.prototype.hasOwnProperty.call(normalizedPayload, 'name')) {
        normalizedPayload.name = typeof normalizedPayload.name === 'string' ? normalizedPayload.name.trim() : '';
    }

    if (Object.prototype.hasOwnProperty.call(normalizedPayload, 'category') && typeof normalizedPayload.category === 'string') {
        normalizedPayload.category = normalizedPayload.category.trim();
    }

    return normalizedPayload;
};

const updateTransactionById = async (req, res) => {
    try {
        const userId = req.user.id;
        const payload = normalizeUpdatePayload(req.body || {});

        if (Object.prototype.hasOwnProperty.call(payload, 'name') && !payload.name) {
            return res.status(400).json({ message: 'Name is required' });
        }

        delete payload.userId;

        const updatedTransaction = await Transaction.findOneAndUpdate(
            { _id: req.params.id, userId },
            payload,
            { new: true, runValidators: true }
        );

        if (!updatedTransaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        res.json(updatedTransaction);
    } catch (err) {
        if (err.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid transaction id' });
        }

        res.status(400).json({ message: err.message });
    }
};

const deleteTransactionById = async (req, res) => {
    try {
        const userId = req.user.id;
        const deletedTransaction = await Transaction.findOneAndDelete({ _id: req.params.id, userId });

        if (!deletedTransaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        res.json({ message: 'Transaction deleted' });
    } catch (err) {
        if (err.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid transaction id' });
        }

        res.status(500).json({ message: err.message });
    }
};

// Create a new transaction
router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const payload = { ...req.body };
        payload.name = typeof payload.name === 'string' ? payload.name.trim() : '';
        payload.category = typeof payload.category === 'string' ? payload.category.trim() : payload.category;
        delete payload.userId;

        if (!payload.name) {
            return res.status(400).json({ message: 'Name is required' });
        }

        const newTransaction = new Transaction({ ...payload, userId });
        await newTransaction.save();
        res.status(201).json(newTransaction);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Read all transactions
router.get('/', async (req, res) => {
    try {
        const transactions = await Transaction.find({ userId: req.user.id }).sort({ date: -1 });
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update a transaction
router.put('/:id', updateTransactionById);
// Fallback for environments that block PUT but allow POST
router.post('/:id/update', updateTransactionById);

// Delete a transaction
router.delete('/:id', deleteTransactionById);
// Fallback for environments that block DELETE but allow POST
router.post('/:id/delete', deleteTransactionById);

// Fetch transactions for a specific month
router.get('/report/:year/:month', async (req, res) => {
    const { year, month } = req.params;
    const userId = req.user.id;
    const startDate = new Date(`${year}-${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1); // Move to the next month

    try {
        const transactions = await Transaction.find({
            userId,
            date: {
                $gte: startDate,
                $lt: endDate
            }
        });

        // Group by category for legacy compatibility + by type for better report UX
        const report = {};
        const incomeReport = {};
        const outflowReport = {};

        transactions.forEach((transaction) => {
            const groupCategory = transaction.category || 'Uncategorized';
            const amount = Number(transaction.amount) || 0;

            if (!report[groupCategory]) report[groupCategory] = { total: 0, transactions: 0 };
            report[groupCategory].total += amount;
            report[groupCategory].transactions += 1;

            const typeBucket = transaction.type === 'income' ? incomeReport : outflowReport;
            if (!typeBucket[groupCategory]) typeBucket[groupCategory] = { total: 0, transactions: 0 };
            typeBucket[groupCategory].total += amount;
            typeBucket[groupCategory].transactions += 1;
        });

        // Total income and expenses
        const totalIncome = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
        const totalExpenses = transactions
            .filter(t => t.type === 'expense' || t.type === 'subscription')
            .reduce((acc, t) => acc + t.amount, 0);

        res.json({
            report,
            breakdownByType: {
                income: incomeReport,
                outflow: outflowReport,
            },
            totalIncome,
            totalExpenses,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


module.exports = router;
