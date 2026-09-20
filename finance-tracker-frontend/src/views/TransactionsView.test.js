import { fireEvent, render, screen } from '@testing-library/react';
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
