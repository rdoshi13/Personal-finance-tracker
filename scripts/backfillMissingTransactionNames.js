require('dotenv').config();
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');

const isBlank = (value) => typeof value !== 'string' || value.trim() === '';

const run = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not configured');
    }

    await mongoose.connect(process.env.MONGO_URI);

    const transactions = await Transaction.find({
        $or: [
            { name: { $exists: false } },
            { name: null },
            { name: '' },
            { name: /^\s*$/ },
        ],
    }).lean();

    if (transactions.length === 0) {
        console.log('No transactions with missing names found.');
        await mongoose.disconnect();
        return;
    }

    const operations = transactions.map((transaction) => {
        const fallbackName = !isBlank(transaction.category)
            ? transaction.category.trim()
            : 'Transaction';

        return {
            updateOne: {
                filter: { _id: transaction._id },
                update: { $set: { name: fallbackName } },
            },
        };
    });

    const result = await Transaction.bulkWrite(operations);
    console.log(`Updated ${result.modifiedCount} transactions with fallback names.`);
    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error('Backfill failed:', error.message);
    try {
        await mongoose.disconnect();
    } catch (disconnectError) {
        console.error('Disconnect failed:', disconnectError.message);
    }
    process.exit(1);
});
