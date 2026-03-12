// models/Transaction.js
const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    type: {
        type: String,
        required: true,
        enum: ['income', 'expense', 'subscription'], // restricts to these types
    },
    category: {
        type: String,
        required: true,
        default: 'Uncategorized',
        trim: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        required: true,
        default: Date.now,
    },
    description: {
        type: String,
    }
});

module.exports = mongoose.model('Transaction', TransactionSchema);
