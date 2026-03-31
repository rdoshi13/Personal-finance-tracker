const { TOKEN_COOKIE_NAME, verifyAuthToken } = require('../lib/auth');

const getTokenFromRequest = (req) => {
    const authorizationHeader = req.headers.authorization || '';
    const [scheme, token] = authorizationHeader.split(' ');

    if (scheme === 'Bearer' && token) {
        return token.trim();
    }

    return req.cookies?.[TOKEN_COOKIE_NAME] || '';
};

const requireAuth = (req, res, next) => {
    try {
        const token = getTokenFromRequest(req);

        if (!token) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const decoded = verifyAuthToken(token);

        if (!decoded?.sub) {
            return res.status(401).json({ message: 'Invalid authentication token' });
        }

        req.user = {
            id: decoded.sub,
            email: decoded.email || '',
            name: decoded.name || '',
        };

        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid or expired authentication token' });
    }
};

module.exports = {
    requireAuth,
};
