import React, { useEffect, useState } from 'react';
import { createTransaction, updateTransaction } from './api/transactions';

const CATEGORY_OPTIONS = {
    income: ['Salary', 'Freelance', 'Investment', 'Interest', 'Bonus', 'Gift', 'Transfer', 'Tax Refund', 'Misc'],
    expense: ['Groceries', 'Housing', 'Transport', 'Health', 'Food', 'Entertainment', 'Transfer', 'Credit Card Payment', 'Misc'],
    subscription: ['Subscription', 'Streaming', 'Software', 'Utilities', 'Cloud', 'Gym', 'Membership', 'Misc'],
};

// An imported transaction can carry a category that is not in its type's list: the
// statement importer tags recurring card charges 'Subscription' while typing them
// 'expense', and a refund from a shop becomes 'income' + 'Groceries'. Surface the
// stored value as a selectable option rather than silently rewriting it to the
// default, which turned opening the edit form into a data-loss risk.
const getCategoryOptions = (type, currentCategory) => {
    const options = CATEGORY_OPTIONS[type] || ['Misc'];
    const current = String(currentCategory || '').trim();
    return current && !options.includes(current) ? [current, ...options] : options;
};
const getDefaultCategory = (type) => {
    const options = getCategoryOptions(type);
    return options[options.length - 1];
};

const EMPTY_TRANSACTION = {
    type: 'expense',
    name: '',
    category: getDefaultCategory('expense'),
    amount: '',
    description: '',
};
const getTransactionId = (transaction) => transaction?._id || transaction?.id || '';

const AddTransaction = ({ onSaved, onCancel, editingTransaction }) => {
    const [transaction, setTransaction] = useState(EMPTY_TRANSACTION);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState('');

    const isEditMode = Boolean(getTransactionId(editingTransaction));

    useEffect(() => {
        if (isEditMode) {
            const incomingType = editingTransaction.type || 'expense';
            const incomingCategory = String(editingTransaction.category || '').trim();

            setTransaction({
                type: incomingType,
                name: editingTransaction.name || '',
                category: incomingCategory || getDefaultCategory(incomingType),
                amount: String(editingTransaction.amount ?? ''),
                description: editingTransaction.description || '',
            });
            return;
        }

        setTransaction(EMPTY_TRANSACTION);
    }, [editingTransaction, isEditMode]);

    // Handle form input changes
    const handleChange = (e) => {
        setFormError('');
        const { name, value } = e.target;

        if (name === 'type') {
            const nextCategories = getCategoryOptions(value);
            setTransaction((previousTransaction) => ({
                ...previousTransaction,
                type: value,
                category: nextCategories.includes(previousTransaction.category)
                    ? previousTransaction.category
                    : getDefaultCategory(value),
            }));
            return;
        }

        setTransaction((previousTransaction) => ({
            ...previousTransaction,
            [name]: value,
        }));
    };

    const categoryOptions = getCategoryOptions(transaction.type, transaction.category);

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setFormError('');

        try {
            const normalizedName = transaction.name.trim();
            if (!normalizedName) {
                setFormError('Name is required');
                return;
            }

            const payload = {
                ...transaction,
                name: normalizedName,
                amount: Number(transaction.amount),
            };

            if (isEditMode && !getTransactionId(editingTransaction)) {
                setFormError('Missing transaction id');
                return;
            }

            const data = isEditMode
                ? await updateTransaction(getTransactionId(editingTransaction), payload)
                : await createTransaction(payload);
            onSaved(data, isEditMode ? 'edit' : 'add');
        } catch (error) {
            console.error('Error saving transaction:', error);
            setFormError(error.message || 'Failed to save transaction');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="form-container">
            <form className="transaction-form" onSubmit={handleSubmit}>
                <h2 className="transaction-form-title">{isEditMode ? 'Edit Transaction' : 'Add Transaction'}</h2>

                <div className="transaction-form-grid">
                    <div className="transaction-form-field">
                        <label htmlFor="transaction-type">Type</label>
                        <select
                            id="transaction-type"
                            name="type"
                            value={transaction.type}
                            onChange={handleChange}
                        >
                            <option value="expense">Expense</option>
                            <option value="income">Income</option>
                            <option value="subscription">Subscription</option>
                        </select>
                    </div>
                    <div className="transaction-form-field">
                        <label htmlFor="transaction-name">Name</label>
                        <input
                            id="transaction-name"
                            type="text"
                            name="name"
                            value={transaction.name}
                            onChange={handleChange}
                            placeholder="Enter name"
                            required
                        />
                    </div>
                    <div className="transaction-form-field">
                        <label htmlFor="transaction-category">Category</label>
                        <select
                            id="transaction-category"
                            name="category"
                            value={transaction.category}
                            onChange={handleChange}
                            required
                        >
                            {categoryOptions.map((categoryOption) => (
                                <option key={categoryOption} value={categoryOption}>
                                    {categoryOption}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="transaction-form-field">
                        <label htmlFor="transaction-amount">Amount</label>
                        <input
                            id="transaction-amount"
                            type="number"
                            name="amount"
                            value={transaction.amount}
                            onChange={handleChange}
                            placeholder="Enter amount"
                            min="0"
                            step="0.01"
                            required
                        />
                    </div>
                    <div className="transaction-form-field transaction-form-field-full">
                        <label htmlFor="transaction-description">Description</label>
                        <input
                            id="transaction-description"
                            type="text"
                            name="description"
                            value={transaction.description}
                            onChange={handleChange}
                            placeholder="Enter description"
                        />
                    </div>
                </div>

                <div className="form-buttons">
                    <button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : isEditMode ? 'Save Changes' : 'Add Transaction'}
                    </button>
                    <button type="button" className="secondary-button" onClick={onCancel} disabled={isSubmitting}>
                        Cancel
                    </button>
                </div>

                {formError && <p className="error-text">{formError}</p>}
            </form>
        </div>
    );
};

export default AddTransaction;
