const crypto = require('crypto');
const { parse } = require('csv-parse/sync');
const { fromCents, sumMoney, toCents } = require('./money');

const MAX_IMPORT_ROWS = 5000;
const TRANSACTION_TYPES = ['income', 'expense', 'subscription', 'transfer'];
const ACCOUNT_TYPES = ['bank', 'credit_card'];

const DATE_COLUMNS = ['date', 'transaction date', 'posted date', 'post date'];
const NAME_COLUMNS = ['description', 'name', 'merchant', 'memo', 'payee'];
const AMOUNT_COLUMNS = ['amount', 'transaction amount'];
const DEBIT_COLUMNS = ['debit', 'withdrawal', 'withdrawals', 'charge', 'charges'];
const CREDIT_COLUMNS = ['credit', 'deposit', 'deposits'];

// Categories that mean "recurring commitment". A row landing in one of these while
// going out gets typed 'subscription' rather than 'expense', so imported and
// hand-entered subscriptions share one shape. Kept in sync with CATEGORY_OPTIONS
// in finance-tracker-frontend/src/AddTransaction.js -- separate module systems, so
// the list cannot be shared.
const SUBSCRIPTION_CATEGORIES = ['Subscription', 'Streaming', 'Software', 'Cloud', 'Gym', 'Membership'];

const CATEGORY_RULES = [
    { category: 'Subscription', keywords: ['recurring card purchase', 'openai chatgpt', 'google play', 'netflix', 'spotify', 'subscription', 'membership'] },
    { category: 'Credit Card Payment', keywords: ['chase credit card autopay', 'chase credit crd autopay', 'credit card autopay', 'credit crd autopay', 'chase card payment', 'payment to chase card'] },
    { category: 'Transfer', keywords: ['zelle payment', 'zelle -', 'cash app', 'cashapp', 'venmo', 'payment received'] },
    { category: 'Tax Refund', keywords: ['irs tax refund', 'irs treas', 'az tax refund', 'az dept of rev tax refund', 'tax refund'] },
    { category: 'Groceries', keywords: ['grocery', 'supermarket', 'walmart', 'target', 'costco', 'trader joe', 'whole foods'] },
    // Ahead of Transport: an Uber Eats line also contains 'uber'.
    { category: 'Food', keywords: ['uber eats', 'uber *eats'] },
    { category: 'Travel', keywords: ['united airlines', 'united.com', 'airlines', 'airbnb', 'hotel'] },
    { category: 'Cloud', keywords: ['google cloud', 'google *cloud'] },
    { category: 'Transport', keywords: ['uber', 'lyft', 'gas', 'fuel', 'shell', 'chevron', 'parking', 'metro'] },
    { category: 'Food', keywords: ['restaurant', 'coffee', 'cafe', 'starbucks', 'doordash', 'ubereats', 'grubhub', 'subway', 'cheesecake', 'taco bell', "domino's", 'dominos'] },
    { category: 'Housing', keywords: ['rent', 'mortgage', 'apartment'] },
    { category: 'Utilities', keywords: ['utility', 'electric', 'water', 'internet', 'phone', 'comcast', 'verizon', 'at&t', 'mint mobile'] },
    { category: 'Health', keywords: ['pharmacy', 'doctor', 'medical', 'dentist', 'clinic'] },
    { category: 'Entertainment', keywords: ['netflix', 'spotify', 'movie', 'cinema', 'ticket'] },
    { category: 'Salary', keywords: ['payroll', 'salary', 'direct deposit'] },
    { category: 'Investment', keywords: ['dividend', 'brokerage', 'interest'] },
];

const normalizeHeader = (header) =>
    String(header || '')
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ');

const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const titleCaseMerchant = (value) =>
    normalizeText(value)
        .toLowerCase()
        .replace(/\b\w/g, (character) => character.toUpperCase())
        .replace(/'\w/g, (match) => match.toLowerCase())
        .replace(/\b(Irs|Ppd|Az|Ny|Ca|Com|Olo|Jpm)\b/g, (match) => match.toUpperCase());

const normalizeMerchantAlias = (value) => {
    const merchant = normalizeText(value);
    const aliasRules = [
        { pattern: /^Costco Whse\b/i, name: 'Costco' },
        { pattern: /^Walmart\.Com\b/i, name: 'Walmart' },
        { pattern: /^Google\s+\*Play\b/i, name: 'Google Play' },
        { pattern: /^Domino'?s\b/i, name: "Domino's" },
        { pattern: /^OpenAI\s+ChatGPT\b/i, name: 'OpenAI ChatGPT' },
        // Seen on the credit card statement, where merchants keep their processor prefix.
        { pattern: /^Uber\s+\*Eats\b/i, name: 'Uber Eats' },
        { pattern: /^Uber\s+\*Trip\b/i, name: 'Uber' },
        { pattern: /^United\b/i, name: 'United Airlines' },
        { pattern: /^Paypal\s+\*Mint\s+Mobile\b/i, name: 'Mint Mobile' },
        { pattern: /^Google\s+\*Cloud\b/i, name: 'Google Cloud' },
    ];
    const alias = aliasRules.find((rule) => rule.pattern.test(merchant));

    return alias?.name || merchant;
};

const cleanCardMerchantName = (description) => {
    let merchant = normalizeText(description)
        .replace(/^(Recurring Card Purchase|Card Purchase With Pin|Card Purchase Return|Card Purchase)\s+/i, '')
        .replace(/^\d{2}\/\d{2}\s+/, '')
        .replace(/\s+Card\s+\d{4}\b.*$/i, '')
        .replace(/\s+\b[A-Z]{2}\b$/i, '')
        .replace(/\s+\d{3}-\d{3}-\d{4}\b.*$/i, '')
        .replace(/\s+\d{3}-\d{4}\b.*$/i, '')
        .replace(/\s+#?\d{3,}\b.*$/i, '')
        .replace(/\s+Online\s+Olo\.Com\b.*$/i, '')
        .replace(/\s+800-\d{3}-\d{4}\b.*$/i, '')
        .replace(/\s+G\.CO\/.*$/i, '')
        .replace(/\s+Www\..*$/i, '')
        .replace(/\s+\*Chatgpt\s+Subscr\b.*$/i, ' ChatGPT')
        .replace(/^Openai\b/i, 'OpenAI');

    merchant = merchant.replace(/\s+#?\d+\b.*$/i, '');

    return normalizeMerchantAlias(titleCaseMerchant(merchant));
};

const cleanChaseTransactionName = (description) => {
    const normalizedDescription = normalizeText(description);

    if (/^Irs\s+Treas\s+310\s+Tax\s+Ref/i.test(normalizedDescription)) return 'IRS Tax Refund';
    if (/^AZ Dept of Rev\s+Tax Refund/i.test(normalizedDescription)) return 'AZ Tax Refund';
    if (/^Chase Credit Crd Autopay/i.test(normalizedDescription)) return 'Chase Credit Card Autopay';
    // A manual card payment carries its own date ahead of the text, which used to
    // end up in the name: "07/20 Payment To Chase Card Ending IN 1301".
    if (/^(?:\d{2}\/\d{2}\s+)?Payment To Chase Card Ending IN \d{4}/i.test(normalizedDescription)) return 'Chase Card Payment';
    if (/^Remote Online Deposit/i.test(normalizedDescription)) return 'Remote Online Deposit';

    const zelleMatch = normalizedDescription.match(/^Zelle Payment To\s+(.+?)(?:\s+Jpm\w+)?$/i);
    if (zelleMatch) return `Zelle - ${titleCaseMerchant(zelleMatch[1])}`;

    const venmoMatch = normalizedDescription.match(/^Payment Received\s+\d{2}\/\d{2}\s+Venmo\*([A-Za-z\s]+?)(?:\s+AL\s+Visa Direct\s+NY)?(?:\s+Card\s+\d{4})?$/i);
    if (venmoMatch) return `Venmo - ${titleCaseMerchant(venmoMatch[1])}`;

    if (/^(Recurring Card Purchase|Card Purchase With Pin|Card Purchase Return|Card Purchase)\s+/i.test(normalizedDescription)) {
        return cleanCardMerchantName(normalizedDescription) || normalizedDescription;
    }

    return normalizedDescription;
};

const findColumn = (headers, candidates) => {
    const normalizedCandidates = candidates.map(normalizeHeader);
    return headers.find((header) => normalizedCandidates.includes(normalizeHeader(header)));
};

const parseMoney = (value) => {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) return null;

    const isNegativeByParentheses = /^\(.*\)$/.test(rawValue);
    const cleanedValue = rawValue.replace(/[$,\s()]/g, '');
    const parsedValue = Number(cleanedValue);

    if (!Number.isFinite(parsedValue) || parsedValue === 0) return null;
    return isNegativeByParentheses ? -Math.abs(parsedValue) : parsedValue;
};

const parseStatementMoney = (value) => {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) return null;

    const isNegative = rawValue.includes('-');
    const cleanedValue = rawValue.replace(/[$,\s-]/g, '');
    const parsedValue = Number(cleanedValue);

    if (!Number.isFinite(parsedValue)) return null;
    return isNegative ? -Math.abs(parsedValue) : parsedValue;
};

const parseDateValue = (value) => {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) return null;

    const isoDateMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDateMatch) {
        const [, year, month, day] = isoDateMatch;
        return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
    }

    const slashDateMatch = rawValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashDateMatch) {
        const [, month, day, year] = slashDateMatch;
        return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
    }

    const parsedDate = new Date(rawValue);
    if (Number.isNaN(parsedDate.getTime())) return null;
    return parsedDate;
};

const formatDateForInput = (date) => {
    if (!date) return '';
    return date.toISOString().slice(0, 10);
};

const suggestCategory = (name, type) => {
    if (type === 'income') {
        const incomeMatch = CATEGORY_RULES.find((rule) =>
            ['Salary', 'Investment', 'Transfer', 'Tax Refund'].includes(rule.category) &&
            rule.keywords.some((keyword) => name.includes(keyword))
        );
        if (incomeMatch) return incomeMatch.category;
    }

    const match = CATEGORY_RULES.find((rule) =>
        !['Salary', 'Investment'].includes(rule.category) &&
        rule.keywords.some((keyword) => name.includes(keyword))
    );
    return match?.category || 'Misc';
};

/**
 * The importer derives direction from the sign of the amount, which can only ever
 * produce 'income' or 'expense'. An outflow in a subscription category is promoted
 * to 'subscription', so the Subscriptions view does not have to understand two
 * shapes. That type is already in OUTFLOW_TYPES, so no figure changes.
 *
 * A checking-side card payment ('Credit Card Payment') deliberately stays an
 * expense here. It becomes a transfer only when lib/transferMatch.js pairs it with
 * the card statement's own payment row -- until then it is the only record of the
 * card spending it paid for.
 */
const resolveType = (baseType, category) => {
    if (baseType === 'income') return baseType;
    if (SUBSCRIPTION_CATEGORIES.includes(category)) return 'subscription';
    return baseType;
};

/**
 * `occurrence` separates genuinely identical lines in one statement -- two $2.90
 * transit taps on the same day -- which would otherwise share a hash and have the
 * second skipped as a duplicate. The first copy has no occurrence, so every hash
 * built before this existed is unchanged; only the 2nd, 3rd... copies differ.
 */
const buildImportHash = ({ date, amount, name, description, sourceAccount, occurrence }) => {
    const parts = [
        formatDateForInput(date instanceof Date ? date : parseDateValue(date)),
        Number(amount || 0).toFixed(2),
        normalizeText(name || description).toLowerCase(),
        normalizeText(sourceAccount).toLowerCase(),
    ];
    if (Number.isInteger(occurrence) && occurrence > 1) parts.push(`#${occurrence}`);
    const hashInput = parts.join('|');

    return crypto.createHash('sha256').update(hashInput).digest('hex');
};

const getColumns = (records) => {
    const firstRecord = records[0] || {};
    const headers = Object.keys(firstRecord);

    return {
        dateColumn: findColumn(headers, DATE_COLUMNS),
        nameColumn: findColumn(headers, NAME_COLUMNS),
        amountColumn: findColumn(headers, AMOUNT_COLUMNS),
        debitColumn: findColumn(headers, DEBIT_COLUMNS),
        creditColumn: findColumn(headers, CREDIT_COLUMNS),
    };
};

const getRowAmount = (record, columns) => {
    if (columns.amountColumn) {
        return parseMoney(record[columns.amountColumn]);
    }

    const debitAmount = columns.debitColumn ? parseMoney(record[columns.debitColumn]) : null;
    const creditAmount = columns.creditColumn ? parseMoney(record[columns.creditColumn]) : null;

    if (creditAmount !== null) return Math.abs(creditAmount);
    if (debitAmount !== null) return -Math.abs(debitAmount);
    return null;
};

const normalizeRecord = (record, columns, options = {}) => {
    const sourceAccount = normalizeText(options.sourceAccount);
    const errors = [];
    const parsedDate = columns.dateColumn ? parseDateValue(record[columns.dateColumn]) : null;
    const name = columns.nameColumn ? normalizeText(record[columns.nameColumn]) : '';
    const signedAmount = getRowAmount(record, columns);

    if (!columns.dateColumn || !parsedDate) errors.push('Invalid or missing date');
    if (!columns.nameColumn || !name) errors.push('Missing description');
    if (signedAmount === null) errors.push('Invalid or missing amount');

    const baseType = signedAmount !== null && signedAmount > 0 ? 'income' : 'expense';
    const amount = signedAmount === null ? '' : Math.abs(signedAmount);
    const category = suggestCategory(name.toLowerCase(), baseType);
    const type = resolveType(baseType, category);
    const importHash = errors.length === 0
        ? buildImportHash({ date: parsedDate, amount, name, sourceAccount })
        : '';

    return {
        rowNumber: Number(options.rowNumber) || 0,
        date: formatDateForInput(parsedDate),
        name,
        description: name,
        amount,
        type,
        category,
        sourceAccount,
        importHash,
        status: errors.length > 0 ? 'invalid' : 'ready',
        errors,
    };
};

const parseCsvBuffer = (buffer) => {
    const records = parse(buffer, {
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true,
    });

    if (records.length > MAX_IMPORT_ROWS) {
        const error = new Error(`CSV import is limited to ${MAX_IMPORT_ROWS} rows`);
        error.statusCode = 400;
        throw error;
    }

    return records;
};

const normalizeCsvBuffer = (buffer, options = {}) => {
    const records = parseCsvBuffer(buffer);
    const columns = getColumns(records);

    return records.map((record, index) => normalizeRecord(record, columns, {
        ...options,
        rowNumber: index + 2,
    }));
};

const getStatementYear = (text) => {
    const match = String(text || '').match(/\bthrough\s+[A-Za-z]+\s+\d{1,2},\s+(\d{4})\b/i);
    return match ? Number(match[1]) : new Date().getFullYear();
};

const getBeginningBalanceBeforeTransactions = (lines, firstTransactionIndex) => {
    for (let index = firstTransactionIndex - 1; index >= 0; index -= 1) {
        const match = lines[index].match(/Beginning Balance\s+\$?([0-9,]+\.\d{2})/i);
        if (match) return parseStatementMoney(match[1]);
    }

    return null;
};

const buildTransactionBlocks = (lines) => {
    const blocks = [];
    let currentBlock = null;

    lines.forEach((line, index) => {
        const normalizedLine = normalizeText(line);
        if (!normalizedLine) return;

        const transactionMatch = normalizedLine.match(/^(\d{2}\/\d{2})\s+(.+)$/);
        if (transactionMatch) {
            if (currentBlock) blocks.push(currentBlock);
            currentBlock = {
                rowNumber: index + 1,
                dateToken: transactionMatch[1],
                text: transactionMatch[2],
            };
            return;
        }

        if (!currentBlock) return;

        if (/^(CHECKING SUMMARY|TRANSACTION DETAIL|DATE DESCRIPTION|AMOUNT|BALANCE|\*|Beginning Balance|Ending Balance|Page \d+|IN CASE OF ERRORS)/i.test(normalizedLine)) {
            blocks.push(currentBlock);
            currentBlock = null;
            return;
        }

        if (!/[0-9,]+\.\d{2}\s*$/.test(currentBlock.text)) {
            currentBlock.text = `${currentBlock.text} ${normalizedLine}`;
        }
    });

    if (currentBlock) blocks.push(currentBlock);
    return blocks;
};

const normalizeChaseStatementText = (text, options = {}) => {
    const sourceAccount = normalizeText(options.sourceAccount);
    const year = getStatementYear(text);
    const lines = String(text || '').split(/\r?\n/);
    const firstTransactionIndex = lines.findIndex((line) => /^\s*\d{2}\/\d{2}\s+/.test(line));
    const beginningBalance = getBeginningBalanceBeforeTransactions(lines, firstTransactionIndex);
    const blocks = buildTransactionBlocks(lines);
    let previousBalance = beginningBalance;

    return blocks.map((block) => {
        const errors = [];
        const moneyMatches = [...block.text.matchAll(/-?\s?\$?[0-9,]+\.\d{2}/g)];
        const balanceMatch = moneyMatches[moneyMatches.length - 1];
        const currentBalance = balanceMatch ? parseStatementMoney(balanceMatch[0]) : null;
        const date = parseDateValue(`${block.dateToken}/${year}`);
        let signedAmount = null;

        if (currentBalance !== null && previousBalance !== null) {
            signedAmount = Number((currentBalance - previousBalance).toFixed(2));
            previousBalance = currentBalance;
        }

        if (!date) errors.push('Invalid or missing date');
        if (currentBalance === null || signedAmount === null || signedAmount === 0) {
            errors.push('Invalid or missing amount');
        }

        let description = block.text;
        if (balanceMatch) {
            description = description.slice(0, balanceMatch.index).trim();
        }

        const amountAtEndPattern = /(?:-?\s?\$?[0-9,]+\.\d{2})\s*$/;
        if (amountAtEndPattern.test(description)) {
            description = description.replace(amountAtEndPattern, '').trim();
        }

        if (!description) errors.push('Missing description');

        const cleanedName = cleanChaseTransactionName(description);
        const baseType = signedAmount !== null && signedAmount > 0 ? 'income' : 'expense';
        const amount = signedAmount === null ? '' : Math.abs(signedAmount);
        const category = suggestCategory(`${cleanedName} ${description}`.toLowerCase(), baseType);
        const type = resolveType(baseType, category);
        const importHash = errors.length === 0
            ? buildImportHash({ date, amount, name: cleanedName, description, sourceAccount })
            : '';

        return {
            rowNumber: block.rowNumber,
            date: formatDateForInput(date),
            name: cleanedName,
            description,
            amount,
            type,
            category,
            sourceAccount,
            importHash,
            status: errors.length > 0 ? 'invalid' : 'ready',
            errors,
        };
    });
};

// --- Chase credit card statements -----------------------------------------------
//
// A card statement is not a checking statement with the signs flipped. There is no
// running balance to difference, so amounts are printed per row; positive is a
// charge and negative a credit. Not every credit is a payment: STATEMENT CREDIT is
// a points redemption, and a merchant refund is a credit too.
//
// The statement prints its own totals, which makes a check possible that the
// checking parser cannot do: previous balance + every row = new balance, and the
// summary lines add up to the same. A statement that fails either is refused
// rather than imported half-read.

const isChaseCardStatementText = (text) =>
    /Opening\/Closing Date\s+\d{2}\/\d{2}\/\d{2}\s*-\s*\d{2}\/\d{2}\/\d{2}/.test(text) &&
    /Merchant Name or Transaction Description/.test(text) &&
    /Account Number: X{4} X{4} X{4} \d{4}/.test(text);

const CARD_SUMMARY_LINES = {
    previousBalance: 'Previous Balance',
    payments: 'Payment, Credits',
    purchases: 'Purchases',
    cashAdvances: 'Cash Advances',
    balanceTransfers: 'Balance Transfers',
    fees: 'Fees Charged',
    interest: 'Interest Charged',
    newBalance: 'New Balance',
};

const CARD_ROW = /^(\d{2})\/(\d{2})\s+(.+?)\s+(-?[\d,]*\.\d{2})$/;
const CARD_PAYMENT_ROW = /^(AUTOMATIC PAYMENT - THANK YOU|Payment Thank You)/i;
const CARD_REWARDS_ROW = /^STATEMENT CREDIT$/i;
// Chase's own charges, not any merchant with "fee" in its name -- a DMV
// registration fee is a purchase in its own category.
const CARD_COST_ROW = /\bINTEREST CHARGE\b|^(LATE|ANNUAL MEMBERSHIP|FOREIGN TRANSACTION|RETURNED PAYMENT|CASH ADVANCE|BALANCE TRANSFER|OVER ?LIMIT) FEE\b/i;
// Lines inside the activity block that are neither a row nor a wrapped row: the
// section headings Chase prints between groups of rows, and the column and page
// headers a multi-page statement repeats. Appended, they would end up in the row
// above's description -- and in its name and category when the cleaner kept them.
const CARD_NON_ROW_LINE = new RegExp([
    '^(PAYMENTS AND OTHER CREDITS|PURCHASES?|CASH ADVANCES?|BALANCE TRANSFERS?|FEES CHARGED|INTEREST CHARGED)$',
    '^TOTAL FEES FOR THIS PERIOD\\b',
    '^ACCOUNT ACTIVITY\\b',
    '^Date of$',
    '^Transaction Merchant Name or Transaction Description\\b',
    '\\bPage \\d+ of \\d+\\b',
    // pdf-parse's own page separator, between the text of consecutive pages.
    '^-- \\d+ of \\d+ --$',
    '^Statement Date:',
    '^Manage your account online\\b',
    '^(www\\.chase\\.com|Chase Mobile app today|Download the)\\b',
    '^YOUR ACCOUNT MESSAGES\\b',
].join('|'), 'i');

const statementError = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
};

const parseCardDate = (token) => {
    const [month, day, year] = token.split('/').map(Number);
    return new Date(Date.UTC(2000 + year, month - 1, day, 12));
};

/** The whole-line summary figure, e.g. `Purchases +$504.36`. Signs are printed. */
const readSummaryLine = (lines, label) => {
    const pattern = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+([+-]?)\\$([\\d,]+\\.\\d{2})$`);
    for (const line of lines) {
        const match = line.trim().match(pattern);
        if (match) return (match[1] === '-' ? -1 : 1) * Number(match[2].replace(/,/g, ''));
    }
    return null;
};

/**
 * The statement's own figures. Everything the Cards view shows about a statement
 * comes from here, not from summing rows -- history before the first imported
 * statement is missing, so a balance derived from rows would be wrong.
 */
const parseCardStatementSummary = (text) => {
    const lines = String(text || '').split(/\r?\n/);
    const period = text.match(/Opening\/Closing Date\s+(\d{2}\/\d{2}\/\d{2})\s*-\s*(\d{2}\/\d{2}\/\d{2})/);
    const due = text.match(/Payment Due Date:\s+(\d{2}\/\d{2}\/\d{2})/);
    const minimum = text.match(/Minimum Payment Due:\s+\$([\d,]+\.\d{2})/);
    const limit = text.match(/^Credit Limit\s+\$([\d,]+(?:\.\d{2})?)$/m);
    const apr = text.match(/^Purchases\s+(\d+\.\d+)%/m);
    const last4 = text.match(/Account Number: X{4} X{4} X{4} (\d{4})/);
    const product = text.match(/^ACCOUNT SUMMARY\s*\n(CHASE [A-Z ]+)$/m);

    const figures = {};
    const missing = [];
    Object.entries(CARD_SUMMARY_LINES).forEach(([key, label]) => {
        figures[key] = readSummaryLine(lines, label);
        if (figures[key] === null) missing.push(label);
    });
    if (!period) missing.push('Opening/Closing Date');
    if (missing.length) throw statementError(`Card statement is missing: ${missing.join(', ')}`);

    const money = (match) => (match ? Number(match[1].replace(/,/g, '')) : null);

    return {
        issuer: 'Chase',
        productName: product ? titleCaseMerchant(product[1]) : 'Chase card',
        last4: last4[1],
        openingDate: formatDateForInput(parseCardDate(period[1])),
        closingDate: formatDateForInput(parseCardDate(period[2])),
        dueDate: due ? formatDateForInput(parseCardDate(due[1])) : null,
        minimumPayment: money(minimum),
        creditLimit: money(limit),
        purchaseApr: apr ? Number(apr[1]) : null,
        ...figures,
    };
};

/**
 * Throws unless the statement's totals agree with themselves. Used on the parsed
 * summary at preview, and again on the submitted copy at commit.
 */
const assertCardStatementBalances = (statement) => {
    const parts = ['payments', 'purchases', 'cashAdvances', 'balanceTransfers', 'fees', 'interest'];
    const values = [statement?.previousBalance, statement?.newBalance, ...parts.map((key) => statement?.[key])];
    if (values.some((value) => !Number.isFinite(Number(value)))) {
        throw statementError('Card statement figures are incomplete');
    }

    const expected = toCents(statement.previousBalance) + parts.reduce((acc, key) => acc + toCents(statement[key]), 0);
    if (expected !== toCents(statement.newBalance)) {
        throw statementError(
            `Card statement does not balance: previous balance and activity come to ` +
            `$${fromCents(expected).toFixed(2)}, but the new balance is $${Number(statement.newBalance).toFixed(2)}`
        );
    }
};

/** Row dates print as MM/DD; the year is the closing year unless that lands after it. */
const cardRowDate = (month, day, closingDate) => {
    const closing = parseDateValue(closingDate);
    let date = new Date(Date.UTC(closing.getUTCFullYear(), month - 1, day, 12));
    if (date > closing) date = new Date(Date.UTC(closing.getUTCFullYear() - 1, month - 1, day, 12));
    return date;
};

const classifyCardRow = (description, signedAmount) => {
    if (signedAmount < 0 && CARD_PAYMENT_ROW.test(description)) {
        return { name: 'Card Payment Received', type: 'transfer', category: 'Credit Card Payment' };
    }
    if (signedAmount < 0 && CARD_REWARDS_ROW.test(description)) {
        return { name: 'Rewards Redemption', type: 'income', category: 'Rewards' };
    }
    if (signedAmount > 0 && CARD_COST_ROW.test(description)) {
        return { name: titleCaseMerchant(description), type: 'expense', category: 'Interest & Fees' };
    }

    const name = cleanCardMerchantName(description) || normalizeText(description);
    const baseType = signedAmount > 0 ? 'expense' : 'income';
    // A merchant refund keeps the merchant's category, as a checking-side
    // "Card Purchase Return" already does.
    const category = suggestCategory(`${name} ${description}`.toLowerCase(), 'expense');
    return { name, type: resolveType(baseType, category), category };
};

/**
 * Parses a Chase credit card statement into `{ statement, rows }`. Rows have the
 * same shape as the checking parser's, plus accountType: 'credit_card'. Throws a
 * 400-coded error if the statement does not balance.
 */
const parseChaseCardStatementText = (text) => {
    const statement = parseCardStatementSummary(text);
    assertCardStatementBalances(statement);

    const lines = String(text || '').split(/\r?\n/);
    const start = lines.findIndex((line) => /Merchant Name or Transaction Description/.test(line));
    const blocks = [];

    for (let index = start + 1; index < lines.length; index += 1) {
        const line = normalizeText(lines[index]);
        if (/^TOTAL INTEREST FOR THIS PERIOD\b|^Total fees charged in\b/i.test(line)) break;
        if (!line) continue;

        if (CARD_NON_ROW_LINE.test(line)) continue;

        const match = line.match(CARD_ROW);
        if (match) {
            blocks.push({
                rowNumber: index + 1,
                month: Number(match[1]),
                day: Number(match[2]),
                description: match[3],
                signedAmount: Number(match[4].replace(/,/g, '')),
            });
        } else if (blocks.length) {
            // A wrapped line, e.g. an airline itinerary under the fare.
            blocks[blocks.length - 1].description += ` ${line}`;
        }
    }

    const rowTotal = sumMoney(blocks.map((block) => block.signedAmount));
    const activity = statement.newBalance - statement.previousBalance;
    if (toCents(rowTotal) !== toCents(activity)) {
        throw statementError(
            `Card statement rows do not add up: they total $${rowTotal.toFixed(2)}, ` +
            `but the balance moved by $${fromCents(toCents(activity)).toFixed(2)}. Nothing was imported.`
        );
    }

    const sourceAccount = `${statement.issuer} ••${statement.last4}`;
    const seen = new Map();
    const rows = blocks.map((block) => {
        const date = cardRowDate(block.month, block.day, statement.closingDate);
        const description = normalizeText(block.description);
        const amount = Math.abs(block.signedAmount);
        const { name, type, category } = classifyCardRow(description, block.signedAmount);
        // Counted on exactly what the hash is built from -- the cleaned name and the
        // unsigned amount -- so two lines that would hash alike are always told
        // apart: a charge and its same-day refund, or two trips that both clean to
        // 'Uber'. Keying on the printed line instead would miss both.
        const lineKey = `${formatDateForInput(date)}|${amount.toFixed(2)}|${name.toLowerCase()}`;
        const occurrence = (seen.get(lineKey) || 0) + 1;
        seen.set(lineKey, occurrence);

        return {
            rowNumber: block.rowNumber,
            date: formatDateForInput(date),
            name,
            description,
            amount,
            type,
            category,
            sourceAccount,
            accountType: 'credit_card',
            ...(occurrence > 1 ? { occurrence } : {}),
            importHash: buildImportHash({ date, amount, name, description, sourceAccount, occurrence }),
            status: 'ready',
            errors: [],
        };
    });

    return { statement: { ...statement, sourceAccount }, rows };
};

const loadPdfParser = () => {
    try {
        const canvas = require('@napi-rs/canvas');
        globalThis.DOMMatrix = globalThis.DOMMatrix || canvas.DOMMatrix;
        globalThis.ImageData = globalThis.ImageData || canvas.ImageData;
        globalThis.Path2D = globalThis.Path2D || canvas.Path2D;
    } catch (error) {
        const loadError = new Error('PDF import is unavailable because the server PDF canvas dependency failed to load');
        loadError.cause = error;
        throw loadError;
    }

    return require('pdf-parse');
};

/** `{ rows, statement }`; statement is set only for a credit card statement. */
const normalizePdfBuffer = async (buffer, options = {}) => {
    const { PDFParse } = loadPdfParser();
    const parser = new PDFParse({ data: buffer });

    try {
        const result = await parser.getText();
        if (isChaseCardStatementText(result.text)) {
            return parseChaseCardStatementText(result.text);
        }
        return { rows: normalizeChaseStatementText(result.text, options), statement: null };
    } finally {
        await parser.destroy();
    }
};

/** `{ rows, statement }`; statement is set only for a credit card statement. */
const normalizeImportFileBuffer = async (buffer, file = {}, options = {}) => {
    const originalName = String(file.originalname || '').toLowerCase();
    const mimeType = String(file.mimetype || '').toLowerCase();

    if (originalName.endsWith('.pdf') || mimeType === 'application/pdf') {
        return normalizePdfBuffer(buffer, options);
    }

    return { rows: normalizeCsvBuffer(buffer, options), statement: null };
};

const normalizeSubmissionRow = (row, options = {}) => {
    const errors = [];
    const date = parseDateValue(row?.date);
    const name = normalizeText(row?.name);
    const description = normalizeText(row?.description);
    const category = normalizeText(row?.category) || 'Misc';
    const type = TRANSACTION_TYPES.includes(row?.type) ? row.type : '';
    const amount = Number(row?.amount);
    // Unknown or absent means a bank row, which is what every row was before cards.
    const accountType = ACCOUNT_TYPES.includes(row?.accountType) ? row.accountType : undefined;
    const occurrence = Number.isInteger(row?.occurrence) && row.occurrence > 1 ? row.occurrence : undefined;
    // A card row's account comes from the statement itself and is part of its hash,
    // so the free-text account typed in the import form must not replace it.
    const sourceAccount = accountType === 'credit_card'
        ? normalizeText(row?.sourceAccount || options.sourceAccount)
        : normalizeText(options.sourceAccount || row?.sourceAccount);

    if (!date) errors.push('Invalid or missing date');
    if (!name) errors.push('Missing name');
    if (!Number.isFinite(amount) || amount <= 0) errors.push('Invalid or missing amount');
    if (!type) errors.push('Invalid transaction type');

    return {
        rowNumber: Number(row?.rowNumber) || 0,
        date: formatDateForInput(date),
        name,
        description,
        amount: Number.isFinite(amount) && amount > 0 ? amount : '',
        type: type || 'expense',
        category,
        sourceAccount,
        accountType,
        occurrence,
        importHash: errors.length === 0
            ? buildImportHash({ date, amount, name, description, sourceAccount, occurrence })
            : '',
        status: errors.length > 0 ? 'invalid' : 'ready',
        errors,
    };
};

const buildFileHash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

module.exports = {
    MAX_IMPORT_ROWS,
    SUBSCRIPTION_CATEGORIES,
    TRANSACTION_TYPES,
    assertCardStatementBalances,
    isChaseCardStatementText,
    parseChaseCardStatementText,
    resolveType,
    buildFileHash,
    buildImportHash,
    cleanChaseTransactionName,
    suggestCategory,
    normalizeChaseStatementText,
    normalizeCsvBuffer,
    normalizeImportFileBuffer,
    normalizePdfBuffer,
    normalizeSubmissionRow,
};
