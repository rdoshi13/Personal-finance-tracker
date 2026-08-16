import { useEffect, useState } from 'react';
import { prefersReducedMotion } from './useCountUp';

/**
 * Flips false → true one frame after mount (or after `key` changes).
 *
 * Bars render at zero size on the first paint and transition to their real size on the
 * second, which is what makes CSS width/height transitions actually run — setting the
 * final size during the initial render gives the browser nothing to animate from.
 */
const useGrowIn = (key) => {
    const skip = () =>
        prefersReducedMotion() ||
        (typeof document !== 'undefined' && document.visibilityState === 'hidden');

    const [grown, setGrown] = useState(skip);

    useEffect(() => {
        if (skip()) {
            setGrown(true);
            return undefined;
        }

        setGrown(false);

        // requestAnimationFrame is suspended in hidden documents; the timeout guarantees
        // the bars reach full size even if the frames never arrive.
        const frame = requestAnimationFrame(() => {
            // A second frame guarantees the zero state was committed before the change.
            requestAnimationFrame(() => setGrown(true));
        });
        const fallback = setTimeout(() => setGrown(true), 400);

        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(fallback);
        };
    }, [key]);

    return grown;
};

export default useGrowIn;
