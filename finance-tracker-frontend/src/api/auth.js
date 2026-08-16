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

const signup = async ({ name, email, password }) =>
    requestJson(
        '/api/auth/signup',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password }),
        },
        'Failed to create account'
    );

const login = async ({ email, password }) =>
    requestJson(
        '/api/auth/login',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        },
        'Failed to sign in'
    );

const logout = async () =>
    requestJson(
        '/api/auth/logout',
        {
            method: 'POST',
        },
        'Failed to sign out'
    );

const forgotPassword = async ({ email }) =>
    requestJson(
        '/api/auth/forgot-password',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        },
        'Failed to send reset link'
    );

const resetPassword = async ({ token, password }) =>
    requestJson(
        '/api/auth/reset-password',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password }),
        },
        'Failed to reset password'
    );

const getCurrentUser = async () =>
    requestJson('/api/auth/me', {}, 'Failed to fetch current user');

export {
    forgotPassword,
    getCurrentUser,
    login,
    logout,
    resetPassword,
    signup,
};
