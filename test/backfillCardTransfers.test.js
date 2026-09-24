const test = require('node:test');
const assert = require('node:assert/strict');
const { planRow } = require('../scripts/backfillCardTransfers');
const { buildImportHash } = require('../lib/transactionImport');

const importedRow = (overrides = {}) => {
    const row = {
        date: new Date('2026-07-20T12:00:00Z'),
        amount: 500,
        name: '07/20 Payment To Chase Card Ending IN 1301',
        description: '07/20 Payment To Chase Card Ending IN 1301',
        sourceAccount: 'Chase 9550',
        type: 'expense',
        category: 'Misc',
        ...overrides,
    };
    // What the importer stored: the hash of the fields as they were at import time.
    row.importHash = overrides.importHash ?? buildImportHash(row);
    return row;
};

test('a manual payment is retyped, renamed, and rehashed to match a fresh import', () => {
    const row = importedRow();
    const { update, note } = planRow(row);

    assert.equal(update.type, 'transfer');
    assert.equal(update.category, 'Credit Card Payment');
    assert.equal(update.name, 'Chase Card Payment');
    // Exactly the hash re-importing the same statement line would now produce, so
    // the dedupe check still recognises it.
    assert.equal(update.importHash, buildImportHash({ ...row, name: 'Chase Card Payment' }));
    assert.notEqual(update.importHash, row.importHash);
    assert.equal(note, 'hash recomputed');
});

test('a row edited since import keeps its hash and is reported', () => {
    const row = importedRow({ importHash: 'not-what-the-fields-produce' });
    const { update, note } = planRow(row);

    assert.equal(update.name, 'Chase Card Payment');
    assert.equal(update.importHash, undefined);
    assert.match(note, /hash left alone/);
});

test('an autopay row keeps its name and hash, only its type changes', () => {
    const row = importedRow({
        name: 'Chase Credit Card Autopay',
        description: 'Chase Credit Crd Autopay PPD ID: 4760039224',
        category: 'Credit Card Payment',
        amount: 40,
    });
    const { update, note } = planRow(row);

    assert.deepEqual(update, { type: 'transfer', category: 'Credit Card Payment', name: 'Chase Credit Card Autopay' });
    assert.equal(note, '');
});

test('a hand-entered card payment without a hash is retyped and nothing else', () => {
    const { update, note } = planRow({
        date: new Date('2026-07-20'), amount: 25, name: 'Paid card', description: '',
        type: 'expense', category: 'Credit Card Payment',
    });

    assert.deepEqual(update, { type: 'transfer', category: 'Credit Card Payment', name: 'Paid card' });
    assert.equal(note, '');
});
