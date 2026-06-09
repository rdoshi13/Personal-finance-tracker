require('dotenv').config();

const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const { cleanChaseTransactionName, suggestCategory } = require('../lib/transactionImport');

const RAW_STATEMENT_PATTERNS = [
    /^Card Purchase\b/i,
    /^Recurring Card Purchase\b/i,
    /^Zelle Payment\b/i,
    /^Payment Received\b/i,
    /^Irs\s+Treas\b/i,
    /^AZ Dept of Rev\b/i,
    /^Chase Credit Crd Autopay\b/i,
    /^Remote Online Deposit\b/i,
];

const shouldCleanTransaction = (transaction) => {
    const name = String(transaction.name || '').trim();
    const description = String(transaction.description || '').trim();

    if (!description) return false;
    if (name === description) return true;
    return RAW_STATEMENT_PATTERNS.some((pattern) => pattern.test(name));
};

const run = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not configured');
    }

    await mongoose.connect(process.env.MONGO_URI);

    const transactions = await Transaction.find({ description: { $type: 'string', $ne: '' } });
    let updatedNameCount = 0;
    let updatedCategoryCount = 0;

    for (const transaction of transactions) {
        if (!shouldCleanTransaction(transaction)) {
            const suggestedCategory = suggestCategory(`${transaction.name} ${transaction.description}`.toLowerCase(), transaction.type);
            if (suggestedCategory && suggestedCategory !== 'Misc' && transaction.category !== suggestedCategory) {
                transaction.category = suggestedCategory;
                await transaction.save();
                updatedCategoryCount += 1;
            }
            continue;
        }

        const cleanedName = cleanChaseTransactionName(transaction.description);
        const suggestedCategory = suggestCategory(`${cleanedName} ${transaction.description}`.toLowerCase(), transaction.type);
        let changed = false;

        if (cleanedName && cleanedName !== transaction.name) {
            transaction.name = cleanedName;
            updatedNameCount += 1;
            changed = true;
        }

        if (suggestedCategory && suggestedCategory !== 'Misc' && transaction.category !== suggestedCategory) {
            transaction.category = suggestedCategory;
            updatedCategoryCount += 1;
            changed = true;
        }

        if (changed) {
            await transaction.save();
        }
    }

    console.log(`Updated ${updatedNameCount} transaction names`);
    console.log(`Updated ${updatedCategoryCount} transaction categories`);
    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
