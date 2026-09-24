import { fireEvent, render, screen, within } from '@testing-library/react';
import CardsView from './CardsView';

const mockState = { cardStatements: [], transactions: [] };

jest.mock('../state/AppStateContext', () => ({
    useAppState: () => mockState,
}));

const statement = (overrides = {}) => ({
    _id: 's-aug',
    issuer: 'Chase',
    productName: 'Chase Freedom Unlimited',
    last4: '1301',
    sourceAccount: 'Chase ••1301',
    openingDate: '2026-07-08T00:00:00.000Z',
    closingDate: '2026-08-07T00:00:00.000Z',
    dueDate: '2026-09-04T00:00:00.000Z',
    previousBalance: 942.84,
    payments: -500,
    purchases: 504.36,
    cashAdvances: 0,
    balanceTransfers: 0,
    fees: 0,
    interest: 23.19,
    newBalance: 970.39,
    minimumPayment: 40,
    creditLimit: 2700,
    purchaseApr: 27.49,
    ...overrides,
});

const cardRow = (overrides = {}) => ({
    _id: 'r1',
    name: 'United Airlines',
    category: 'Travel',
    amount: 153.4,
    type: 'expense',
    date: '2026-07-10T12:00:00.000Z',
    accountType: 'credit_card',
    sourceAccount: 'Chase ••1301',
    ...overrides,
});

const panel = (title) => screen.getByText(title, { selector: '.bq-pt' }).closest('.bq-panel');

beforeEach(() => {
    mockState.cardStatements = [
        statement(),
        statement({
            _id: 's-jul', closingDate: '2026-07-07T00:00:00.000Z', openingDate: '2026-06-08T00:00:00.000Z',
            interest: 20.13, newBalance: 942.84, payments: -40, purchases: 847.56,
        }),
        statement({
            _id: 's-dec', closingDate: '2025-12-07T00:00:00.000Z', openingDate: '2025-11-08T00:00:00.000Z',
            interest: 9.99, newBalance: 139.07, payments: -40, purchases: 0,
        }),
    ];
    mockState.transactions = [
        cardRow(),
        cardRow({ _id: 'p1', name: 'Card Payment Received', category: 'Credit Card Payment', type: 'transfer', amount: 500, date: '2026-07-20T12:00:00.000Z', linkedTransactionId: 'b1' }),
        cardRow({ _id: 'p2', name: 'Card Payment Received', category: 'Credit Card Payment', type: 'transfer', amount: 40, date: '2026-07-03T12:00:00.000Z' }),
        // A checking row: not on the card, must not appear.
        { _id: 'b1', name: 'Chase Card Payment', category: 'Credit Card Payment', type: 'transfer', amount: 500, date: '2026-07-20T12:00:00.000Z' },
        { _id: 'g1', name: 'Costco', category: 'Groceries', type: 'expense', amount: 80, date: '2026-07-11T12:00:00.000Z' },
    ];
});

test('the balance and due date come from the latest statement', () => {
    render(<CardsView onImport={jest.fn()} />);

    expect(screen.getByText('Chase Freedom Unlimited · ••1301')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('970.39');
    expect(screen.getByText(/36% of the .*2,700.* limit used/)).toBeInTheDocument();
});

test('interest is summed over the latest statement year only', () => {
    render(<CardsView onImport={jest.fn()} />);
    const tile = screen.getByText('Interest paid').closest('.bq-ioc');

    // 23.19 + 20.13; December 2025's 9.99 belongs to the year before.
    expect(tile).toHaveTextContent('43.32');
    expect(screen.getByText('What the card cost in 2026')).toBeInTheDocument();
});

test('each payment says whether its checking debit was found', () => {
    render(<CardsView onImport={jest.fn()} />);
    const payments = panel('Payments');

    expect(within(payments).getByText('1 without a checking debit')).toBeInTheDocument();
    expect(within(payments).getByText(/paid from checking/)).toBeInTheDocument();
    expect(within(payments).getByText('no matching checking debit')).toBeInTheDocument();
});

test('card spending only counts purchases on this card', () => {
    render(<CardsView onImport={jest.fn()} />);
    const spending = panel('Spent on the card');

    expect(within(spending).getByText('Travel')).toBeInTheDocument();
    expect(within(spending).queryByText('Groceries')).not.toBeInTheDocument();
    expect(within(spending).queryByText('Credit Card Payment')).not.toBeInTheDocument();
});

test('the statement history lists every statement, newest first', () => {
    render(<CardsView onImport={jest.fn()} />);
    const rows = within(panel('Statements')).getAllByRole('row').slice(1);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('7 Aug 2026');
    expect(rows[2]).toHaveTextContent('7 Dec 2025');
});

test('with no statements it offers an import', () => {
    mockState.cardStatements = [];
    const onImport = jest.fn();
    render(<CardsView onImport={onImport} />);

    fireEvent.click(screen.getByRole('button', { name: 'Import a statement' }));
    expect(onImport).toHaveBeenCalled();
});

test('a failed load says so instead of claiming there are no statements', () => {
    mockState.cardStatements = null;
    render(<CardsView onImport={jest.fn()} />);

    expect(screen.getByText('Card statements could not be loaded')).toBeInTheDocument();
    expect(screen.queryByText('No card statements yet')).not.toBeInTheDocument();
});
