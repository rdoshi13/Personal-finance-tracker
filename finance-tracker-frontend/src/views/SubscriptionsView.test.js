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
    history: [
        { date: new Date('2026-05-01T12:00:00.000Z'), amount: 11.99, category: 'Streaming' },
        { date: new Date('2026-04-01T12:00:00.000Z'), amount: 11.99, category: 'Streaming' },
        { date: new Date('2026-03-01T12:00:00.000Z'), amount: 9.99, category: 'Streaming' },
    ],
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

    test('charges are hidden until the row is expanded', () => {
        render(<SubscriptionsView onAdd={jest.fn()} />);

        expect(screen.queryByText('1 Apr 2026')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Show charges for Spotify' }))
            .toHaveAttribute('aria-expanded', 'false');
    });

    test('expanding lists every charge with its date and amount, newest first', () => {
        render(<SubscriptionsView onAdd={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Show charges for Spotify' }));

        const history = document.querySelector('.bq-subh');
        const rows = [...history.querySelectorAll('.bq-subhr')].map((r) => r.textContent);
        expect(rows).toHaveLength(3);
        expect(rows[0]).toContain('1 May 2026');
        expect(rows[0]).toContain('$11.99');
        expect(rows[2]).toContain('1 Mar 2026');
        // The price rise is visible in the history even though the row shows the latest.
        expect(rows[2]).toContain('$9.99');
    });

    test('the gap between consecutive charges is shown', () => {
        render(<SubscriptionsView onAdd={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Show charges for Spotify' }));

        // 1 Apr -> 1 May is 30 days; the oldest row has nothing before it.
        expect(screen.getByText('30d later')).toBeInTheDocument();
        expect(screen.getAllByText(/d later$/)).toHaveLength(2);
    });

    test('the toggle reports and flips its expanded state', () => {
        render(<SubscriptionsView onAdd={jest.fn()} />);
        const toggle = () => screen.getByRole('button', { name: /charges for Spotify/ });

        fireEvent.click(toggle());
        expect(toggle()).toHaveAttribute('aria-expanded', 'true');
        expect(toggle()).toHaveAccessibleName('Hide charges for Spotify');

        fireEvent.click(toggle());
        expect(toggle()).toHaveAttribute('aria-expanded', 'false');
        expect(document.querySelector('.bq-subh')).not.toBeInTheDocument();
    });

    test('rows expand independently of each other', () => {
        mockState.subscriptions = [
            sub(),
            sub({ key: 'notion', name: 'Notion', history: [{ date: new Date('2026-05-02T12:00:00.000Z'), amount: 8, category: 'Software' }], charges: 1 }),
        ];
        render(<SubscriptionsView onAdd={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Show charges for Notion' }));

        expect(document.querySelectorAll('.bq-subh')).toHaveLength(1);
        expect(screen.getByRole('button', { name: 'Show charges for Spotify' }))
            .toHaveAttribute('aria-expanded', 'false');
    });

    test('a one-charge subscription expands without a gap label', () => {
        mockState.subscriptions = [sub({
            cadence: 'unknown', charges: 1, nextExpected: null,
            history: [{ date: new Date('2026-05-15T12:00:00.000Z'), amount: 25, category: 'Subscription' }],
        })];
        render(<SubscriptionsView onAdd={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Show charges for Spotify' }));

        expect(document.querySelectorAll('.bq-subhr')).toHaveLength(1);
        expect(screen.queryByText(/d later$/)).not.toBeInTheDocument();
    });
});
