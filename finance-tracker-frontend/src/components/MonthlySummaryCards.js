import React from 'react';

const formatCurrency = (value) =>
    new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
    }).format(value);

const MonthlySummaryCards = ({ income, expenses, net, transactionCount }) => (
    <section className="summary-section">
        <div className="summary-grid">
            <article className="summary-card">
                <span className="summary-label">This Month Income</span>
                <strong className="summary-value summary-positive">{formatCurrency(income)}</strong>
            </article>
            <article className="summary-card">
                <span className="summary-label">This Month Expenses</span>
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
