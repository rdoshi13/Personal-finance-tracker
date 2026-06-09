const crypto = require('crypto');
const { parse } = require('csv-parse/sync');

const MAX_IMPORT_ROWS = 5000;

const DATE_COLUMNS = ['date', 'transaction date', 'posted date', 'post date'];
const NAME_COLUMNS = ['description', 'name', 'merchant', 'memo', 'payee'];
const AMOUNT_COLUMNS = ['amount', 'transaction amount'];
const DEBIT_COLUMNS = ['debit', 'withdrawal', 'withdrawals', 'charge', 'charges'];
const CREDIT_COLUMNS = ['credit', 'deposit', 'deposits'];

const CATEGORY_RULES = [
    { category: 'Subscription', keywords: ['recurring card purchase', 'openai chatgpt', 'google play', 'netflix', 'spotify', 'subscription', 'membership'] },
    { category: 'Credit Card Payment', keywords: ['chase credit card autopay', 'chase credit crd autopay', 'credit card autopay', 'credit crd autopay'] },
    { category: 'Transfer', keywords: ['zelle payment', 'zelle -', 'cash app', 'cashapp', 'venmo', 'payment received'] },
    { category: 'Tax Refund', keywords: ['irs tax refund', 'irs treas', 'az tax refund', 'az dept of rev tax refund', 'tax refund'] },
    { category: 'Groceries', keywords: ['grocery', 'supermarket', 'walmart', 'target', 'costco', 'trader joe', 'whole foods'] },
    { category: 'Transport', keywords: ['uber', 'lyft', 'gas', 'fuel', 'shell', 'chevron', 'parking', 'metro'] },
    { category: 'Food', keywords: ['restaurant', 'coffee', 'cafe', 'starbucks', 'doordash', 'ubereats', 'grubhub', 'subway', 'cheesecake', 'taco bell', "domino's", 'dominos'] },
    { category: 'Housing', keywords: ['rent', 'mortgage', 'apartment'] },
    { category: 'Utilities', keywords: ['utility', 'electric', 'water', 'internet', 'phone', 'comcast', 'verizon', 'at&t'] },
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

const buildImportHash = ({ date, amount, name, description, sourceAccount }) => {
    const hashInput = [
        formatDateForInput(date instanceof Date ? date : parseDateValue(date)),
        Number(amount || 0).toFixed(2),
        normalizeText(name || description).toLowerCase(),
        normalizeText(sourceAccount).toLowerCase(),
    ].join('|');

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

    const type = signedAmount !== null && signedAmount > 0 ? 'income' : 'expense';
    const amount = signedAmount === null ? '' : Math.abs(signedAmount);
    const category = suggestCategory(name.toLowerCase(), type);
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
        const type = signedAmount !== null && signedAmount > 0 ? 'income' : 'expense';
        const amount = signedAmount === null ? '' : Math.abs(signedAmount);
        const category = suggestCategory(`${cleanedName} ${description}`.toLowerCase(), type);
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

const normalizePdfBuffer = async (buffer, options = {}) => {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });

    try {
        const result = await parser.getText();
        return normalizeChaseStatementText(result.text, options);
    } finally {
        await parser.destroy();
    }
};

const normalizeImportFileBuffer = async (buffer, file = {}, options = {}) => {
    const originalName = String(file.originalname || '').toLowerCase();
    const mimeType = String(file.mimetype || '').toLowerCase();

    if (originalName.endsWith('.pdf') || mimeType === 'application/pdf') {
        return normalizePdfBuffer(buffer, options);
    }

    return normalizeCsvBuffer(buffer, options);
};

const normalizeSubmissionRow = (row, options = {}) => {
    const errors = [];
    const date = parseDateValue(row?.date);
    const name = normalizeText(row?.name);
    const description = normalizeText(row?.description);
    const category = normalizeText(row?.category) || 'Misc';
    const type = ['income', 'expense', 'subscription'].includes(row?.type) ? row.type : '';
    const amount = Number(row?.amount);
    const sourceAccount = normalizeText(options.sourceAccount || row?.sourceAccount);

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
        importHash: errors.length === 0
            ? buildImportHash({ date, amount, name, description, sourceAccount })
            : '',
        status: errors.length > 0 ? 'invalid' : 'ready',
        errors,
    };
};

const buildFileHash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

module.exports = {
    MAX_IMPORT_ROWS,
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
