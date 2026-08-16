import { NEUTRAL, PALETTE, categoryColor, categoryToken, hashString } from './categoryColor';

describe('categoryColor', () => {
    test('is deterministic for the same category', () => {
        expect(categoryToken('Groceries')).toBe(categoryToken('Groceries'));
        expect(categoryColor('Groceries')).toBe(categoryColor('Groceries'));
    });

    test('ignores case and surrounding whitespace', () => {
        expect(categoryToken('Groceries')).toBe(categoryToken('  groceries  '));
    });

    test('always resolves to a slot in the validated palette', () => {
        const samples = ['Groceries', 'Rent & utilities', 'Dining', 'Transport', 'Subscriptions', 'Shopping', 'Misc', 'Freelance'];
        samples.forEach((category) => {
            expect(PALETTE).toContain(categoryToken(category));
        });
    });

    test('sends Uncategorized and blanks to the neutral token', () => {
        expect(categoryToken('Uncategorized')).toBe(NEUTRAL);
        expect(categoryToken('')).toBe(NEUTRAL);
        expect(categoryToken(null)).toBe(NEUTRAL);
        expect(categoryToken(undefined)).toBe(NEUTRAL);
    });

    test('wraps the token in a css var()', () => {
        expect(categoryColor('Groceries')).toBe(`var(${categoryToken('Groceries')})`);
    });

    test('hash is stable and non-negative', () => {
        expect(hashString('abc')).toBe(hashString('abc'));
        expect(hashString('abc')).toBeGreaterThanOrEqual(0);
        expect(hashString('')).toBe(0);
    });

    test('spreads common categories across more than one hue', () => {
        const tokens = new Set(
            ['Groceries', 'Rent', 'Dining', 'Transport', 'Subscriptions', 'Shopping'].map(categoryToken)
        );
        expect(tokens.size).toBeGreaterThan(1);
    });
});
