import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { money, periodLabel } from '../../lib/money';

const StatusBar = () => {
    const { totals, period, loading } = useAppState();

    return (
        <div className="bq-status">
            <span>
                <span className="bq-dot-ok" />
                {loading ? 'Loading…' : 'Up to date'}
            </span>
            <span>{totals.count} transactions</span>
            <span>{periodLabel(period)}</span>
            <span className="bq-grow" />
            <span>
                net{' '}
                <span className={totals.net >= 0 ? 'bq-pos' : 'bq-neg'}>
                    {totals.net >= 0 ? '+' : '−'}{money(totals.net)}
                </span>
            </span>
        </div>
    );
};

export default StatusBar;
