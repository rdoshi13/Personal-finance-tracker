import { API_BASE_URL } from '../config';

const parseErrorMessage = async (response, fallbackMessage) => {
    const errorData = await response.json().catch(() => ({}));
    return errorData.message || fallbackMessage;
};

const requestJson = async (path, options = {}, fallbackError = 'Request failed') => {
    const response = await fetch(`${API_BASE_URL}${path}`, options);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message = data?.message || fallbackError;
        throw new Error(message);
    }

    return data;
};

const getTransactions = async () =>
    requestJson('/api/transactions', {}, 'Failed to fetch transactions');

const getMonthlyReport = async (year, month) =>
    requestJson(`/api/transactions/report/${year}/${month}`, {}, 'Failed to fetch report');

const createTransaction = async (transaction) =>
    requestJson(
        '/api/transactions',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transaction),
        },
        'Failed to create transaction'
    );

const updateTransaction = async (transactionId, transaction) =>
    requestJson(
        `/api/transactions/${transactionId}`,
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transaction),
        },
        'Failed to update transaction'
    );

const deleteTransaction = async (transactionId) => {
    const response = await fetch(`${API_BASE_URL}/api/transactions/${transactionId}`, {
        method: 'DELETE',
    });

    if (!response.ok) {
        const message = await parseErrorMessage(response, 'Failed to delete transaction');
        throw new Error(message);
    }
};

export {
    createTransaction,
    deleteTransaction,
    getMonthlyReport,
    getTransactions,
    updateTransaction,
};
