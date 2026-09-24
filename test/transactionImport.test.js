const test = require('node:test');
const assert = require('node:assert/strict');
const {
    cleanChaseTransactionName,
    normalizeChaseStatementText,
    normalizeCsvBuffer,
    normalizeSubmissionRow,
    resolveType,
    suggestCategory,
} = require('../lib/transactionImport');

test('parses generic amount CSV rows', () => {
    const csv = [
        'Date,Description,Amount',
        '2026-03-01,Payroll,1500.00',
        '2026-03-02,Coffee Shop,-6.25',
    ].join('\n');

    const rows = normalizeCsvBuffer(Buffer.from(csv));

    assert.equal(rows.length, 2);
    assert.equal(rows[0].type, 'income');
    assert.equal(rows[0].amount, 1500);
    assert.equal(rows[0].category, 'Salary');
    assert.equal(rows[0].status, 'ready');
    assert.equal(rows[1].type, 'expense');
    assert.equal(rows[1].amount, 6.25);
    assert.equal(rows[1].category, 'Food');
});

test('parses debit and credit CSV rows', () => {
    const csv = [
        'Transaction Date,Merchant,Debit,Credit',
        '2026-03-03,Gas Station,45.50,',
        '2026-03-04,Direct Deposit,,2500',
    ].join('\n');

    const rows = normalizeCsvBuffer(Buffer.from(csv), { sourceAccount: 'Checking' });

    assert.equal(rows[0].type, 'expense');
    assert.equal(rows[0].amount, 45.5);
    assert.equal(rows[0].sourceAccount, 'Checking');
    assert.equal(rows[1].type, 'income');
    assert.equal(rows[1].amount, 2500);
});

test('returns row-level validation errors', () => {
    const csv = [
        'Date,Description,Amount',
        'not-a-date,,',
    ].join('\n');

    const rows = normalizeCsvBuffer(Buffer.from(csv));

    assert.equal(rows[0].status, 'invalid');
    assert.deepEqual(rows[0].errors, [
        'Invalid or missing date',
        'Missing description',
        'Invalid or missing amount',
    ]);
});

test('submission normalization ignores spoofed user ids', () => {
    const row = normalizeSubmissionRow({
        date: '2026-03-05',
        name: 'Uber trip',
        amount: '18.20',
        type: 'expense',
        category: 'Transport',
        description: 'Airport ride',
        userId: 'spoofed-user',
    });

    assert.equal(row.status, 'ready');
    assert.equal(Object.prototype.hasOwnProperty.call(row, 'userId'), false);
    assert.equal(row.importHash.length, 64);
});

test('parses Chase statement PDF text using balance deltas', () => {
    const statementText = [
        'April 16, 2026 through May 15, 2026',
        'TRANSACTION DETAIL',
        'Beginning Balance $586.11',
        '04/22 Irs Treas 310 Tax Ref PPD ID: 9111736959 828.11',
        '04/22 Card Purchase 04/22 Subway 54791 Tempe AZ Card 6758 -10.80 817.31',
        '05/07 Payment Received 05/06 Venmo*Doshi Rishabh AL Visa Direct NY',
        'Card 6758 895.91',
        'Ending Balance $895.91',
    ].join('\n');

    const rows = normalizeChaseStatementText(statementText, { sourceAccount: 'Chase 9550' });

    assert.equal(rows.length, 3);
    assert.equal(rows[0].type, 'income');
    assert.equal(rows[0].amount, 242);
    assert.equal(rows[1].type, 'expense');
    assert.equal(rows[1].amount, 10.8);
    assert.equal(rows[1].name, 'Subway');
    assert.equal(rows[1].description, 'Card Purchase 04/22 Subway 54791 Tempe AZ Card 6758');
    assert.equal(rows[2].type, 'income');
    assert.equal(rows[2].amount, 78.6);
    assert.equal(rows[2].name, 'Venmo - Doshi Rishabh');
    assert.equal(rows[2].description, 'Payment Received 05/06 Venmo*Doshi Rishabh AL Visa Direct NY Card 6758');
});

test('cleans Chase transaction names while preserving meaning', () => {
    assert.equal(
        cleanChaseTransactionName('Irs Treas 310 Tax Ref PPD ID: 9111736959'),
        'IRS Tax Refund'
    );
    assert.equal(
        cleanChaseTransactionName('Card Purchase 04/22 Subway 54791 Tempe AZ Card 6758'),
        'Subway'
    );
    assert.equal(
        cleanChaseTransactionName('Card Purchase 04/26 Cheesecake 036 Online Olo.Com AZ Card 6758'),
        'Cheesecake'
    );
    assert.equal(
        cleanChaseTransactionName('Card Purchase 05/05 Taco Bell #721245 928-681-3344 AZ Card 6758'),
        'Taco Bell'
    );
    assert.equal(
        cleanChaseTransactionName('Payment Received 05/06 Venmo*Doshi Rishabh AL Visa Direct NY Card 6758'),
        'Venmo - Doshi Rishabh'
    );
    assert.equal(
        cleanChaseTransactionName('Recurring Card Purchase 05/10 Openai *Chatgpt Subscr Openai.Com CA Card 6758'),
        'OpenAI ChatGPT'
    );
    assert.equal(
        cleanChaseTransactionName("Card Purchase 05/11 Domino's 7603 480-460-3332 AZ Card 6758"),
        "Domino's"
    );
    assert.equal(
        cleanChaseTransactionName('Card Purchase With Pin 05/01 Costco Whse #0481 Gilbert AZ Card 6758'),
        'Costco'
    );
    assert.equal(
        cleanChaseTransactionName('Card Purchase 05/14 Walmart.Com 800-925-6278 AR Card 6758'),
        'Walmart'
    );
    assert.equal(
        cleanChaseTransactionName('Zelle Payment To Ansh Asu Se Jpm99Cf546I9'),
        'Zelle - Ansh Asu Se'
    );
});

test('suggests categories from common statement phrases', () => {
    assert.equal(
        suggestCategory('recurring card purchase openai chatgpt subscription', 'expense'),
        'Subscription'
    );
    assert.equal(
        suggestCategory('subway cheesecakE taco bell', 'expense'),
        'Food'
    );
    assert.equal(
        suggestCategory('zelle payment to ansh asu', 'expense'),
        'Transfer'
    );
    assert.equal(
        suggestCategory('venmo doshi rishabh payment received', 'income'),
        'Transfer'
    );
    assert.equal(
        suggestCategory('chase credit crd autopay ppd id', 'expense'),
        'Credit Card Payment'
    );
    assert.equal(
        suggestCategory('irs treas 310 tax ref tax refund', 'income'),
        'Tax Refund'
    );
    assert.equal(
        suggestCategory('card purchase return walmart.com', 'income'),
        'Groceries'
    );
    assert.equal(
        suggestCategory('google play g.co helppay', 'expense'),
        'Subscription'
    );
});

test('imported subscriptions are typed subscription, not expense', () => {
    const csv = [
        'Date,Description,Amount',
        '2026-03-01,Netflix Monthly,-15.99',
        '2026-03-02,Recurring Card Purchase Openai ChatGPT Subscr,-21.62',
        '2026-03-03,Coffee Shop,-6.25',
    ].join('\n');

    const rows = normalizeCsvBuffer(Buffer.from(csv));

    // The importer derives direction from the amount's sign and could only ever
    // produce 'expense'. A subscription category now promotes it.
    assert.equal(rows[0].category, 'Subscription');
    assert.equal(rows[0].type, 'subscription');
    assert.equal(rows[1].category, 'Subscription');
    assert.equal(rows[1].type, 'subscription');
    // Everything else is untouched.
    assert.equal(rows[2].type, 'expense');
});

test('an inflow is never promoted to subscription', () => {
    const csv = [
        'Date,Description,Amount',
        // A refund from a subscription merchant is money coming in, not a charge.
        '2026-03-01,Netflix Refund,15.99',
    ].join('\n');

    const rows = normalizeCsvBuffer(Buffer.from(csv));

    assert.equal(rows[0].type, 'income');
});

test('resolveType only promotes outflows in a subscription category', () => {
    assert.equal(resolveType('expense', 'Subscription'), 'subscription');
    assert.equal(resolveType('expense', 'Streaming'), 'subscription');
    assert.equal(resolveType('expense', 'Gym'), 'subscription');
    assert.equal(resolveType('expense', 'Groceries'), 'expense');
    assert.equal(resolveType('income', 'Subscription'), 'income');
});

test('a statement subscription is typed subscription', () => {
    const statement = [
        'CHECKING SUMMARY',
        'Beginning Balance $1,000.00',
        'TRANSACTION DETAIL',
        '03/02 Recurring Card Purchase 03/01 Spotify USA 877-778-1161 NY Card 1234 11.99 988.01',
        '03/05 Card Purchase 03/04 Trader Joes Card 1234 40.00 948.01',
        'Ending Balance $948.01',
        'through March 31, 2026',
    ].join('\n');

    const rows = normalizeChaseStatementText(statement);
    const spotify = rows.find((r) => /spotify/i.test(r.name));
    const groceries = rows.find((r) => /trader/i.test(r.name));

    assert.equal(spotify.category, 'Subscription');
    assert.equal(spotify.type, 'subscription');
    assert.equal(groceries.type, 'expense');
});

// --- credit card payments are transfers ------------------------------------

test('a manual card payment gets a clean name, without its date prefix', () => {
    assert.equal(cleanChaseTransactionName('07/20 Payment To Chase Card Ending IN 1301'), 'Chase Card Payment');
    assert.equal(cleanChaseTransactionName('Payment To Chase Card Ending IN 1301'), 'Chase Card Payment');
});

test('resolveType makes an outgoing card payment a transfer, never an inflow', () => {
    assert.equal(resolveType('expense', 'Credit Card Payment'), 'transfer');
    assert.equal(resolveType('income', 'Credit Card Payment'), 'income');
});

test('both shapes of card payment in a checking statement import as transfers', () => {
    const statement = [
        'CHECKING SUMMARY',
        'Beginning Balance $2,000.00',
        'TRANSACTION DETAIL',
        '07/06 Chase Credit Crd Autopay PPD ID: 4760039224 -40.00 1,960.00',
        '07/20 07/20 Payment To Chase Card Ending IN 1301 -500.00 1,460.00',
        '07/21 Card Purchase 07/21 Subway 54791 Tempe AZ Card 6758 -10.00 1,450.00',
        'Ending Balance $1,450.00',
        'through July 31, 2026',
    ].join('\n');

    const [autopay, manual, subway] = normalizeChaseStatementText(statement, { sourceAccount: 'Chase 9550' });

    // The autopay name predates this change and is part of its import hash, so it
    // must not move -- otherwise re-importing an old statement duplicates the row.
    assert.equal(autopay.name, 'Chase Credit Card Autopay');
    assert.equal(autopay.type, 'transfer');
    assert.equal(autopay.category, 'Credit Card Payment');
    assert.equal(autopay.amount, 40);

    assert.equal(manual.name, 'Chase Card Payment');
    assert.equal(manual.type, 'transfer');
    assert.equal(manual.category, 'Credit Card Payment');
    assert.equal(manual.amount, 500);
    assert.equal(manual.date, '2026-07-20');
    assert.equal(manual.status, 'ready');

    assert.equal(subway.type, 'expense');
});

test('a card payment in a CSV export is a transfer too', () => {
    const csv = [
        'Date,Description,Amount',
        '2026-07-20,Payment To Chase Card Ending IN 1301,-500.00',
    ].join('\n');

    const [row] = normalizeCsvBuffer(Buffer.from(csv));

    assert.equal(row.type, 'transfer');
    assert.equal(row.category, 'Credit Card Payment');
    assert.equal(row.amount, 500);
});

test('submission accepts transfer and a known accountType, and drops an unknown one', () => {
    const base = { date: '2026-07-20', name: 'Chase Card Payment', amount: 500, category: 'Credit Card Payment' };

    const transfer = normalizeSubmissionRow({ ...base, type: 'transfer', accountType: 'credit_card' });
    assert.equal(transfer.status, 'ready');
    assert.equal(transfer.type, 'transfer');
    assert.equal(transfer.accountType, 'credit_card');

    const bogus = normalizeSubmissionRow({ ...base, type: 'transfer', accountType: 'offshore' });
    assert.equal(bogus.status, 'ready');
    assert.equal(bogus.accountType, undefined);

    const badType = normalizeSubmissionRow({ ...base, type: 'gift' });
    assert.equal(badType.status, 'invalid');
    assert.deepEqual(badType.errors, ['Invalid transaction type']);
});
