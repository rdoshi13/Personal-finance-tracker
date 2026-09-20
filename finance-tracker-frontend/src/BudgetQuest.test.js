import { act, render, screen } from '@testing-library/react';
import BudgetQuest from './BudgetQuest';
import { getCurrentUser, logout } from './api/auth';

jest.mock('./api/auth', () => ({
    getCurrentUser: jest.fn(),
    logout: jest.fn(),
}));

let authSectionProps;
let resetSectionProps;
jest.mock('./components/AuthSection', () => (props) => {
    authSectionProps = props;
    return <div data-testid="auth-section" />;
});
jest.mock('./components/ResetPasswordSection', () => (props) => {
    resetSectionProps = props;
    return <div data-testid="reset-section" />;
});
jest.mock('./components/shell/AppShell', () => () => <div data-testid="app-shell" />);
let providerProps;
jest.mock('./state/AppStateContext', () => ({
    AppStateProvider: (props) => {
        providerProps = props;
        return <div data-testid="provider">{props.children}</div>;
    },
}));

const user = { id: '1', name: 'Test', email: 'test@test.com' };

beforeEach(() => {
    jest.clearAllMocks();
    authSectionProps = undefined;
    resetSectionProps = undefined;
    providerProps = undefined;
    window.history.replaceState({}, '', '/');
});

describe('BudgetQuest auth gate', () => {
    test('shows a session check before deciding what to render', () => {
        getCurrentUser.mockReturnValue(new Promise(() => {}));
        render(<BudgetQuest />);

        expect(screen.getByText('Loading session…')).toBeInTheDocument();
        expect(screen.queryByTestId('auth-section')).not.toBeInTheDocument();
        expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
    });

    test('an unauthenticated visitor gets the sign-in form, with no error shown', async () => {
        // A 401 on first load is the normal signed-out path, not a failure worth
        // shouting about.
        getCurrentUser.mockRejectedValue(new Error('Authentication required'));
        render(<BudgetQuest />);

        expect(await screen.findByTestId('auth-section')).toBeInTheDocument();
        expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
        expect(screen.queryByText(/Authentication required/)).not.toBeInTheDocument();
    });

    test('an expired token is treated the same way', async () => {
        getCurrentUser.mockRejectedValue(new Error('Invalid or expired authentication token'));
        render(<BudgetQuest />);

        expect(await screen.findByTestId('auth-section')).toBeInTheDocument();
        expect(screen.queryByText(/expired/)).not.toBeInTheDocument();
    });

    test('a real failure is surfaced rather than swallowed', async () => {
        getCurrentUser.mockRejectedValue(new Error('Failed to fetch'));
        render(<BudgetQuest />);

        expect(await screen.findByTestId('auth-section')).toBeInTheDocument();
        expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
    });

    test('an authenticated visitor gets the shell', async () => {
        getCurrentUser.mockResolvedValue({ user });
        render(<BudgetQuest />);

        expect(await screen.findByTestId('app-shell')).toBeInTheDocument();
        expect(screen.queryByTestId('auth-section')).not.toBeInTheDocument();
    });

    test('signing in from the form swaps straight to the shell', async () => {
        getCurrentUser.mockRejectedValue(new Error('Authentication required'));
        render(<BudgetQuest />);
        await screen.findByTestId('auth-section');

        authSectionProps.onAuthSuccess(user);

        expect(await screen.findByTestId('app-shell')).toBeInTheDocument();
    });

    test('a reset_token in the URL takes priority over the session check', async () => {
        window.history.replaceState({}, '', '/?reset_token=abc123');
        getCurrentUser.mockResolvedValue({ user });
        render(<BudgetQuest />);

        expect(screen.getByTestId('reset-section')).toBeInTheDocument();
        expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
        expect(resetSectionProps.token).toBe('abc123');
    });

    test('a completed reset signs the user in and scrubs the token from the URL', async () => {
        window.history.replaceState({}, '', '/?reset_token=abc123');
        getCurrentUser.mockResolvedValue({ user });
        render(<BudgetQuest />);

        resetSectionProps.onResetSuccess(user);

        expect(await screen.findByTestId('app-shell')).toBeInTheDocument();
        // The token must not linger in history for someone to copy out of the bar.
        expect(window.location.search).toBe('');
    });

    test('cancelling a reset drops the token and falls back to the session', async () => {
        window.history.replaceState({}, '', '/?reset_token=abc123');
        getCurrentUser.mockResolvedValue({ user });
        render(<BudgetQuest />);

        resetSectionProps.onCancel();

        expect(await screen.findByTestId('app-shell')).toBeInTheDocument();
        expect(window.location.search).toBe('');
    });

    test('signing out returns to the form', async () => {
        getCurrentUser.mockResolvedValue({ user });
        logout.mockResolvedValue(undefined);
        render(<BudgetQuest />);
        await screen.findByTestId('app-shell');

        await act(async () => { await providerProps.onLogout(); });

        expect(logout).toHaveBeenCalled();
        expect(screen.getByTestId('auth-section')).toBeInTheDocument();
        expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument();
    });

    test('signing out clears local state even if the round trip fails', async () => {
        getCurrentUser.mockResolvedValue({ user });
        logout.mockRejectedValue(new Error('offline'));
        render(<BudgetQuest />);
        await screen.findByTestId('app-shell');

        await act(async () => { await providerProps.onLogout(); });

        // Being stuck in a signed-in shell after asking to leave is worse than
        // a stale cookie, so the failure is swallowed on purpose.
        expect(screen.getByTestId('auth-section')).toBeInTheDocument();
    });
});
