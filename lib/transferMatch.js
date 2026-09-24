const Transaction = require('../models/Transaction');
const { toCents } = require('./money');

/**
 * Pairs each credit card payment as the card saw it ("Payment Thank You") with the
 * checking debit that funded it ("Payment To Chase Card Ending IN 1301"). Both are
 * already transfers, so pairing changes no total -- it lets the Cards view say
 * "paid from checking", and flags a payment with nothing on the other side.
 *
 * A pair needs the same amount to the cent and dates within MATCH_WINDOW_DAYS; the
 * two sides post a day or three apart. Candidates are taken closest-date first, so
 * two equal payments in consecutive months each find their own debit. A debit that
 * names its card ("Payment To Chase Card Ending IN 1301") only pairs with that
 * card; an autopay line names none, so amount and date have to do.
 */
const MATCH_WINDOW_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const idOf = (row) => String(row._id);

/** The card a row belongs to or names, as its last four digits, or null. */
const cardLast4 = (row) => {
    const own = String(row.sourceAccount || '').match(/(\d{4})$/);
    if (row.accountType === 'credit_card') return own ? own[1] : null;
    const named = String(row.description || '').match(/Card Ending IN (\d{4})/i);
    return named ? named[1] : null;
};

/** Pure: returns [[cardRow, bankRow], ...]. Neither side is used twice. */
const pairCardPayments = (cardRows, bankRows, windowDays = MATCH_WINDOW_DAYS) => {
    const candidates = [];
    cardRows.forEach((card) => {
        bankRows.forEach((bank) => {
            if (toCents(card.amount) !== toCents(bank.amount)) return;
            const named = cardLast4(bank);
            if (named && named !== cardLast4(card)) return;
            const gap = Math.abs(new Date(card.date) - new Date(bank.date)) / DAY_MS;
            if (gap <= windowDays) candidates.push({ card, bank, gap });
        });
    });

    // Closest first; ties broken by date then id so the result does not depend on
    // the order rows came back from the database.
    candidates.sort((a, b) =>
        a.gap - b.gap ||
        new Date(a.card.date) - new Date(b.card.date) ||
        idOf(a.card).localeCompare(idOf(b.card)) ||
        idOf(a.bank).localeCompare(idOf(b.bank)));

    const usedCards = new Set();
    const usedBanks = new Set();
    const pairs = [];
    candidates.forEach(({ card, bank }) => {
        if (usedCards.has(idOf(card)) || usedBanks.has(idOf(bank))) return;
        usedCards.add(idOf(card));
        usedBanks.add(idOf(bank));
        pairs.push([card, bank]);
    });
    return pairs;
};

/** Links every unlinked card payment the user has that finds a partner. */
const matchCardPayments = async (userId) => {
    const unlinked = await Transaction.find({
        userId,
        type: 'transfer',
        category: 'Credit Card Payment',
        linkedTransactionId: { $exists: false },
    }).select('amount date accountType sourceAccount description').lean();

    const cardRows = unlinked.filter((row) => row.accountType === 'credit_card');
    const bankRows = unlinked.filter((row) => row.accountType !== 'credit_card');
    const pairs = pairCardPayments(cardRows, bankRows);
    if (!pairs.length) return 0;

    // One pair at a time, each half conditional on still being unlinked. If a
    // concurrent import got to the bank row first, the card half is rolled back, so
    // a link is always two-sided.
    let linked = 0;
    for (const [card, bank] of pairs) {
        const unlinkedFilter = { userId, linkedTransactionId: { $exists: false } };
        const first = await Transaction.updateOne(
            { ...unlinkedFilter, _id: card._id },
            { $set: { linkedTransactionId: bank._id } }
        );
        if (!first.modifiedCount) continue;

        const second = await Transaction.updateOne(
            { ...unlinkedFilter, _id: bank._id },
            { $set: { linkedTransactionId: card._id } }
        );
        if (second.modifiedCount) {
            linked += 1;
        } else {
            await Transaction.updateOne(
                { _id: card._id, userId, linkedTransactionId: bank._id },
                { $unset: { linkedTransactionId: 1 } }
            );
        }
    }
    return linked;
};

const PAIR_FIELDS = 'type category amount date accountType sourceAccount description linkedTransactionId';

/**
 * After a row is edited: if it was paired and the pair no longer holds -- an
 * amount corrected, a date moved, retyped away from transfer -- both halves are
 * unlinked. Then the matcher runs, so the edited row, or the partner it left, can
 * find its real counterpart. A pair holds exactly when pairCardPayments would
 * still make it. Returns true if a link was broken.
 */
const recheckLinkAfterEdit = async (userId, transactionId) => {
    const row = await Transaction.findOne({ _id: transactionId, userId }).select(PAIR_FIELDS).lean();
    if (!row) return false;

    let broken = false;
    if (row.linkedTransactionId) {
        const partner = await Transaction.findOne({ _id: row.linkedTransactionId, userId }).select(PAIR_FIELDS).lean();
        const halves = [row, partner].filter(Boolean);
        const isPayment = (t) => t.type === 'transfer' && t.category === 'Credit Card Payment';
        const card = halves.find((t) => t.accountType === 'credit_card');
        const bank = halves.find((t) => t.accountType !== 'credit_card');
        const holds = Boolean(card && bank && isPayment(card) && isPayment(bank) &&
            pairCardPayments([card], [bank]).length === 1);

        if (!holds) {
            await Transaction.updateMany(
                { userId, _id: { $in: [row._id, row.linkedTransactionId] } },
                { $unset: { linkedTransactionId: 1 } }
            );
            broken = true;
        }
    }

    if (broken || row.type === 'transfer') await matchCardPayments(userId);
    return broken;
};

module.exports = { MATCH_WINDOW_DAYS, matchCardPayments, pairCardPayments, recheckLinkAfterEdit };
