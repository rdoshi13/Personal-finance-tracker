// Minimal in-memory limiter. It is per-process, so on serverless it only throttles
// bursts that land on the same warm instance. Move to a shared store (Redis, Mongo)
// if this ever needs to hold across instances.

// Sweep expired keys once a store gets this big. A key is only pruned when it is
// hit again, so one that is never seen twice would otherwise sit there forever.
// Deliberately not a timer: an interval would keep a serverless instance alive.
const SWEEP_THRESHOLD = 5000;

const allStores = new Set();

const createRateLimiter = ({ windowMs, max }) => {
    // Each limiter gets its own store. With a single shared map, two limiters
    // handed the same key -- an IP address, say -- would eat each other's budget,
    // so a failed password reset could lock someone out of signing in.
    const buckets = new Map();
    allStores.add(buckets);

    const sweepExpired = (now) => {
        buckets.forEach((timestamps, key) => {
            if (timestamps.every((timestamp) => now - timestamp >= windowMs)) {
                buckets.delete(key);
            }
        });
    };

    const hit = (key) => {
        const now = Date.now();

        if (buckets.size >= SWEEP_THRESHOLD) {
            sweepExpired(now);
        }

        const timestamps = (buckets.get(key) || []).filter((timestamp) => now - timestamp < windowMs);

        if (timestamps.length >= max) {
            buckets.set(key, timestamps);
            return { allowed: false, retryAfterMs: windowMs - (now - timestamps[0]) };
        }

        timestamps.push(now);
        buckets.set(key, timestamps);
        return { allowed: true, retryAfterMs: 0 };
    };

    return { hit, size: () => buckets.size };
};

const resetRateLimits = () => {
    allStores.forEach((store) => store.clear());
};

module.exports = {
    SWEEP_THRESHOLD,
    createRateLimiter,
    resetRateLimits,
};
