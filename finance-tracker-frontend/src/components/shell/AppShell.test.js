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
};

jest.mock('../../state/AppStateContext', () => ({
    useAppState: () => mockState,
}));

// TransactionsView stays real — it owns the edit button we click.
jest.mock('./Sidebar', () => () => <div />);
jest.mock('./TopBar', () => () => <div />);
jest.mock('./MonthStrip', () => () => <div />);
jest.mock('./StatusBar', () => () => <div />);
jest.mock('./Toasts', () => () => <div />);
jest.mock('../CommandPalette', () => () => <div />);
jest.mock('../ImportStatementModal', () => () => <div />);
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
