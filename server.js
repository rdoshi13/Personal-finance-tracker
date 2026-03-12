// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env file

const app = express();
app.use(cors());
app.use(express.json()); // Parses incoming JSON requests

// Import routes
const transactionRoutes = require('./routes/transactionRoutes');

// Use the routes
app.use('/api/transactions', transactionRoutes);

// Confirm config is present without leaking secrets into logs
console.log('MongoDB URI configured:', Boolean(process.env.MONGO_URI));

const PORT = process.env.PORT || 5001;

// Connect to MongoDB (no need for deprecated options)
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
