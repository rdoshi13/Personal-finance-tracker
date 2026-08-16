const OUTFLOW_TYPES = ['expense', 'subscription'];

const isOutflow = (transaction) => OUTFLOW_TYPES.includes(transaction?.type);
const isIncome = (transaction) => transaction?.type === 'income';

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
    let income = 0;
    let expense = 0;
    transactions.forEach((transaction) => {
        const amount = Number(transaction.amount) || 0;
        if (isIncome(transaction)) income += amount;
        else if (isOutflow(transaction)) expense += amount;
    });
    return { income, expense, net: income - expense, count: transactions.length };
};

const spendByCategory = (transactions = []) => {
    const totals = {};
    transactions.filter(isOutflow).forEach((transaction) => {
        const key = (transaction.category || 'Uncategorized').trim() || 'Uncategorized';
        totals[key] = (totals[key] || 0) + (Number(transaction.amount) || 0);
    });
    return totals;
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
    MONTHS,
    MONTHS_LONG,
    OUTFLOW_TYPES,
    initialsOf,
    isIncome,
    isOutflow,
    money,
    periodKeyOf,
    periodLabel,
    signedMoney,
    spendByCategory,
    summarize,
};
