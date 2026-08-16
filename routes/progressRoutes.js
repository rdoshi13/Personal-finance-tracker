const express = require('express');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const Progress = require('../models/Progress');
const { evaluateQuests, findQuest, periodKeyOf } = require('../lib/quests');
const { evaluateAchievements } = require('../lib/achievements');
const { describeXp } = require('../lib/xp');
const { ACHIEVEMENT_DEFINITIONS } = require('../lib/achievements');

const router = express.Router();

const getProgress = async (userId) => {
    const existing = await Progress.findOne({ userId });
    if (existing) return existing;
    return Progress.create({ userId, xp: 0, claims: [], achievements: [] });
};

const budgetMapFor = async (userId) => {
    const budgets = await Budget.find({ userId }).lean();
    return budgets.reduce((acc, b) => { acc[b.category] = b.monthlyLimit; return acc; }, {});
};

const monthWindow = (year, month) => {
    const start = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return { start, end };
};

const isValidPeriod = (year, month) =>
    Number.isInteger(Number(year)) && Number(year) > 1970 && Number(year) < 3000 &&
    Number.isInteger(Number(month)) && Number(month) >= 1 && Number(month) <= 12;

/** Re-derives achievements from history and persists any newly earned ones. */
const syncAchievements = async (userId, progress) => {
    const transactions = await Transaction.find({ userId }).lean();
    const budgetCount = await Budget.countDocuments({ userId });
    const evaluated = evaluateAchievements(transactions, budgetCount);

    let changed = false;
    evaluated.filter((a) => a.earned).forEach((a) => {
        if (!progress.hasAchievement(a.id)) {
            progress.achievements.push({ id: a.id, unlockedAt: new Date() });
            changed = true;
        }
    });
    if (changed) await progress.save();

    const unlocked = new Set(progress.achievements.map((a) => a.id));
    return ACHIEVEMENT_DEFINITIONS.map((def) => ({
        id: def.id,
        name: def.name,
        description: def.description,
        earned: unlocked.has(def.id),
        unlockedAt: (progress.achievements.find((a) => a.id === def.id) || {}).unlockedAt || null,
    }));
};

router.get('/', async (req, res) => {
    try {
        const progress = await getProgress(req.user.id);
        const achievements = await syncAchievements(req.user.id, progress);

        return res.status(200).json({
            ...describeXp(progress.xp),
            achievements,
            claims: progress.claims.map((c) => ({ periodKey: c.periodKey, questId: c.questId })),
        });
    } catch (error) {
        console.error('Failed to load progress:', error);
        return res.status(500).json({ message: 'Failed to load progress' });
    }
});

router.get('/quests/:year/:month', async (req, res) => {
    const { year, month } = req.params;
    if (!isValidPeriod(year, month)) {
        return res.status(400).json({ message: 'Invalid year or month' });
    }

    try {
        const { start, end } = monthWindow(year, month);
        const [transactions, budgets, progress] = await Promise.all([
            Transaction.find({ userId: req.user.id, date: { $gte: start, $lt: end } }).lean(),
            budgetMapFor(req.user.id),
            getProgress(req.user.id),
        ]);

        const periodKey = `${year}-${String(Number(month)).padStart(2, '0')}`;
        const quests = evaluateQuests(transactions, budgets).map((quest) => ({
            ...quest,
            claimed: progress.hasClaim(periodKey, quest.id),
            claimable: quest.done && !quest.unavailable && !progress.hasClaim(periodKey, quest.id),
        }));

        return res.status(200).json({ periodKey, quests });
    } catch (error) {
        console.error('Failed to load quests:', error);
        return res.status(500).json({ message: 'Failed to load quests' });
    }
});

router.post('/quests/:year/:month/:questId/claim', async (req, res) => {
    const { year, month, questId } = req.params;
    if (!isValidPeriod(year, month)) {
        return res.status(400).json({ message: 'Invalid year or month' });
    }

    const definition = findQuest(questId);
    if (!definition) {
        return res.status(404).json({ message: 'Unknown quest' });
    }

    try {
        const periodKey = `${year}-${String(Number(month)).padStart(2, '0')}`;
        const progress = await getProgress(req.user.id);

        if (progress.hasClaim(periodKey, questId)) {
            return res.status(409).json({ message: 'Reward already claimed', ...describeXp(progress.xp) });
        }

        // Never trust the client's word that a quest is finished — recompute it here.
        const { start, end } = monthWindow(year, month);
        const [transactions, budgets] = await Promise.all([
            Transaction.find({ userId: req.user.id, date: { $gte: start, $lt: end } }).lean(),
            budgetMapFor(req.user.id),
        ]);

        const quest = evaluateQuests(transactions, budgets).find((q) => q.id === questId);
        if (!quest || !quest.done || quest.unavailable) {
            return res.status(400).json({ message: 'That quest is not complete yet' });
        }

        const before = describeXp(progress.xp);
        progress.claims.push({ periodKey, questId, xpAwarded: definition.xp });
        progress.xp += definition.xp;
        await progress.save();
        const after = describeXp(progress.xp);

        return res.status(200).json({
            awarded: definition.xp,
            leveledUp: after.level > before.level,
            ...after,
        });
    } catch (error) {
        console.error('Failed to claim quest:', error);
        return res.status(500).json({ message: 'Failed to claim reward' });
    }
});

module.exports = router;
