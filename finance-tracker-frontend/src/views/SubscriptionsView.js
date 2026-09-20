import React, { useMemo, useState } from 'react';
import { useAppState } from '../state/AppStateContext';
import { categoryColor } from '../lib/categoryColor';
import { money } from '../lib/money';
import { RepeatIcon } from '../components/shell/icons';

const CADENCE_LABEL = {
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Annual',
    irregular: 'Irregular',
    unknown: 'Unknown',
};

const dateLabel = (date) =>
    date ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

const Row = ({ subscription, onToggleCancelled, busy }) => {
    const { key, name, category, amount, amountVaries, cadence, confidence,
        monthlyCost, charges, lastCharged, nextExpected, status } = subscription;
    const cancelled = status === 'cancelled';

    return (
        <div className={`bq-sub ${cancelled ? 'off' : ''}`}>
            <span className="bq-cn">
                <span className="bq-cdot" style={{ background: categoryColor(category) }} />
                <span className="bq-subn">{name}</span>
                <span className="bq-tag">{CADENCE_LABEL[cadence]}</span>
                {confidence === 'low' && cadence !== 'unknown' && (
                    <span className="bq-share" title={`Inferred from ${charges} charges`}>estimated</span>
                )}
            </span>

            <span className="bq-cv bq-num">
                {amountVaries ? '~' : ''}{money(amount)}
                {cadence !== 'monthly' && cadence !== 'unknown' && !cancelled && (
                    <span className="bq-cbud">{money(monthlyCost)}/mo</span>
                )}
            </span>

            <span className="bq-submeta">
                <span>{charges} {charges === 1 ? 'charge' : 'charges'} · last {dateLabel(lastCharged)}</span>
                <span className="bq-grow" />
                {!cancelled && nextExpected && <span>next ~{dateLabel(nextExpected)}</span>}
                <button
                    type="button"
                    className="bq-btn bq-btn-sm"
                    disabled={busy}
                    onClick={() => onToggleCancelled(key, !cancelled)}
                >
                    {cancelled ? 'Restore' : 'Mark cancelled'}
                </button>
            </span>
        </div>
    );
};

const Group = ({ title, note, rows, onToggleCancelled, busyKey }) => (
    <section className="bq-panel">
        <div className="bq-ph">
            <span className="bq-pt">{title}</span>
            <span className="bq-grow" />
            <span className="bq-pn">{note}</span>
        </div>
        <div className="bq-pb">
            {rows.map((s) => (
                <Row
                    key={s.key}
                    subscription={s}
                    onToggleCancelled={onToggleCancelled}
                    busy={busyKey === s.key}
                />
            ))}
        </div>
    </section>
);

const SubscriptionsView = ({ onAdd }) => {
    const { subscriptions, subscriptionMonthlyTotal, setSubscriptionCancelled } = useAppState();
    const [busyKey, setBusyKey] = useState(null);

    const { active, lapsed, cancelled } = useMemo(() => ({
        active: subscriptions.filter((s) => s.status === 'active'),
        lapsed: subscriptions.filter((s) => s.status === 'lapsed'),
        cancelled: subscriptions.filter((s) => s.status === 'cancelled'),
    }), [subscriptions]);

    const handleToggle = async (key, nextCancelled) => {
        setBusyKey(key);
        await setSubscriptionCancelled(key, nextCancelled);
        setBusyKey(null);
    };

    if (!subscriptions.length) {
        return (
            <div className="bq-empty">
                <RepeatIcon size={30} strokeWidth="1.6" style={{ color: 'var(--ink-3)' }} />
                <h3>No subscriptions yet</h3>
                <p>
                    Anything typed as a subscription, or filed under Streaming, Software, Cloud,
                    Gym or Membership, shows up here with what it costs and how often it bills.
                </p>
                <div className="bq-empty-actions">
                    <button type="button" className="bq-btn bq-btn-g" onClick={onAdd}>Add a transaction</button>
                </div>
            </div>
        );
    }

    return (
        <>
            <section className="bq-hcard" style={{ marginBottom: 14 }}>
                <div className="bq-eyebrow">Committed each month</div>
                <h1 className="bq-hnum bq-num bq-neg">{money(subscriptionMonthlyTotal)}</h1>
                <p className="bq-hsub">
                    {money(subscriptionMonthlyTotal * 12)} a year across{' '}
                    <b>{active.length}</b> active {active.length === 1 ? 'subscription' : 'subscriptions'}.
                    {' '}Weekly and annual plans are converted to a monthly figure so they compare honestly.
                </p>
            </section>

            {active.length > 0 && (
                <Group
                    title="Active"
                    note="largest commitment first"
                    rows={active}
                    onToggleCancelled={handleToggle}
                    busyKey={busyKey}
                />
            )}

            {lapsed.length > 0 && (
                <Group
                    title="Nothing recent"
                    note="no charge for two expected cycles"
                    rows={lapsed}
                    onToggleCancelled={handleToggle}
                    busyKey={busyKey}
                />
            )}

            {cancelled.length > 0 && (
                <Group
                    title="Cancelled"
                    note="not counted in the monthly total"
                    rows={cancelled}
                    onToggleCancelled={handleToggle}
                    busyKey={busyKey}
                />
            )}
        </>
    );
};

export default SubscriptionsView;
