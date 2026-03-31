require('dotenv').config();

const express = require('express');
const cors = require('cors');
const transactionRoutes = require('./routes/transactionRoutes');
const { connectToDatabase } = require('./lib/mongo');

const parseAllowedOrigins = () => {
    const rawOrigins = process.env.ALLOWED_ORIGINS || '';
    const parsedOrigins = rawOrigins
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (parsedOrigins.length > 0) {
        return new Set(parsedOrigins);
    }

    if (process.env.NODE_ENV !== 'production') {
        return new Set([
            'http://localhost:3000',
            'http://127.0.0.1:3000',
        ]);
    }

    return new Set();
};

const isVercelPreviewOrigin = (origin) => /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);

const allowedOrigins = parseAllowedOrigins();
const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS === 'true';

if (process.env.NODE_ENV === 'production' && allowedOrigins.size === 0) {
    throw new Error('ALLOWED_ORIGINS must be configured in production');
}

const app = express();

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) {
            callback(null, true);
            return;
        }

        if (allowedOrigins.has(origin)) {
            callback(null, true);
            return;
        }

        if (allowVercelPreviews && isVercelPreviewOrigin(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());

app.use(async (req, res, next) => {
    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }

    try {
        await connectToDatabase();
        next();
    } catch (error) {
        next(error);
    }
});

app.use('/api/transactions', transactionRoutes);

app.use((error, req, res, next) => {
    if (error && error.message === 'Not allowed by CORS') {
        res.status(403).json({ message: 'CORS origin denied' });
        return;
    }

    if (error && error.message === 'MONGO_URI is not configured') {
        res.status(500).json({ message: 'Server database configuration error' });
        return;
    }

    if (error) {
        console.error('Unhandled server error:', error);
        res.status(500).json({ message: 'Internal server error' });
        return;
    }

    next();
});

module.exports = app;
