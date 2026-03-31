const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { TOKEN_COOKIE_NAME, getAuthCookieOptions, signAuthToken } = require('../lib/auth');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

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
