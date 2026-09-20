// Integration tests: a real Express app over real HTTP against a real MongoDB,
// using a dedicated database that is dropped afterwards. No new dependency --
// app.listen(0) plus the built-in fetch is enough.
//
// These skip themselves when mongod is not reachable, so the suite stays green on
// a machine without it. Everything else in test/ is pure and DB-free.
process.env.MONGO_URI = process.env.TEST_MONGO_URI
    || 'mongodb://127.0.0.1:27017/finance-tracker-integration-test';
process.env.JWT_SECRET = 'test-only-secret-for-route-tests';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const app = require('../app');
const { connectToDatabase } = require('../lib/mongo');
const { signAuthToken } = require('../lib/auth');
const { resetRateLimits } = require('../lib/rateLimit');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

let server;
let baseUrl;
let dbReady = false;
let skipReason = '';

const call = (path, { token, method = 'GET', body } = {}) =>
    fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });

const asJson = async (response) => ({ status: response.status, body: await response.json().catch(() => null) });

let ann;
let bob;
let annToken;
let bobToken;

const seedUsers = async () => {
    await Promise.all([User.deleteMany({}), Transaction.deleteMany({})]);
    [ann, bob] = await User.create([
        { name: 'Ann', email: 'ann@example.com', passwordHash: 'x' },
        { name: 'Bob', email: 'bob@example.com', passwordHash: 'x' },
    ]);
    annToken = signAuthToken({ sub: String(ann._id), email: ann.email, name: ann.name });
    bobToken = signAuthToken({ sub: String(bob._id), email: bob.email, name: bob.name });
};

test.before(async () => {
    try {
        mongoose.set('bufferTimeoutMS', 2000);
        await Promise.race([
            connectToDatabase(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 3000)),
        ]);
        dbReady = true;
    } catch (error) {
        skipReason = `mongod not reachable (${error.message})`;
        return;
    }

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    await seedUsers();
});

test.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (dbReady) {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
    }
});

test.beforeEach(() => resetRateLimits());

const dbTest = (name, fn) => test(name, async (t) => {
    if (!dbReady) return t.skip(skipReason);
    return fn(t);
});

// --- the auth boundary, over real HTTP -------------------------------------

dbTest('every data route refuses an unauthenticated request', async () => {
    const paths = [
        '/api/transactions',
        '/api/transactions/summary?year=2026',
        '/api/transactions/report/2026/5',
        '/api/budgets',
        '/api/progress',
        '/api/progress/quests/2026/5',
        '/api/subscriptions',
        '/api/auth/me',
    ];

    for (const path of paths) {
        const { status } = await asJson(await call(path));
        assert.equal(status, 401, `${path} should require auth`);
    }
});

dbTest('a forged token does not get through over HTTP either', async () => {
    const { status } = await asJson(await call('/api/transactions', { token: 'not.a.jwt' }));
    assert.equal(status, 401);
});

// --- per-user isolation ----------------------------------------------------

dbTest("one user cannot read another's transactions", async () => {
    await Transaction.create({
        userId: bob._id, name: "Bob's rent", type: 'expense', category: 'Housing',
        amount: 380, date: new Date('2026-05-01'),
    });

    const { status, body } = await asJson(await call('/api/transactions', { token: annToken }));

    assert.equal(status, 200);
    assert.equal(body.length, 0, "Ann should see none of Bob's rows");
});

dbTest("one user cannot update another's transaction", async () => {
    const bobs = await Transaction.create({
        userId: bob._id, name: 'Bob only', type: 'expense', category: 'Food',
        amount: 10, date: new Date('2026-05-02'),
    });

    const { status } = await asJson(await call(`/api/transactions/${bobs._id}`, {
        token: annToken, method: 'PUT', body: { name: 'Hijacked' },
    }));

    assert.equal(status, 404, 'should be indistinguishable from not existing');
    const after = await Transaction.findById(bobs._id);
    assert.equal(after.name, 'Bob only');
});

dbTest("one user cannot delete another's transaction", async () => {
    const bobs = await Transaction.create({
        userId: bob._id, name: 'Keep me', type: 'expense', category: 'Food',
        amount: 12, date: new Date('2026-05-03'),
    });

    const { status } = await asJson(await call(`/api/transactions/${bobs._id}`, {
        token: annToken, method: 'DELETE',
    }));

    assert.equal(status, 404);
    assert.ok(await Transaction.findById(bobs._id), 'row must survive');
});

dbTest('a spoofed userId in the body is ignored on create', async () => {
    const { status, body } = await asJson(await call('/api/transactions', {
        token: annToken,
        method: 'POST',
        body: { userId: String(bob._id), name: 'Mine', type: 'expense', category: 'Food', amount: 5, date: '2026-05-04' },
    }));

    assert.equal(status, 201);
    assert.equal(body.userId, String(ann._id), 'must belong to the caller, not the claimed id');
});

dbTest('the month report only covers the calling user', async () => {
    await Transaction.create([
        { userId: ann._id, name: 'Ann pay', type: 'income', category: 'Salary', amount: 100, date: new Date('2026-06-10') },
        { userId: bob._id, name: 'Bob pay', type: 'income', category: 'Salary', amount: 999, date: new Date('2026-06-10') },
    ]);

    const { body } = await asJson(await call('/api/transactions/report/2026/6', { token: annToken }));

    assert.equal(body.totalIncome, 100);
});

dbTest('the summary aggregate only covers the calling user', async () => {
    await Transaction.create([
        { userId: ann._id, name: 'Ann jul', type: 'expense', category: 'Food', amount: 20, date: new Date('2026-07-10') },
        { userId: bob._id, name: 'Bob jul', type: 'expense', category: 'Food', amount: 500, date: new Date('2026-07-10') },
    ]);

    const { body } = await asJson(await call('/api/transactions/summary?year=2026', { token: annToken }));
    const july = body.months.find((m) => m.month === 7);

    assert.equal(july.expense, 20);
});

// --- amount validation -----------------------------------------------------

dbTest('a negative amount is rejected by the API', async () => {
    const { status } = await asJson(await call('/api/transactions', {
        token: annToken,
        method: 'POST',
        body: { name: 'Refund?', type: 'expense', category: 'Food', amount: -500, date: '2026-05-05' },
    }));

    // Direction is carried by `type`; a negative amount would invert its own
    // contribution to every aggregate.
    assert.equal(status, 400);
});

dbTest('a zero amount is rejected by the API', async () => {
    const { status } = await asJson(await call('/api/transactions', {
        token: annToken,
        method: 'POST',
        body: { name: 'Nothing', type: 'expense', category: 'Food', amount: 0, date: '2026-05-06' },
    }));

    assert.equal(status, 400);
});

dbTest('an amount cannot be edited into a negative one either', async () => {
    const mine = await Transaction.create({
        userId: ann._id, name: 'Lunch', type: 'expense', category: 'Food',
        amount: 10, date: new Date('2026-05-07'),
    });

    const { status } = await asJson(await call(`/api/transactions/${mine._id}`, {
        token: annToken, method: 'PUT', body: { amount: -10 },
    }));

    assert.equal(status, 400, 'runValidators must apply on update, not just create');
    assert.equal((await Transaction.findById(mine._id)).amount, 10);
});

// --- rate limiting ---------------------------------------------------------

dbTest('login is rate limited per account', async () => {
    const attempt = () => call('/api/auth/login', {
        method: 'POST',
        body: { email: 'ann@example.com', password: 'wrong-password' },
    });

    const codes = [];
    for (let i = 0; i < 12; i += 1) {
        codes.push((await attempt()).status);
    }

    assert.ok(codes.includes(401), 'early attempts should be ordinary failures');
    assert.equal(codes.at(-1), 429, 'repeated guessing must be throttled');
});

dbTest('signup is rate limited', async () => {
    const codes = [];
    for (let i = 0; i < 7; i += 1) {
        const response = await call('/api/auth/signup', {
            method: 'POST',
            body: { name: 'Spam', email: `spam${i}@example.com`, password: 'password123' },
        });
        codes.push(response.status);
    }

    assert.equal(codes.at(-1), 429, 'mass account creation must be throttled');
});

dbTest('a throttled login does not leak whether the account exists', async () => {
    for (let i = 0; i < 11; i += 1) {
        await call('/api/auth/login', {
            method: 'POST', body: { email: 'ghost@example.com', password: 'nope' },
        });
    }

    const { status, body } = await asJson(await call('/api/auth/login', {
        method: 'POST', body: { email: 'ghost@example.com', password: 'nope' },
    }));

    assert.equal(status, 429);
    assert.match(body.message, /Too many attempts/);
});

// --- ordinary behaviour, so the tests above are not passing by accident ----

dbTest('an authenticated user can create and read back their own transaction', async () => {
    const created = await asJson(await call('/api/transactions', {
        token: annToken,
        method: 'POST',
        body: { name: 'Coffee', type: 'expense', category: 'Food', amount: 4.5, date: '2026-08-01' },
    }));

    assert.equal(created.status, 201);

    const listed = await asJson(await call('/api/transactions', { token: annToken }));
    assert.ok(listed.body.some((t) => t.name === 'Coffee' && t.amount === 4.5));
});

dbTest('a subscription cancellation round-trips for the owner only', async () => {
    const saved = await asJson(await call('/api/subscriptions', {
        token: annToken, method: 'PUT', body: { key: 'spotify', cancelled: true },
    }));
    assert.equal(saved.status, 200);

    const mine = await asJson(await call('/api/subscriptions', { token: annToken }));
    assert.deepEqual(mine.body.cancelled.map((c) => c.key), ['spotify']);

    const theirs = await asJson(await call('/api/subscriptions', { token: bobToken }));
    assert.deepEqual(theirs.body.cancelled, [], "Bob must not see Ann's overrides");
});
