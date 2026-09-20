import { roundMoney, sumMoney } from './money';

const DAY_MS = 24 * 60 * 60 * 1000;
const AVG_MONTH_DAYS = 30.44;

// Mirrors SUBSCRIPTION_CATEGORIES in lib/transactionImport.js. The two codebases
// use different module systems, so the list cannot be shared.
const SUBSCRIPTION_CATEGORIES = ['Subscription', 'Streaming', 'Software', 'Cloud', 'Gym', 'Membership'];

// `days` drives cadence *detection* from the gaps between charges. `perYear` drives
// cost *normalisation*, and is a calendar count rather than a day ratio: an annual
// plan is exactly a twelfth per month, where 365.25/30.44 gives 12.0098 and turns
// $120 a year into $120.01.
const CADENCES = [
    { cadence: 'weekly', days: 7, perYear: 52 },
    { cadence: 'monthly', days: AVG_MONTH_DAYS, perYear: 12 },
    { cadence: 'quarterly', days: AVG_MONTH_DAYS * 3, perYear: 4 },
    { cadence: 'yearly', days: 365.25, perYear: 1 },
];

const PER_YEAR = CADENCES.reduce((acc, c) => ({ ...acc, [c.cadence]: c.perYear }), {});

const CADENCE_DAYS = CADENCES.reduce((acc, c) => ({ ...acc, [c.cadence]: c.days }), {});

// Above this, the gaps do not describe any regular cycle.
const IRREGULAR_THRESHOLD = 0.35;
// Each skipped cycle a period has to assume costs it this much, so a 60-day gap
// reads as a monthly charge with one miss rather than a clean two-month cycle.
const SKIP_PENALTY = 0.15;
// Two charges on the same day are a double entry, not a billing cycle.
const MIN_MEANINGFUL_GAP_DAYS = 2;

const categoryOf = (transaction) => (transaction?.category || '').trim();

/**
 * Classification, not recurrence: a subscription is something typed as one or
 * filed under a recurring-commitment category. Deciding membership by repetition
 * instead would pull in rent and card autopays, which recur just as reliably.
 */
const isSubscription = (transaction) =>
    transaction?.type === 'subscription' || SUBSCRIPTION_CATEGORIES.includes(categoryOf(transaction));

const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Scores each candidate period by how well the observed gaps fit whole multiples
 * of it, penalised by how many cycles it has to assume were skipped. Without that
 * penalty every gap fits `monthly` (a year is twelve of them) and nothing would
 * ever read as annual.
 */
const inferCadence = (gapsInDays) => {
    if (!gapsInDays.length) return { cadence: 'unknown', days: null };

    const scored = CADENCES.map(({ cadence, days }) => {
        let errorSum = 0;
        let skipSum = 0;

        gapsInDays.forEach((gap) => {
            const cycles = Math.max(1, Math.round(gap / days));
            errorSum += Math.abs(gap - cycles * days) / days;
            skipSum += cycles - 1;
        });

        const n = gapsInDays.length;
        return { cadence, days, score: errorSum / n + SKIP_PENALTY * (skipSum / n) };
    }).sort((a, b) => a.score - b.score);

    const best = scored[0];
    return best.score > IRREGULAR_THRESHOLD
        ? { cadence: 'irregular', days: median(gapsInDays) }
        : { cadence: best.cadence, days: best.days };
};

/**
 * What one charge works out to per month. Calendar-based for the known cadences;
 * an irregular run falls back to its observed day spacing, which is the only
 * thing available. An unknown cadence is counted at face value -- treating a
 * single charge as monthly is the conservative reading, and the UI labels it.
 */
const normaliseToMonthly = (amount, cadence, periodDays) => {
    const perYear = PER_YEAR[cadence];
    if (perYear) return roundMoney(amount * (perYear / 12));
    if (cadence === 'irregular' && periodDays) return roundMoney(amount * (AVG_MONTH_DAYS / periodDays));
    return roundMoney(amount);
};

/**
 * @param {Array}  transactions  every transaction, not just one month's
 * @param {Object} options
 * @param {Array}  options.cancelledKeys  keys the user has marked cancelled
 * @param {Date}   options.now            injectable for tests
 */
const detectSubscriptions = (transactions = [], options = {}) => {
    const cancelled = new Set(options.cancelledKeys || []);
    const now = options.now instanceof Date ? options.now : new Date();

    const groups = new Map();
    transactions.filter(isSubscription).forEach((transaction) => {
        const name = String(transaction.name || '').trim() || 'Unnamed';
        const key = name.toLowerCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({
            name,
            category: categoryOf(transaction) || 'Uncategorized',
            amount: Number(transaction.amount) || 0,
            date: new Date(transaction.date),
        });
    });

    const rows = [];

    groups.forEach((charges, key) => {
        charges.sort((a, b) => a.date - b.date);
        const latest = charges[charges.length - 1];
        const first = charges[0];

        const gaps = [];
        for (let i = 1; i < charges.length; i += 1) {
            const gap = (charges[i].date - charges[i - 1].date) / DAY_MS;
            if (gap >= MIN_MEANINGFUL_GAP_DAYS) gaps.push(gap);
        }

        const { cadence, days } = inferCadence(gaps);
        const periodDays = cadence === 'unknown' ? null : days;
        const amounts = charges.map((c) => c.amount);
        const amountVaries = new Set(amounts.map((a) => a.toFixed(2))).size > 1;

        const isCancelled = cancelled.has(key);
        // A subscription that has missed two whole cycles has probably stopped,
        // but only the user can say whether that was deliberate.
        const lapsed = !isCancelled
            && periodDays !== null
            && (now - latest.date) / DAY_MS > periodDays * 2;

        rows.push({
            // Newest first: the charge you are most likely asking about is the
            // last one, and it is what `amount` and `lastCharged` describe.
            history: [...charges].reverse().map((c) => ({
                date: c.date,
                amount: c.amount,
                category: c.category,
            })),
            key,
            name: latest.name,
            category: latest.category,
            amount: latest.amount,
            amountVaries,
            cadence,
            periodDays,
            confidence: charges.length >= 3 ? 'high' : 'low',
            monthlyCost: isCancelled ? 0 : normaliseToMonthly(latest.amount, cadence, periodDays),
            charges: charges.length,
            firstCharged: first.date,
            lastCharged: latest.date,
            nextExpected: periodDays === null
                ? null
                : new Date(latest.date.getTime() + periodDays * DAY_MS),
            status: isCancelled ? 'cancelled' : (lapsed ? 'lapsed' : 'active'),
        });
    });

    // Biggest commitment first; cancelled rows all normalise to 0 and sink.
    return rows.sort((a, b) => b.monthlyCost - a.monthlyCost || a.name.localeCompare(b.name));
};

/** Only active subscriptions count toward what you are committed to per month. */
const monthlyTotal = (subscriptions = []) =>
    sumMoney(subscriptions.filter((s) => s.status === 'active').map((s) => s.monthlyCost));

export {
    AVG_MONTH_DAYS,
    CADENCE_DAYS,
    PER_YEAR,
    SUBSCRIPTION_CATEGORIES,
    detectSubscriptions,
    inferCadence,
    isSubscription,
    monthlyTotal,
    normaliseToMonthly,
};
