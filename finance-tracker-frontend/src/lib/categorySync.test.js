const fs = require('fs');
const path = require('path');

const { SUBSCRIPTION_CATEGORIES } = require('./subscriptions');

/**
 * The same category vocabulary is declared in three places, and it cannot be
 * shared: the backend is CommonJS, the frontend is ESM, and they are separate
 * npm projects. Drift between them has already caused one real bug -- imported
 * transactions silently losing their category on edit (#6).
 *
 * So these read the other declarations as text and compare. Reading source is
 * ugly, but it is the only thing that actually fails when someone edits one list
 * and forgets the others.
 */
const repoRoot = path.resolve(__dirname, '../../..');
const readIfPresent = (relative) => {
    const file = path.join(repoRoot, relative);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

/** Pulls `NAME = ['a','b']` or `name: ['a','b']` out of a source file. */
const arrayLiteral = (source, name) => {
    const match = source.match(new RegExp(`${name}\\s*[=:]\\s*\\[([^\\]]*)\\]`));
    if (!match) return null;
    return match[1]
        .split(',')
        .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
};

const importer = readIfPresent('lib/transactionImport.js');
const addTransaction = readIfPresent('finance-tracker-frontend/src/AddTransaction.js');

describe('category vocabularies stay in sync', () => {
    test('the backend importer declares the same subscription categories', () => {
        if (!importer) return; // frontend-only checkout

        const backend = arrayLiteral(importer, 'SUBSCRIPTION_CATEGORIES');

        expect(backend).not.toBeNull();
        // If these drift, the importer types a row 'subscription' that the
        // Subscriptions view does not recognise, or the reverse.
        expect([...backend].sort()).toEqual([...SUBSCRIPTION_CATEGORIES].sort());
    });

    test('the add/edit form offers every subscription category', () => {
        if (!addTransaction) return;

        const options = arrayLiteral(addTransaction, 'subscription');

        expect(options).not.toBeNull();
        SUBSCRIPTION_CATEGORIES.forEach((category) => {
            // A category the detector recognises but the form cannot select is a
            // subscription you can never create by hand.
            expect(options).toContain(category);
        });
    });

    test('every category the importer can assign is selectable somewhere in the form', () => {
        if (!importer || !addTransaction) return;

        const assigned = [...importer.matchAll(/category:\s*'([^']+)'/g)].map((m) => m[1]);
        const offered = ['income', 'expense', 'subscription', 'transfer']
            .flatMap((type) => arrayLiteral(addTransaction, type) || []);

        // Not fatal when it fails -- AddTransaction preserves an unlisted category
        // rather than dropping it (#6) -- but it means the dropdown gains a
        // one-off entry, which is worth noticing deliberately.
        const missing = [...new Set(assigned)].filter((c) => !offered.includes(c));
        expect(missing).toEqual([]);
    });
});
