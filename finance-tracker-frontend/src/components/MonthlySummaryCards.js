import React from 'react';

const formatCurrency = (value) =>
    new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
    }).format(value);

const MonthlySummaryCards = ({
    income,
    expenses,
    net,
    transactionCount,
    year,
    month,
    onYearChange,
    onMonthChange,
}) => (
    <section className="summary-section">
        <div className="dashboard-period-controls" aria-label="Dashboard period">
            <label htmlFor="dashboard-year">Year</label>
            <input
                id="dashboard-year"
                type="number"
                min="2000"
                max="2100"
                value={year}
                onChange={(event) => onYearChange(event.target.value)}
            />

            <label htmlFor="dashboard-month">Month</label>
            <select
                id="dashboard-month"
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

        <div className="summary-grid">
            <article className="summary-card">
                <span className="summary-label">Selected Month Income</span>
                <strong className="summary-value summary-positive">{formatCurrency(income)}</strong>
            </article>
            <article className="summary-card">
                <span className="summary-label">Selected Month Expenses</span>
                <strong className="summary-value summary-negative">{formatCurrency(expenses)}</strong>
            </article>
            <article className="summary-card">
                <span className="summary-label">Net</span>
                <strong className={`summary-value ${net >= 0 ? 'summary-positive' : 'summary-negative'}`}>
                    {formatCurrency(net)}
                </strong>
            </article>
            <article className="summary-card">
                <span className="summary-label">Transactions</span>
                <strong className="summary-value">{transactionCount}</strong>
            </article>
        </div>
    </section>
);

export default MonthlySummaryCards;
