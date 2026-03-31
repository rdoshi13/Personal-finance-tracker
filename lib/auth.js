const jwt = require('jsonwebtoken');

const TOKEN_COOKIE_NAME = 'auth_token';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;

    if (secret) {
        return secret;
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET is not configured');
    }

    return 'dev-only-jwt-secret-change-me';
};

const signAuthToken = (payload) =>
    jwt.sign(payload, getJwtSecret(), {
        expiresIn: TOKEN_TTL_SECONDS,
    });

const verifyAuthToken = (token) => jwt.verify(token, getJwtSecret());

const getAuthCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: '/',
});

module.exports = {
    TOKEN_COOKIE_NAME,
    TOKEN_TTL_SECONDS,
    getAuthCookieOptions,
    signAuthToken,
    verifyAuthToken,
};
