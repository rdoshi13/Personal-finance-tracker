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
 * two equal payments in consecutive months each find their own debit.
 */
const MATCH_WINDOW_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const idOf = (row) => String(row._id);

/** Pure: returns [[cardRow, bankRow], ...]. Neither side is used twice. */
const pairCardPayments = (cardRows, bankRows, windowDays = MATCH_WINDOW_DAYS) => {
    const candidates = [];
    cardRows.forEach((card) => {
        bankRows.forEach((bank) => {
            if (toCents(card.amount) !== toCents(bank.amount)) return;
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
    }).select('amount date accountType').lean();

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

module.exports = { MATCH_WINDOW_DAYS, matchCardPayments, pairCardPayments };
