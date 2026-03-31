import { API_BASE_URL } from '../config';

const parseErrorMessage = async (response, fallbackMessage) => {
    const errorData = await response.json().catch(() => ({}));
    return errorData.message || fallbackMessage;
};
const normalizeTransactionId = (transactionId) => {
    const normalizedId = String(transactionId || '').trim();
    if (!normalizedId) {
        throw new Error('Missing transaction id');
    }
    return normalizedId;
};
const isNetworkFetchError = (error) => error instanceof TypeError || error?.message === 'Failed to fetch';

const requestJson = async (path, options = {}, fallbackError = 'Request failed') => {
    let response;
    let data;

    try {
        response = await fetch(`${API_BASE_URL}${path}`, options);
        data = await response.json().catch(() => null);
    } catch (error) {
        if (isNetworkFetchError(error)) {
            throw new Error('Failed to fetch');
        }
        throw error;
    }

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
        `/api/transactions/${normalizeTransactionId(transactionId)}`,
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transaction),
        },
        'Failed to update transaction'
    ).catch((error) => {
        if (!isNetworkFetchError(error)) {
            throw error;
        }

        return requestJson(
            `/api/transactions/${normalizeTransactionId(transactionId)}/update`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(transaction),
            },
            'Failed to update transaction'
        );
    });

const deleteTransaction = async (transactionId) => {
    const normalizedId = normalizeTransactionId(transactionId);

    try {
        const response = await fetch(`${API_BASE_URL}/api/transactions/${normalizedId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            const message = await parseErrorMessage(response, 'Failed to delete transaction');
            throw new Error(message);
        }
    } catch (error) {
        if (!isNetworkFetchError(error)) {
            throw error;
        }

        await requestJson(
            `/api/transactions/${normalizedId}/delete`,
            { method: 'POST' },
            'Failed to delete transaction'
        );
    }
};

export {
    createTransaction,
    deleteTransaction,
    getMonthlyReport,
    getTransactions,
    updateTransaction,
};
