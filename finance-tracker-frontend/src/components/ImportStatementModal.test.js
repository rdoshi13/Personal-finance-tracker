import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ImportStatementModal from './ImportStatementModal';
import { importTransactions, previewTransactionImport } from '../api/transactions';

jest.mock('../api/transactions', () => ({
    previewTransactionImport: jest.fn(),
    importTransactions: jest.fn(),
}));

const readyRow = (overrides = {}) => ({
    rowNumber: 2,
    date: '2026-05-04',
    name: 'Costco',
    description: 'Card Purchase Costco',
    amount: 28.03,
    type: 'expense',
    category: 'Groceries',
    importHash: 'hash-ready',
    status: 'ready',
    errors: [],
    ...overrides,
});

const preview = (rows, summary) => ({
    filename: 'statement.csv',
    fileHash: 'file-hash',
    totalRows: rows.length,
    rows,
    summary,
});

const uploadFile = () => {
    const input = screen.getByLabelText('Statement file');
    const file = new File(['date,description,amount\n'], 'statement.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });
};

describe('ImportStatementModal', () => {
    const onClose = jest.fn();
    const onImported = jest.fn();

    beforeEach(() => jest.clearAllMocks());

    test('previewing a statement lists the rows and the server summary', async () => {
        previewTransactionImport.mockResolvedValue(
            preview([readyRow(), readyRow({ name: 'Walmart', importHash: 'hash-2' })], { ready: 2, duplicate: 0, invalid: 0 })
        );
        render(<ImportStatementModal onClose={onClose} onImported={onImported} />);

        uploadFile();

        expect(await screen.findByDisplayValue('Costco')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Walmart')).toBeInTheDocument();
        expect(screen.getByText('Total rows: 2')).toBeInTheDocument();
        expect(screen.getByText('Ready: 2')).toBeInTheDocument();
    });

    test('invalid rows show their reasons and are left out of the import count', async () => {
        previewTransactionImport.mockResolvedValue(
            preview([
                readyRow(),
                readyRow({
                    name: '', amount: '', importHash: '', status: 'invalid',
                    errors: ['Missing description', 'Invalid or missing amount'],
                }),
            ], { ready: 1, duplicate: 0, invalid: 1 })
        );
        render(<ImportStatementModal onClose={onClose} onImported={onImported} />);

        uploadFile();

        expect(await screen.findByText('Missing description, Invalid or missing amount')).toBeInTheDocument();
        // Two rows on screen, but only one is importable.
        expect(screen.getByRole('button', { name: 'Import 1 transactions' })).toBeInTheDocument();
    });

    test('duplicates are shown but never counted as importable', async () => {
        previewTransactionImport.mockResolvedValue(
            preview([
                readyRow(),
                readyRow({ status: 'duplicate', importHash: 'hash-dupe', errors: [] }),
            ], { ready: 1, duplicate: 1, invalid: 0 })
        );
        render(<ImportStatementModal onClose={onClose} onImported={onImported} />);

        uploadFile();

        expect(await screen.findByText('Duplicates: 1')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Import 1 transactions' })).toBeInTheDocument();
    });

    test('importing sends only the importable rows and reports what happened', async () => {
        previewTransactionImport.mockResolvedValue(
            preview([
                readyRow(),
                readyRow({ status: 'duplicate', importHash: 'hash-dupe' }),
            ], { ready: 1, duplicate: 1, invalid: 0 })
        );
        importTransactions.mockResolvedValue({
            imported: 1, skipped: 1, failed: 0, transactions: [{ _id: 'new-1' }],
        });
        render(<ImportStatementModal onClose={onClose} onImported={onImported} />);
        uploadFile();
        fireEvent.click(await screen.findByRole('button', { name: 'Import 1 transactions' }));

        await waitFor(() => expect(importTransactions).toHaveBeenCalled());
        const [sentRows, batch] = importTransactions.mock.calls[0];
        expect(sentRows).toHaveLength(1);
        expect(sentRows[0].name).toBe('Costco');
        expect(batch).toMatchObject({ filename: 'statement.csv', fileHash: 'file-hash' });

        expect(await screen.findByText('Imported 1, skipped 1, failed 0.')).toBeInTheDocument();
        // The whole result goes along too, so the shell can show matches and warnings.
        expect(onImported).toHaveBeenCalledWith(
            [{ _id: 'new-1' }],
            expect.objectContaining({ imported: 1, skipped: 1, failed: 0 })
        );
    });

    test('correcting an invalid row makes it importable', async () => {
        previewTransactionImport.mockResolvedValue(
            preview([
                readyRow({ name: '', status: 'invalid', errors: ['Missing description'] }),
            ], { ready: 0, duplicate: 0, invalid: 1 })
        );
        render(<ImportStatementModal onClose={onClose} onImported={onImported} />);
        uploadFile();

        await screen.findByText('Missing description');
        expect(screen.queryByRole('button', { name: /^Import/ })).toBeDisabled();

        // Scoped to the table: the page's first empty textbox is "Source account".
        const table = screen.getByRole('table');
        const [nameInput] = within(table).getAllByRole('textbox');
        fireEvent.change(nameInput, { target: { value: 'Recovered merchant' } });

        expect(await screen.findByRole('button', { name: 'Import 1 transactions' })).toBeEnabled();
    });

    test('a failed preview reports the reason and lists nothing', async () => {
        previewTransactionImport.mockRejectedValue(new Error('Statement file must be 2 MB or smaller'));
        render(<ImportStatementModal onClose={onClose} onImported={onImported} />);

        uploadFile();

        expect(await screen.findByText('Statement file must be 2 MB or smaller')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Import/ })).not.toBeInTheDocument();
    });

    test('a failed import keeps the rows on screen so the work is not lost', async () => {
        previewTransactionImport.mockResolvedValue(preview([readyRow()], { ready: 1, duplicate: 0, invalid: 0 }));
        importTransactions.mockRejectedValue(new Error('Failed to import transactions'));
        render(<ImportStatementModal onClose={onClose} onImported={onImported} />);
        uploadFile();
        fireEvent.click(await screen.findByRole('button', { name: 'Import 1 transactions' }));

        expect(await screen.findByText('Failed to import transactions')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Costco')).toBeInTheDocument();
        expect(onImported).not.toHaveBeenCalled();
    });
});

describe('ImportStatementModal with a card statement', () => {
    const cardStatement = {
        issuer: 'Chase', productName: 'Chase Freedom Unlimited', last4: '1301', sourceAccount: 'Chase ••1301',
        openingDate: '2026-07-08', closingDate: '2026-08-07', previousBalance: 942.84, newBalance: 970.39,
    };

    beforeEach(() => jest.clearAllMocks());

    test('shows the statement, and sends it with the import', async () => {
        previewTransactionImport.mockResolvedValue({
            ...preview([readyRow({ accountType: 'credit_card' })], { ready: 1, duplicate: 0, invalid: 0 }),
            statement: cardStatement,
        });
        importTransactions.mockResolvedValue({ imported: 1, skipped: 0, failed: 0, transactions: [], transfersMatched: 1, warnings: [] });
        render(<ImportStatementModal onClose={jest.fn()} onImported={jest.fn()} />);

        uploadFile();

        expect(await screen.findByLabelText('Card statement')).toHaveTextContent(
            'Chase Freedom Unlimited ••1301 · 2026-07-08 to 2026-08-07 · new balance $970.39 · balances ✓'
        );
        fireEvent.click(screen.getByRole('button', { name: 'Import 1 transactions' }));

        expect(await screen.findByText(/Matched 1 card payment to checking/)).toBeInTheDocument();
        expect(importTransactions.mock.calls[0][1].statement).toEqual(cardStatement);
    });

    test('a re-imported statement with only duplicates can still be committed', async () => {
        previewTransactionImport.mockResolvedValue({
            ...preview([readyRow({ status: 'duplicate' })], { ready: 0, duplicate: 1, invalid: 0 }),
            statement: cardStatement,
        });
        importTransactions.mockResolvedValue({
            imported: 0, skipped: 0, failed: 0, transactions: [], transfersMatched: null,
            warnings: ['Card payments could not be paired with checking. Re-import the file to retry.'],
        });
        render(<ImportStatementModal onClose={jest.fn()} onImported={jest.fn()} />);

        uploadFile();
        const button = await screen.findByRole('button', { name: 'Update statement' });
        expect(button).toBeEnabled();
        fireEvent.click(button);

        expect(await screen.findByText(/could not be paired with checking/)).toBeInTheDocument();
        expect(importTransactions.mock.calls[0][0]).toEqual([]);
    });
});
