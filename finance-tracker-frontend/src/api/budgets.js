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

const getBudgets = async () => requestJson('/api/budgets', {}, 'Failed to load budgets');

const setBudget = async (category, monthlyLimit) =>
    requestJson(
        '/api/budgets',
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, monthlyLimit }),
        },
        'Failed to save budget'
    );

/** Turns the API's array response into a { [category]: limit } lookup. */
const toBudgetMap = (payload) =>
    (payload?.budgets || []).reduce((acc, budget) => {
        acc[budget.category] = budget.monthlyLimit;
        return acc;
    }, {});

export { getBudgets, setBudget, toBudgetMap };
