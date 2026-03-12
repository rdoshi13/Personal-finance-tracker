import React from 'react';

const formatCurrency = (value) =>
    new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
    }).format(Number(value) || 0);

const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;
const sortEntriesByTotalDesc = (entries) =>
    [...entries].sort(([, leftSummary], [, rightSummary]) => (rightSummary?.total ?? 0) - (leftSummary?.total ?? 0));

const MonthlyReportSection = ({
    year,
    month,
    onYearChange,
    onMonthChange,
    isReportLoading,
    onFetchReport,
    onGeneratePDF,
    reportData,
    reportError,
    reportEntries,
}) => {
    const incomeEntries = sortEntriesByTotalDesc(Object.entries(reportData?.breakdownByType?.income || {}));
    const typedOutflowEntries = sortEntriesByTotalDesc(Object.entries(reportData?.breakdownByType?.outflow || {}));
    const fallbackCombinedEntries = sortEntriesByTotalDesc(reportEntries);
    const outflowEntries = typedOutflowEntries.length > 0 || incomeEntries.length > 0
        ? typedOutflowEntries
        : fallbackCombinedEntries;

    const totalIncome = Number(reportData?.totalIncome) || 0;
    const totalExpenses = Number(reportData?.totalExpenses) || 0;
    const netAmount = totalIncome - totalExpenses;

    const topIncomeEntry = incomeEntries[0];
    const topOutflowEntry = outflowEntries[0];
    const topIncomeName = topIncomeEntry?.[0];
    const topOutflowName = topOutflowEntry?.[0];
    const topIncomeTotal = Number(topIncomeEntry?.[1]?.total) || 0;
    const topOutflowTotal = Number(topOutflowEntry?.[1]?.total) || 0;

    const renderBreakdown = ({ title, entries, totalAmount, variant, shareLabel, emptyState }) => {
        if (entries.length === 0) {
            return (
                <div className="report-chart">
                    <h3>{title}</h3>
                    <p className="report-chart-empty">{emptyState}</p>
                </div>
            );
        }

        const maxTotal = entries.reduce(
            (currentMax, [, summary]) => Math.max(currentMax, summary?.total ?? 0),
            0
        );

        return (
            <div className="report-chart">
                <h3>{title}</h3>
                <ul className="report-chart-list">
                    {entries.map(([category, summary]) => {
                        const total = Number(summary?.total) || 0;
                        const transactionCount = Number(summary?.transactions) || 0;
                        const fillWidth = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
                        const share = totalAmount > 0 ? total / totalAmount : 0;

                        return (
                            <li key={category} className="report-chart-item">
                                <div className="report-chart-header">
                                    <span>{category}</span>
                                    <div className="report-chart-values">
                                        <strong>{formatCurrency(total)}</strong>
                                        <span className="report-share-pill">{formatPercent(share)}</span>
                                    </div>
                                </div>
                                <div className="report-chart-track">
                                    <div
                                        className={`report-chart-fill report-chart-fill-${variant}`}
                                        style={{ width: `${Math.max(fillWidth, 2)}%` }}
                                    />
                                </div>
                                <div className="report-chart-meta">
                                    <small>{transactionCount} {transactionCount === 1 ? 'transaction' : 'transactions'}</small>
                                    <small>{formatPercent(share)} of {shareLabel}</small>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    };

    return (
        <section className="report-section">
            <h2>Monthly Report</h2>

        <div className="report-controls">
            <label htmlFor="report-year">Year</label>
            <input
                id="report-year"
                type="number"
                min="2000"
                max="2100"
                value={year}
                onChange={(event) => onYearChange(event.target.value)}
            />

            <label htmlFor="report-month">Month</label>
            <select
                id="report-month"
                value={month}
                onChange={(event) => onMonthChange(event.target.value)}
            >
                <option value="01">January</option>
                <option value="02">February</option>
                <option value="03">March</option>
                <option value="04">April</option>
                <option value="05">May</option>
                <option value="06">June</option>
                <option value="07">July</option>
                <option value="08">August</option>
                <option value="09">September</option>
                <option value="10">October</option>
                <option value="11">November</option>
                <option value="12">December</option>
            </select>
        </div>

        <div className="action-buttons">
            <button onClick={onFetchReport} disabled={isReportLoading}>
                {isReportLoading ? 'Loading...' : 'Load Report'}
            </button>
            <button onClick={onGeneratePDF} disabled={!reportData}>Export PDF</button>
        </div>

        {reportError && <p className="error-text">{reportError}</p>}

        {reportData && (
            <>
                <div className="report-metrics">
                    <article className="report-metric-card">
                        <span className="report-metric-label">Total Income</span>
                        <strong className="summary-positive">{formatCurrency(totalIncome)}</strong>
                    </article>
                    <article className="report-metric-card">
                        <span className="report-metric-label">Total Expenses</span>
                        <strong className="summary-negative">{formatCurrency(totalExpenses)}</strong>
                    </article>
                    <article className="report-metric-card">
                        <span className="report-metric-label">Net</span>
                        <strong className={netAmount >= 0 ? 'summary-positive' : 'summary-negative'}>
                            {formatCurrency(netAmount)}
                        </strong>
                    </article>
                </div>

                <div className="report-insights">
                    {topIncomeName && (
                        <p className="report-insight">
                            Top income: <strong>{topIncomeName}</strong> ({formatCurrency(topIncomeTotal)})
                        </p>
                    )}
                    {topOutflowName && (
                        <p className="report-insight">
                            Top outflow: <strong>{topOutflowName}</strong> ({formatCurrency(topOutflowTotal)})
                        </p>
                    )}
                </div>
            </>
        )}

            {reportData && (
                <div className="report-chart-grid">
                    {renderBreakdown({
                        title: 'Income by Category',
                        entries: incomeEntries,
                        totalAmount: totalIncome,
                        variant: 'income',
                        shareLabel: 'monthly income',
                        emptyState: 'No income categories for the selected month.',
                    })}
                    {renderBreakdown({
                        title: 'Expenses & Subscriptions by Category',
                        entries: outflowEntries,
                        totalAmount: totalExpenses,
                        variant: 'outflow',
                        shareLabel: 'monthly outflow',
                        emptyState: 'No expense or subscription categories for the selected month.',
                    })}
                </div>
            )}
        </section>
    );
};

export default MonthlyReportSection;
