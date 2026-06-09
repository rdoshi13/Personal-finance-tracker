// routes/transactionRoutes.js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const Transaction = require('../models/Transaction');
const ImportBatch = require('../models/ImportBatch');
const {
    buildFileHash,
    normalizeImportFileBuffer,
    normalizeSubmissionRow,
} = require('../lib/transactionImport');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        const originalName = String(file.originalname || '').toLowerCase();
        const mimeType = String(file.mimetype || '').toLowerCase();
        const isCsv = originalName.endsWith('.csv') || mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel';
        const isPdf = originalName.endsWith('.pdf') || mimeType === 'application/pdf';

        if (!isCsv && !isPdf) {
            callback(new Error('Only CSV and PDF files are supported'));
            return;
        }

        callback(null, true);
    },
});

const handleImportUpload = (req, res, next) => {
    upload.single('file')(req, res, (error) => {
        if (!error) {
            next();
            return;
        }

        if (error.code === 'LIMIT_FILE_SIZE') {
            res.status(400).json({ message: 'Statement file must be 2 MB or smaller' });
            return;
        }

        res.status(400).json({ message: error.message || 'Invalid CSV upload' });
    });
};

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

const markDuplicateRows = async (rows, userId) => {
    const seenHashes = new Set();
    const hashes = rows.map((row) => row.importHash).filter(Boolean);
    const existingTransactions = hashes.length > 0
        ? await Transaction.find({ userId, importHash: { $in: hashes } }).select('importHash')
        : [];
    const existingHashes = new Set(existingTransactions.map((transaction) => transaction.importHash));

    return rows.map((row) => {
        if (!row.importHash || row.status === 'invalid') {
            return row;
        }

        if (existingHashes.has(row.importHash) || seenHashes.has(row.importHash)) {
            return {
                ...row,
                status: 'duplicate',
                errors: [],
            };
        }

        seenHashes.add(row.importHash);
        return row;
    });
};

router.post('/import/preview', handleImportUpload, async (req, res) => {
    try {
        if (!req.file?.buffer) {
            return res.status(400).json({ message: 'CSV file is required' });
        }

        const sourceAccount = req.body?.sourceAccount || '';
        const normalizedRows = await normalizeImportFileBuffer(req.file.buffer, req.file, { sourceAccount });
        const rows = await markDuplicateRows(normalizedRows, req.user.id);

        res.json({
            filename: req.file.originalname,
            fileHash: buildFileHash(req.file.buffer),
            totalRows: rows.length,
            rows,
            summary: {
                ready: rows.filter((row) => row.status === 'ready').length,
                duplicate: rows.filter((row) => row.status === 'duplicate').length,
                invalid: rows.filter((row) => row.status === 'invalid').length,
            },
        });
    } catch (error) {
        res.status(error.statusCode || 400).json({ message: error.message || 'Failed to parse CSV' });
    }
});

router.post('/import', async (req, res) => {
    try {
        const userId = req.user.id;
        const submittedRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
        const sourceAccount = req.body?.sourceAccount || req.body?.batch?.sourceAccount || '';
        const normalizedRows = submittedRows.map((row) => normalizeSubmissionRow(row, { sourceAccount }));
        const reviewedRows = await markDuplicateRows(normalizedRows, userId);
        const importBatch = await ImportBatch.create({
            userId,
            filename: String(req.body?.batch?.filename || '').trim(),
            fileHash: String(req.body?.batch?.fileHash || '').trim(),
            totalRows: reviewedRows.length,
            imported: 0,
            skipped: reviewedRows.filter((row) => row.status === 'duplicate').length,
            failed: reviewedRows.filter((row) => row.status === 'invalid').length,
        });

        const importedTransactions = [];
        const errors = [];
        let skipped = 0;
        let failed = 0;

        for (const row of reviewedRows) {
            if (row.status === 'invalid') {
                failed += 1;
                errors.push({ rowNumber: row.rowNumber, errors: row.errors });
                continue;
            }

            if (row.status === 'duplicate') {
                skipped += 1;
                continue;
            }

            try {
                const transaction = await Transaction.create({
                    userId,
                    name: row.name,
                    type: row.type,
                    category: row.category,
                    amount: row.amount,
                    date: row.date,
                    description: row.description,
                    importHash: row.importHash,
                    importBatchId: importBatch._id,
                    sourceAccount: row.sourceAccount,
                });
                importedTransactions.push(transaction);
            } catch (error) {
                if (error?.code === 11000) {
                    skipped += 1;
                    continue;
                }

                failed += 1;
                errors.push({
                    rowNumber: row.rowNumber,
                    errors: [error.message || 'Failed to import row'],
                });
            }
        }

        importBatch.imported = importedTransactions.length;
        importBatch.skipped = skipped;
        importBatch.failed = failed;
        await importBatch.save();

        res.status(201).json({
            totalRows: reviewedRows.length,
            imported: importedTransactions.length,
            skipped,
            failed,
            transactions: importedTransactions,
            errors,
            importBatchId: importBatch._id,
        });
    } catch (error) {
        res.status(400).json({ message: error.message || 'Failed to import transactions' });
    }
});

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
    const startDate = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    const endDate = new Date(startDate);
    endDate.setUTCMonth(endDate.getUTCMonth() + 1); // Move to the next month

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
