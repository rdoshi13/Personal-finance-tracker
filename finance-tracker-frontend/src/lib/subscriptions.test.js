import {
    detectSubscriptions,
    inferCadence,
    isSubscription,
    monthlyTotal,
    normaliseToMonthly,
} from './subscriptions';

const charge = (name, date, amount, extra = {}) => ({
    name,
    date: `${date}T12:00:00.000Z`,
    amount,
    type: 'subscription',
    category: 'Subscription',
    ...extra,
});

const NOW = new Date('2026-05-31T12:00:00.000Z');
const detect = (txns, options = {}) => detectSubscriptions(txns, { now: NOW, ...options });
const byKey = (rows, key) => rows.find((r) => r.key === key);

describe('isSubscription', () => {
    test('accepts the typed shape and the category shape', () => {
        expect(isSubscription({ type: 'subscription', category: 'Gym' })).toBe(true);
        // What the importer produced before the type backfill.
        expect(isSubscription({ type: 'expense', category: 'Subscription' })).toBe(true);
        expect(isSubscription({ type: 'expense', category: 'Streaming' })).toBe(true);
    });

    test('leaves recurring non-subscriptions alone', () => {
        // Both recur monthly on a fixed amount and would fool a recurrence detector.
        expect(isSubscription({ type: 'expense', category: 'Housing' })).toBe(false);
        expect(isSubscription({ type: 'expense', category: 'Credit Card Payment' })).toBe(false);
        expect(isSubscription({ type: 'income', category: 'Salary' })).toBe(false);
    });
});

describe('inferCadence', () => {
    test('reads clean gaps at each supported period', () => {
        expect(inferCadence([7, 7, 7]).cadence).toBe('weekly');
        expect(inferCadence([30, 31, 30]).cadence).toBe('monthly');
        expect(inferCadence([91, 92]).cadence).toBe('quarterly');
        expect(inferCadence([365]).cadence).toBe('yearly');
    });

    test('a missed month still reads as monthly, not bi-monthly', () => {
        // The real Spotify case: charged 2 Mar and 1 May, nothing in April.
        expect(inferCadence([60]).cadence).toBe('monthly');
        expect(inferCadence([31, 60, 30]).cadence).toBe('monthly');
    });

    test('a consistent 90-day cycle is quarterly, not monthly with two misses', () => {
        // The skip penalty is what separates these two readings.
        expect(inferCadence([91, 91, 92]).cadence).toBe('quarterly');
    });

    test('no gaps means unknown rather than a guess', () => {
        expect(inferCadence([])).toEqual({ cadence: 'unknown', days: null });
    });

    test('gaps that fit no cycle are reported as irregular', () => {
        expect(inferCadence([3, 47, 12, 88]).cadence).toBe('irregular');
    });
});

describe('normaliseToMonthly', () => {
    test('uses calendar periods, so an annual plan is exactly a twelfth', () => {
        // A day ratio gives 10.0008 here, and $120.01 once multiplied back up.
        expect(normaliseToMonthly(120, 'yearly')).toBe(10);
        expect(normaliseToMonthly(120, 'yearly') * 12).toBe(120);
        expect(normaliseToMonthly(30, 'monthly')).toBe(30);
        expect(normaliseToMonthly(90, 'quarterly')).toBe(30);
        expect(normaliseToMonthly(10, 'weekly')).toBeCloseTo(43.33, 2);
    });

    test('an unknown cadence is counted at face value', () => {
        expect(normaliseToMonthly(25, 'unknown')).toBe(25);
    });

    test('an irregular run falls back to its observed spacing', () => {
        expect(normaliseToMonthly(20, 'irregular', 60)).toBeCloseTo(10.15, 2);
    });

    test('every result is a whole number of cents', () => {
        [['yearly', 99.99], ['weekly', 3.33], ['quarterly', 49.99]].forEach(([cadence, amount]) => {
            const monthly = normaliseToMonthly(amount, cadence);
            expect(Math.round(monthly * 100)).toBeCloseTo(monthly * 100, 6);
        });
    });
});

describe('detectSubscriptions', () => {
    test('groups charges by name and derives cadence and next charge', () => {
        const rows = detect([
            charge('OpenAI ChatGPT', '2026-03-11', 21.62),
            charge('OpenAI ChatGPT', '2026-04-10', 21.62),
            charge('OpenAI ChatGPT', '2026-05-11', 21.62),
        ]);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            key: 'openai chatgpt',
            name: 'OpenAI ChatGPT',
            cadence: 'monthly',
            charges: 3,
            confidence: 'high',
            amountVaries: false,
            status: 'active',
        });
        expect(rows[0].monthlyCost).toBeCloseTo(21.62, 2);
        expect(rows[0].nextExpected.toISOString().slice(0, 7)).toBe('2026-06');
    });

    test('picks up both data shapes in one pass', () => {
        const rows = detect([
            charge('Spotify', '2026-04-01', 11.99, { type: 'subscription', category: 'Streaming' }),
            charge('Spotify', '2026-05-01', 11.99, { type: 'subscription', category: 'Streaming' }),
            // Pre-backfill shape.
            charge('Notion', '2026-04-02', 8, { type: 'expense', category: 'Software' }),
            charge('Notion', '2026-05-02', 8, { type: 'expense', category: 'Software' }),
        ]);

        expect(rows.map((r) => r.key).sort()).toEqual(['notion', 'spotify']);
    });

    test('an annual plan is normalised against monthly ones', () => {
        const rows = detect([
            charge('Domain Renewal', '2024-05-20', 120),
            charge('Domain Renewal', '2025-05-20', 120),
            charge('Domain Renewal', '2026-05-20', 120),
        ]);

        expect(rows[0].cadence).toBe('yearly');
        // Exactly a twelfth, so the annual figure the UI shows comes back to $120.
        expect(rows[0].monthlyCost).toBe(10);
        expect(monthlyTotal(rows) * 12).toBe(120);
        expect(rows[0].status).toBe('active');
    });

    test('a single charge reports unknown rather than assuming monthly', () => {
        const rows = detect([charge('Gym', '2026-05-12', 23, { category: 'Gym' })]);

        expect(rows[0]).toMatchObject({ cadence: 'unknown', confidence: 'low', charges: 1 });
        expect(rows[0].nextExpected).toBeNull();
        // Nothing is claimed about the period, so nothing is claimed about the cost.
        expect(rows[0].monthlyCost).toBeCloseTo(23, 2);
    });

    test('fewer than three charges is flagged low confidence', () => {
        const rows = detect([
            charge('Spotify', '2026-04-01', 11.99),
            charge('Spotify', '2026-05-01', 11.99),
        ]);

        expect(rows[0].cadence).toBe('monthly');
        expect(rows[0].confidence).toBe('low');
    });

    test('a changing price is flagged and reported at the latest amount', () => {
        const rows = detect([
            charge('Streaming Co', '2026-03-01', 9.99),
            charge('Streaming Co', '2026-04-01', 9.99),
            charge('Streaming Co', '2026-05-01', 12.99),
        ]);

        expect(rows[0].amountVaries).toBe(true);
        expect(rows[0].amount).toBe(12.99);
    });

    test('two charges on one day are a double entry, not a cycle', () => {
        // The real Google Play case: one imported, one entered by hand.
        const rows = detect([
            charge('Google Play', '2026-05-15', 25),
            charge('Google Play', '2026-05-15', 23),
        ]);

        expect(rows[0].charges).toBe(2);
        expect(rows[0].cadence).toBe('unknown');
        expect(rows[0].amountVaries).toBe(true);
    });

    test('missing two whole cycles marks it lapsed', () => {
        const rows = detect([
            charge('Forgotten Box', '2025-11-01', 30),
            charge('Forgotten Box', '2025-12-01', 30),
            charge('Forgotten Box', '2026-01-01', 30),
        ]);

        expect(rows[0].status).toBe('lapsed');
    });

    test('a cancelled subscription is marked and stops counting', () => {
        const rows = detect([
            charge('Spotify', '2026-03-01', 11.99),
            charge('Spotify', '2026-04-01', 11.99),
            charge('Spotify', '2026-05-01', 11.99),
        ], { cancelledKeys: ['spotify'] });

        expect(rows[0].status).toBe('cancelled');
        expect(rows[0].monthlyCost).toBe(0);
        // Cancelling wins over lapse detection -- it is the more specific answer.
        expect(monthlyTotal(rows)).toBe(0);
    });

    test('orders by monthly cost, so the biggest commitment leads', () => {
        const rows = detect([
            charge('Cheap', '2026-04-01', 5), charge('Cheap', '2026-05-01', 5),
            charge('Pricey', '2026-04-01', 50), charge('Pricey', '2026-05-01', 50),
            charge('Middling', '2026-04-01', 20), charge('Middling', '2026-05-01', 20),
        ]);

        expect(rows.map((r) => r.name)).toEqual(['Pricey', 'Middling', 'Cheap']);
    });

    test('ignores everything that is not a subscription', () => {
        const rows = detect([
            { name: 'Rent', date: '2026-04-01T12:00:00.000Z', amount: 380, type: 'expense', category: 'Housing' },
            { name: 'Rent', date: '2026-05-01T12:00:00.000Z', amount: 380, type: 'expense', category: 'Housing' },
            { name: 'Payroll', date: '2026-05-01T12:00:00.000Z', amount: 1620, type: 'income', category: 'Salary' },
        ]);

        expect(rows).toEqual([]);
    });

    test('monthlyTotal counts only what is still running', () => {
        const rows = detect([
            charge('Active One', '2026-04-01', 10), charge('Active One', '2026-05-01', 10),
            charge('Old One', '2025-01-01', 99), charge('Old One', '2025-02-01', 99),
        ]);

        expect(byKey(rows, 'old one').status).toBe('lapsed');
        expect(monthlyTotal(rows)).toBeCloseTo(10, 2);
    });

    test('carries the individual charges, newest first', () => {
        const rows = detect([
            charge('OpenAI ChatGPT', '2026-03-11', 21.62),
            charge('OpenAI ChatGPT', '2026-05-11', 19.99),
            charge('OpenAI ChatGPT', '2026-04-10', 21.62),
        ]);

        expect(rows[0].history.map((h) => h.date.toISOString().slice(0, 10)))
            .toEqual(['2026-05-11', '2026-04-10', '2026-03-11']);
        // The head of the history is what `amount` and `lastCharged` describe.
        expect(rows[0].history[0].amount).toBe(19.99);
        expect(rows[0].amount).toBe(19.99);
        expect(rows[0].history).toHaveLength(rows[0].charges);
    });

    test('a single charge still has a one-entry history', () => {
        const rows = detect([charge('Gym', '2026-05-12', 23, { category: 'Gym' })]);

        expect(rows[0].history).toHaveLength(1);
        expect(rows[0].history[0]).toMatchObject({ amount: 23, category: 'Gym' });
    });

    test('no transactions yields an empty list, not a crash', () => {
        expect(detect([])).toEqual([]);
        expect(detectSubscriptions()).toEqual([]);
        expect(monthlyTotal()).toBe(0);
    });

    test('the monthly total is exact across awkward amounts', () => {
        const rows = detect([
            charge('A', '2026-04-01', 0.1), charge('A', '2026-05-01', 0.1),
            charge('B', '2026-04-02', 0.2), charge('B', '2026-05-02', 0.2),
        ]);

        // 0.1 + 0.2 is 0.30000000000000004 if summed as plain floats.
        expect(monthlyTotal(rows)).toBe(0.3);
    });
});
