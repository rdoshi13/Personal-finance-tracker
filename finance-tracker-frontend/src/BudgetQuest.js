import React, { useCallback, useEffect, useState } from 'react';
import './theme/tokens.css';
import './theme/shell.css';
import './theme/views.css';
import { getCurrentUser, logout } from './api/auth';
import AuthSection from './components/AuthSection';
import ResetPasswordSection from './components/ResetPasswordSection';
import { AppStateProvider } from './state/AppStateContext';
import AppShell from './components/shell/AppShell';

const RESET_TOKEN_PARAM = 'reset_token';

const readResetTokenFromUrl = () => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get(RESET_TOKEN_PARAM) || '';
};

const clearResetTokenFromUrl = () => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.delete(RESET_TOKEN_PARAM);
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
};

const SILENT_AUTH_ERRORS = new Set([
    'Authentication required',
    'Invalid or expired authentication token',
]);

const BudgetQuest = () => {
    const [user, setUser] = useState(null);
    const [checking, setChecking] = useState(true);
    const [authError, setAuthError] = useState('');
    const [resetToken, setResetToken] = useState(readResetTokenFromUrl);

    useEffect(() => {
        let active = true;

        (async () => {
            try {
                const response = await getCurrentUser();
                if (active) setUser(response?.user || null);
            } catch (error) {
                if (!active) return;
                setUser(null);
                if (!SILENT_AUTH_ERRORS.has(error.message)) {
                    setAuthError(error.message || 'Unable to verify session');
                }
            } finally {
                if (active) setChecking(false);
            }
        })();

        return () => { active = false; };
    }, []);

    const handleLogout = useCallback(async () => {
        try {
            await logout();
        } catch (error) {
            // Clearing local state matters more than the round trip succeeding.
        }
        setUser(null);
    }, []);

    const handleResetSuccess = useCallback((resetUser) => {
        setResetToken('');
        clearResetTokenFromUrl();
        setUser(resetUser || null);
    }, []);

    if (resetToken) {
        return (
            <div className="bq-root">
                <div style={{ maxWidth: 460, margin: '0 auto', padding: '48px 16px' }}>
                    <ResetPasswordSection
                        token={resetToken}
                        onResetSuccess={handleResetSuccess}
                        onCancel={() => { setResetToken(''); clearResetTokenFromUrl(); }}
                    />
                </div>
            </div>
        );
    }

    if (checking) {
        return (
            <div className="bq-root">
                <div style={{ padding: 40, color: 'var(--ink-3)' }}>Loading session…</div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="bq-root">
                <div style={{ maxWidth: 460, margin: '0 auto', padding: '48px 16px' }}>
                    <AuthSection onAuthSuccess={setUser} />
                    {authError && <p className="error-text">{authError}</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="bq-root">
            <AppStateProvider user={user} onLogout={handleLogout}>
                <AppShell />
            </AppStateProvider>
        </div>
    );
};

export default BudgetQuest;
