const test = require('node:test');
const assert = require('node:assert/strict');
const {
    evaluateQuests,
    findQuest,
    isOutflow,
    periodKeyOf,
    spendByCategory,
    summarize,
} = require('../lib/quests');
const { computeStreak, evaluateAchievements, groupByMonth } = require('../lib/achievements');
const { describeXp, levelForXp, rankForLevel } = require('../lib/xp');

const tx = (date, type, amount, category = 'Misc', extra = {}) =>
    ({ date: new Date(date), type, amount, category, ...extra });

test('subscription transactions count as outflow, not income', () => {
    assert.equal(isOutflow({ type: 'subscription' }), true);
    assert.equal(isOutflow({ type: 'expense' }), true);
    assert.equal(isOutflow({ type: 'income' }), false);
});

test('summarize buckets subscriptions with expenses', () => {
    const list = [
        tx('2026-05-01', 'income', 1000, 'Salary'),
        tx('2026-05-02', 'expense', 200, 'Groceries'),
        tx('2026-05-03', 'subscription', 50, 'Streaming'),
    ];

    const summary = summarize(list);
    assert.equal(summary.income, 1000);
    assert.equal(summary.expense, 250, 'subscription must be included in outflow');
    assert.equal(summary.net, 750);
    assert.equal(summary.count, 3);
});

test('spendByCategory includes subscriptions and excludes income', () => {
    const totals = spendByCategory([
        tx('2026-05-01', 'income', 1000, 'Salary'),
        tx('2026-05-02', 'expense', 200, 'Groceries'),
        tx('2026-05-03', 'subscription', 50, 'Streaming'),
    ]);

    assert.deepEqual(totals, { Groceries: 200, Streaming: 50 });
    assert.equal(totals.Salary, undefined);
});

test('period keys use UTC so they match the server aggregation', () => {
    assert.equal(periodKeyOf(new Date('2026-05-15T00:00:00Z')), '2026-05');
    assert.equal(periodKeyOf('2026-01-01T00:00:00Z'), '2026-01');
});

test('logger quest tracks transaction count', () => {
    const few = evaluateQuests([tx('2026-05-01', 'expense', 10)]).find((q) => q.id === 'logger');
    assert.equal(few.done, false);
    assert.equal(few.value, 1);

    const many = evaluateQuests(Array.from({ length: 12 }, () => tx('2026-05-01', 'expense', 10)))
        .find((q) => q.id === 'logger');
    assert.equal(many.done, true);
    assert.equal(many.progress, 100);
});

test('green quest requires a positive net', () => {
    const positive = evaluateQuests([
        tx('2026-05-01', 'income', 500, 'Salary'),
        tx('2026-05-02', 'expense', 100),
    ]).find((q) => q.id === 'green');
    assert.equal(positive.done, true);

    const negative = evaluateQuests([
        tx('2026-05-01', 'income', 50, 'Salary'),
        tx('2026-05-02', 'expense', 100),
    ]).find((q) => q.id === 'green');
    assert.equal(negative.done, false);
});

test('tidy quest fails while anything is uncategorised', () => {
    const loose = evaluateQuests([tx('2026-05-01', 'expense', 10, 'Uncategorized')]).find((q) => q.id === 'tidy');
    assert.equal(loose.done, false);

    const tidy = evaluateQuests([tx('2026-05-01', 'expense', 10, 'Groceries')]).find((q) => q.id === 'tidy');
    assert.equal(tidy.done, true);
});

test('budget-hero reports unavailable until a cap exists', () => {
    const list = [tx('2026-05-01', 'expense', 200, 'Groceries')];

    const without = evaluateQuests(list, {}).find((q) => q.id === 'budget-hero');
    assert.equal(without.unavailable, true);
    assert.equal(without.done, false);

    const under = evaluateQuests(list, { Groceries: 300 }).find((q) => q.id === 'budget-hero');
    assert.equal(under.done, true);

    const over = evaluateQuests(list, { Groceries: 150 }).find((q) => q.id === 'budget-hero');
    assert.equal(over.done, false);
});

test('budget-hero counts subscription spend against its category cap', () => {
    const list = [tx('2026-05-01', 'subscription', 200, 'Streaming')];
    const over = evaluateQuests(list, { Streaming: 100 }).find((q) => q.id === 'budget-hero');
    assert.equal(over.done, false, 'subscriptions must count toward the cap');
});

test('an empty month completes nothing', () => {
    const quests = evaluateQuests([], {});
    assert.equal(quests.filter((q) => q.done).length, 0);
});

test('findQuest resolves known ids and rejects unknown ones', () => {
    assert.equal(findQuest('logger').id, 'logger');
    assert.equal(findQuest('not-a-quest'), null);
});

test('xp maps to levels and ranks', () => {
    assert.equal(levelForXp(0), 1);
    assert.equal(levelForXp(299), 1);
    assert.equal(levelForXp(300), 2);
    assert.equal(rankForLevel(1), 'Bronze Beginner');
    assert.equal(rankForLevel(5), 'Silver Saver');
    assert.equal(rankForLevel(12), 'Platinum Planner');

    const described = describeXp(1240);
    assert.equal(described.level, 5);
    assert.equal(described.intoLevel, 40);
    assert.equal(described.toNextLevel, 260);
});

test('streak counts consecutive positive months backwards from the latest', () => {
    const byMonth = {
        '2026-03': { net: 100 },
        '2026-04': { net: 200 },
        '2026-05': { net: 300 },
    };
    assert.equal(computeStreak(byMonth), 3);

    byMonth['2026-04'] = { net: -50 };
    assert.equal(computeStreak(byMonth), 1, 'a negative month breaks the run');
});

test('groupByMonth splits transactions by UTC month', () => {
    const grouped = groupByMonth([
        tx('2026-04-30', 'expense', 10),
        tx('2026-05-01', 'expense', 10),
    ]);
    assert.deepEqual(Object.keys(grouped).sort(), ['2026-04', '2026-05']);
});

test('achievements unlock from history', () => {
    const earned = (list, budgetCount = 0) =>
        evaluateAchievements(list, budgetCount).filter((a) => a.earned).map((a) => a.id);

    assert.deepEqual(earned([]), []);
    assert.ok(earned([tx('2026-05-01', 'expense', 10)]).includes('first'));
    assert.ok(earned([tx('2026-05-01', 'expense', 10)], 1).includes('planner'));
    assert.ok(
        earned([tx('2026-05-01', 'expense', 10, 'Misc', { importBatchId: 'abc' })]).includes('importer')
    );
    assert.ok(
        earned([
            tx('2026-05-01', 'income', 5000, 'Salary'),
            tx('2026-05-02', 'expense', 100),
        ]).includes('saver'),
        'saving over $1,000 in a month unlocks Big Saver'
    );
});
