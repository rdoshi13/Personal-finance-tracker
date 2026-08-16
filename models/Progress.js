const mongoose = require('mongoose');

const ClaimSchema = new mongoose.Schema(
    {
        periodKey: { type: String, required: true },   // 'YYYY-MM'
        questId: { type: String, required: true },
        xpAwarded: { type: Number, required: true },
        claimedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const AchievementSchema = new mongoose.Schema(
    {
        id: { type: String, required: true },
        unlockedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const ProgressSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
        },
        xp: {
            type: Number,
            default: 0,
            min: 0,
        },
        claims: [ClaimSchema],
        achievements: [AchievementSchema],
        // Set by scripts/backfillProgress.js so a re-run cannot double-award.
        backfilledAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

ProgressSchema.methods.hasClaim = function hasClaim(periodKey, questId) {
    return this.claims.some((c) => c.periodKey === periodKey && c.questId === questId);
};

ProgressSchema.methods.hasAchievement = function hasAchievement(id) {
    return this.achievements.some((a) => a.id === id);
};

module.exports = mongoose.model('Progress', ProgressSchema);
