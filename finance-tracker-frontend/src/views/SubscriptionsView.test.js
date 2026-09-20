import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SubscriptionsView from './SubscriptionsView';

const mockState = {
    subscriptions: [],
    subscriptionMonthlyTotal: 0,
    setSubscriptionCancelled: jest.fn(),
};

jest.mock('../state/AppStateContext', () => ({
    useAppState: () => mockState,
}));

const sub = (overrides = {}) => ({
    key: 'spotify',
    name: 'Spotify',
    category: 'Streaming',
    amount: 11.99,
    amountVaries: false,
    cadence: 'monthly',
    periodDays: 30.44,
    confidence: 'high',
    monthlyCost: 11.99,
    charges: 3,
    firstCharged: new Date('2026-03-01T12:00:00.000Z'),
    lastCharged: new Date('2026-05-01T12:00:00.000Z'),
    nextExpected: new Date('2026-05-31T12:00:00.000Z'),
    status: 'active',
    ...overrides,
});

const panel = (title) => screen.getByText(title).closest('.bq-panel');

beforeEach(() => {
    jest.clearAllMocks();
    mockState.setSubscriptionCancelled = jest.fn().mockResolvedValue(undefined);
    mockState.subscriptions = [sub()];
    mockState.subscriptionMonthlyTotal = 11.99;
});

describe('SubscriptionsView', () => {
    test('leads with the monthly commitment and its annual equivalent', () => {
        const { container } = render(<SubscriptionsView onAdd={jest.fn()} />);

        // The same figure appears on the row, so target the headline specifically.
        expect(container.querySelector('.bq-hnum')).toHaveTextContent('$11.99');
        // The count sits in its own <b>, so match the whole subtitle.
        const subtitle = container.querySelector('.bq-hsub');
        expect(subtitle).toHaveTextContent('$143.88 a year');
        expect(subtitle).toHaveTextContent('1 active subscription');
    });

    test('shows the cadence and when the next charge is due', () => {
        render(<SubscriptionsView onAdd={jest.fn()} />);

        expect(screen.getByText('Monthly')).toBeInTheDocument();
        expect(screen.getByText(/3 charges/)).toBeInTheDocument();
        expect(screen.getByText(/next ~31 May 2026/)).toBeInTheDocument();
    });

    test('an annual plan also shows what it works out to per month', () => {
        mockState.subscriptions = [sub({
            name: 'Domain Renewal', cadence: 'yearly', amount: 120, monthlyCost: 10,
        })];
        mockState.subscriptionMonthlyTotal = 10;
        render(<SubscriptionsView onAdd={jest.fn()} />);

        expect(screen.getByText('Annual')).toBeInTheDocument();
        // The headline figure and the per-row conversion.
        expect(screen.getByText('$10.00/mo')).toBeInTheDocument();
        expect(screen.getByText('$120.00')).toBeInTheDocument();
    });

    test('a monthly plan does not repeat itself with a /mo conversion', () => {
        render(<SubscriptionsView onAdd={jest.fn()} />);
        expect(screen.queryByText(/\/mo$/)).not.toBeInTheDocument();
    });

    test('a cadence guessed from two charges is marked estimated', () => {
        mockState.subscriptions = [sub({ confidence: 'low', charges: 2 })];
        render(<SubscriptionsView onAdd={jest.fn()} />);

        expect(screen.getByText('estimated')).toBeInTheDocument();
    });

    test('an unknown cadence is not dressed up as an estimate', () => {
        mockState.subscriptions = [sub({ cadence: 'unknown', charges: 1, confidence: 'low', nextExpected: null })];
        render(<SubscriptionsView onAdd={jest.fn()} />);

        expect(screen.getByText('Unknown')).toBeInTheDocument();
        expect(screen.queryByText('estimated')).not.toBeInTheDocument();
        expect(screen.queryByText(/next ~/)).not.toBeInTheDocument();
    });

    test('a varying price is prefixed rather than stated as exact', () => {
        mockState.subscriptions = [sub({ amountVaries: true })];
        render(<SubscriptionsView onAdd={jest.fn()} />);

        expect(screen.getByText(/~\$11\.99/)).toBeInTheDocument();
    });

    test('active, lapsed and cancelled are separated', () => {
        mockState.subscriptions = [
            sub(),
            sub({ key: 'oldbox', name: 'Old Box', status: 'lapsed' }),
            sub({ key: 'gym', name: 'Gym', status: 'cancelled', monthlyCost: 0 }),
        ];
        render(<SubscriptionsView onAdd={jest.fn()} />);

        expect(within(panel('Active')).getByText('Spotify')).toBeInTheDocument();
        expect(within(panel('Nothing recent')).getByText('Old Box')).toBeInTheDocument();
        expect(within(panel('Cancelled')).getByText('Gym')).toBeInTheDocument();
    });

    test('groups with nothing in them are not rendered at all', () => {
        render(<SubscriptionsView onAdd={jest.fn()} />);

        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.queryByText('Nothing recent')).not.toBeInTheDocument();
        expect(screen.queryByText('Cancelled')).not.toBeInTheDocument();
    });

    test('marking one cancelled sends the key upward', async () => {
        render(<SubscriptionsView onAdd={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Mark cancelled' }));

        await waitFor(() =>
            expect(mockState.setSubscriptionCancelled).toHaveBeenCalledWith('spotify', true));
    });

    test('a cancelled one offers restore instead', async () => {
        mockState.subscriptions = [sub({ status: 'cancelled', monthlyCost: 0 })];
        mockState.subscriptionMonthlyTotal = 0;
        render(<SubscriptionsView onAdd={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

        await waitFor(() =>
            expect(mockState.setSubscriptionCancelled).toHaveBeenCalledWith('spotify', false));
    });

    test('with nothing detected it explains what would qualify', () => {
        mockState.subscriptions = [];
        mockState.subscriptionMonthlyTotal = 0;
        const onAdd = jest.fn();
        render(<SubscriptionsView onAdd={onAdd} />);

        expect(screen.getByText('No subscriptions yet')).toBeInTheDocument();
        expect(screen.getByText(/Streaming, Software, Cloud/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Add a transaction' }));
        expect(onAdd).toHaveBeenCalled();
    });
});
