const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildImportHash,
    cleanChaseTransactionName,
    isChaseCardStatementText,
    parseChaseCardStatementText,
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

test('resolveType leaves a card payment from checking an expense; pairing decides', () => {
    assert.equal(resolveType('expense', 'Credit Card Payment'), 'expense');
    assert.equal(resolveType('income', 'Credit Card Payment'), 'income');
});

test('both shapes of card payment in a checking statement import as card-payment expenses', () => {
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
    // Spending until its card statement is imported and the matcher pairs it.
    assert.equal(autopay.type, 'expense');
    assert.equal(autopay.category, 'Credit Card Payment');
    assert.equal(autopay.amount, 40);

    assert.equal(manual.name, 'Chase Card Payment');
    assert.equal(manual.type, 'expense');
    assert.equal(manual.category, 'Credit Card Payment');
    assert.equal(manual.amount, 500);
    assert.equal(manual.date, '2026-07-20');
    assert.equal(manual.status, 'ready');

    assert.equal(subway.type, 'expense');
});

test('a card payment in a CSV export is categorised the same way', () => {
    const csv = [
        'Date,Description,Amount',
        '2026-07-20,Payment To Chase Card Ending IN 1301,-500.00',
    ].join('\n');

    const [row] = normalizeCsvBuffer(Buffer.from(csv));

    // The CSV path does not clean names. scripts/reconcileCardPayments.js relies on
    // that: it leaves CSV rows' names and hashes alone because a re-import keeps them.
    assert.equal(row.name, 'Payment To Chase Card Ending IN 1301');
    assert.equal(row.type, 'expense');
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

// --- credit card statements ------------------------------------------------------

// Synthetic, shaped like the pdf-parse output of a real Chase card statement. The
// figures balance: 100.00 - 60.00 + 50.00 + 2.50 = 92.50, and the rows sum to -7.50.
const cardStatement = (overrides = {}) => {
    const rows = overrides.rows || [
        '12/20 AUTOMATIC PAYMENT - THANK YOU -40.00',
        '12/22 STATEMENT CREDIT -20.00',
        '12/06 CORNER BAKERY 555-123-4567 NY 30.00',
        '01/03 SKYWAY AIRLINES 0012345 SKYWAY.COM TX 20.00',
        '010526 1 K JFK LAX',
        '01/07 PURCHASE INTEREST CHARGE 2.50',
    ];
    return [
        'Payment Due Date: 02/04/26',
        'New Balance: $92.50',
        'Minimum Payment Due: $25.00',
        'Account Number: XXXX XXXX XXXX 4242',
        'New Balance $92.50',
        `Previous Balance ${overrides.previous || '$100.00'}`,
        'Payment, Credits -$60.00',
        'Purchases +$50.00',
        'Cash Advances $0.00',
        'Balance Transfers $0.00',
        'Fees Charged $0.00',
        'Interest Charged +$2.50',
        'Opening/Closing Date 12/08/25 - 01/07/26',
        'Credit Limit $1,000',
        'ACCOUNT SUMMARY',
        'CHASE SAPPHIRE TEST',
        'Date of',
        'Transaction Merchant Name or Transaction Description $ Amount',
        ...rows,
        'TOTAL INTEREST FOR THIS PERIOD $2.50',
        'Purchases 24.99%(v)(d) $80.00 $2.50',
    ].join('\n');
};

test('a card statement is recognised, and a checking statement is not', () => {
    assert.equal(isChaseCardStatementText(cardStatement()), true);
    assert.equal(isChaseCardStatementText([
        'CHECKING SUMMARY', 'Beginning Balance $10.00', '03/02 Card Purchase Coffee -2.00 8.00',
    ].join('\n')), false);
});

test('the card statement summary is read as printed', () => {
    const { statement } = parseChaseCardStatementText(cardStatement());

    assert.deepEqual(statement, {
        issuer: 'Chase',
        productName: 'Chase Sapphire Test',
        last4: '4242',
        sourceAccount: 'Chase ••4242',
        openingDate: '2025-12-08',
        closingDate: '2026-01-07',
        dueDate: '2026-02-04',
        minimumPayment: 25,
        creditLimit: 1000,
        purchaseApr: 24.99,
        previousBalance: 100,
        payments: -60,
        purchases: 50,
        cashAdvances: 0,
        balanceTransfers: 0,
        fees: 0,
        interest: 2.5,
        newBalance: 92.5,
    });
});

test('card rows flip sign by meaning: charges spend, payments transfer, credits earn', () => {
    const { rows } = parseChaseCardStatementText(cardStatement());
    const [payment, credit, bakery, flight, interest] = rows;

    assert.equal(rows.length, 5);
    rows.forEach((row) => {
        assert.equal(row.accountType, 'credit_card');
        assert.equal(row.sourceAccount, 'Chase ••4242');
        assert.equal(row.status, 'ready');
        assert.ok(row.amount > 0, 'amounts are stored as magnitudes');
        assert.ok(row.importHash);
    });

    assert.equal(payment.type, 'transfer');
    assert.equal(payment.category, 'Credit Card Payment');
    assert.equal(payment.name, 'Card Payment Received');
    assert.equal(payment.amount, 40);

    assert.equal(credit.type, 'income');
    assert.equal(credit.category, 'Rewards');
    assert.equal(credit.name, 'Rewards Redemption');

    assert.equal(bakery.type, 'expense');
    assert.equal(bakery.name, 'Corner Bakery');
    assert.equal(bakery.amount, 30);

    assert.equal(flight.category, 'Travel');
    assert.equal(flight.description, 'SKYWAY AIRLINES 0012345 SKYWAY.COM TX 010526 1 K JFK LAX',
        'a wrapped line joins the row above it');

    assert.equal(interest.type, 'expense');
    assert.equal(interest.category, 'Interest & Fees');
    assert.equal(interest.amount, 2.5);
});

test('card row years come from the closing date, across the new year', () => {
    const { rows } = parseChaseCardStatementText(cardStatement());
    const dates = rows.map((row) => row.date);

    // 12/06 is before the period opens (12/08) but still 2025; 01/xx is 2026.
    assert.deepEqual(dates, ['2025-12-20', '2025-12-22', '2025-12-06', '2026-01-03', '2026-01-07']);
});

test('a merchant refund on the card is income in the merchant category', () => {
    const { rows } = parseChaseCardStatementText(cardStatement({
        rows: [
            '12/20 AUTOMATIC PAYMENT - THANK YOU -40.00',
            '12/22 STATEMENT CREDIT -20.00',
            '12/23 WALMART.COM 800-925-6278 AR -5.00',
            '12/24 CORNER BAKERY 555-123-4567 NY 55.00',
            '01/07 PURCHASE INTEREST CHARGE 2.50',
        ],
    }));
    const refund = rows.find((row) => row.name === 'Walmart');

    assert.equal(refund.type, 'income');
    assert.equal(refund.category, 'Groceries');
    assert.equal(refund.amount, 5);
});

test('card rows that do not add up to the balance change refuse the whole statement', () => {
    const misread = cardStatement({
        rows: [
            '12/20 AUTOMATIC PAYMENT - THANK YOU -40.00',
            '12/22 STATEMENT CREDIT -20.00',
            '12/06 CORNER BAKERY 555-123-4567 NY 30.00',
            '01/07 PURCHASE INTEREST CHARGE 2.50',
        ],
    });

    assert.throws(() => parseChaseCardStatementText(misread), (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /do not add up: they total \$-27\.50, but the balance moved by \$-7\.50/);
        return true;
    });
});

test('a card summary that does not balance is refused before any row is read', () => {
    assert.throws(() => parseChaseCardStatementText(cardStatement({ previous: '$101.00' })), (error) => {
        assert.equal(error.statusCode, 400);
        assert.match(error.message, /does not balance/);
        return true;
    });
});

test('a card row keeps the account from its statement over the form field', () => {
    const [row] = parseChaseCardStatementText(cardStatement()).rows;
    const submitted = normalizeSubmissionRow(row, { sourceAccount: 'Typed in the form' });

    assert.equal(submitted.sourceAccount, 'Chase ••4242');
    assert.equal(submitted.importHash, row.importHash, 'the preview and commit hashes must agree');

    const bankRow = normalizeSubmissionRow({ ...row, accountType: undefined }, { sourceAccount: 'Typed in the form' });
    assert.equal(bankRow.sourceAccount, 'Typed in the form');
});

test('uber eats is food even though the line also says uber', () => {
    assert.equal(cleanChaseTransactionName('Card Purchase 07/23 UBER *EATS HELP.UBER.COM CA Card 6758'), 'Uber Eats');
    assert.equal(suggestCategory('uber eats uber *eats help.uber.com ca', 'expense'), 'Food');
    assert.equal(suggestCategory('uber uber *trip help.uber.com ca', 'expense'), 'Transport');
});

test('two identical charges on one statement both import, with distinct hashes', () => {
    const { rows } = parseChaseCardStatementText(cardStatement({
        rows: [
            '12/20 AUTOMATIC PAYMENT - THANK YOU -40.00',
            '12/22 STATEMENT CREDIT -20.00',
            '12/06 METRO TRANSIT NY 15.00',
            '12/06 METRO TRANSIT NY 15.00',
            '01/03 SKYWAY AIRLINES 0012345 SKYWAY.COM TX 20.00',
            '01/07 PURCHASE INTEREST CHARGE 2.50',
        ],
    }));
    const [first, second] = rows.filter((row) => /metro/i.test(row.description));

    assert.equal(first.occurrence, undefined);
    assert.equal(second.occurrence, 2);
    assert.notEqual(first.importHash, second.importHash);
    // The first copy hashes exactly as before occurrences existed.
    assert.equal(first.importHash, buildImportHash(first));

    // And the commit step recomputes the same hashes from what the client sends back.
    assert.equal(normalizeSubmissionRow(first).importHash, first.importHash);
    assert.equal(normalizeSubmissionRow(second).importHash, second.importHash);
});

test('section and page headers inside the activity block are not glued onto a row', () => {
    const { rows } = parseChaseCardStatementText(cardStatement({
        rows: [
            'PAYMENTS AND OTHER CREDITS',
            '12/20 AUTOMATIC PAYMENT - THANK YOU -40.00',
            '12/22 STATEMENT CREDIT -20.00',
            'PURCHASE',
            '12/06 CORNER BAKERY 555-123-4567 NY 30.00',
            'Page 2 of 3 Statement Date: 01/07/26 JANE DOE',
            'Date of',
            'Transaction Merchant Name or Transaction Description $ Amount',
            'ACCOUNT ACTIVITY (CONTINUED)',
            '01/03 SKYWAY AIRLINES 0012345 SKYWAY.COM TX 20.00',
            '010526 1 K JFK LAX',
            'FEES CHARGED',
            'TOTAL FEES FOR THIS PERIOD $0.00',
            'INTEREST CHARGED',
            '01/07 PURCHASE INTEREST CHARGE 2.50',
        ],
    }));

    assert.deepEqual(rows.map((row) => row.description), [
        'AUTOMATIC PAYMENT - THANK YOU',
        'STATEMENT CREDIT',
        'CORNER BAKERY 555-123-4567 NY',
        'SKYWAY AIRLINES 0012345 SKYWAY.COM TX 010526 1 K JFK LAX',
        'PURCHASE INTEREST CHARGE',
    ]);
});

test('lines that clean to the same hash inputs are still told apart', () => {
    const { rows } = parseChaseCardStatementText(cardStatement({
        rows: [
            '12/20 AUTOMATIC PAYMENT - THANK YOU -40.00',
            '12/22 STATEMENT CREDIT -20.00',
            // A charge and its same-day refund: same name, same unsigned amount.
            '12/06 CORNER BAKERY 555-123-4567 NY 25.00',
            '12/06 CORNER BAKERY 555-123-4567 NY -25.00',
            // Two different trips whose printed lines differ but both clean to 'Uber'.
            '12/07 UBER *TRIP HELP.UBER.COM CA 15.00',
            '12/07 UBER *TRIP 8XYZ HELP.UBER.COM CA 15.00',
            '01/03 SKYWAY AIRLINES 0012345 SKYWAY.COM TX 20.00',
            '01/07 PURCHASE INTEREST CHARGE 2.50',
        ],
    }));
    const hashes = rows.map((row) => row.importHash);

    assert.equal(new Set(hashes).size, rows.length, 'every row must survive duplicate marking');
    assert.equal(rows.filter((row) => row.name === 'Uber').length, 2);
});

test("pdf-parse's page separator is not glued onto the last row of a page", () => {
    const { rows } = parseChaseCardStatementText(cardStatement({
        rows: [
            '12/20 AUTOMATIC PAYMENT - THANK YOU -40.00',
            '12/22 STATEMENT CREDIT -20.00',
            '12/06 CORNER BAKERY 555-123-4567 NY 30.00',
            '',
            '-- 1 of 3 --',
            '',
            '01/03 SKYWAY AIRLINES 0012345 SKYWAY.COM TX 20.00',
            '01/07 PURCHASE INTEREST CHARGE 2.50',
        ],
    }));

    assert.equal(rows[2].description, 'CORNER BAKERY 555-123-4567 NY');
    assert.equal(rows[2].name, 'Corner Bakery');
});

test("only Chase's own fees are Interest & Fees, not a merchant with 'fee' in its name", () => {
    const { rows } = parseChaseCardStatementText(cardStatement({
        rows: [
            '12/20 AUTOMATIC PAYMENT - THANK YOU -40.00',
            '12/22 STATEMENT CREDIT -20.00',
            '12/06 AZ MVD REGISTRATION FEE 602-255-0072 AZ 30.00',
            '01/03 LATE FEE 20.00',
            '01/07 PURCHASE INTEREST CHARGE 2.50',
        ],
    }));
    const [, , mvd, late, interest] = rows;

    assert.notEqual(mvd.category, 'Interest & Fees');
    assert.equal(late.category, 'Interest & Fees');
    assert.equal(interest.category, 'Interest & Fees');
});
