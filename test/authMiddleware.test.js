// Set before requiring lib/auth, which reads JWT_SECRET when it signs or verifies.
process.env.JWT_SECRET = 'test-only-secret-for-auth-middleware';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../middleware/auth');
const { TOKEN_COOKIE_NAME, signAuthToken } = require('../lib/auth');

const makeRes = () => {
    const res = { statusCode: null, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (payload) => { res.body = payload; return res; };
    return res;
};

/** Runs the middleware and reports what it did, without an HTTP server. */
const run = (req) => {
    const res = makeRes();
    let nextCalled = false;
    requireAuth(req, res, () => { nextCalled = true; });
    return { res, nextCalled, user: req.user };
};

const validToken = signAuthToken({ sub: 'user-1', email: 'a@b.com', name: 'Ann' });

test('a request with no credentials is refused', () => {
    const { res, nextCalled } = run({ headers: {}, cookies: {} });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, 'Authentication required');
});

test('a bearer token is accepted and identifies the user', () => {
    const { res, nextCalled, user } = run({
        headers: { authorization: `Bearer ${validToken}` },
        cookies: {},
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
    assert.deepEqual(user, { id: 'user-1', email: 'a@b.com', name: 'Ann' });
});

test('a cookie works when there is no authorization header', () => {
    const { nextCalled, user } = run({
        headers: {},
        cookies: { [TOKEN_COOKIE_NAME]: validToken },
    });

    assert.equal(nextCalled, true);
    assert.equal(user.id, 'user-1');
});

test('the bearer header wins over the cookie', () => {
    const other = signAuthToken({ sub: 'user-2', email: 'c@d.com', name: 'Bob' });
    const { user } = run({
        headers: { authorization: `Bearer ${other}` },
        cookies: { [TOKEN_COOKIE_NAME]: validToken },
    });

    assert.equal(user.id, 'user-2');
});

test('a malformed authorization header falls through to no credentials', () => {
    ['Bearer', 'Basic abc', validToken, 'Bearer  '].forEach((authorization) => {
        const { res, nextCalled } = run({ headers: { authorization }, cookies: {} });
        assert.equal(nextCalled, false, `should reject: ${authorization}`);
        assert.equal(res.statusCode, 401);
    });
});

test('a garbage token is refused', () => {
    const { res, nextCalled } = run({
        headers: { authorization: 'Bearer not.a.jwt' },
        cookies: {},
    });

    assert.equal(nextCalled, false);
    assert.equal(res.body.message, 'Invalid or expired authentication token');
});

test('a token signed with another secret is refused', () => {
    // The whole point of signing: a forged token must not be accepted.
    const forged = jwt.sign({ sub: 'user-1' }, 'some-other-secret', { expiresIn: 3600 });
    const { res, nextCalled } = run({
        headers: { authorization: `Bearer ${forged}` },
        cookies: {},
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
});

test('an expired token is refused', () => {
    const expired = jwt.sign({ sub: 'user-1' }, process.env.JWT_SECRET, { expiresIn: -10 });
    const { res, nextCalled } = run({
        headers: { authorization: `Bearer ${expired}` },
        cookies: {},
    });

    assert.equal(nextCalled, false);
    assert.equal(res.body.message, 'Invalid or expired authentication token');
});

test('a correctly signed token with no subject is refused', () => {
    // Signed by us, but identifies nobody -- req.user.id would be undefined and
    // every route scopes its queries on it.
    const subjectless = jwt.sign({ email: 'a@b.com' }, process.env.JWT_SECRET, { expiresIn: 3600 });
    const { res, nextCalled } = run({
        headers: { authorization: `Bearer ${subjectless}` },
        cookies: {},
    });

    assert.equal(nextCalled, false);
    assert.equal(res.body.message, 'Invalid authentication token');
});

test('a token missing optional claims still authenticates', () => {
    const minimal = jwt.sign({ sub: 'user-9' }, process.env.JWT_SECRET, { expiresIn: 3600 });
    const { nextCalled, user } = run({
        headers: { authorization: `Bearer ${minimal}` },
        cookies: {},
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(user, { id: 'user-9', email: '', name: '' });
});

test('a request with no cookies object at all does not throw', () => {
    const { res, nextCalled } = run({ headers: {} });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
});
