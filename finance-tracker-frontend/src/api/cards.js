import { API_BASE_URL } from '../config';

const requestJson = async (path, options = {}, fallbackMessage = 'Request failed') => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        credentials: 'include',
        ...options,
    }).catch(() => {
        throw new Error('Failed to fetch');
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data?.message || fallbackMessage);
    }

    return data;
};

// Each credit card statement's own figures -- balance, due date, limit, interest.
// The card's transactions come through /api/transactions like every other row.
const getCardStatements = async () => {
    const data = await requestJson('/api/cards/statements', {}, 'Failed to load card statements');
    return Array.isArray(data?.statements) ? data.statements : [];
};

export { getCardStatements };
