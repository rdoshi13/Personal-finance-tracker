import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AddTransaction from './AddTransaction';
import { createTransaction, updateTransaction } from './api/transactions';

jest.mock('./api/transactions', () => ({
    createTransaction: jest.fn(),
    updateTransaction: jest.fn(),
}));

describe('AddTransaction', () => {
    const onSaved = jest.fn();
    const onCancel = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('creates a transaction in add mode', async () => {
        const createdTransaction = {
            _id: '1',
            name: 'Monthly salary',
            category: 'Income',
            amount: 5000,
            type: 'income',
        };
        createTransaction.mockResolvedValue(createdTransaction);

        render(<AddTransaction onSaved={onSaved} onCancel={onCancel} editingTransaction={null} />);

        fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'income' } });
        fireEvent.change(screen.getByPlaceholderText('Enter name'), { target: { value: 'Monthly salary' } });
        fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Bonus' } });
        fireEvent.change(screen.getByPlaceholderText('Enter amount'), { target: { value: '5000' } });
        fireEvent.change(screen.getByPlaceholderText('Enter description'), { target: { value: 'Monthly pay' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));

        await waitFor(() => {
            expect(createTransaction).toHaveBeenCalledWith({
                type: 'income',
                name: 'Monthly salary',
                category: 'Bonus',
                amount: 5000,
                description: 'Monthly pay',
            });
        });
        expect(updateTransaction).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(onSaved).toHaveBeenCalledWith(createdTransaction, 'add');
        });
    });

    test('updates a transaction in edit mode', async () => {
        const editedTransaction = {
            _id: 'txn-1',
            type: 'expense',
            name: 'Apartment rent',
            category: 'Housing',
            amount: 1700,
            description: 'Apartment',
        };
        updateTransaction.mockResolvedValue(editedTransaction);

        render(
            <AddTransaction
                onSaved={onSaved}
                onCancel={onCancel}
                editingTransaction={editedTransaction}
            />
        );

        const amountInput = screen.getByPlaceholderText('Enter amount');
        fireEvent.change(amountInput, { target: { value: '1800' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

        await waitFor(() => {
            expect(updateTransaction).toHaveBeenCalledWith('txn-1', {
                type: 'expense',
                name: 'Apartment rent',
                category: 'Housing',
                amount: 1800,
                description: 'Apartment',
            });
        });
        expect(createTransaction).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(onSaved).toHaveBeenCalledWith(editedTransaction, 'edit');
        });
    });

    test('shows API errors', async () => {
        createTransaction.mockRejectedValue(new Error('Bad request'));

        render(<AddTransaction onSaved={onSaved} onCancel={onCancel} editingTransaction={null} />);

        fireEvent.change(screen.getByPlaceholderText('Enter name'), { target: { value: 'Dinner' } });
        fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Food' } });
        fireEvent.change(screen.getByPlaceholderText('Enter amount'), { target: { value: '40' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));

        expect(await screen.findByText('Bad request')).toBeInTheDocument();
    });
});
