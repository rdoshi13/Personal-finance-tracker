// Authoritative quest evaluation. The browser renders progress from this, but the
// server recomputes it before awarding XP — otherwise XP is free to anyone with devtools.

// The Transaction type enum is ['income','expense','subscription']. Subscriptions are
// money leaving the account, so every aggregate here buckets them with expenses.
const OUTFLOW_TYPES = ['expense', 'subscription'];

const isOutflow = (transaction) => OUTFLOW_TYPES.includes(transaction.type);
const isIncome = (transaction) => transaction.type === 'income';
const amountOf = (transaction) => Number(transaction.amount) || 0;
const categoryOf = (transaction) => (transaction.category || 'Uncategorized').trim() || 'Uncategorized';

const periodKeyOf = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const summarize = (transactions) => {
    let income = 0;
    let expense = 0;

    transactions.forEach((transaction) => {
        const amount = amountOf(transaction);
        if (isIncome(transaction)) {
            income += amount;
        } else if (isOutflow(transaction)) {
            expense += amount;
        }
    });

    return {
        income,
        expense,
        net: income - expense,
        count: transactions.length,
    };
};

const spendByCategory = (transactions) => {
    const totals = {};
    transactions.filter(isOutflow).forEach((transaction) => {
        const key = categoryOf(transaction);
        totals[key] = (totals[key] || 0) + amountOf(transaction);
    });
    return totals;
};

const clampPercent = (value, target) => {
    if (!target) return 0;
    return Math.max(0, Math.min(100, (value / target) * 100));
};

const money = (n) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Every quest works with zero configuration against free-text categories, so it holds
// up on existing data. `budget-hero` is the one exception and reports itself
// unavailable until the user actually sets a cap.
const QUEST_DEFINITIONS = [
    {
        id: 'logger',
        name: 'Diligent Logger',
        description: 'Record 12 transactions this month',
        xp: 80,
        evaluate: ({ summary }) => {
            const target = 12;
            return {
                value: summary.count,
                target,
                progress: clampPercent(summary.count, target),
                done: summary.count >= target,
                label: `${summary.count} of ${target} logged`,
            };
        },
    },
    {
        id: 'green',
        name: 'Stay in the Green',
        description: 'Finish the month with more coming in than going out',
        xp: 150,
        evaluate: ({ summary }) => {
            const done = summary.net > 0 && summary.count > 0;
            return {
                value: Math.max(0, summary.net),
                target: Math.max(1, summary.income),
                progress: summary.income ? clampPercent(Math.max(0, summary.net), summary.income) : 0,
                done,
                label: done ? `${money(summary.net)} saved` : 'Not yet positive',
            };
        },
    },
    {
        id: 'keep-twenty',
        name: 'One Fifth Kept',
        description: 'Hold on to at least 20% of what comes in',
        xp: 120,
        evaluate: ({ summary }) => {
            const rate = summary.income ? (summary.net / summary.income) * 100 : 0;
            return {
                value: Math.max(0, rate),
                target: 20,
                progress: clampPercent(Math.max(0, rate), 20),
                done: rate >= 20,
                label: summary.income ? `${rate.toFixed(1)}% of income kept` : 'No income recorded',
            };
        },
    },
    {
        id: 'tidy',
        name: 'Nothing Left Loose',
        description: 'Give every transaction a real category',
        xp: 60,
        evaluate: ({ transactions }) => {
            if (!transactions.length) {
                return { value: 0, target: 1, progress: 0, done: false, label: 'Nothing recorded yet' };
            }
            const loose = transactions.filter((t) => categoryOf(t) === 'Uncategorized').length;
            const sorted = transactions.length - loose;
            return {
                value: sorted,
                target: transactions.length,
                progress: clampPercent(sorted, transactions.length),
                done: loose === 0,
                label: loose === 0 ? 'All categorised' : `${loose} still uncategorised`,
            };
        },
    },
    {
        id: 'budget-hero',
        name: 'Budget Hero',
        description: 'Stay under every cap you have set',
        xp: 180,
        evaluate: ({ transactions, budgets }) => {
            const caps = Object.entries(budgets || {}).filter(([, limit]) => limit > 0);
            if (!caps.length) {
                return {
                    value: 0,
                    target: 0,
                    progress: 0,
                    done: false,
                    unavailable: true,
                    label: 'Set a category budget to unlock',
                };
            }
            const spend = spendByCategory(transactions);
            const within = caps.filter(([category, limit]) => (spend[category] || 0) <= limit).length;
            return {
                value: within,
                target: caps.length,
                progress: clampPercent(within, caps.length),
                done: within === caps.length,
                label: `${within} of ${caps.length} categories within budget`,
            };
        },
    },
];

/**
 * @param {Array} transactions transactions for a single month
 * @param {Object} budgets     { [category]: monthlyLimit }
 */
const evaluateQuests = (transactions, budgets = {}) => {
    const list = transactions || [];
    const context = { transactions: list, budgets, summary: summarize(list) };

    return QUEST_DEFINITIONS.map((quest) => {
        const result = quest.evaluate(context);
        return {
            id: quest.id,
            name: quest.name,
            description: quest.description,
            xp: quest.xp,
            unavailable: false,
            ...result,
        };
    });
};

const findQuest = (questId) => QUEST_DEFINITIONS.find((q) => q.id === questId) || null;

module.exports = {
    OUTFLOW_TYPES,
    QUEST_DEFINITIONS,
    amountOf,
    categoryOf,
    evaluateQuests,
    findQuest,
    isIncome,
    isOutflow,
    periodKeyOf,
    spendByCategory,
    summarize,
};
