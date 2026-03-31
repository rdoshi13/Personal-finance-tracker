import React, { useState } from 'react';
import { login, signup } from '../api/auth';

const AuthSection = ({ onAuthSuccess }) => {
    const [mode, setMode] = useState('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState('');

    const isSignupMode = mode === 'signup';

    const resetForm = () => {
        setName('');
        setEmail('');
        setPassword('');
    };

    const toggleMode = () => {
        setFormError('');
        setMode((previousMode) => (previousMode === 'login' ? 'signup' : 'login'));
        resetForm();
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setFormError('');
        setIsSubmitting(true);

        try {
            if (isSignupMode) {
                const response = await signup({
                    name: name.trim(),
                    email: email.trim(),
                    password,
                });
                onAuthSuccess(response.user);
            } else {
                const response = await login({
                    email: email.trim(),
                    password,
                });
                onAuthSuccess(response.user);
            }
            resetForm();
        } catch (error) {
            setFormError(error.message || 'Authentication failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <section className="auth-section">
            <div className="auth-card">
                <h2>{isSignupMode ? 'Create account' : 'Sign in'}</h2>
                <p className="auth-subtitle">
                    {isSignupMode
                        ? 'Create your account to keep transactions private.'
                        : 'Sign in to access your personal transactions.'}
                </p>

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

                    <div className="auth-field">
                        <label htmlFor="auth-password">Password</label>
                        <input
                            id="auth-password"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder={isSignupMode ? 'Minimum 8 characters' : 'Enter password'}
                            minLength={8}
                            required
                        />
                    </div>

                    <button type="submit" disabled={isSubmitting}>
                        {isSubmitting
                            ? isSignupMode ? 'Creating account...' : 'Signing in...'
                            : isSignupMode ? 'Create Account' : 'Sign In'}
                    </button>
                </form>

                {formError && <p className="error-text">{formError}</p>}

                <button
                    type="button"
                    className="link-button"
                    onClick={toggleMode}
                    disabled={isSubmitting}
                >
                    {isSignupMode ? 'Already have an account? Sign in' : 'New here? Create an account'}
                </button>
            </div>
        </section>
    );
};

export default AuthSection;
