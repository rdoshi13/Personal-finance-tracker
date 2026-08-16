import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuthSection from './AuthSection';
import { forgotPassword } from '../api/auth';

jest.mock('../api/auth', () => ({
    forgotPassword: jest.fn(),
    login: jest.fn(),
    signup: jest.fn(),
}));

describe('AuthSection', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('toggles password visibility', () => {
        render(<AuthSection onAuthSuccess={jest.fn()} />);

        const passwordInput = screen.getByLabelText('Password');
        expect(passwordInput).toHaveAttribute('type', 'password');

        fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
        expect(passwordInput).toHaveAttribute('type', 'text');

        fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
        expect(passwordInput).toHaveAttribute('type', 'password');
    });

    test('switches to forgot password mode and hides the password field', () => {
        render(<AuthSection onAuthSuccess={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }));

        expect(screen.getByRole('heading', { name: 'Reset password' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeInTheDocument();
    });

    test('submits the email and shows the generic confirmation', async () => {
        forgotPassword.mockResolvedValue({
            message: 'If an account exists for that email, a reset link is on its way.',
        });

        render(<AuthSection onAuthSuccess={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }));

        fireEvent.change(screen.getByLabelText('Email'), {
            target: { value: '  user@example.com  ' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

        await waitFor(() => {
            expect(forgotPassword).toHaveBeenCalledWith({ email: 'user@example.com' });
        });

        expect(
            await screen.findByText('If an account exists for that email, a reset link is on its way.')
        ).toBeInTheDocument();
    });

    test('surfaces reset request failures', async () => {
        forgotPassword.mockRejectedValue(new Error('Too many reset requests. Please try again later.'));

        render(<AuthSection onAuthSuccess={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }));

        fireEvent.change(screen.getByLabelText('Email'), {
            target: { value: 'user@example.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

        expect(
            await screen.findByText('Too many reset requests. Please try again later.')
        ).toBeInTheDocument();
    });

    test('returns from forgot mode back to sign in', () => {
        render(<AuthSection onAuthSuccess={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }));
        fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));

        expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
        expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });
});
