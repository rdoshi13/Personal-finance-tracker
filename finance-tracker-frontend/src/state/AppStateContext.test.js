import { act, render, waitFor } from '@testing-library/react';
import {
    AppStateProvider,
    useAppState,
    pickInitialPeriod,
    currentPeriodKey,
} from './AppStateContext';
import { deleteTransaction, getTransactions, getYearSummary } from '../api/transactions';
import { getBudgets } from '../api/budgets';
import { claimQuest, getProgress, getQuests } from '../api/progress';
import { getSubscriptionStates, setSubscriptionCancelled } from '../api/subscriptions';

jest.mock('../api/transactions', () => ({
    getTransactions: jest.fn(),
    getYearSummary: jest.fn(),
    deleteTransaction: jest.fn(),
}));
jest.mock('../api/budgets', () => ({
    getBudgets: jest.fn(),
    toBudgetMap: (payload) =>
        (payload?.budgets || []).reduce((acc, b) => ({ ...acc, [b.category]: b.monthlyLimit }), {}),
}));
jest.mock('../api/progress', () => ({
    getProgress: jest.fn(),
    getQuests: jest.fn(),
    claimQuest: jest.fn(),
}));
jest.mock('../api/subscriptions', () => ({
    getSubscriptionStates: jest.fn(),
    setSubscriptionCancelled: jest.fn(),
    toCancelledKeys: (payload) => (payload?.cancelled || []).map((e) => e.key),
}));

const txn = (id, periodKey, type, amount, category = 'Groceries') => ({
    _id: id,
    name: `Txn ${id}`,
    type,
    amount,
    category,
    date: `${periodKey}-15T12:00:00.000Z`,
});

let ctx;
const Probe = () => {
    ctx = useAppState();
    return null;
};

const renderProvider = async () => {
    render(
        <AppStateProvider user={{ name: 'Test' }} onLogout={jest.fn()}>
            <Probe />
        </AppStateProvider>
    );
    await waitFor(() => expect(ctx.loading).toBe(false));
};

beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    getTransactions.mockResolvedValue([]);
    getBudgets.mockResolvedValue({ budgets: [] });
    getProgress.mockResolvedValue({ xp: 0, level: 1, rank: 'Bronze Beginner' });
    getQuests.mockResolvedValue({ quests: [] });
    getYearSummary.mockResolvedValue({ months: [] });
    deleteTransaction.mockResolvedValue(undefined);
    getSubscriptionStates.mockResolvedValue({ cancelled: [] });
    setSubscriptionCancelled.mockResolvedValue({});
});

describe('pickInitialPeriod', () => {
    test('falls back to the current month when there is no history', () => {
        expect(pickInitialPeriod([])).toBe(currentPeriodKey());
    });

    test('opens on the latest month with data when the current month is empty', () => {
        // The original app opened on the current month and showed four $0.00 cards.
        expect(pickInitialPeriod([txn('a', '2026-03', 'expense', 10), txn('b', '2026-05', 'expense', 10)]))
            .toBe('2026-05');
    });

    test('prefers the current month when it does have data', () => {
        const now = currentPeriodKey();
        expect(pickInitialPeriod([txn('a', '2020-01', 'expense', 10), txn('b', now, 'expense', 10)]))
            .toBe(now);
    });
});

describe('AppStateProvider', () => {
    test('loads transactions, budgets and progress, then lands on the latest month', async () => {
        getTransactions.mockResolvedValue([txn('a', '2026-03', 'expense', 10), txn('b', '2026-05', 'income', 90)]);
        getBudgets.mockResolvedValue({ budgets: [{ category: 'Groceries', monthlyLimit: 300 }] });

        await renderProvider();

        expect(ctx.transactions).toHaveLength(2);
        expect(ctx.budgets).toEqual({ Groceries: 300 });
        expect(ctx.progress).toMatchObject({ level: 1 });
        expect(ctx.period).toBe('2026-05');
        expect(ctx.error).toBe('');
    });

    test('derives the selected month, its totals and the month before it', async () => {
        getTransactions.mockResolvedValue([
            txn('a', '2026-04', 'income', 500),
            txn('b', '2026-05', 'income', 300),
            txn('c', '2026-05', 'expense', 100),
            // Subscriptions are outflow, so net is 300 - 100 - 50.
            txn('d', '2026-05', 'subscription', 50),
        ]);

        await renderProvider();

        expect(ctx.period).toBe('2026-05');
        expect(ctx.monthTransactions).toHaveLength(3);
        expect(ctx.totals).toMatchObject({ income: 300, expense: 150, net: 150, count: 3 });
        expect(ctx.previousTotals).toMatchObject({ income: 500, net: 500 });
    });

    test('surfaces a load failure instead of rendering an empty app', async () => {
        getTransactions.mockRejectedValue(new Error('Failed to fetch'));

        await renderProvider();

        expect(ctx.error).toBe('Failed to fetch');
        expect(ctx.transactions).toEqual([]);
    });

    test('stepping the month rolls over the year and stops auto-picking', async () => {
        getTransactions.mockResolvedValue([txn('a', '2026-01', 'expense', 10)]);
        await renderProvider();
        expect(ctx.period).toBe('2026-01');

        act(() => ctx.stepPeriod(-1));
        expect(ctx.period).toBe('2025-12');

        act(() => ctx.goToPeriod('2026-07'));
        expect(ctx.period).toBe('2026-07');
    });

    test('removing a transaction drops it immediately and calls the API', async () => {
        getTransactions.mockResolvedValue([txn('a', '2026-05', 'expense', 10), txn('b', '2026-05', 'expense', 20)]);
        await renderProvider();

        await act(async () => { await ctx.removeTransaction('a'); });

        expect(deleteTransaction).toHaveBeenCalledWith('a');
        expect(ctx.transactions.map((t) => t._id)).toEqual(['b']);
        expect(ctx.toasts.some((t) => t.title === 'Transaction removed')).toBe(true);
    });

    test('a failed delete reloads rather than leaving the row missing', async () => {
        getTransactions.mockResolvedValue([txn('a', '2026-05', 'expense', 10)]);
        await renderProvider();
        deleteTransaction.mockRejectedValue(new Error('Network down'));

        await act(async () => { await ctx.removeTransaction('a'); });

        // The optimistic removal has to be undone, or the row is gone from the UI
        // while still in the database.
        await waitFor(() => expect(ctx.transactions).toHaveLength(1));
        expect(ctx.toasts.some((t) => t.title === 'Delete failed')).toBe(true);
    });

    test('theme defaults to dark, persists, and drives the document attribute', async () => {
        await renderProvider();

        expect(ctx.theme).toBe('dark');
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

        act(() => ctx.setTheme('light'));

        await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light'));
        expect(window.localStorage.getItem('finance-tracker-theme')).toBe('light');
    });

    test('claiming a quest awards XP and refreshes progress', async () => {
        claimQuest.mockResolvedValue({ awarded: 80, leveledUp: false, level: 1, rank: 'Bronze Beginner' });
        getTransactions.mockResolvedValue([txn('a', '2026-05', 'expense', 10)]);
        await renderProvider();

        await act(async () => { await ctx.claim('logger'); });

        expect(claimQuest).toHaveBeenCalledWith('2026', 5, 'logger');
        expect(ctx.toasts.some((t) => t.title === '+80 XP')).toBe(true);
        // Re-read rather than trusting the claim response.
        expect(getProgress).toHaveBeenCalledTimes(2);
    });

    test('a rejected claim reports it without awarding anything', async () => {
        claimQuest.mockRejectedValue(new Error('That quest is not complete yet'));
        getTransactions.mockResolvedValue([txn('a', '2026-05', 'expense', 10)]);
        await renderProvider();

        await act(async () => { await ctx.claim('green'); });

        expect(ctx.toasts.some((t) => t.title === 'Could not claim')).toBe(true);
    });

    test('a failing budgets or progress call does not take the whole app down', async () => {
        getTransactions.mockResolvedValue([txn('a', '2026-05', 'expense', 10)]);
        getBudgets.mockRejectedValue(new Error('boom'));
        getProgress.mockRejectedValue(new Error('boom'));

        await renderProvider();

        expect(ctx.error).toBe('');
        expect(ctx.transactions).toHaveLength(1);
        expect(ctx.budgets).toEqual({});
        expect(ctx.progress).toBeNull();
    });
});

describe('AppStateProvider subscriptions', () => {
    // The provider uses the real clock, so charges are placed relative to today.
    // Fixed dates would read as lapsed the moment the calendar moved past them.
    const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
    const sub = (id, agoDays, amount = 10) => ({
        _id: id, name: 'Spotify', type: 'subscription', category: 'Streaming',
        amount, date: daysAgo(agoDays),
    });

    test('derives subscriptions from the whole history, not the selected month', async () => {
        getTransactions.mockResolvedValue([
            sub('a', 61), sub('b', 30), sub('c', 0),
        ]);
        await renderProvider();

        expect(ctx.subscriptions).toHaveLength(1);
        expect(ctx.subscriptions[0]).toMatchObject({ key: 'spotify', cadence: 'monthly' });
        expect(ctx.subscriptionMonthlyTotal).toBeCloseTo(10, 2);
    });

    test('a stored cancellation is applied on load', async () => {
        getTransactions.mockResolvedValue([sub('a', 30), sub('b', 0)]);
        getSubscriptionStates.mockResolvedValue({ cancelled: [{ key: 'spotify' }] });
        await renderProvider();

        expect(ctx.subscriptions[0].status).toBe('cancelled');
        expect(ctx.subscriptionMonthlyTotal).toBe(0);
    });

    test('cancelling applies immediately and persists', async () => {
        getTransactions.mockResolvedValue([sub('a', 30), sub('b', 0)]);
        await renderProvider();
        expect(ctx.subscriptions[0].status).toBe('active');

        await act(async () => { await ctx.setSubscriptionCancelled('spotify', true); });

        expect(setSubscriptionCancelled).toHaveBeenCalledWith('spotify', true);
        expect(ctx.subscriptions[0].status).toBe('cancelled');
    });

    test('a failed cancel rolls back rather than lying about the state', async () => {
        getTransactions.mockResolvedValue([sub('a', 30), sub('b', 0)]);
        await renderProvider();
        setSubscriptionCancelled.mockRejectedValue(new Error('Network down'));

        await act(async () => { await ctx.setSubscriptionCancelled('spotify', true); });

        expect(ctx.subscriptions[0].status).toBe('active');
        expect(ctx.toasts.some((t) => t.title === 'Could not cancel')).toBe(true);
    });

    test('restoring a cancelled subscription brings it back to the total', async () => {
        getTransactions.mockResolvedValue([sub('a', 30), sub('b', 0)]);
        getSubscriptionStates.mockResolvedValue({ cancelled: [{ key: 'spotify' }] });
        await renderProvider();

        await act(async () => { await ctx.setSubscriptionCancelled('spotify', false); });

        expect(setSubscriptionCancelled).toHaveBeenCalledWith('spotify', false);
        expect(ctx.subscriptions[0].status).toBe('active');
        expect(ctx.subscriptionMonthlyTotal).toBeCloseTo(10, 2);
    });

    test('a failing subscription-state call does not block the app', async () => {
        getTransactions.mockResolvedValue([sub('a', 0)]);
        getSubscriptionStates.mockRejectedValue(new Error('boom'));
        await renderProvider();

        expect(ctx.error).toBe('');
        expect(ctx.subscriptions).toHaveLength(1);
    });
});
