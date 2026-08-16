import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ResetPasswordSection from './ResetPasswordSection';
import { resetPassword } from '../api/auth';

jest.mock('../api/auth', () => ({
    resetPassword: jest.fn(),
}));

const renderSection = (overrides = {}) => {
    const props = {
        token: 'reset-token',
        onResetSuccess: jest.fn(),
        onCancel: jest.fn(),
        ...overrides,
    };

    render(<ResetPasswordSection {...props} />);
    return props;
};

const fillPasswords = (password, confirmation) => {
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
        target: { value: confirmation },
    });
};

describe('ResetPasswordSection', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('rejects mismatched passwords without calling the api', async () => {
        renderSection();

        fillPasswords('correct-horse', 'battery-staple');
        fireEvent.click(screen.getByRole('button', { name: 'Save New Password' }));

        expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
        expect(resetPassword).not.toHaveBeenCalled();
    });

    test('submits the token with the new password and signs the user in', async () => {
        const user = { id: '1', email: 'user@example.com', name: 'User' };
        resetPassword.mockResolvedValue({ user });

        const props = renderSection();

        fillPasswords('correct-horse', 'correct-horse');
        fireEvent.click(screen.getByRole('button', { name: 'Save New Password' }));

        await waitFor(() => {
            expect(props.onResetSuccess).toHaveBeenCalledWith(user);
        });

        expect(resetPassword).toHaveBeenCalledWith({
            token: 'reset-token',
            password: 'correct-horse',
        });
    });

    test('shows the server message when the link is expired', async () => {
        resetPassword.mockRejectedValue(new Error('This reset link is invalid or has expired'));

        renderSection();

        fillPasswords('correct-horse', 'correct-horse');
        fireEvent.click(screen.getByRole('button', { name: 'Save New Password' }));

        expect(
            await screen.findByText('This reset link is invalid or has expired')
        ).toBeInTheDocument();
    });

    test('toggles password visibility for both fields', () => {
        renderSection();

        expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password');

        fireEvent.click(screen.getByRole('button', { name: 'Show password' }));

        expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text');
        expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('type', 'text');
    });

    test('cancelling hands control back to the caller', () => {
        const props = renderSection();

        fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));

        expect(props.onCancel).toHaveBeenCalled();
    });
});
