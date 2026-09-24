const test = require('node:test');
const assert = require('node:assert/strict');
const { pairCardPayments } = require('../lib/transferMatch');

const row = (id, amount, date) => ({ _id: id, amount, date: new Date(`${date}T12:00:00Z`) });
const ids = (pairs) => pairs.map(([card, bank]) => `${card._id}-${bank._id}`);

test('a card payment pairs with the checking debit of the same amount a few days away', () => {
    const pairs = pairCardPayments([row('c1', 40, '2026-05-04')], [row('b1', 40, '2026-05-05')]);
    assert.deepEqual(ids(pairs), ['c1-b1']);
});

test('amounts must match to the cent', () => {
    assert.deepEqual(pairCardPayments([row('c1', 40, '2026-05-04')], [row('b1', 40.01, '2026-05-04')]), []);
});

test('nothing pairs beyond the window', () => {
    assert.deepEqual(pairCardPayments([row('c1', 40, '2026-05-01')], [row('b1', 40, '2026-05-07')]), []);
    assert.deepEqual(ids(pairCardPayments([row('c1', 40, '2026-05-01')], [row('b1', 40, '2026-05-06')])), ['c1-b1']);
});

test('equal monthly payments each find their own debit, not the first one', () => {
    const cards = [row('may', 40, '2026-05-04'), row('jun', 40, '2026-06-04')];
    // Given in an order that would mispair a naive first-match loop.
    const banks = [row('bjun', 40, '2026-06-05'), row('bmay', 40, '2026-05-05')];

    assert.deepEqual(ids(pairCardPayments(cards, banks)).sort(), ['jun-bjun', 'may-bmay']);
});

test('the closest date wins when two debits could fit, and nothing is used twice', () => {
    const cards = [row('c1', 500, '2026-07-20'), row('c2', 500, '2026-07-22')];
    const banks = [row('b1', 500, '2026-07-21')];

    const pairs = pairCardPayments(cards, banks);
    assert.equal(pairs.length, 1);
    // Both are a day away; the tie goes to the earlier card payment.
    assert.deepEqual(ids(pairs), ['c1-b1']);
});
