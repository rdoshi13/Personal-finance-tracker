const { categoryOf, periodKeyOf, summarize } = require('./quests');

// Achievements are derived from the full transaction history rather than stored counters,
// so they stay correct even when transactions are edited or deleted after the fact.
const ACHIEVEMENT_DEFINITIONS = [
    {
        id: 'first',
        name: 'First Steps',
        description: 'Log your first transaction',
        test: ({ transactions }) => transactions.length >= 1,
    },
    {
        id: 'ten',
        name: 'Getting Serious',
        description: 'Log ten transactions',
        test: ({ transactions }) => transactions.length >= 10,
    },
    {
        id: 'century',
        name: 'Century Club',
        description: 'Log one hundred transactions',
        test: ({ transactions }) => transactions.length >= 100,
    },
    {
        id: 'importer',
        name: 'Bulk Handler',
        description: 'Bring in transactions from a statement',
        test: ({ transactions }) => transactions.some((t) => t.importBatchId || t.importHash),
    },
    {
        id: 'streak',
        name: 'On a Roll',
        description: 'Three months in a row with a positive net',
        test: ({ streak }) => streak >= 3,
    },
    {
        id: 'saver',
        name: 'Big Saver',
        description: 'Save more than $1,000 in a single month',
        test: ({ byMonth }) => Object.values(byMonth).some((s) => s.net > 1000),
    },
    {
        id: 'sorted',
        name: 'Well Sorted',
        description: 'Use five or more categories in one month',
        test: ({ categoriesByMonth }) => Object.values(categoriesByMonth).some((set) => set.size >= 5),
    },
    {
        id: 'planner',
        name: 'Forward Planner',
        description: 'Set a budget on any category',
        test: ({ budgetCount }) => budgetCount > 0,
    },
    {
        id: 'historian',
        name: 'Historian',
        description: 'Build up twelve months of records',
        test: ({ byMonth }) => Object.keys(byMonth).length >= 12,
    },
];

const groupByMonth = (transactions) => {
    const buckets = {};
    transactions.forEach((transaction) => {
        const key = periodKeyOf(transaction.date);
        (buckets[key] = buckets[key] || []).push(transaction);
    });
    return buckets;
};

/** Longest run of consecutive calendar months ending at the most recent month with data. */
const computeStreak = (byMonth) => {
    const keys = Object.keys(byMonth).sort();
    if (!keys.length) return 0;

    let streak = 0;
    let cursor = keys[keys.length - 1];

    while (byMonth[cursor] && byMonth[cursor].net > 0) {
        streak += 1;
        let [year, month] = cursor.split('-').map(Number);
        month -= 1;
        if (month === 0) { month = 12; year -= 1; }
        cursor = `${year}-${String(month).padStart(2, '0')}`;
    }

    return streak;
};

const buildContext = (transactions, budgetCount = 0) => {
    const grouped = groupByMonth(transactions);
    const byMonth = {};
    const categoriesByMonth = {};

    Object.entries(grouped).forEach(([key, list]) => {
        byMonth[key] = summarize(list);
        categoriesByMonth[key] = new Set(list.map(categoryOf));
    });

    return {
        transactions,
        byMonth,
        categoriesByMonth,
        budgetCount,
        streak: computeStreak(byMonth),
    };
};

const evaluateAchievements = (transactions, budgetCount = 0) => {
    const context = buildContext(transactions || [], budgetCount);
    return ACHIEVEMENT_DEFINITIONS.map((achievement) => ({
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        earned: Boolean(achievement.test(context)),
    }));
};

module.exports = {
    ACHIEVEMENT_DEFINITIONS,
    buildContext,
    computeStreak,
    evaluateAchievements,
    groupByMonth,
};
