import { fireEvent, render, screen } from '@testing-library/react';
import AuthSection from './AuthSection';

jest.mock('../api/auth', () => ({
    login: jest.fn(),
    signup: jest.fn(),
}));

describe('AuthSection', () => {
    test('toggles password visibility', () => {
        render(<AuthSection onAuthSuccess={jest.fn()} />);

        const passwordInput = screen.getByLabelText('Password');
        expect(passwordInput).toHaveAttribute('type', 'password');

        fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
        expect(passwordInput).toHaveAttribute('type', 'text');

        fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
        expect(passwordInput).toHaveAttribute('type', 'password');
    });
});
