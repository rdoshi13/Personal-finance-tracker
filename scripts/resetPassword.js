require('dotenv').config();
const readline = require('readline');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const promptHidden = (question) =>
    new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const onData = (char) => {
            if (String(char) === '\n' || String(char) === '\r' || String(char) === '') {
                process.stdin.removeListener('data', onData);
            } else {
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);
                process.stdout.write(question);
            }
        };

        process.stdin.on('data', onData);
        rl.question(question, (answer) => {
            rl.close();
            process.stdout.write('\n');
            resolve(answer);
        });
    });

const run = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not configured');
    }

    const email = String(process.argv[2] || '').trim().toLowerCase();
    if (!email) {
        throw new Error('Usage: node scripts/resetPassword.js <email>');
    }

    await mongoose.connect(process.env.MONGO_URI);

    const user = await User.findOne({ email });
    if (!user) {
        throw new Error(`No account found for ${email}`);
    }

    const password = await promptHidden(`New password for ${email}: `);
    if (password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
    }

    const confirmation = await promptHidden('Confirm new password: ');
    if (password !== confirmation) {
        throw new Error('Passwords do not match');
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    await user.save();

    console.log(`Password updated for ${email}.`);
    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error('Password reset failed:', error.message);
    try {
        await mongoose.disconnect();
    } catch (disconnectError) {
        console.error('Disconnect failed:', disconnectError.message);
    }
    process.exit(1);
});
