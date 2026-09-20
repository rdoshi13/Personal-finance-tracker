const OUTFLOW_TYPES = ['expense', 'subscription'];

const isOutflow = (transaction) => OUTFLOW_TYPES.includes(transaction?.type);
const isIncome = (transaction) => transaction?.type === 'income';

const CENTS_PER_UNIT = 100;

/**
 * Money is stored as a 2dp decimal in a double, which is exact -- any realistic
 * 2dp value round-trips. The error comes from *arithmetic*: 0.1 + 0.2 is
 * 0.30000000000000004, so a category sitting exactly on its budget cap compares
 * as over it. Summing in integer cents and coming back at the end removes that.
 */
const toCents = (value) => Math.round((Number(value) || 0) * CENTS_PER_UNIT);
const fromCents = (cents) => cents / CENTS_PER_UNIT;

/** Exact sum of money values. Use instead of reduce((a, b) => a + b). */
const sumMoney = (values = []) => fromCents(values.reduce((acc, value) => acc + toCents(value), 0));

/** Snaps a computed money value to the nearest cent, for anything not a plain sum. */
const roundMoney = (value) => fromCents(toCents(value));

/**
 * Compares two money values at cent precision. `a` is over `b` only when it
 * exceeds it by at least one cent, so a budget met exactly is not a breach.
 */
const isOverBy = (a, b) => toCents(a) > toCents(b);

const money = (value) =>
    `$${Math.abs(Number(value) || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

/** Prefixes with a real minus sign rather than a hyphen. */
const signedMoney = (value) => `${(Number(value) || 0) < 0 ? '−' : '+'}${money(value)}`;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** 'YYYY-MM' for a transaction date, matching the server's UTC bucketing. */
const periodKeyOf = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const periodLabel = (periodKey, long = false) => {
    if (!periodKey) return '';
    const [year, month] = periodKey.split('-');
    const names = long ? MONTHS_LONG : MONTHS;
    return `${names[Number(month) - 1]} ${year}`;
};

const summarize = (transactions = []) => {
    let incomeCents = 0;
    let expenseCents = 0;
    transactions.forEach((transaction) => {
        const cents = toCents(transaction.amount);
        if (isIncome(transaction)) incomeCents += cents;
        else if (isOutflow(transaction)) expenseCents += cents;
    });
    return {
        income: fromCents(incomeCents),
        expense: fromCents(expenseCents),
        net: fromCents(incomeCents - expenseCents),
        count: transactions.length,
    };
};

const spendByCategory = (transactions = []) => {
    const cents = {};
    transactions.filter(isOutflow).forEach((transaction) => {
        const key = (transaction.category || 'Uncategorized').trim() || 'Uncategorized';
        cents[key] = (cents[key] || 0) + toCents(transaction.amount);
    });
    return Object.fromEntries(Object.entries(cents).map(([key, value]) => [key, fromCents(value)]));
};

/**
 * Category totals for one month, split by direction and sorted largest first.
 * `share` is of that side's own total, so income and outflow each sum to 1 --
 * comparing a category against the other side's total would be meaningless.
 * Subscriptions count as outflow, matching summarize() and the server.
 */
const categoryBreakdown = (transactions = []) => {
    const buckets = { income: {}, outflow: {} };

    transactions.forEach((transaction) => {
        let side = null;
        if (isIncome(transaction)) side = 'income';
        else if (isOutflow(transaction)) side = 'outflow';
        if (!side) return;

        const key = (transaction.category || 'Uncategorized').trim() || 'Uncategorized';
        const bucket = buckets[side];
        if (!bucket[key]) bucket[key] = { category: key, total: 0, count: 0 };
        bucket[key].total += toCents(transaction.amount);
        bucket[key].count += 1;
    });

    const finalise = (bucket) => {
        const rows = Object.values(bucket).sort((a, b) => b.total - a.total);
        // Shares divide cents by cents, so the ratio is unaffected by the units.
        const sumCents = rows.reduce((acc, row) => acc + row.total, 0);
        return rows.map((row) => ({
            ...row,
            total: fromCents(row.total),
            share: sumCents ? row.total / sumCents : 0,
        }));
    };

    return { income: finalise(buckets.income), outflow: finalise(buckets.outflow) };
};

const initialsOf = (name) =>
    String(name || '?')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase();

export {
    CENTS_PER_UNIT,
    MONTHS,
    MONTHS_LONG,
    OUTFLOW_TYPES,
    categoryBreakdown,
    initialsOf,
    isIncome,
    isOverBy,
    isOutflow,
    money,
    periodKeyOf,
    periodLabel,
    roundMoney,
    signedMoney,
    sumMoney,
    toCents,
    spendByCategory,
    summarize,
};
