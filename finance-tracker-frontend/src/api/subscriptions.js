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

// Subscriptions themselves are derived from transaction history on the client.
// Only the cancellation override is stored, because history cannot distinguish a
// subscription that lapsed from one that was deliberately ended.
const getSubscriptionStates = async () =>
    requestJson('/api/subscriptions', {}, 'Failed to load subscription states');

const setSubscriptionCancelled = async (key, cancelled) =>
    requestJson(
        '/api/subscriptions',
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, cancelled }),
        },
        'Failed to update subscription'
    );

/** Turns the API's array response into the key list detectSubscriptions expects. */
const toCancelledKeys = (payload) => (payload?.cancelled || []).map((entry) => entry.key);

export { getSubscriptionStates, setSubscriptionCancelled, toCancelledKeys };
