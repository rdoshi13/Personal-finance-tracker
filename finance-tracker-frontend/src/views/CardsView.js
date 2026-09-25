import React, { useMemo } from 'react';
import { useAppState } from '../state/AppStateContext';
import useGrowIn from '../hooks/useGrowIn';
import { categoryBreakdown, isTransfer, money, sumMoney } from '../lib/money';
import { CategorySide } from './BreakdownView';
import { CardIcon, CheckIcon } from '../components/shell/icons';

const dateLabel = (value) =>
    value
        ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
        : '—';

const shortDate = (value) =>
    new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const yearOf = (value) => new Date(value).getUTCFullYear();

// money() drops the sign. A card balance below zero is a credit the issuer owes
// you, and must not read as a debt.
const balance = (value) => (Number(value) < 0 ? `${money(value)} credit` : money(value));

/**
 * One card: its latest statement's figures, then payments, spending and the
 * statement history. The balance and due date come from the statement snapshot,
 * never from summing rows -- history before the first imported statement is
 * missing, so a derived balance would be wrong.
 */
const CardSection = ({ statements, rows, grown }) => {
    const latest = statements[0];
    const year = yearOf(latest.closingDate);

    const interestThisYear = sumMoney(
        statements.filter((s) => yearOf(s.closingDate) === year).map((s) => s.interest)
    );
    // Clamped at 0 too: a statement can close in credit after an overpayment.
    const used = latest.creditLimit ? Math.min(Math.max(latest.newBalance / latest.creditLimit, 0), 1) : null;

    const payments = rows
        .filter(isTransfer)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    const unmatched = payments.filter((p) => !p.linkedTransactionId).length;
    const spending = categoryBreakdown(rows).outflow;

    return (
        <>
            <div className="bq-hero">
                <section className="bq-hcard">
                    <div className="bq-eyebrow">{latest.productName || 'Card'} · ••{latest.last4}</div>
                    <h1 className={`bq-hnum bq-num ${latest.newBalance < 0 ? 'bq-pos' : ''}`}>{balance(latest.newBalance)}</h1>
                    <p className="bq-hsub">
                        Balance on the statement that closed <b>{dateLabel(latest.closingDate)}</b>.
                        {latest.dueDate && (
                            <> Minimum <b>{money(latest.minimumPayment)}</b> due <b>{dateLabel(latest.dueDate)}</b>.</>
                        )}
                    </p>
                    {used !== null && (
                        <>
                            <div className="bq-ctr" aria-hidden="true">
                                <i style={{ width: grown ? `${used * 100}%` : '0%', background: 'var(--neg)' }} />
                            </div>
                            <div className="bq-pn" style={{ marginTop: 6 }}>
                                {Math.round(used * 100)}% of the {money(latest.creditLimit)} limit used
                            </div>
                        </>
                    )}
                </section>

                <section className="bq-hcard">
                    <div className="bq-eyebrow">What the card cost in {year}</div>
                    <div className="bq-io">
                        <div className="bq-ioc">
                            <div className="bq-iok">Interest paid</div>
                            <div className="bq-iov bq-num bq-neg">{money(interestThisYear)}</div>
                        </div>
                        <div className="bq-ioc">
                            <div className="bq-iok">Purchase APR</div>
                            <div className="bq-iov bq-num">
                                {latest.purchaseApr !== null && latest.purchaseApr !== undefined ? `${latest.purchaseApr}%` : '—'}
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <div className="bq-g2e">
                <section className="bq-panel">
                    <div className="bq-ph">
                        <span className="bq-pt">Payments</span>
                        <span className="bq-grow" />
                        <span className="bq-pn">
                            {unmatched ? `${unmatched} without a checking debit` : 'all paid from checking'}
                        </span>
                    </div>
                    <div className="bq-pb">
                        {payments.length ? payments.map((p) => (
                            <div className="bq-subhr" key={p._id || p.id}>
                                <span>{dateLabel(p.date)}</span>
                                <span className="bq-grow" />
                                {p.linkedTransactionId ? (
                                    <span className="bq-subhg" title="Matched to the debit in your checking account">
                                        <CheckIcon size={11} /> paid from checking
                                    </span>
                                ) : (
                                    <span className="bq-over" title="No checking debit of this amount within 5 days">
                                        no matching checking debit
                                    </span>
                                )}
                                <span className="bq-num bq-xfer">{money(p.amount)}</span>
                            </div>
                        )) : (
                            <p style={{ color: 'var(--ink-3)', margin: 0 }}>No payments on the imported statements.</p>
                        )}
                    </div>
                </section>

                <CategorySide
                    title="Spent on the card"
                    note="every imported statement, largest first"
                    rows={spending}
                    total={sumMoney(spending.map((r) => r.total))}
                    tone="bq-neg"
                    grown={grown}
                    emptyText="No purchases on the imported statements."
                />
            </div>

            <section className="bq-panel" style={{ marginBottom: 14 }}>
                <div className="bq-ph">
                    <span className="bq-pt">Statements</span>
                    <span className="bq-grow" />
                    <span className="bq-pn">{statements.length} imported</span>
                </div>
                <table className="bq-table">
                    <thead>
                        <tr>
                            <th scope="col">Period</th>
                            <th scope="col" className="r">Purchases</th>
                            <th scope="col" className="r">Interest</th>
                            <th scope="col" className="r">Payments</th>
                            <th scope="col" className="r">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {statements.map((s) => (
                            <tr key={s._id || s.closingDate}>
                                <td className="bq-num">{shortDate(s.openingDate)} – {dateLabel(s.closingDate)}</td>
                                <td className="bq-tamt bq-num">{money(s.purchases)}</td>
                                <td className={`bq-tamt bq-num ${s.interest > 0 ? 'bq-neg' : ''}`}>{money(s.interest)}</td>
                                <td className="bq-tamt bq-num bq-xfer">{money(Math.abs(s.payments))}</td>
                                <td className="bq-tamt bq-num">{balance(s.newBalance)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </>
    );
};

const CardsView = ({ onImport }) => {
    const { cardStatements, transactions } = useAppState();
    const grown = useGrowIn('cards');

    // One entry per card, newest statement first, with that card's rows.
    const cards = useMemo(() => {
        const byAccount = new Map();
        (cardStatements || []).forEach((statement) => {
            if (!byAccount.has(statement.sourceAccount)) byAccount.set(statement.sourceAccount, []);
            byAccount.get(statement.sourceAccount).push(statement);
        });
        return [...byAccount.entries()].map(([account, statements]) => ({
            account,
            statements: [...statements].sort((a, b) => new Date(b.closingDate) - new Date(a.closingDate)),
            rows: transactions.filter((t) => t.accountType === 'credit_card' && t.sourceAccount === account),
        }));
    }, [cardStatements, transactions]);

    if (cardStatements === null) {
        return (
            <div className="bq-empty">
                <CardIcon size={30} strokeWidth="1.6" style={{ color: 'var(--ink-3)' }} />
                <h3>Card statements could not be loaded</h3>
                <p>Your transactions are fine. Reload the page to try again.</p>
            </div>
        );
    }

    if (!cards.length) {
        return (
            <div className="bq-empty">
                <CardIcon size={30} strokeWidth="1.6" style={{ color: 'var(--ink-3)' }} />
                <h3>No card statements yet</h3>
                <p>
                    Import a Chase credit card statement PDF. Purchases count as spending, and each
                    payment is matched to the checking debit that paid it, so nothing is counted twice.
                </p>
                <div className="bq-empty-actions">
                    <button type="button" className="bq-btn bq-btn-g" onClick={onImport}>Import a statement</button>
                </div>
            </div>
        );
    }

    return cards.map((card) => (
        <CardSection key={card.account} statements={card.statements} rows={card.rows} grown={grown} />
    ));
};

export default CardsView;
