const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildResetUrl,
    createResetToken,
    hashResetToken,
} = require('../lib/passwordReset');
const { buildPasswordResetEmail } = require('../lib/mailer');
const { createRateLimiter, resetRateLimits } = require('../lib/rateLimit');

test('creates a high-entropy token whose hash matches the raw value', () => {
    const { token, tokenHash, expiresAt } = createResetToken();

    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal(tokenHash, hashResetToken(token));
    assert.notEqual(tokenHash, token);
    assert.ok(expiresAt.getTime() > Date.now());
});

test('issues a different token on every call', () => {
    const first = createResetToken();
    const second = createResetToken();

    assert.notEqual(first.token, second.token);
    assert.notEqual(first.tokenHash, second.tokenHash);
});

test('hashing is stable and case sensitive', () => {
    assert.equal(hashResetToken('abc'), hashResetToken('abc'));
    assert.notEqual(hashResetToken('abc'), hashResetToken('ABC'));
});

test('builds a reset url carrying the token as a query parameter', () => {
    const url = buildResetUrl('token-with-special/chars');

    assert.ok(url.includes('reset_token='));
    assert.ok(url.includes(encodeURIComponent('token-with-special/chars')));
    assert.ok(!url.includes('token-with-special/chars'));
});

test('reset email embeds the link and escapes the recipient name', () => {
    const { text, html } = buildPasswordResetEmail({
        name: '<script>alert(1)</script>',
        resetUrl: 'https://example.com/?reset_token=abc',
    });

    assert.ok(text.includes('https://example.com/?reset_token=abc'));
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
});

test('reset email falls back to a neutral greeting without a name', () => {
    const { text } = buildPasswordResetEmail({ name: '', resetUrl: 'https://example.com' });

    assert.ok(text.startsWith('Hi there,'));
});

test('rate limiter allows up to max hits then blocks', () => {
    resetRateLimits();
    const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 3 });

    assert.equal(limiter.hit('user-a').allowed, true);
    assert.equal(limiter.hit('user-a').allowed, true);
    assert.equal(limiter.hit('user-a').allowed, true);

    const blocked = limiter.hit('user-a');
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterMs > 0);
});

test('rate limiter buckets each key independently', () => {
    resetRateLimits();
    const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 1 });

    assert.equal(limiter.hit('user-a').allowed, true);
    assert.equal(limiter.hit('user-a').allowed, false);
    assert.equal(limiter.hit('user-b').allowed, true);
});
