import { fireEvent, render, screen, within } from '@testing-library/react';
import TransactionsView from './TransactionsView';

const mockRemoveTransaction = jest.fn();
const mockState = {
    monthTransactions: [],
    categories: [],
    filters: { q: '', type: 'all', category: 'all', from: '', to: '' },
    setFilters: jest.fn(),
    sort: { key: 'date', dir: 'desc' },
    setSort: jest.fn(),
    removeTransaction: mockRemoveTransaction,
};

jest.mock('../state/AppStateContext', () => ({
    useAppState: () => mockState,
}));

const groceries = {
    _id: 'txn-1',
    name: 'Weekly shop',
    category: 'Groceries',
    description: 'Supermarket run',
    amount: 62.4,
    type: 'expense',
    date: '2026-09-04T12:00:00.000Z',
};

describe('TransactionsView', () => {
    const onAdd = jest.fn();
    const onEdit = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        mockState.monthTransactions = [groceries];
    });

    test('hands the whole transaction to onEdit, not just its id', () => {
        render(<TransactionsView onAdd={onAdd} onEdit={onEdit} />);

        fireEvent.click(screen.getByLabelText('Edit Weekly shop'));

        expect(onEdit).toHaveBeenCalledTimes(1);
        // AddTransaction reads name/type/category/amount off this object to
        // populate the form, so the row object has to arrive intact.
        expect(onEdit).toHaveBeenCalledWith(groceries);
        expect(mockRemoveTransaction).not.toHaveBeenCalled();
    });

    test('delete still removes by id and does not open the editor', () => {
        render(<TransactionsView onAdd={onAdd} onEdit={onEdit} />);

        fireEvent.click(screen.getByLabelText('Delete Weekly shop'));

        expect(mockRemoveTransaction).toHaveBeenCalledWith('txn-1');
        expect(onEdit).not.toHaveBeenCalled();
    });

    test('falls back to id when a row has no _id', () => {
        mockState.monthTransactions = [{ ...groceries, _id: undefined, id: 'legacy-9' }];
        render(<TransactionsView onAdd={onAdd} onEdit={onEdit} />);

        fireEvent.click(screen.getByLabelText('Delete Weekly shop'));

        expect(mockRemoveTransaction).toHaveBeenCalledWith('legacy-9');
    });
});

describe('TransactionsView filtering and sorting', () => {
    const onAdd = jest.fn();
    const onEdit = jest.fn();

    const rows = () => [...document.querySelectorAll('.bq-table tbody tr')]
        .map((r) => r.querySelector('.bq-tn')?.textContent)
        .filter(Boolean);

    const ledger = [
        { _id: '1', name: 'Costco', description: 'Weekly shop', category: 'Groceries', amount: 80, type: 'expense', date: '2026-05-02T12:00:00.000Z' },
        { _id: '2', name: 'Payroll', description: 'Monthly salary', category: 'Salary', amount: 3000, type: 'income', date: '2026-05-10T12:00:00.000Z' },
        { _id: '3', name: 'Netflix', description: 'Streaming plan', category: 'Subscription', amount: 15, type: 'subscription', date: '2026-05-20T12:00:00.000Z' },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        mockState.monthTransactions = ledger;
        mockState.categories = ['Groceries', 'Salary', 'Subscription'];
        mockState.filters = { q: '', type: 'all', category: 'all', from: '', to: '' };
        mockState.sort = { key: 'date', dir: 'desc' };
    });

    test('search matches name or description, case-insensitively', () => {
        mockState.filters = { ...mockState.filters, q: 'COSTCO' };
        render(<TransactionsView onAdd={onAdd} onEdit={onEdit} />);
        expect(rows()).toEqual(['Costco']);
    });

    test('search also reaches the description, not just the name', () => {
        mockState.filters = { ...mockState.filters, q: 'streaming' };
        render(<TransactionsView onAdd={onAdd} onEdit={onEdit} />);
        expect(rows()).toEqual(['Netflix']);
    });

    test('the outflow filter keeps subscriptions alongside expenses', () => {
        mockState.filters = { ...mockState.filters, type: 'outflow' };
        render(<TransactionsView onAdd={onAdd} onEdit={onEdit} />);
        expect(rows().sort()).toEqual(['Costco', 'Netflix']);
    });

    test('the income filter keeps only income', () => {
        mockState.filters = { ...mockState.filters, type: 'income' };
        render(<TransactionsView onAdd={onAdd} onEdit={onEdit} />);
        expect(rows()).toEqual(['Payroll']);
    });

    test('the date range is inclusive at both ends', () => {
        mockState.filters = { ...mockState.filters, from: '2026-05-10', to: '2026-05-20' };
        render(<TransactionsView onAdd={onAdd} onEdit={onEdit} />);
        expect(rows().sort()).toEqual(['Netflix', 'Payroll']);
    });

    test('sorting by amount ascending puts the smallest first', () => {
        mockState.sort = { key: 'amount', dir: 'asc' };
        render(<TransactionsView onAdd={onAdd} onEdit={onEdit} />);
        expect(rows()).toEqual(['Netflix', 'Costco', 'Payroll']);
    });

    test('the header reports how many of the month are shown', () => {
        mockState.filters = { ...mockState.filters, category: 'Groceries' };
        render(<TransactionsView onAdd={onAdd} onEdit={onEdit} />);
        expect(screen.getByText('1 of 3')).toBeInTheDocument();
    });

    test('filters that match nothing say so instead of showing a blank table', () => {
        mockState.filters = { ...mockState.filters, q: 'nothing matches this' };
        render(<TransactionsView onAdd={onAdd} onEdit={onEdit} />);
        expect(screen.getByText('No transactions match these filters.')).toBeInTheDocument();
        expect(rows()).toEqual([]);
    });

    test('typing in search patches only that field', () => {
        render(<TransactionsView onAdd={onAdd} onEdit={onEdit} />);
        fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'cost' } });

        const patch = mockState.setFilters.mock.calls[0][0](mockState.filters);
        expect(patch).toEqual({ q: 'cost', type: 'all', category: 'all', from: '', to: '' });
    });

    test('Clear resets every filter at once', () => {
        mockState.filters = { q: 'x', type: 'income', category: 'Salary', from: '2026-05-01', to: '2026-05-31' };
        render(<TransactionsView onAdd={onAdd} onEdit={onEdit} />);
        fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

        expect(mockState.setFilters).toHaveBeenCalledWith({
            q: '', type: 'all', category: 'all', from: '', to: '',
        });
    });

    test('clicking a sorted column flips direction rather than re-sorting descending', () => {
        render(<TransactionsView onAdd={onAdd} onEdit={onEdit} />);
        const dateHeader = screen.getByRole('columnheader', { name: /Date/ });
        expect(dateHeader).toHaveAttribute('aria-sort', 'descending');

        fireEvent.click(dateHeader);
        expect(mockState.setSort.mock.calls[0][0]({ key: 'date', dir: 'desc' }))
            .toEqual({ key: 'date', dir: 'asc' });
    });

    test('switching to a different column starts descending', () => {
        render(<TransactionsView onAdd={onAdd} onEdit={onEdit} />);
        fireEvent.click(screen.getByRole('columnheader', { name: /Amount/ }));

        expect(mockState.setSort.mock.calls[0][0]({ key: 'date', dir: 'asc' }))
            .toEqual({ key: 'amount', dir: 'desc' });
    });

    test('the footer nets only what is on screen', () => {
        mockState.filters = { ...mockState.filters, type: 'outflow' };
        render(<TransactionsView onAdd={onAdd} onEdit={onEdit} />);
        expect(screen.getByText('2 shown')).toBeInTheDocument();
        expect(within(screen.getByText(/Net of shown/)).getByText(/95\.00/)).toBeInTheDocument();
    });
});

describe('TransactionsView transfers', () => {
    const rows = () => [...document.querySelectorAll('.bq-table tbody tr')]
        .map((r) => r.querySelector('.bq-tn')?.textContent)
        .filter(Boolean);

    beforeEach(() => {
        mockState.monthTransactions = [
            { _id: '1', name: 'Costco', category: 'Groceries', amount: 80, type: 'expense', date: '2026-05-02T12:00:00.000Z' },
            { _id: '2', name: 'Payroll', category: 'Salary', amount: 3000, type: 'income', date: '2026-05-10T12:00:00.000Z' },
            { _id: '3', name: 'Chase Card Payment', category: 'Credit Card Payment', amount: 500, type: 'transfer', date: '2026-05-12T12:00:00.000Z' },
        ];
        mockState.categories = ['Credit Card Payment', 'Groceries', 'Salary'];
        mockState.filters = { q: '', type: 'all', category: 'all', from: '', to: '' };
        mockState.sort = { key: 'date', dir: 'desc' };
    });

    test('the expense filter no longer sweeps in transfers', () => {
        mockState.filters = { ...mockState.filters, type: 'outflow' };
        render(<TransactionsView onAdd={jest.fn()} onEdit={jest.fn()} />);
        expect(rows()).toEqual(['Costco']);
    });

    test('the transfer filter keeps only transfers', () => {
        mockState.filters = { ...mockState.filters, type: 'transfer' };
        render(<TransactionsView onAdd={jest.fn()} onEdit={jest.fn()} />);
        expect(rows()).toEqual(['Chase Card Payment']);
    });

    test('a transfer is marked TF and coloured as neither gain nor spend', () => {
        render(<TransactionsView onAdd={jest.fn()} onEdit={jest.fn()} />);
        const row = screen.getByText('Chase Card Payment').closest('tr');
        const amount = row.querySelector('.bq-tamt.bq-num');

        expect(amount).toHaveClass('bq-xfer');
        expect(amount).not.toHaveClass('bq-neg');
        expect(row.querySelector('.bq-dirt')).toHaveTextContent('TF');
    });
});
