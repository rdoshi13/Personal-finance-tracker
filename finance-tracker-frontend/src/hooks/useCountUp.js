import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Animates a number towards `target`.
 *
 * On first mount it counts up from zero. On later changes it counts from whatever was
 * last painted, so switching months reads as the figure moving to its new value rather
 * than dropping to zero and climbing again. Returns `target` immediately when the user
 * has asked for reduced motion.
 */
const useCountUp = (target, { duration = 900, enabled = true } = {}) => {
    const safeTarget = Number(target) || 0;

    // Resolved once, on the first render only — `useRef(fn())` would re-evaluate every
    // render, and seeding `from` with the target would skip the initial count-up.
    const startRef = useRef(null);
    if (startRef.current === null) {
        startRef.current = prefersReducedMotion() || !enabled ? safeTarget : 0;
    }

    const [value, setValue] = useState(startRef.current);
    const fromRef = useRef(startRef.current);
    const latestRef = useRef(startRef.current);
    const frameRef = useRef(null);

    useEffect(() => {
        const settle = () => {
            setValue(safeTarget);
            fromRef.current = safeTarget;
            latestRef.current = safeTarget;
        };

        // Browsers suspend requestAnimationFrame in a hidden document, so animating
        // there would leave the figure frozen at its start value — and it would stay
        // frozen after the tab came forward. Nobody is watching, so jump to the answer.
        const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';

        if (!enabled || prefersReducedMotion() || hidden) {
            settle();
            return undefined;
        }

        const from = fromRef.current;
        if (from === safeTarget) {
            setValue(safeTarget);
            return undefined;
        }

        const start = performance.now();
        const step = (now) => {
            const progress = Math.min(1, (now - start) / duration);
            const next = from + (safeTarget - from) * easeOutCubic(progress);
            latestRef.current = next;
            setValue(next);

            if (progress < 1) {
                frameRef.current = requestAnimationFrame(step);
            } else {
                fromRef.current = safeTarget;
                latestRef.current = safeTarget;
            }
        };

        frameRef.current = requestAnimationFrame(step);

        // Safety net for the throttled-but-visible case (background window, heavy tab):
        // if the frames never arrive, show the real number rather than a stale one.
        const fallback = setTimeout(settle, duration + 400);

        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            clearTimeout(fallback);
            // Resume from the last painted value so an interrupted count continues
            // smoothly instead of snapping backwards.
            fromRef.current = latestRef.current;
        };
    }, [safeTarget, duration, enabled]);

    return value;
};

export default useCountUp;
export { easeOutCubic, prefersReducedMotion };
