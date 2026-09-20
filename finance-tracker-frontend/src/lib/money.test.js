import { initialsOf, isIncome, isOutflow, money, periodKeyOf, periodLabel, signedMoney, spendByCategory, summarize, categoryBreakdown } from './money';

const tx = (date, type, amount, category = 'Misc') => ({ date, type, amount, category });

describe('money helpers', () => {
    test('formats with two decimals and thousands separators', () => {
        expect(money(1234.5)).toBe('$1,234.50');
        expect(money(0)).toBe('$0.00');
    });

    test('formats magnitude only, leaving the sign to the caller', () => {
        expect(money(-42)).toBe('$42.00');
        expect(signedMoney(-42)).toBe('−$42.00');
        expect(signedMoney(42)).toBe('+$42.00');
    });

    test('classifies subscriptions as outflow', () => {
        expect(isOutflow({ type: 'subscription' })).toBe(true);
        expect(isOutflow({ type: 'expense' })).toBe(true);
        expect(isIncome({ type: 'income' })).toBe(true);
        expect(isOutflow({ type: 'income' })).toBe(false);
    });

    test('summarize matches the server: subscriptions reduce net', () => {
        const summary = summarize([
            tx('2026-05-01T00:00:00Z', 'income', 1000, 'Salary'),
            tx('2026-05-02T00:00:00Z', 'expense', 200, 'Groceries'),
            tx('2026-05-03T00:00:00Z', 'subscription', 50, 'Streaming'),
        ]);

        expect(summary.income).toBe(1000);
        expect(summary.expense).toBe(250);
        expect(summary.net).toBe(750);
        expect(summary.count).toBe(3);
    });

    test('spendByCategory folds blank categories into Uncategorized', () => {
        const totals = spendByCategory([
            { type: 'expense', amount: 10, category: '' },
            { type: 'expense', amount: 5 },
            { type: 'income', amount: 900, category: 'Salary' },
        ]);
        expect(totals).toEqual({ Uncategorized: 15 });
    });

    test('period keys and labels use UTC', () => {
        expect(periodKeyOf('2026-05-15T00:00:00Z')).toBe('2026-05');
        expect(periodLabel('2026-05')).toBe('May 2026');
        expect(periodLabel('2026-05', true)).toBe('May 2026');
        expect(periodLabel('')).toBe('');
    });

    test('initials take at most two letters', () => {
        expect(initialsOf('Walmart')).toBe('W');
        expect(initialsOf('Payroll deposit')).toBe('PD');
        expect(initialsOf('Trader Joes Market')).toBe('TJ');
    });
});

describe('categoryBreakdown', () => {
    const txns = [
        { type: 'income', category: 'Salary', amount: 3000 },
        { type: 'income', category: 'Interest', amount: 1000 },
        { type: 'expense', category: 'Groceries', amount: 120 },
        { type: 'expense', category: 'Groceries', amount: 80 },
        // Subscriptions are outflow, the same as the server treats them.
        { type: 'subscription', category: 'Streaming', amount: 100 },
        { type: 'transfer', category: 'Ignored', amount: 999 },
    ];

    test('splits by direction, sorts by size and counts rows', () => {
        const { income, outflow } = categoryBreakdown(txns);

        expect(income.map((r) => r.category)).toEqual(['Salary', 'Interest']);
        expect(outflow.map((r) => r.category)).toEqual(['Groceries', 'Streaming']);
        expect(outflow[0]).toMatchObject({ total: 200, count: 2 });
    });

    test('share is of that side alone, so each side sums to 1', () => {
        const { income, outflow } = categoryBreakdown(txns);

        expect(income[0].share).toBeCloseTo(0.75);
        expect(outflow[0].share).toBeCloseTo(200 / 300);
        [income, outflow].forEach((side) => {
            expect(side.reduce((acc, r) => acc + r.share, 0)).toBeCloseTo(1);
        });
    });

    test('a type that is neither income nor outflow is left out', () => {
        const all = categoryBreakdown(txns);
        const names = [...all.income, ...all.outflow].map((r) => r.category);
        expect(names).not.toContain('Ignored');
    });

    test('blank and missing categories fall back to Uncategorized', () => {
        const { outflow } = categoryBreakdown([
            { type: 'expense', category: '   ', amount: 10 },
            { type: 'expense', amount: 5 },
        ]);
        expect(outflow).toHaveLength(1);
        expect(outflow[0]).toMatchObject({ category: 'Uncategorized', total: 15, count: 2 });
    });

    test('no transactions yields empty sides rather than NaN shares', () => {
        expect(categoryBreakdown([])).toEqual({ income: [], outflow: [] });
        expect(categoryBreakdown()).toEqual({ income: [], outflow: [] });
    });
});
