// routes/transactionRoutes.js
const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');

// Create a new transaction
router.post('/', async (req, res) => {
    try {
        const payload = { ...req.body };
        payload.name = typeof payload.name === 'string' ? payload.name.trim() : '';
        payload.category = typeof payload.category === 'string' ? payload.category.trim() : payload.category;

        if (!payload.name) {
            return res.status(400).json({ message: 'Name is required' });
        }

        const newTransaction = new Transaction(payload);
        await newTransaction.save();
        res.status(201).json(newTransaction);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Read all transactions
router.get('/', async (req, res) => {
    try {
        const transactions = await Transaction.find();
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update a transaction
router.put('/:id', async (req, res) => {
    try {
        const payload = { ...req.body };
        if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
            payload.name = typeof payload.name === 'string' ? payload.name.trim() : '';
            if (!payload.name) {
                return res.status(400).json({ message: 'Name is required' });
            }
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'category') && typeof payload.category === 'string') {
            payload.category = payload.category.trim();
        }

        const updatedTransaction = await Transaction.findByIdAndUpdate(
            req.params.id,
            payload,
            { new: true, runValidators: true }
        );
        res.json(updatedTransaction);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Delete a transaction
router.delete('/:id', async (req, res) => {
    try {
        await Transaction.findByIdAndDelete(req.params.id);
        res.json({ message: 'Transaction deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Fetch transactions for a specific month
router.get('/report/:year/:month', async (req, res) => {
    const { year, month } = req.params;
    const startDate = new Date(`${year}-${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1); // Move to the next month

    try {
        const transactions = await Transaction.find({
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
