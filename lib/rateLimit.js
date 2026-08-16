// Minimal in-memory limiter. It is per-process, so on serverless it only throttles
// bursts that land on the same warm instance. Move to a shared store (Redis, Mongo)
// if this ever needs to hold across instances.
const buckets = new Map();

const createRateLimiter = ({ windowMs, max }) => {
    const hit = (key) => {
        const now = Date.now();
        const timestamps = (buckets.get(key) || []).filter((timestamp) => now - timestamp < windowMs);

        if (timestamps.length >= max) {
            buckets.set(key, timestamps);
            return { allowed: false, retryAfterMs: windowMs - (now - timestamps[0]) };
        }

        timestamps.push(now);
        buckets.set(key, timestamps);
        return { allowed: true, retryAfterMs: 0 };
    };

    return { hit };
};

const resetRateLimits = () => {
    buckets.clear();
};

module.exports = {
    createRateLimiter,
    resetRateLimits,
};
