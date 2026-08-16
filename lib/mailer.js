const nodemailer = require('nodemailer');
const { RESET_TOKEN_TTL_MINUTES } = require('./passwordReset');

let cachedTransport = null;

const isSmtpConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransport = () => {
    if (cachedTransport) {
        return cachedTransport;
    }

    const port = Number(process.env.SMTP_PORT || 587);

    cachedTransport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    return cachedTransport;
};

const escapeHtml = (value) =>
    String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const buildPasswordResetEmail = ({ name, resetUrl }) => {
    const safeName = escapeHtml(name || 'there');
    const safeUrl = escapeHtml(resetUrl);

    const text = [
        `Hi ${name || 'there'},`,
        '',
        'We received a request to reset your Finance Tracker password.',
        `Open this link to choose a new one (it expires in ${RESET_TOKEN_TTL_MINUTES} minutes):`,
        '',
        resetUrl,
        '',
        'If you did not request this, you can ignore this email. Your password will not change.',
    ].join('\n');

    const html = [
        `<p>Hi ${safeName},</p>`,
        '<p>We received a request to reset your Finance Tracker password.</p>',
        `<p><a href="${safeUrl}">Choose a new password</a> (this link expires in ${RESET_TOKEN_TTL_MINUTES} minutes).</p>`,
        `<p>If the link does not work, copy this into your browser:<br><span>${safeUrl}</span></p>`,
        '<p>If you did not request this, you can ignore this email. Your password will not change.</p>',
    ].join('\n');

    return { text, html };
};

const sendPasswordResetEmail = async ({ to, name, resetUrl }) => {
    const { text, html } = buildPasswordResetEmail({ name, resetUrl });

    if (!isSmtpConfigured()) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('SMTP is not configured');
        }

        // Local development fallback: print the link instead of sending mail.
        console.log('\n--- Password reset email (SMTP not configured) ---');
        console.log(`To: ${to}`);
        console.log(resetUrl);
        console.log('--- end ---\n');
        return { delivered: false, previewedToConsole: true };
    }

    await getTransport().sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to,
        subject: 'Reset your Finance Tracker password',
        text,
        html,
    });

    return { delivered: true, previewedToConsole: false };
};

module.exports = {
    buildPasswordResetEmail,
    isSmtpConfigured,
    sendPasswordResetEmail,
};
