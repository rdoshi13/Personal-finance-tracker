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
        const error = new Error(data?.message || fallbackMessage);
        error.status = response.status;
        error.data = data;
        throw error;
    }

    return data;
};

const getProgress = async () =>
    requestJson('/api/progress', {}, 'Failed to load progress');

const getQuests = async (year, month) =>
    requestJson(`/api/progress/quests/${year}/${month}`, {}, 'Failed to load quests');

const claimQuest = async (year, month, questId) =>
    requestJson(
        `/api/progress/quests/${year}/${month}/${questId}/claim`,
        { method: 'POST' },
        'Failed to claim reward'
    );

export { claimQuest, getProgress, getQuests };
