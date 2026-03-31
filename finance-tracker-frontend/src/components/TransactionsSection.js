import React from 'react';
import AddTransaction from '../AddTransaction';

const getAmountClassName = (type) => (type === 'income' ? 'amount-income' : 'amount-outflow');
const getTransactionName = (transaction) => transaction.name || 'Unnamed transaction';
const getTransactionCategory = (transaction) => transaction.category || 'Uncategorized';
const getTransactionId = (transaction) => transaction?._id || transaction?.id || '';

const PencilIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 17.25V21h3.75l11-11.03-3.75-3.75L3 17.25zm17.71-10.04a1 1 0 0 0 0-1.41l-2.5-2.5a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.99-2.37z" />
    </svg>
);

const TrashIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm1 12h8a2 2 0 0 0 2-2V9H6v10a2 2 0 0 0 2 2z" />
    </svg>
);

const TransactionsSection = ({
    transactions,
    totalTransactionsCount,
    isFormVisible,
    isTransactionEditMode,
    editingTransaction,
    searchQuery,
    selectedType,
    selectedCategory,
    categoryOptions,
    startDate,
    endDate,
    onOpenAddForm,
    onToggleTransactionEditMode,
    onOpenEditForm,
    onCloseForm,
    onTransactionSaved,
    onDelete,
    onSearchQueryChange,
    onTypeChange,
    onCategoryChange,
    onStartDateChange,
    onEndDateChange,
    onClearFilters,
    formatDate,
}) => (
    <section className="transactions-section">
        <h2>Recent Transactions</h2>

        <div className="action-buttons">
            <button onClick={onOpenAddForm}>Add Transaction</button>
            <button className="secondary-button" onClick={onToggleTransactionEditMode}>
                {isTransactionEditMode ? 'Done' : 'Edit'}
            </button>
        </div>

        <div className="transactions-filters">
            <input
                type="text"
                className="filter-search"
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="Search name or description"
            />
            <select
                className="filter-select"
                value={selectedType}
                onChange={(event) => onTypeChange(event.target.value)}
            >
                <option value="all">All types</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="subscription">Subscription</option>
            </select>
            <select
                className="filter-select"
                value={selectedCategory}
                onChange={(event) => onCategoryChange(event.target.value)}
            >
                <option value="all">All categories</option>
                {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                        {category}
                    </option>
                ))}
            </select>
            <input
                type="date"
                className="filter-date"
                value={startDate}
                onChange={(event) => onStartDateChange(event.target.value)}
                aria-label="Start date"
            />
            <input
                type="date"
                className="filter-date"
                value={endDate}
                onChange={(event) => onEndDateChange(event.target.value)}
                aria-label="End date"
            />
            <button className="secondary-button filter-clear-button" onClick={onClearFilters}>
                Clear Filters
            </button>
        </div>

        {totalTransactionsCount > 0 && (
            <p className="filter-summary">
                Showing {transactions.length} of {totalTransactionsCount} transactions
            </p>
        )}

        {isFormVisible && (
            <div className="form-modal-overlay" onClick={onCloseForm} role="presentation">
                <div className="form-modal-content" onClick={(event) => event.stopPropagation()}>
                    <button
                        type="button"
                        className="modal-close-button"
                        onClick={onCloseForm}
                        aria-label="Close transaction form"
                    >
                        ×
                    </button>
                    <AddTransaction
                        onSaved={onTransactionSaved}
                        onCancel={onCloseForm}
                        editingTransaction={editingTransaction}
                    />
                </div>
            </div>
        )}

        {transactions.length === 0 ? (
            <p>{totalTransactionsCount === 0 ? 'No transactions added yet.' : 'No transactions match these filters.'}</p>
        ) : (
            <ul>
                {transactions.map((transaction, index) => (
                    <li key={getTransactionId(transaction) || `${getTransactionName(transaction)}-${index}`} className="transaction-item">
                        <div className="transaction-grid">
                            <div className="transaction-cell">
                                <span className="transaction-label">Name</span>
                                <strong>{getTransactionName(transaction)}</strong>
                            </div>
                            <div className="transaction-cell">
                                <span className="transaction-label">Category</span>
                                <span className="transaction-meta">{getTransactionCategory(transaction)}</span>
                            </div>
                            <div className="transaction-cell">
                                <span className="transaction-label">Value</span>
                                <strong className={getAmountClassName(transaction.type)}>
                                    ${transaction.amount}
                                </strong>
                            </div>
                            <div className="transaction-cell">
                                <span className="transaction-label">Description</span>
                                <span>{transaction.description || 'No description'}</span>
                            </div>
                            <div className="transaction-cell">
                                <span className="transaction-label">Date</span>
                                <span>{formatDate(transaction.date)}</span>
                            </div>
                        </div>
                        {isTransactionEditMode && (
                            <div className="transaction-row-actions">
                                <button
                                    className="icon-button icon-edit"
                                    onClick={() => onOpenEditForm(transaction)}
                                    aria-label={`Edit ${getTransactionName(transaction)}`}
                                    title="Edit transaction"
                                >
                                    <PencilIcon />
                                </button>
                                <button
                                    className="icon-button icon-delete"
                                    onClick={() => onDelete(transaction)}
                                    aria-label={`Delete ${getTransactionName(transaction)}`}
                                    title="Delete transaction"
                                >
                                    <TrashIcon />
                                </button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        )}
    </section>
);

export default TransactionsSection;
