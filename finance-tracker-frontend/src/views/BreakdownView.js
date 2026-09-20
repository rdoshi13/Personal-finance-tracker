import React, { useMemo } from 'react';
import { useAppState } from '../state/AppStateContext';
import useGrowIn from '../hooks/useGrowIn';
import { categoryColor } from '../lib/categoryColor';
import { categoryBreakdown, money, periodLabel } from '../lib/money';
import { CalendarIcon } from '../components/shell/icons';

const percent = (share) => `${(share * 100).toFixed(1)}%`;

/**
 * Bars are sized against the largest row on their own side, so the biggest
 * category always fills the track. The exact proportion is carried by the share
 * pill instead, which stays readable when one category dwarfs the rest.
 */
const Side = ({ title, note, rows, total, tone, grown, emptyText }) => (
    <section className="bq-panel">
        <div className="bq-ph">
            <span className="bq-pt">{title}</span>
            <span className="bq-grow" />
            <span className={`bq-pt bq-num ${tone}`}>{money(total)}</span>
        </div>
        <div className="bq-pb">
            {rows.length ? (
                <>
                    <div className="bq-pn" style={{ marginBottom: 4 }}>{note}</div>
                    {rows.map((row, index) => (
                        <div className="bq-cat" key={row.category}>
                            <span className="bq-cn">
                                <span className="bq-cdot" style={{ background: categoryColor(row.category) }} />
                                {row.category}
                                <span className="bq-share">{percent(row.share)}</span>
                            </span>
                            <span className="bq-cv bq-num">
                                {money(row.total)}
                                <span className="bq-cbud">
                                    {row.count} {row.count === 1 ? 'txn' : 'txns'}
                                </span>
                            </span>
                            <span className="bq-ctr">
                                <i
                                    style={{
                                        width: grown ? `${(row.total / rows[0].total) * 100}%` : '0%',
                                        background: categoryColor(row.category),
                                        transitionDelay: `${Math.min(index, 8) * 40}ms`,
                                    }}
                                />
                            </span>
                        </div>
                    ))}
                </>
            ) : (
                <p style={{ color: 'var(--ink-3)', margin: 0 }}>{emptyText}</p>
            )}
        </div>
    </section>
);

const BreakdownView = ({ onAdd }) => {
    const { monthTransactions, period, goToPeriod, latestPeriodWithData } = useAppState();
    const grown = useGrowIn(period);

    const { income, outflow } = useMemo(
        () => categoryBreakdown(monthTransactions),
        [monthTransactions]
    );

    const totalIn = useMemo(() => income.reduce((acc, r) => acc + r.total, 0), [income]);
    const totalOut = useMemo(() => outflow.reduce((acc, r) => acc + r.total, 0), [outflow]);

    if (!monthTransactions.length) {
        return (
            <div className="bq-empty">
                <CalendarIcon size={30} strokeWidth="1.6" style={{ color: 'var(--ink-3)' }} />
                <h3>Nothing to break down in {periodLabel(period)}</h3>
                <p>
                    {latestPeriodWithData
                        ? `Your most recent activity was ${periodLabel(latestPeriodWithData)}.`
                        : 'Add a transaction or import a statement to see where your money goes.'}
                </p>
                <div className="bq-empty-actions">
                    {latestPeriodWithData && latestPeriodWithData !== period && (
                        <button type="button" className="bq-btn bq-btn-g" onClick={() => goToPeriod(latestPeriodWithData)}>
                            Go to {periodLabel(latestPeriodWithData)}
                        </button>
                    )}
                    <button type="button" className="bq-btn" onClick={onAdd}>Add a transaction</button>
                </div>
            </div>
        );
    }

    return (
        <div className="bq-g2e">
            <Side
                title="Money in"
                note={`${income.length} ${income.length === 1 ? 'category' : 'categories'} · share of income`}
                rows={income}
                total={totalIn}
                tone="bq-pos"
                grown={grown}
                emptyText={`Nothing came in during ${periodLabel(period)}.`}
            />
            <Side
                title="Money out"
                note={`${outflow.length} ${outflow.length === 1 ? 'category' : 'categories'} · share of outflow`}
                rows={outflow}
                total={totalOut}
                tone="bq-neg"
                grown={grown}
                emptyText={`Nothing went out during ${periodLabel(period)}.`}
            />
        </div>
    );
};

export default BreakdownView;
