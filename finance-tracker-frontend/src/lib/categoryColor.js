// Categories are free text in the database, so there is no fixed palette to map onto.
// Hashing the name into a validated six-hue palette gives every existing category a
// stable colour on every device with no migration and no stored preference.
//
// The palette is the CVD-checked set: adjacent pairs stay separable under protanopia,
// deuteranopia and tritanopia, and each slot resolves per theme via CSS custom properties.
const PALETTE = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'];

const NEUTRAL = '--ink-3';
const UNCATEGORIZED = 'Uncategorized';

const hashString = (value) => {
    let hash = 0;
    const str = String(value);
    for (let i = 0; i < str.length; i += 1) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0; // force 32-bit
    }
    return Math.abs(hash);
};

/** Returns the CSS variable name for a category, e.g. '--s3'. */
const categoryToken = (category) => {
    const name = String(category || '').trim();
    if (!name || name === UNCATEGORIZED) return NEUTRAL;
    return PALETTE[hashString(name.toLowerCase()) % PALETTE.length];
};

/** Returns a ready-to-use CSS value, e.g. 'var(--s3)'. */
const categoryColor = (category) => `var(${categoryToken(category)})`;

export { NEUTRAL, PALETTE, UNCATEGORIZED, categoryColor, categoryToken, hashString };
