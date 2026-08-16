import React, { useState } from 'react';
import { resetPassword } from '../api/auth';

const ResetPasswordSection = ({ token, onResetSuccess, onCancel }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState('');

    const handleSubmit = async (event) => {
        event.preventDefault();
        setFormError('');

        if (password !== confirmPassword) {
            setFormError('Passwords do not match');
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await resetPassword({ token, password });
            onResetSuccess(response.user);
        } catch (error) {
            setFormError(error.message || 'Failed to reset password');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <section className="auth-section">
            <div className="auth-card">
                <h2>Choose a new password</h2>
                <p className="auth-subtitle">
                    Pick a new password for your account. You will be signed in once it is saved.
                </p>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <div className="auth-field">
                        <label htmlFor="reset-password">New password</label>
                        <div className="password-field-wrapper">
                            <input
                                id="reset-password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                placeholder="Minimum 8 characters"
                                minLength={8}
                                required
                            />
                            <button
                                type="button"
                                className="password-visibility-toggle"
                                onClick={() => setShowPassword((previousState) => !previousState)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </div>
                    </div>

                    <div className="auth-field">
                        <label htmlFor="reset-confirm-password">Confirm new password</label>
                        <input
                            id="reset-confirm-password"
                            type={showPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            placeholder="Re-enter your new password"
                            minLength={8}
                            required
                        />
                    </div>

                    <button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : 'Save New Password'}
                    </button>
                </form>

                {formError && <p className="error-text">{formError}</p>}

                <button
                    type="button"
                    className="link-button"
                    onClick={onCancel}
                    disabled={isSubmitting}
                >
                    Back to sign in
                </button>
            </div>
        </section>
    );
};

export default ResetPasswordSection;
