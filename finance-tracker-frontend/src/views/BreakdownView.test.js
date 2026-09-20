import { render, screen, within } from '@testing-library/react';
import BreakdownView from './BreakdownView';

const mockState = {
    monthTransactions: [],
    period: '2026-05',
    goToPeriod: jest.fn(),
    latestPeriodWithData: '2026-05',
};

jest.mock('../state/AppStateContext', () => ({
    useAppState: () => mockState,
}));
// Bars mount at width 0 and transition; skip to the settled state.
jest.mock('../hooks/useGrowIn', () => () => true);

const txn = (type, category, amount) => ({
    _id: `${type}-${category}-${amount}`, type, category, amount,
    name: category, date: '2026-05-04T12:00:00.000Z',
});

const panel = (title) => screen.getByText(title).closest('.bq-panel');
const rows = (title) => [...panel(title).querySelectorAll('.bq-cat')].map((row) => ({
    text: row.querySelector('.bq-cn').textContent,
    amount: row.querySelector('.bq-cv').textContent,
    barWidth: row.querySelector('.bq-ctr i').style.width,
}));

describe('BreakdownView', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockState.monthTransactions = [
            txn('income', 'Salary', 3000),
            txn('income', 'Interest', 1000),
            txn('expense', 'Groceries', 200),
            txn('expense', 'Transport', 50),
            txn('subscription', 'Streaming', 50),
        ];
    });

    test('splits money in from money out and totals each side', () => {
        render(<BreakdownView onAdd={jest.fn()} />);

        expect(within(panel('Money in')).getByText('$4,000.00')).toBeInTheDocument();
        // Subscriptions belong to outflow: 200 + 50 + 50.
        expect(within(panel('Money out')).getByText('$300.00')).toBeInTheDocument();
    });

    test('orders categories by size and shows each share of its own side', () => {
        render(<BreakdownView onAdd={jest.fn()} />);

        const income = rows('Money in');
        expect(income.map((r) => r.text)).toEqual(['Salary75.0%', 'Interest25.0%']);
        expect(income[0].amount).toContain('$3,000.00');

        const out = rows('Money out');
        expect(out.map((r) => r.text)).toEqual(['Groceries66.7%', 'Transport16.7%', 'Streaming16.7%']);
    });

    test('bars are sized against the largest row on their own side', () => {
        render(<BreakdownView onAdd={jest.fn()} />);

        // Outflow's biggest is 200, so 50 renders at a quarter -- not at its
        // 16.7% share, and not against income's much larger 3000.
        expect(rows('Money out').map((r) => r.barWidth)).toEqual(['100%', '25%', '25%']);
        expect(rows('Money in')[0].barWidth).toBe('100%');
    });

    test('pluralises the transaction count per category', () => {
        mockState.monthTransactions = [
            txn('expense', 'Groceries', 10),
            { ...txn('expense', 'Groceries', 20), _id: 'second' },
            txn('expense', 'Transport', 5),
        ];
        render(<BreakdownView onAdd={jest.fn()} />);

        const out = rows('Money out');
        expect(out[0].amount).toContain('2 txns');
        expect(out[1].amount).toContain('1 txn');
    });

    test('a side with nothing on it says so rather than rendering empty', () => {
        mockState.monthTransactions = [txn('expense', 'Groceries', 40)];
        render(<BreakdownView onAdd={jest.fn()} />);

        expect(within(panel('Money in')).getByText(/Nothing came in during May 2026/)).toBeInTheDocument();
        expect(rows('Money out')).toHaveLength(1);
    });

    test('an empty month offers a way back to the last month with data', () => {
        mockState.monthTransactions = [];
        mockState.period = '2026-01';
        mockState.latestPeriodWithData = '2026-05';
        render(<BreakdownView onAdd={jest.fn()} />);

        expect(screen.getByText('Nothing to break down in Jan 2026')).toBeInTheDocument();
        screen.getByRole('button', { name: 'Go to May 2026' }).click();
        expect(mockState.goToPeriod).toHaveBeenCalledWith('2026-05');
    });
});
