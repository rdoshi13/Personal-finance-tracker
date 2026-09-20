import React from 'react';
import { isMonthScopedView, useAppState } from '../../state/AppStateContext';
import { money, periodLabel } from '../../lib/money';

const StatusBar = () => {
    const { totals, period, loading, view, transactions } = useAppState();
    const monthScoped = isMonthScopedView(view);

    return (
        <div className="bq-status">
            <span>
                <span className="bq-dot-ok" />
                {loading ? 'Loading…' : 'Up to date'}
            </span>
            {/* Achievements are all-time, so a month's count, period and net would
                all be describing something the view is not showing. */}
            <span>{monthScoped ? totals.count : transactions.length} transactions</span>
            <span>{monthScoped ? periodLabel(period) : 'All time'}</span>
            <span className="bq-grow" />
            {monthScoped && (
                <span>
                    net{' '}
                    <span className={totals.net >= 0 ? 'bq-pos' : 'bq-neg'}>
                        {totals.net >= 0 ? '+' : '−'}{money(totals.net)}
                    </span>
                </span>
            )}
        </div>
    );
};

export default StatusBar;
