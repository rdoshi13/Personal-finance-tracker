import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { MONTHS } from '../../lib/money';

/**
 * A dot marks a month that actually holds transactions, so an empty month is visibly
 * empty before you click it rather than after.
 */
const MonthStrip = () => {
    const { period, goToPeriod, periodsWithData, year } = useAppState();

    return (
        <div className="bq-mstrip" role="group" aria-label="Select month">
            {MONTHS.map((label, index) => {
                const key = `${year}-${String(index + 1).padStart(2, '0')}`;
                const hasData = periodsWithData.has(key);
                const selected = key === period;
                return (
                    <button
                        key={key}
                        type="button"
                        className={`bq-mstep ${selected ? 'on' : ''} ${hasData ? '' : 'mt'}`}
                        aria-pressed={selected}
                        onClick={() => goToPeriod(key)}
                    >
                        {label}
                        {hasData && <span className="d" aria-hidden="true" />}
                    </button>
                );
            })}
            <span className="bq-grow" />
            <button
                type="button"
                className="bq-mstep"
                onClick={() => goToPeriod(`${year - 1}-${period.split('-')[1]}`)}
                aria-label={`Go to ${year - 1}`}
            >
                ‹
            </button>
            <span style={{ fontSize: 12, color: 'var(--ink-3)', padding: '0 4px' }}>{year}</span>
            <button
                type="button"
                className="bq-mstep"
                onClick={() => goToPeriod(`${year + 1}-${period.split('-')[1]}`)}
                aria-label={`Go to ${year + 1}`}
            >
                ›
            </button>
        </div>
    );
};

export default MonthStrip;
