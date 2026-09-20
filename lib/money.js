const CENTS_PER_UNIT = 100;

/**
 * Money is stored as a 2dp decimal in a double, which is exact -- any realistic
 * 2dp value round-trips through a double unchanged. The error comes from
 * *arithmetic*: 0.1 + 0.2 is 0.30000000000000004, so a category sitting exactly
 * on its budget cap compares as over it. Summing in integer cents and converting
 * back at the end removes that, without needing to change how anything is stored.
 *
 * Mirrors the same helpers in finance-tracker-frontend/src/lib/money.js. The two
 * codebases use different module systems, so this cannot be shared.
 */
const toCents = (value) => Math.round((Number(value) || 0) * CENTS_PER_UNIT);

const fromCents = (cents) => cents / CENTS_PER_UNIT;

/** Exact sum of money values. Use instead of reduce((a, b) => a + b). */
const sumMoney = (values = []) => fromCents(values.reduce((acc, value) => acc + toCents(value), 0));

/** Snaps a computed money value to the nearest cent. */
const roundMoney = (value) => fromCents(toCents(value));

/**
 * Compares two money values at cent precision. `a` is over `b` only when it
 * exceeds it by at least one cent, so a cap met exactly is not a breach.
 */
const isOverBy = (a, b) => toCents(a) > toCents(b);

module.exports = {
    CENTS_PER_UNIT,
    fromCents,
    isOverBy,
    roundMoney,
    sumMoney,
    toCents,
};
