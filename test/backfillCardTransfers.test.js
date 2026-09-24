const test = require('node:test');
const assert = require('node:assert/strict');
const { planRow, sourceOf } = require('../scripts/backfillCardTransfers');
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
        importBatchId: 'batch-1',
        ...overrides,
    };
    // What the importer stored: the hash of the fields as they were at import time.
    row.importHash = overrides.importHash ?? buildImportHash(row);
    return row;
};

test('a PDF-imported manual payment is renamed and rehashed to match a fresh import', () => {
    const row = importedRow();
    const { update, note } = planRow(row, 'pdf');

    assert.equal(update.type, 'transfer');
    assert.equal(update.category, 'Credit Card Payment');
    assert.equal(update.name, 'Chase Card Payment');
    // Exactly the hash re-importing the same statement line would now produce, so
    // the dedupe check still recognises it.
    assert.equal(update.importHash, buildImportHash({ ...row, name: 'Chase Card Payment' }));
    assert.notEqual(update.importHash, row.importHash);
    assert.equal(note, 'renamed, hash recomputed');
});

test('a CSV-imported payment keeps its raw name and hash, as a CSV re-import still produces them', () => {
    const row = importedRow({
        name: 'Payment To Chase Card Ending IN 1301',
        description: 'Payment To Chase Card Ending IN 1301',
    });
    const { update, note } = planRow(row, 'csv');

    assert.deepEqual(update, { type: 'transfer', category: 'Credit Card Payment', name: row.name });
    assert.equal(note, '');
});

test('an unknown import source keeps the name and says why', () => {
    const { update, note } = planRow(importedRow(), null);

    assert.equal(update.name, '07/20 Payment To Chase Card Ending IN 1301');
    assert.equal(update.importHash, undefined);
    assert.match(note, /import file unknown/);
});

test('a PDF row the user renamed keeps their name and its hash', () => {
    const row = importedRow();
    const edited = { ...row, name: 'Paid off July' };
    const { update, note } = planRow(edited, 'pdf');

    assert.equal(update.name, 'Paid off July');
    assert.equal(update.importHash, undefined);
    assert.equal(update.type, 'transfer');
    assert.match(note, /edited since import/);
});

test('an autopay row keeps its name and hash, only its type changes', () => {
    const row = importedRow({
        name: 'Chase Credit Card Autopay',
        description: 'Chase Credit Crd Autopay PPD ID: 4760039224',
        category: 'Credit Card Payment',
        amount: 40,
    });
    const { update, note } = planRow(row, 'pdf');

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

test('sourceOf reads the import file kind from its name', () => {
    assert.equal(sourceOf('20260817-statements-9550-.PDF'), 'pdf');
    assert.equal(sourceOf('export.csv'), 'csv');
    assert.equal(sourceOf(''), null);
    assert.equal(sourceOf(undefined), null);
});
