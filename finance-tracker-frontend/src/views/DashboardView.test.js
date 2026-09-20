import { render } from '@testing-library/react';
import DashboardView from './DashboardView';

const mockState = {
    monthTransactions: [],
    totals: { income: 0, expense: 0, net: 0, count: 0 },
    previousTotals: { income: 0, expense: 0, net: 0, count: 0 },
    period: '2026-02',
    budgets: {},
    quests: [],
    claim: jest.fn(),
    setView: jest.fn(),
    goToPeriod: jest.fn(),
    latestPeriodWithData: '2026-02',
    summary: [],
};

jest.mock('../state/AppStateContext', () => ({
    useAppState: () => mockState,
}));
// Bars mount at 0% and transition to their target; skip straight to the target.
jest.mock('../hooks/useGrowIn', () => () => true);
jest.mock('../hooks/useCountUp', () => (value) => value);

const txn = {
    _id: 't1', name: 'Rent', category: 'Housing',
    amount: 100, type: 'expense', date: '2026-02-03T12:00:00.000Z',
};

const month = (periodKey, net, count = 3) => ({
    periodKey, month: Number(periodKey.split('-')[1]), count,
    income: net > 0 ? net : 0, expense: net < 0 ? -net : 0, net,
});

const chart = (container) => ({
    zeroTop: container.querySelector('.bq-zero').style.top,
    columns: [...container.querySelectorAll('.bq-cbar')].map((col) => ({
        negative: col.classList.contains('neg'),
        upHeight: col.querySelector('.bq-cbar-up').style.height,
        downHeight: col.querySelector('.bq-cbar-down').style.height,
        barIn: col.querySelector('.bq-cbar-up .bq-cbar-t') ? 'up' : 'down',
        barHeight: col.querySelector('.bq-cbar-t').style.height,
        label: col.querySelector('.bq-cbar-v').textContent,
    })),
});

describe('DashboardView net-by-month chart', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockState.monthTransactions = [txn];
    });

    test('splits the plot at zero and hangs negative months below it', () => {
        mockState.summary = [month('2026-01', 300), month('2026-02', -100)];
        const { container } = render(<DashboardView onAdd={jest.fn()} />);
        const { zeroTop, columns } = chart(container);

        // maxPos 300, maxNeg 100 -> zero sits 75% down, leaving each side space
        // proportional to its own peak.
        expect(zeroTop).toBe('75%');
        expect(columns[0]).toMatchObject({
            negative: false, barIn: 'up', upHeight: '75%', label: '$300',
        });
        expect(columns[1]).toMatchObject({
            negative: true, barIn: 'down', downHeight: '25%', label: '−$100',
        });
    });

    test('an all-negative run puts zero at the top so every bar hangs', () => {
        mockState.summary = [month('2026-01', -115), month('2026-02', -619)];
        const { container } = render(<DashboardView onAdd={jest.fn()} />);
        const { zeroTop, columns } = chart(container);

        expect(zeroTop).toBe('0%');
        expect(columns.every((c) => c.negative && c.barIn === 'down')).toBe(true);
        // Scaled against the negative peak, so -619 fills its side and -115 does not.
        expect(columns[1].barHeight).toBe('100%');
        expect(parseFloat(columns[0].barHeight)).toBeCloseTo((115 / 619) * 100, 1);
    });

    test('an all-positive run keeps zero at the bottom and grows upward', () => {
        mockState.summary = [month('2026-01', 40), month('2026-02', 80)];
        const { container } = render(<DashboardView onAdd={jest.fn()} />);
        const { zeroTop, columns } = chart(container);

        expect(zeroTop).toBe('100%');
        expect(columns.every((c) => !c.negative && c.barIn === 'up')).toBe(true);
        expect(columns[0].barHeight).toBe('50%');
        expect(columns[1].barHeight).toBe('100%');
    });

    test('equal magnitudes of opposite sign are mirrored about the line', () => {
        mockState.summary = [month('2026-01', 250), month('2026-02', -250)];
        const { container } = render(<DashboardView onAdd={jest.fn()} />);
        const { zeroTop, columns } = chart(container);

        expect(zeroTop).toBe('50%');
        expect(columns[0].barHeight).toBe('100%');
        expect(columns[1].barHeight).toBe('100%');
    });

    test('a zero-net month does not divide by zero', () => {
        mockState.summary = [month('2026-01', 0), month('2026-02', 0)];
        const { container } = render(<DashboardView onAdd={jest.fn()} />);
        const { zeroTop, columns } = chart(container);

        expect(zeroTop).toBe('100%');
        expect(columns.every((c) => c.barHeight === '0%')).toBe(true);
        expect(columns[0].label).toBe('$0');
    });
});
