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
        response = await fetch(`${API_BASE_URL}${path}`, {
            credentials: 'include',
            ...options,
        });
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

const PAGE_SIZE = 250;
// 100 pages is 25,000 transactions. Past that the client should not be holding
// the whole history in memory anyway -- see getTransactionsPage.
const MAX_PAGES = 100;

/** One page, for callers that want to drive paging themselves. */
const getTransactionsPage = async ({ limit = PAGE_SIZE, cursor } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);

    return requestJson(`/api/transactions?${params}`, {}, 'Failed to fetch transactions');
};

/**
 * Every view derives from the full history -- subscriptions, the saving streak,
 * the category list and which months hold data are all all-time -- so this walks
 * the pages and returns one array. The endpoint is paginated so no single
 * response is unbounded; bounding what the client *holds* needs those aggregates
 * served separately, which is a larger change.
 */
const getTransactions = async () => {
    const all = [];
    let cursor;

    for (let page = 0; page < MAX_PAGES; page += 1) {
        // eslint-disable-next-line no-await-in-loop -- each page needs the previous cursor
        const data = await getTransactionsPage({ cursor });
        all.push(...(data?.transactions || []));

        if (!data?.hasMore || !data?.nextCursor) return all;
        cursor = data.nextCursor;
    }

    return all;
};

const getYearSummary = async (year) =>
    requestJson(`/api/transactions/summary?year=${year}`, {}, 'Failed to fetch summary');

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

const previewTransactionImport = async (file, sourceAccount = '') => {
    const formData = new FormData();
    formData.append('file', file);
    if (sourceAccount) {
        formData.append('sourceAccount', sourceAccount);
    }

    return requestJson(
        '/api/transactions/import/preview',
        {
            method: 'POST',
            body: formData,
        },
        'Failed to preview statement import'
    );
};

const importTransactions = async (rows, batch = {}) =>
    requestJson(
        '/api/transactions/import',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows, batch, sourceAccount: batch.sourceAccount || '' }),
        },
        'Failed to import transactions'
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
            credentials: 'include',
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
    getTransactions,
    getTransactionsPage,
    getYearSummary,
    importTransactions,
    previewTransactionImport,
    updateTransaction,
};
