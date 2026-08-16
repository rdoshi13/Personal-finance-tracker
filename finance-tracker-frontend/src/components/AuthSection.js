import React, { useState } from 'react';
import { forgotPassword, login, signup } from '../api/auth';

const AuthSection = ({ onAuthSuccess }) => {
    const [mode, setMode] = useState('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [statusMessage, setStatusMessage] = useState('');

    const isSignupMode = mode === 'signup';
    const isForgotMode = mode === 'forgot';

    const resetForm = () => {
        setName('');
        setEmail('');
        setPassword('');
    };

    const changeMode = (nextMode) => {
        setFormError('');
        setStatusMessage('');
        setMode(nextMode);
        setShowPassword(false);
        resetForm();
    };

    const toggleMode = () => {
        changeMode(isSignupMode ? 'login' : 'signup');
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setFormError('');
        setStatusMessage('');
        setIsSubmitting(true);

        try {
            if (isForgotMode) {
                const response = await forgotPassword({ email: email.trim() });
                setStatusMessage(
                    response?.message || 'If an account exists for that email, a reset link is on its way.'
                );
                resetForm();
            } else if (isSignupMode) {
                const response = await signup({
                    name: name.trim(),
                    email: email.trim(),
                    password,
                });
                onAuthSuccess(response.user);
                resetForm();
            } else {
                const response = await login({
                    email: email.trim(),
                    password,
                });
                onAuthSuccess(response.user);
                resetForm();
            }
        } catch (error) {
            setFormError(error.message || 'Authentication failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getHeading = () => {
        if (isForgotMode) {
            return 'Reset password';
        }
        return isSignupMode ? 'Create account' : 'Sign in';
    };

    const getSubtitle = () => {
        if (isForgotMode) {
            return 'Enter your email and we will send you a link to choose a new password.';
        }
        return isSignupMode
            ? 'Create your account to keep transactions private.'
            : 'Sign in to access your personal transactions.';
    };

    const getSubmitLabel = () => {
        if (isSubmitting) {
            if (isForgotMode) {
                return 'Sending link...';
            }
            return isSignupMode ? 'Creating account...' : 'Signing in...';
        }

        if (isForgotMode) {
            return 'Send Reset Link';
        }
        return isSignupMode ? 'Create Account' : 'Sign In';
    };

    return (
        <section className="auth-section">
            <div className="auth-card">
                <h2>{getHeading()}</h2>
                <p className="auth-subtitle">{getSubtitle()}</p>

                <form className="auth-form" onSubmit={handleSubmit}>
                    {isSignupMode && (
                        <div className="auth-field">
                            <label htmlFor="auth-name">Name</label>
                            <input
                                id="auth-name"
                                type="text"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="Enter your name"
                                required
                            />
                        </div>
                    )}

                    <div className="auth-field">
                        <label htmlFor="auth-email">Email</label>
                        <input
                            id="auth-email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="Enter your email"
                            required
                        />
                    </div>

                    {!isForgotMode && (
                        <div className="auth-field">
                            <label htmlFor="auth-password">Password</label>
                            <div className="password-field-wrapper">
                                <input
                                    id="auth-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder={isSignupMode ? 'Minimum 8 characters' : 'Enter password'}
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
                    )}

                    <button type="submit" disabled={isSubmitting}>
                        {getSubmitLabel()}
                    </button>
                </form>

                {formError && <p className="error-text">{formError}</p>}
                {statusMessage && <p className="success-text">{statusMessage}</p>}

                {mode === 'login' && (
                    <button
                        type="button"
                        className="link-button"
                        onClick={() => changeMode('forgot')}
                        disabled={isSubmitting}
                    >
                        Forgot your password?
                    </button>
                )}

                {isForgotMode ? (
                    <button
                        type="button"
                        className="link-button"
                        onClick={() => changeMode('login')}
                        disabled={isSubmitting}
                    >
                        Back to sign in
                    </button>
                ) : (
                    <button
                        type="button"
                        className="link-button"
                        onClick={toggleMode}
                        disabled={isSubmitting}
                    >
                        {isSignupMode ? 'Already have an account? Sign in' : 'New here? Create an account'}
                    </button>
                )}
            </div>
        </section>
    );
};

export default AuthSection;
