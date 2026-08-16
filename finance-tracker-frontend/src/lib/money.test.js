import { initialsOf, isIncome, isOutflow, money, periodKeyOf, periodLabel, signedMoney, spendByCategory, summarize } from './money';

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
