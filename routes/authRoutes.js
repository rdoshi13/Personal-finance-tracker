const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');
const { TOKEN_COOKIE_NAME, getAuthCookieOptions, signAuthToken } = require('../lib/auth');
const { requireAuth } = require('../middleware/auth');
const { buildResetUrl, createResetToken, hashResetToken } = require('../lib/passwordReset');
const { sendPasswordResetEmail } = require('../lib/mailer');
const { createRateLimiter } = require('../lib/rateLimit');

const router = express.Router();

const forgotPasswordLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const resetPasswordLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

const sanitizeUser = (user) => ({
    id: String(user._id),
    name: user.name,
    email: user.email,
});

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const createSessionResponse = (res, user) => {
    const token = signAuthToken({
        sub: String(user._id),
        email: user.email,
        name: user.name,
    });

    res.cookie(TOKEN_COOKIE_NAME, token, getAuthCookieOptions());

    return res.status(200).json({
        user: sanitizeUser(user),
        token,
    });
};

router.post('/signup', async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '');

        if (!name) {
            return res.status(400).json({ message: 'Name is required' });
        }

        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ message: 'A valid email is required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters long' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ message: 'An account with this email already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const user = await User.create({ name, email, passwordHash });

        return createSessionResponse(res, user);
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({ message: 'An account with this email already exists' });
        }
        return res.status(500).json({ message: 'Failed to create account' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '');

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        return createSessionResponse(res, user);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to sign in' });
    }
});

// Always answers 200 with the same body: a different response for known and unknown
// emails would turn this endpoint into an account-existence oracle.
router.post('/forgot-password', async (req, res) => {
    const genericResponse = {
        message: 'If an account exists for that email, a reset link is on its way.',
    };

    try {
        const email = String(req.body?.email || '').trim().toLowerCase();

        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ message: 'A valid email is required' });
        }

        const limit = forgotPasswordLimiter.hit(`${req.ip}:${email}`);
        if (!limit.allowed) {
            return res.status(429).json({
                message: 'Too many reset requests. Please try again later.',
            });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(200).json(genericResponse);
        }

        // Any earlier link becomes useless the moment a new one is issued.
        await PasswordResetToken.deleteMany({ userId: user._id });

        const { token, tokenHash, expiresAt } = createResetToken();
        await PasswordResetToken.create({ userId: user._id, tokenHash, expiresAt });

        await sendPasswordResetEmail({
            to: user.email,
            name: user.name,
            resetUrl: buildResetUrl(token),
        });

        return res.status(200).json(genericResponse);
    } catch (error) {
        console.error('Password reset request failed:', error);
        return res.status(500).json({ message: 'Failed to process password reset request' });
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const token = String(req.body?.token || '').trim();
        const password = String(req.body?.password || '');

        if (!token) {
            return res.status(400).json({ message: 'Reset token is required' });
        }

        const limit = resetPasswordLimiter.hit(String(req.ip));
        if (!limit.allowed) {
            return res.status(429).json({
                message: 'Too many attempts. Please try again later.',
            });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters long' });
        }

        const resetToken = await PasswordResetToken.findOne({
            tokenHash: hashResetToken(token),
            usedAt: null,
            expiresAt: { $gt: new Date() },
        });

        if (!resetToken) {
            return res.status(400).json({ message: 'This reset link is invalid or has expired' });
        }

        const user = await User.findById(resetToken.userId);
        if (!user) {
            return res.status(400).json({ message: 'This reset link is invalid or has expired' });
        }

        user.passwordHash = await bcrypt.hash(password, 12);
        await user.save();

        // Burn this token and every sibling so the link cannot be replayed.
        await PasswordResetToken.deleteMany({ userId: user._id });

        return createSessionResponse(res, user);
    } catch (error) {
        console.error('Password reset failed:', error);
        return res.status(500).json({ message: 'Failed to reset password' });
    }
});

router.post('/logout', (req, res) => {
    const cookieOptions = getAuthCookieOptions();
    res.clearCookie(TOKEN_COOKIE_NAME, {
        httpOnly: cookieOptions.httpOnly,
        secure: cookieOptions.secure,
        sameSite: cookieOptions.sameSite,
        path: cookieOptions.path,
    });

    return res.status(200).json({ message: 'Logged out' });
});

router.get('/me', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(401).json({ message: 'User not found for current session' });
        }

        return res.status(200).json({ user: sanitizeUser(user) });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch user profile' });
    }
});

module.exports = router;
