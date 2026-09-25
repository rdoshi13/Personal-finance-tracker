import { act, fireEvent, render, screen } from '@testing-library/react';
import AppShell from './AppShell';

// Captures what AppShell hands the form, which is the wiring under test.
const addTransactionProps = [];

const mockState = {
    view: 'transactions',
    loading: false,
    error: '',
    reload: jest.fn().mockResolvedValue(undefined),
    refreshProgress: jest.fn().mockResolvedValue(undefined),
    pushToast: jest.fn(),
    // consumed by the real TransactionsView below
    monthTransactions: [],
    categories: [],
    filters: { q: '', type: 'all', category: 'all', from: '', to: '' },
    setFilters: jest.fn(),
    sort: { key: 'date', dir: 'desc' },
    setSort: jest.fn(),
    removeTransaction: jest.fn(),
    // Read by the real TopBar and StatusBar.
    transactions: [],
    period: '2026-02',
    totals: { income: 0, expense: 0, net: 0, count: 0 },
    theme: 'dark',
    setTheme: jest.fn(),
};

jest.mock('../../state/AppStateContext', () => ({
    ...jest.requireActual('../../state/AppStateContext'),
    useAppState: () => mockState,
}));

// TransactionsView stays real — it owns the edit button we click.
jest.mock('./Sidebar', () => () => <div />);
jest.mock('./MonthStrip', () => () => <div data-testid="month-strip" />);
jest.mock('./Toasts', () => () => <div />);
jest.mock('../CommandPalette', () => () => <div />);
let importModalProps;
jest.mock('../ImportStatementModal', () => (props) => {
    importModalProps = props;
    return <div data-testid="import-modal" />;
});
jest.mock('../../views/DashboardView', () => () => <div />);
jest.mock('../../views/QuestsView', () => () => <div />);
jest.mock('../../views/AchievementsView', () => () => <div />);
jest.mock('../../AddTransaction', () => (props) => {
    addTransactionProps.push(props);
    return <div data-testid="transaction-form" />;
});

const rent = {
    _id: 'txn-7',
    name: 'Rent',
    category: 'Housing',
    description: '',
    amount: 1450,
    type: 'expense',
    date: '2026-09-01T12:00:00.000Z',
};

describe('AppShell edit wiring', () => {
    beforeEach(() => {
        addTransactionProps.length = 0;
        importModalProps = undefined;
        jest.clearAllMocks();
        mockState.monthTransactions = [rent];
    });

    const lastFormProps = () => addTransactionProps[addTransactionProps.length - 1];

    test('routes the clicked row into the form and labels the dialog as an edit', () => {
        render(<AppShell />);
        expect(screen.queryByTestId('transaction-form')).not.toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Edit Rent'));

        expect(screen.getByTestId('transaction-form')).toBeInTheDocument();
        expect(lastFormProps().editingTransaction).toEqual(rent);
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Edit transaction');
    });

    test('a saved edit reports itself as an update, not a new transaction', async () => {
        render(<AppShell />);
        fireEvent.click(screen.getByLabelText('Edit Rent'));

        await act(async () => {
            await lastFormProps().onSaved(rent, 'edit');
        });

        expect(mockState.reload).toHaveBeenCalled();
        expect(mockState.pushToast).toHaveBeenCalledWith(
            'Transaction updated',
            expect.any(String),
            'xp'
        );
        expect(screen.queryByTestId('transaction-form')).not.toBeInTheDocument();
    });

    test('cancelling an edit clears it, so the next open is a blank add', () => {
        render(<AppShell />);

        fireEvent.click(screen.getByLabelText('Edit Rent'));
        expect(lastFormProps().editingTransaction).toEqual(rent);

        act(() => { lastFormProps().onCancel(); });
        // 'n' is the new-transaction shortcut, and it must not reopen the edit.
        fireEvent.keyDown(window, { key: 'n' });

        expect(lastFormProps().editingTransaction).toBeNull();
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Add transaction');
    });
});

describe('AppShell month chrome', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockState.monthTransactions = [rent];
        mockState.transactions = [rent, { ...rent, _id: 'txn-8' }];
        mockState.totals = { income: 0, expense: 1450, net: -1450, count: 1 };
    });

    test('a month-scoped view shows the strip, the period and the month net', () => {
        mockState.view = 'transactions';
        render(<AppShell />);

        expect(screen.getByTestId('month-strip')).toBeInTheDocument();
        // The TopBar subtitle and the StatusBar both carry the period.
        expect(screen.getAllByText('Feb 2026')).toHaveLength(2);
        expect(screen.getByText('1 transactions')).toBeInTheDocument();
        expect(screen.getByText(/net/)).toBeInTheDocument();
    });

    test('achievements is all-time, so none of the month chrome appears', () => {
        mockState.view = 'achievements';
        render(<AppShell />);

        expect(screen.queryByTestId('month-strip')).not.toBeInTheDocument();
        expect(screen.queryAllByText('Feb 2026')).toHaveLength(0);
        // All-time count, not the selected month's.
        expect(screen.getByText('2 transactions')).toBeInTheDocument();
        expect(screen.getByText('All time')).toBeInTheDocument();
        expect(screen.queryByText(/net/)).not.toBeInTheDocument();
    });
});

describe('AppShell import wiring', () => {
    beforeEach(() => {
        importModalProps = undefined;
        jest.clearAllMocks();
        mockState.view = 'transactions';
        mockState.monthTransactions = [rent];
    });

    test('a finished import reloads the data and says so', async () => {
        render(<AppShell />);
        // Opened from the TopBar's import button.
        fireEvent.click(screen.getByLabelText('Import statement'));
        expect(screen.getByTestId('import-modal')).toBeInTheDocument();

        await act(async () => { await importModalProps.onImported([{ _id: 'new-1' }]); });

        // The modal reports what it imported, but the list is re-read from the
        // server rather than patched from that response.
        expect(mockState.reload).toHaveBeenCalled();
        expect(mockState.refreshProgress).toHaveBeenCalled();
        expect(mockState.pushToast).toHaveBeenCalledWith(
            'Statement imported', expect.any(String), 'xp'
        );
        expect(screen.queryByTestId('import-modal')).not.toBeInTheDocument();
    });

    test('a card import says how many payments it matched', async () => {
        render(<AppShell />);
        fireEvent.click(screen.getByLabelText('Import statement'));

        await act(async () => { await importModalProps.onImported([], { transfersMatched: 2, warnings: [] }); });

        expect(mockState.pushToast).toHaveBeenCalledWith(
            'Statement imported', 'Matched 2 card payments to checking', 'xp'
        );
    });

    test('an import with warnings stays open so they can be read, but still reloads', async () => {
        render(<AppShell />);
        fireEvent.click(screen.getByLabelText('Import statement'));

        await act(async () => {
            await importModalProps.onImported([], { transfersMatched: null, warnings: ['Card payments could not be paired.'] });
        });

        expect(mockState.reload).toHaveBeenCalled();
        expect(mockState.pushToast).not.toHaveBeenCalled();
        expect(screen.getByTestId('import-modal')).toBeInTheDocument();
    });

    test('closing the import modal changes nothing', () => {
        render(<AppShell />);
        fireEvent.click(screen.getByLabelText('Import statement'));

        act(() => { importModalProps.onClose(); });

        expect(screen.queryByTestId('import-modal')).not.toBeInTheDocument();
        expect(mockState.reload).not.toHaveBeenCalled();
    });
});
