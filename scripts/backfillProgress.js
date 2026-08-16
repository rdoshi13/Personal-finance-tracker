require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Progress = require('../models/Progress');
const { evaluateAchievements, computeStreak, groupByMonth } = require('../lib/achievements');
const { summarize } = require('../lib/quests');
const { XP_RULES, describeXp } = require('../lib/xp');

const FORCE = process.argv.includes('--force');

// Seeds XP and achievements from history so an existing account does not open the
// gamified UI at level 1 while holding years of data. Idempotent: a user whose
// Progress row is already backfilled is skipped unless --force is passed.
const backfillUser = async (user) => {
    const existing = await Progress.findOne({ userId: user._id });

    if (existing && existing.backfilledAt && !FORCE) {
        return { email: user.email, skipped: true };
    }

    const transactions = await Transaction.find({ userId: user._id }).lean();
    const budgetCount = await Budget.countDocuments({ userId: user._id });

    const manual = transactions.filter((t) => !t.importBatchId && !t.importHash).length;
    const imported = transactions.length - manual;
    const baseXp = manual * XP_RULES.transaction + imported * XP_RULES.imported;

    // Re-running must not wipe XP already earned by claiming quests, so history-derived
    // XP is added to what claims have already paid out rather than replacing it.
    const claimedXp = existing
        ? existing.claims.reduce((sum, claim) => sum + (claim.xpAwarded || 0), 0)
        : 0;
    const xp = baseXp + claimedXp;

    const earned = evaluateAchievements(transactions, budgetCount).filter((a) => a.earned);

    const grouped = groupByMonth(transactions);
    const byMonth = {};
    Object.entries(grouped).forEach(([key, list]) => { byMonth[key] = summarize(list); });

    const progress = existing || new Progress({ userId: user._id });
    progress.xp = xp;
    // Claims are intentionally left empty: past quests stay claimable so the user
    // gets something to collect on their first visit.
    progress.achievements = earned.map((a) => ({
        id: a.id,
        unlockedAt: progress.hasAchievement(a.id)
            ? progress.achievements.find((x) => x.id === a.id).unlockedAt
            : new Date(),
    }));
    progress.backfilledAt = new Date();
    await progress.save();

    const described = describeXp(xp);
    return {
        email: user.email,
        transactions: transactions.length,
        manual,
        imported,
        baseXp,
        claimedXp,
        xp,
        level: described.level,
        rank: described.rank,
        streak: computeStreak(byMonth),
        achievements: earned.length,
        months: Object.keys(byMonth).length,
    };
};

const run = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI is not configured');
    }

    await mongoose.connect(process.env.MONGO_URI);

    const emailArg = process.argv.find((a) => a.includes('@'));
    const query = emailArg ? { email: emailArg.trim().toLowerCase() } : {};
    const users = await User.find(query);

    if (!users.length) {
        console.log(emailArg ? `No account found for ${emailArg}` : 'No users found.');
        await mongoose.disconnect();
        return;
    }

    for (const user of users) {
        const result = await backfillUser(user);
        if (result.skipped) {
            console.log(`- ${result.email}: already backfilled (use --force to redo)`);
        } else {
            console.log(
                `- ${result.email}: ${result.transactions} transactions ` +
                `(${result.manual} manual, ${result.imported} imported) across ${result.months} months ` +
                `→ ${result.xp} XP, level ${result.level} ${result.rank}, ` +
                `${result.achievements} achievements, ${result.streak} month streak`
            );
        }
    }

    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error('Backfill failed:', error.message);
    try { await mongoose.disconnect(); } catch (e) { /* already closed */ }
    process.exit(1);
});
