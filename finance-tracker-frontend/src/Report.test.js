import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Report from './Report';
import { deleteTransaction, getMonthlyReport, getTransactions } from './api/transactions';

jest.mock('./api/transactions', () => ({
    deleteTransaction: jest.fn(),
    getMonthlyReport: jest.fn(),
    getTransactions: jest.fn(),
}));

describe('Report', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        document.documentElement.removeAttribute('data-theme');
        window.confirm = jest.fn();
    });

    test('loads and renders transactions', async () => {
        getTransactions.mockResolvedValue([
            {
                _id: 't-1',
                type: 'expense',
                name: 'Milk and eggs',
                category: 'Groceries',
                amount: 35,
                description: 'Weekly run',
                date: '2026-03-01T00:00:00.000Z',
            },
        ]);

        render(<Report />);

        expect(await screen.findByText('Milk and eggs')).toBeInTheDocument();
        expect(getTransactions).toHaveBeenCalledTimes(1);
    });

    test('loads monthly report data', async () => {
        getTransactions.mockResolvedValue([]);
        getMonthlyReport.mockResolvedValue({
            totalIncome: 5000,
            totalExpenses: 1200,
            report: {
                Housing: { total: 1000, transactions: 1 },
                Food: { total: 200, transactions: 2 },
                Salary: { total: 5000, transactions: 1 },
            },
            breakdownByType: {
                income: {
                    Salary: { total: 5000, transactions: 1 },
                },
                outflow: {
                    Housing: { total: 1000, transactions: 1 },
                    Food: { total: 200, transactions: 2 },
                },
            },
        });

        render(<Report />);

        fireEvent.click(screen.getByRole('button', { name: 'Load Report' }));
        expect(await screen.findByText('Total Income')).toBeInTheDocument();
        expect(screen.getByText('Total Expenses')).toBeInTheDocument();
        expect(screen.getByText('Income by Category')).toBeInTheDocument();
        expect(screen.getByText('Expenses & Subscriptions by Category')).toBeInTheDocument();
        expect(screen.getAllByText('Housing').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Salary').length).toBeGreaterThan(0);
        expect(getMonthlyReport).toHaveBeenCalledTimes(1);
    });

    test('uses transaction fallback to split income and outflow when report API is legacy', async () => {
        getTransactions.mockResolvedValue([
            {
                _id: 'legacy-income',
                type: 'income',
                name: 'Monthly salary',
                category: 'Salary',
                amount: 100,
                description: 'Payroll',
                date: '2026-03-05T00:00:00.000Z',
            },
            {
                _id: 'legacy-expense',
                type: 'expense',
                name: 'Gym payment',
                category: 'Gym',
                amount: 23,
                description: 'Membership',
                date: '2026-03-06T00:00:00.000Z',
            },
        ]);
        getMonthlyReport.mockResolvedValue({
            totalIncome: 100,
            totalExpenses: 23,
            report: {
                Salary: { total: 100, transactions: 1 },
                Gym: { total: 23, transactions: 1 },
            },
        });

        render(<Report />);

        expect(await screen.findByText('Monthly salary')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Load Report' }));

        expect(await screen.findByText('Income by Category')).toBeInTheDocument();
        expect(screen.queryByText('No income categories for the selected month.')).not.toBeInTheDocument();
        expect(screen.getByText(/Top income:/i)).toHaveTextContent('Salary');
        expect(screen.getByText(/Top outflow:/i)).toHaveTextContent('Gym');
    });

    test('deletes a transaction from the list', async () => {
        getTransactions.mockResolvedValue([
            {
                _id: 't-2',
                type: 'expense',
                name: 'Gas refill',
                category: 'Fuel',
                amount: 60,
                description: 'Gas station',
                date: '2026-03-02T00:00:00.000Z',
            },
        ]);
        deleteTransaction.mockResolvedValue(undefined);
        window.confirm.mockReturnValue(true);

        render(<Report />);

        expect(await screen.findByText('Gas refill')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        fireEvent.click(screen.getByRole('button', { name: /Delete Gas refill/i }));

        await waitFor(() => {
            expect(deleteTransaction).toHaveBeenCalledWith('t-2');
        });
        await waitFor(() => {
            expect(screen.queryByText('Gas refill')).not.toBeInTheDocument();
        });
    });

    test('deletes a transaction when API returns id instead of _id', async () => {
        getTransactions.mockResolvedValue([
            {
                id: 'id-only-1',
                type: 'expense',
                name: 'Coffee',
                category: 'Food',
                amount: 8,
                description: 'Morning',
                date: '2026-03-03T00:00:00.000Z',
            },
        ]);
        deleteTransaction.mockResolvedValue(undefined);
        window.confirm.mockReturnValue(true);

        render(<Report />);

        expect(await screen.findByText('Coffee')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        fireEvent.click(screen.getByRole('button', { name: /Delete Coffee/i }));

        await waitFor(() => {
            expect(deleteTransaction).toHaveBeenCalledWith('id-only-1');
        });
        await waitFor(() => {
            expect(screen.queryByText('Coffee')).not.toBeInTheDocument();
        });
    });

    test('filters transactions by search text', async () => {
        getTransactions.mockResolvedValue([
            {
                _id: 't-3',
                type: 'expense',
                name: 'Coffee beans',
                category: 'Groceries',
                amount: 20,
                description: 'Roasted',
                date: '2026-03-03T00:00:00.000Z',
            },
            {
                _id: 't-4',
                type: 'expense',
                name: 'Movie tickets',
                category: 'Entertainment',
                amount: 30,
                description: 'Weekend',
                date: '2026-03-04T00:00:00.000Z',
            },
        ]);

        render(<Report />);

        expect(await screen.findByText('Coffee beans')).toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText('Search name or description'), {
            target: { value: 'movie' },
        });

        await waitFor(() => {
            expect(screen.queryByText('Coffee beans')).not.toBeInTheDocument();
        });
        expect(screen.getByText('Movie tickets')).toBeInTheDocument();
    });

    test('toggles and persists theme mode', async () => {
        getTransactions.mockResolvedValue([]);

        render(<Report />);

        expect(screen.getByRole('heading', { name: 'Personal Financial Tracker' })).toBeInTheDocument();
        const toggleButton = await screen.findByRole('button', { name: 'Switch to dark mode' });
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');

        fireEvent.click(toggleButton);

        await waitFor(() => {
            expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        });
        expect(window.localStorage.getItem('finance-tracker-theme')).toBe('dark');
        expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
    });
});
