const crypto = require('crypto');

const RESET_TOKEN_TTL_MINUTES = Number(process.env.RESET_TOKEN_TTL_MINUTES || 60);
const RESET_TOKEN_BYTES = 32;

// The raw token goes in the email; only its hash is stored, so a leaked database
// dump cannot be replayed against the reset endpoint.
const createResetToken = () => {
    const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');

    return {
        token,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
    };
};

const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const getAppBaseUrl = () => {
    const configured = process.env.APP_BASE_URL || process.env.FRONTEND_BASE_URL;

    if (configured) {
        return configured.replace(/\/$/, '');
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('APP_BASE_URL is not configured');
    }

    return 'http://localhost:3000';
};

const buildResetUrl = (token) =>
    `${getAppBaseUrl()}/?reset_token=${encodeURIComponent(token)}`;

module.exports = {
    RESET_TOKEN_TTL_MINUTES,
    buildResetUrl,
    createResetToken,
    getAppBaseUrl,
    hashResetToken,
};
