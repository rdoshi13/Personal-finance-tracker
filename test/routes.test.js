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

    // Build the declared indexes against a fresh database. This is where an
    // invalid index declaration shows up -- an existing database keeps whatever
    // was created under an older schema and hides the problem.
    await Promise.all([Transaction.init(), User.init()]);

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
    assert.equal(body.transactions.length, 0, "Ann should see none of Bob's rows");
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

// --- indexes actually get created ------------------------------------------

dbTest('the import dedupe index exists on a fresh database', async () => {
    const indexes = await Transaction.collection.indexes();
    const dedupe = indexes.find((i) => i.name === 'userId_1_importHash_1');

    // MongoDB rejects $ne inside a partialFilterExpression, so a declaration
    // using it fails silently and leaves imports with no dedupe guarantee.
    assert.ok(dedupe, 'the dedupe index must be creatable, not just declared');
    assert.equal(dedupe.unique, true);
});

dbTest('the same import hash cannot be stored twice for one user', async () => {
    const row = {
        userId: ann._id, name: 'Imported', type: 'expense', category: 'Food',
        amount: 10, date: new Date('2026-05-01'), importHash: 'hash-dedupe-1',
    };
    await Transaction.create(row);

    await assert.rejects(
        () => Transaction.create(row),
        (error) => error.code === 11000,
        'a repeat import of the same row must be refused'
    );
});

dbTest('two users may hold the same import hash', async () => {
    const hash = 'hash-shared-across-users';
    await Transaction.create({
        userId: ann._id, name: 'Mine', type: 'expense', category: 'Food',
        amount: 10, date: new Date('2026-05-01'), importHash: hash,
    });

    // The index is scoped per user, so Bob importing the same statement row is fine.
    await assert.doesNotReject(() => Transaction.create({
        userId: bob._id, name: 'Theirs', type: 'expense', category: 'Food',
        amount: 10, date: new Date('2026-05-01'), importHash: hash,
    }));
});

dbTest('rows without an import hash are exempt from the unique constraint', async () => {
    // Hand-entered transactions have no hash; the partial filter must let any
    // number of them coexist.
    const base = {
        userId: ann._id, name: 'Manual', type: 'expense', category: 'Food',
        amount: 5, date: new Date('2026-05-02'),
    };
    await Transaction.create(base);
    await assert.doesNotReject(() => Transaction.create(base));
});

// --- pagination ------------------------------------------------------------

const seedRun = async (count, startDay = 1) => {
    await Transaction.deleteMany({ userId: ann._id });
    await Transaction.create(Array.from({ length: count }, (_, i) => ({
        userId: ann._id,
        name: `Row ${String(i).padStart(3, '0')}`,
        type: 'expense',
        category: 'Food',
        amount: i + 1,
        date: new Date(Date.UTC(2026, 0, startDay + i)),
    })));
};

/** Walks every page the way the client does and returns the flattened rows. */
const drain = async (limit) => {
    const seen = [];
    let cursor;
    let pages = 0;

    for (;;) {
        const query = cursor ? `?limit=${limit}&cursor=${encodeURIComponent(cursor)}` : `?limit=${limit}`;
        const { body } = await asJson(await call(`/api/transactions${query}`, { token: annToken }));
        seen.push(...body.transactions);
        pages += 1;
        if (!body.hasMore) return { seen, pages };
        cursor = body.nextCursor;
        if (pages > 50) throw new Error('did not terminate');
    }
};

dbTest('a page is capped and reports whether more exist', async () => {
    await seedRun(30);

    const { body } = await asJson(await call('/api/transactions?limit=10', { token: annToken }));

    assert.equal(body.transactions.length, 10);
    assert.equal(body.hasMore, true);
    assert.ok(body.nextCursor, 'a further page needs a cursor');
});

dbTest('the last page reports no more and no cursor', async () => {
    await seedRun(5);

    const { body } = await asJson(await call('/api/transactions?limit=10', { token: annToken }));

    assert.equal(body.transactions.length, 5);
    assert.equal(body.hasMore, false);
    assert.equal(body.nextCursor, null);
});

dbTest('paging returns every row exactly once, newest first', async () => {
    await seedRun(30);

    const { seen, pages } = await drain(7);
    const names = seen.map((t) => t.name);

    assert.equal(pages, 5, '30 rows at 7 per page');
    assert.equal(names.length, 30);
    assert.equal(new Set(names).size, 30, 'no duplicates across pages');
    assert.equal(names[0], 'Row 029', 'newest first');
    assert.equal(names.at(-1), 'Row 000');
});

dbTest('a row inserted mid-scroll does not shift the pages already read', async () => {
    // The reason for keyset over skip/limit: with skip, inserting a newer row
    // pushes everything down one and the next page repeats a row.
    await seedRun(20);

    const first = await asJson(await call('/api/transactions?limit=5', { token: annToken }));
    const firstNames = first.body.transactions.map((t) => t.name);

    await Transaction.create({
        userId: ann._id, name: 'Inserted newest', type: 'expense', category: 'Food',
        amount: 99, date: new Date(Date.UTC(2026, 5, 1)),
    });

    const second = await asJson(await call(
        `/api/transactions?limit=5&cursor=${encodeURIComponent(first.body.nextCursor)}`,
        { token: annToken }
    ));
    const secondNames = second.body.transactions.map((t) => t.name);

    assert.equal(secondNames.filter((n) => firstNames.includes(n)).length, 0, 'no repeats');
    assert.ok(!secondNames.includes('Inserted newest'), 'the new row belongs before the cursor');
});

dbTest('rows sharing a date are still paged without loss', async () => {
    // The _id tiebreak in the cursor is what makes this work.
    await Transaction.deleteMany({ userId: ann._id });
    const sameDay = new Date(Date.UTC(2026, 2, 15));
    await Transaction.create(Array.from({ length: 12 }, (_, i) => ({
        userId: ann._id, name: `Tie ${i}`, type: 'expense', category: 'Food',
        amount: i + 1, date: sameDay,
    })));

    const { seen } = await drain(5);

    assert.equal(seen.length, 12);
    assert.equal(new Set(seen.map((t) => t.name)).size, 12);
});

dbTest('the page size is capped and bad input is refused', async () => {
    await seedRun(3);

    const huge = await asJson(await call('/api/transactions?limit=99999', { token: annToken }));
    assert.equal(huge.status, 200, 'an over-large limit is clamped, not rejected');

    for (const limit of ['0', '-1', 'abc', '1.5']) {
        const { status } = await asJson(await call(`/api/transactions?limit=${limit}`, { token: annToken }));
        assert.equal(status, 400, `limit=${limit} should be refused`);
    }
});

dbTest('a corrupt cursor is refused rather than ignored', async () => {
    await seedRun(3);

    for (const cursor of ['nonsense', Buffer.from('not-a-date|abc').toString('base64url')]) {
        const { status } = await asJson(await call(
            `/api/transactions?cursor=${encodeURIComponent(cursor)}`, { token: annToken }
        ));
        assert.equal(status, 400, `cursor=${cursor} should be refused`);
    }
});

dbTest('paging stays scoped to the caller', async () => {
    await seedRun(6);
    await Transaction.create({
        userId: bob._id, name: 'Bob row', type: 'expense', category: 'Food',
        amount: 1, date: new Date(Date.UTC(2026, 0, 3)),
    });

    const { seen } = await drain(2);

    assert.equal(seen.length, 6);
    assert.ok(!seen.some((t) => t.name === 'Bob row'));
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
    assert.ok(listed.body.transactions.some((t) => t.name === 'Coffee' && t.amount === 4.5));
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

// --- transfers ---------------------------------------------------------------

dbTest('a transfer counts as neither income nor expense in the summary', async () => {
    await Transaction.create([
        { userId: ann._id, name: 'Pay', type: 'income', category: 'Salary', amount: 1000, date: new Date('2025-03-02') },
        { userId: ann._id, name: 'Lunch', type: 'expense', category: 'Food', amount: 30, date: new Date('2025-03-03') },
        { userId: ann._id, name: 'Chase Card Payment', type: 'transfer', category: 'Credit Card Payment', amount: 500, date: new Date('2025-03-04') },
    ]);

    const { body } = await asJson(await call('/api/transactions/summary?year=2025', { token: annToken }));
    const march = body.months.find((m) => m.month === 3);

    assert.equal(march.income, 1000);
    assert.equal(march.expense, 30);
    assert.equal(march.net, 970);
});

dbTest('the month report leaves transfers out of both sides of its breakdown', async () => {
    await Transaction.create([
        { userId: ann._id, name: 'Lunch', type: 'expense', category: 'Food', amount: 12, date: new Date('2025-04-03') },
        { userId: ann._id, name: 'Chase Card Payment', type: 'transfer', category: 'Credit Card Payment', amount: 500, date: new Date('2025-04-04') },
    ]);

    const { body } = await asJson(await call('/api/transactions/report/2025/4', { token: annToken }));

    assert.equal(body.totalExpenses, 12);
    assert.equal(body.totalIncome, 0);
    assert.equal(body.breakdownByType.outflow['Credit Card Payment'], undefined);
    assert.equal(body.breakdownByType.income['Credit Card Payment'], undefined);
    assert.equal(body.breakdownByType.outflow.Food.total, 12);
    // The legacy all-categories bucket keeps its shape and still lists every row.
    assert.equal(body.report['Credit Card Payment'].total, 500);
});

dbTest('deleting one half of a matched transfer unlinks the other', async () => {
    const [bank, card] = await Transaction.create([
        { userId: ann._id, name: 'Chase Card Payment', type: 'transfer', category: 'Credit Card Payment', amount: 40, date: new Date('2025-05-05') },
        { userId: ann._id, name: 'Autopay', type: 'transfer', category: 'Credit Card Payment', amount: 40, date: new Date('2025-05-04'), accountType: 'credit_card' },
    ]);
    await Transaction.updateOne({ _id: bank._id }, { linkedTransactionId: card._id });
    await Transaction.updateOne({ _id: card._id }, { linkedTransactionId: bank._id });

    const { status } = await asJson(await call(`/api/transactions/${bank._id}`, { token: annToken, method: 'DELETE' }));
    const survivor = await Transaction.findById(card._id).lean();

    assert.equal(status, 200);
    assert.equal(survivor.linkedTransactionId, undefined);
});

dbTest('a client cannot set the transfer link itself', async () => {
    const theirs = await Transaction.create({
        userId: bob._id, name: 'Bob row', type: 'expense', category: 'Food', amount: 5, date: new Date('2025-06-01'),
    });

    const created = await asJson(await call('/api/transactions', {
        token: annToken,
        method: 'POST',
        body: { name: 'Mine', type: 'transfer', category: 'Transfer', amount: 5, date: '2025-06-02', linkedTransactionId: String(theirs._id) },
    }));
    assert.equal(created.status, 201);
    assert.equal(created.body.linkedTransactionId, undefined);

    const updated = await asJson(await call(`/api/transactions/${created.body._id}`, {
        token: annToken, method: 'PUT', body: { linkedTransactionId: String(theirs._id) },
    }));
    assert.equal(updated.status, 200);
    assert.equal(updated.body.linkedTransactionId, undefined);
});

dbTest('an import commit stores transfer rows with their account type', async () => {
    const { status, body } = await asJson(await call('/api/transactions/import', {
        token: annToken,
        method: 'POST',
        body: {
            rows: [{
                rowNumber: 1, date: '2025-07-20', name: 'Chase Card Payment', description: 'Payment To Chase Card Ending IN 1301',
                amount: 500, type: 'transfer', category: 'Credit Card Payment', accountType: 'bank',
            }],
            batch: { filename: 'statement.pdf', fileHash: 'abc' },
        },
    }));

    assert.equal(status, 201);
    assert.equal(body.imported, 1);
    const stored = await Transaction.findById(body.transactions[0]._id).lean();
    assert.equal(stored.type, 'transfer');
    assert.equal(stored.accountType, 'bank');
});
