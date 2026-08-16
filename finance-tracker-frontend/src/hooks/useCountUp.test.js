import { renderHook, act, waitFor } from '@testing-library/react';
import useCountUp from './useCountUp';

const setReducedMotion = (reduce) => {
    window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: reduce && query === '(prefers-reduced-motion: reduce)',
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    }));
};

const setVisibility = (state) => {
    Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => state,
    });
};

describe('useCountUp', () => {
    beforeEach(() => { setVisibility('visible'); });
    afterEach(() => { jest.restoreAllMocks(); setVisibility('visible'); });

    test('returns the target immediately when reduced motion is requested', () => {
        setReducedMotion(true);
        const { result } = renderHook(() => useCountUp(1363.58));
        expect(result.current).toBe(1363.58);
    });

    test('starts below the target and animates up to it', async () => {
        setReducedMotion(false);
        const { result } = renderHook(() => useCountUp(1000, { duration: 60 }));

        expect(result.current).toBeLessThan(1000);
        await waitFor(() => expect(result.current).toBe(1000), { timeout: 2000 });
    });

    test('counts from the previous value rather than resetting to zero', async () => {
        setReducedMotion(false);
        const { result, rerender } = renderHook(({ target }) => useCountUp(target, { duration: 60 }), {
            initialProps: { target: 1000 },
        });

        await waitFor(() => expect(result.current).toBe(1000), { timeout: 2000 });

        act(() => { rerender({ target: 1200 }); });
        // Mid-transition it should be moving between the two months' figures, never near zero.
        expect(result.current).toBeGreaterThan(900);

        await waitFor(() => expect(result.current).toBe(1200), { timeout: 2000 });
    });

    test('skips the animation in a hidden document instead of freezing at zero', () => {
        // requestAnimationFrame never fires while the tab is hidden, so animating there
        // would strand the figure at its start value even after the tab came forward.
        setReducedMotion(false);
        setVisibility('hidden');

        const { result } = renderHook(() => useCountUp(2445.02, { duration: 900 }));
        expect(result.current).toBe(2445.02);
    });

    test('falls back to the real value if frames never arrive', async () => {
        setReducedMotion(false);
        const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

        const { result } = renderHook(() => useCountUp(750, { duration: 30 }));
        expect(result.current).toBe(0);

        await waitFor(() => expect(result.current).toBe(750), { timeout: 3000 });
        raf.mockRestore();
    });

    test('honours enabled: false by jumping straight to the target', () => {
        setReducedMotion(false);
        const { result } = renderHook(() => useCountUp(500, { enabled: false }));
        expect(result.current).toBe(500);
    });

    test('treats non-numeric targets as zero', () => {
        setReducedMotion(true);
        const { result } = renderHook(() => useCountUp(undefined));
        expect(result.current).toBe(0);
    });
});
