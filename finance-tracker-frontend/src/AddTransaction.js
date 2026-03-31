import React, { useEffect, useState } from 'react';
import { createTransaction, updateTransaction } from './api/transactions';

const CATEGORY_OPTIONS = {
    income: ['Salary', 'Freelance', 'Investment', 'Interest', 'Bonus', 'Gift', 'Misc'],
    expense: ['Groceries', 'Housing', 'Transport', 'Health', 'Food', 'Entertainment', 'Misc'],
    subscription: ['Streaming', 'Software', 'Utilities', 'Cloud', 'Gym', 'Membership', 'Misc'],
};

const getCategoryOptions = (type) => CATEGORY_OPTIONS[type] || ['Misc'];
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
            const availableCategories = getCategoryOptions(incomingType);
            const incomingCategory = editingTransaction.category || '';
            const normalizedCategory = availableCategories.includes(incomingCategory)
                ? incomingCategory
                : getDefaultCategory(incomingType);

            setTransaction({
                type: incomingType,
                name: editingTransaction.name || '',
                category: normalizedCategory,
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

    const categoryOptions = getCategoryOptions(transaction.type);

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
