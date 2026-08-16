import React, { useMemo, useState } from 'react';
import { useAppState } from '../state/AppStateContext';
import useCountUp from '../hooks/useCountUp';
import useGrowIn from '../hooks/useGrowIn';
import { categoryColor } from '../lib/categoryColor';
import { initialsOf, money, periodLabel, spendByCategory } from '../lib/money';
import QuestCard from '../components/game/QuestCard';
import { CalendarIcon, StarIcon } from '../components/shell/icons';

const Delta = ({ now, before, invert }) => {
    if (!before) return null;
    const change = ((now - before) / before) * 100;
    if (!Number.isFinite(change)) return null;
    const rising = change >= 0;
    const good = invert ? !rising : rising;
    return (
        <span className={`bq-chip ${good ? 'up' : 'down'}`}>
            {rising ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
        </span>
    );
};

const DashboardView = ({ onAdd }) => {
    const {
        monthTransactions, totals, previousTotals, period, budgets, quests,
        claim, setView, goToPeriod, latestPeriodWithData, summary,
    } = useAppState();

    const [claimingId, setClaimingId] = useState(null);

    // Count from the previous month's net rather than zero, so switching months reads
    // as the figure moving to a new value instead of resetting to nothing.
    const animatedNet = useCountUp(totals.net, { duration: 900 });
    const grown = useGrowIn(period);

    const spend = useMemo(() => spendByCategory(monthTransactions), [monthTransactions]);
    const sortedSpend = useMemo(
        () => Object.entries(spend).sort((a, b) => b[1] - a[1]),
        [spend]
    );

    const monthsWithData = useMemo(
        () => summary.filter((m) => m.count > 0).slice(-6),
        [summary]
    );
    const chartMax = useMemo(
        () => Math.max(1, ...monthsWithData.map((m) => Math.abs(m.net))),
        [monthsWithData]
    );

    const dayGroups = useMemo(() => {
        const byDay = {};
        [...monthTransactions]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 8)
            .forEach((t) => {
                const key = new Date(t.date).toISOString().slice(0, 10);
                (byDay[key] = byDay[key] || []).push(t);
            });
        return Object.entries(byDay);
    }, [monthTransactions]);

    const handleClaim = async (questId) => {
        setClaimingId(questId);
        await claim(questId);
        setClaimingId(null);
    };

    if (!monthTransactions.length) {
        return (
            <div className="bq-empty">
                <CalendarIcon size={30} strokeWidth="1.6" style={{ color: 'var(--ink-3)' }} />
                <h3>Nothing recorded in {periodLabel(period)}</h3>
                <p>
                    {latestPeriodWithData
                        ? `Your most recent activity was ${periodLabel(latestPeriodWithData)}. Jump back to it, or log something to start this month.`
                        : 'Add your first transaction, or import a statement to get going.'}
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

    const keptRate = totals.income ? (totals.net / totals.income) * 100 : 0;
    const biggest = sortedSpend[0];
    const biggestCount = biggest
        ? monthTransactions.filter((t) => (t.category || 'Uncategorized') === biggest[0] && t.type !== 'income').length
        : 0;

    return (
        <>
            <div className="bq-hero">
                <section className="bq-hcard">
                    <div className="bq-eyebrow">Net saved · {periodLabel(period)}</div>
                    <h1 className={`bq-hnum bq-num ${totals.net >= 0 ? 'bq-pos' : 'bq-neg'}`}>
                        {totals.net >= 0 ? '+' : '−'}{money(animatedNet)}
                    </h1>
                    <p className="bq-hsub">
                        You kept <b>{keptRate.toFixed(1)}%</b> of what came in.{' '}
                        {biggest && (
                            <>
                                <b>{biggest[0]}</b> led your spending at {money(biggest[1])} across {biggestCount}{' '}
                                {biggestCount === 1 ? 'transaction' : 'transactions'}
                                {totals.expense ? `, about ${Math.round((biggest[1] / totals.expense) * 100)}% of everything that went out` : ''}.
                            </>
                        )}
                    </p>
                    <div className="bq-io">
                        <div className="bq-ioc">
                            <div className="bq-iok">In</div>
                            <div className="bq-iov bq-num bq-pos">{money(totals.income)}</div>
                            <Delta now={totals.income} before={previousTotals.income} />
                        </div>
                        <div className="bq-ioc">
                            <div className="bq-iok">Out</div>
                            <div className="bq-iov bq-num bq-neg">{money(totals.expense)}</div>
                            <Delta now={totals.expense} before={previousTotals.expense} invert />
                        </div>
                        <div className="bq-ioc">
                            <div className="bq-iok">Logged</div>
                            <div className="bq-iov bq-num">{totals.count}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6 }}>transactions</div>
                        </div>
                    </div>
                </section>

                <section className="bq-hcard">
                    <div className="bq-qh">
                        <span className="bq-qt">
                            <StarIcon size={15} style={{ color: 'var(--gold)' }} />
                            Active quests
                        </span>
                        <button type="button" className="bq-btn bq-btn-sm" onClick={() => setView('quests')}>See all</button>
                    </div>
                    {quests.slice(0, 3).map((quest) => (
                        <QuestCard key={quest.id} quest={quest} onClaim={handleClaim} claiming={claimingId === quest.id} />
                    ))}
                    {!quests.length && <p style={{ color: 'var(--ink-3)', margin: 0 }}>Loading quests…</p>}
                </section>
            </div>

            <div className="bq-g2">
                <section className="bq-panel">
                    <div className="bq-ph">
                        <span className="bq-pt">Budget bars</span>
                        <span className="bq-grow" />
                        <span className="bq-pn">spend vs monthly cap</span>
                    </div>
                    <div className="bq-pb">
                        {sortedSpend.length ? sortedSpend.map(([category, value], index) => {
                            const cap = budgets[category] || 0;
                            const over = cap > 0 && value > cap;
                            const width = cap > 0
                                ? Math.min(100, (value / cap) * 100)
                                : (value / (sortedSpend[0][1] || 1)) * 100;
                            return (
                                <div className="bq-cat" key={category}>
                                    <span className="bq-cn">
                                        <span className="bq-cdot" style={{ background: categoryColor(category) }} />
                                        {category}
                                        {over && <span className="bq-over">OVER</span>}
                                    </span>
                                    <span className="bq-cv bq-num">
                                        {money(value)}
                                        <span className="bq-cbud">/ {cap > 0 ? money(cap) : 'no cap'}</span>
                                    </span>
                                    <span className="bq-ctr">
                                        <i
                                            style={{
                                                width: grown ? `${width}%` : '0%',
                                                background: over ? 'var(--neg)' : categoryColor(category),
                                                transitionDelay: `${Math.min(index, 8) * 40}ms`,
                                            }}
                                        />
                                    </span>
                                </div>
                            );
                        }) : <p style={{ color: 'var(--ink-3)', margin: 0 }}>No spending recorded this month.</p>}
                    </div>
                </section>

                <section className="bq-panel">
                    <div className="bq-ph">
                        <span className="bq-pt">Net by month</span>
                        <span className="bq-grow" />
                        <span className="bq-pn">last {monthsWithData.length}</span>
                    </div>
                    <div className="bq-pb">
                        <div className="bq-chart">
                            {monthsWithData.map((m, index) => {
                                const height = (Math.abs(m.net) / chartMax) * 100;
                                return (
                                    <div
                                        key={m.periodKey}
                                        className={`bq-cbar ${m.net < 0 ? 'neg' : ''} ${m.periodKey === period ? 'on' : ''}`}
                                    >
                                        <span className="bq-cbar-v">
                                            {m.net < 0 ? '−' : ''}${Math.round(Math.abs(m.net)).toLocaleString()}
                                        </span>
                                        <span
                                            className="bq-cbar-t"
                                            style={{
                                                height: grown ? `${height}%` : '0%',
                                                transitionDelay: `${index * 55}ms`,
                                            }}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <div className="bq-chart-foot">
                            {monthsWithData.map((m) => (
                                <span key={m.periodKey}>{periodLabel(m.periodKey).split(' ')[0]}</span>
                            ))}
                        </div>
                    </div>
                </section>
            </div>

            <section className="bq-panel">
                <div className="bq-ph">
                    <span className="bq-pt">Recent activity</span>
                    <span className="bq-grow" />
                    <button type="button" className="bq-btn bq-btn-sm" onClick={() => setView('transactions')}>
                        All {totals.count}
                    </button>
                </div>
                <div className="bq-pb" style={{ paddingTop: 2 }}>
                    {dayGroups.map(([day, items]) => {
                        const dayNet = items.reduce((acc, t) => acc + (t.type === 'income' ? Number(t.amount) : -Number(t.amount)), 0);
                        return (
                            <div key={day}>
                                <div className="bq-dayh">
                                    <span className="bq-dayd">
                                        {new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
                                            weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC',
                                        })}
                                    </span>
                                    <span className={`bq-dayt bq-num ${dayNet >= 0 ? 'bq-pos' : 'bq-neg'}`}>
                                        {dayNet >= 0 ? '+' : '−'}{money(dayNet)}
                                    </span>
                                </div>
                                {items.map((t) => (
                                    <div className="bq-tx" key={t._id || t.id}>
                                        <span className="bq-txi">{initialsOf(t.name)}</span>
                                        <span>
                                            <span className="bq-txn">{t.name}</span>
                                            <span className="bq-txc">
                                                <span className="bq-cdot" style={{ background: categoryColor(t.category) }} />
                                                {t.category || 'Uncategorized'}
                                            </span>
                                        </span>
                                        <span className={`bq-txa bq-num ${t.type === 'income' ? 'bq-pos' : 'bq-neg'}`}>
                                            {t.type === 'income' ? '+' : '−'}{money(t.amount)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            </section>
        </>
    );
};

export default DashboardView;
