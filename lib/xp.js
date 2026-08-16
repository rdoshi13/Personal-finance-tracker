const XP_PER_LEVEL = 300;

const XP_RULES = {
    transaction: 10,   // per manually logged transaction
    imported: 4,       // per imported row — cheaper, since importing is one action
};

const RANKS = [
    { minLevel: 1, name: 'Bronze Beginner' },
    { minLevel: 4, name: 'Silver Saver' },
    { minLevel: 7, name: 'Gold Guardian' },
    { minLevel: 10, name: 'Platinum Planner' },
];

const levelForXp = (xp) => Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;

const rankForLevel = (level) =>
    RANKS.filter((rank) => level >= rank.minLevel).pop().name;

const describeXp = (xp) => {
    const safeXp = Math.max(0, Number(xp) || 0);
    const level = levelForXp(safeXp);
    const intoLevel = safeXp % XP_PER_LEVEL;

    return {
        xp: safeXp,
        level,
        rank: rankForLevel(level),
        intoLevel,
        perLevel: XP_PER_LEVEL,
        toNextLevel: XP_PER_LEVEL - intoLevel,
    };
};

module.exports = {
    RANKS,
    XP_PER_LEVEL,
    XP_RULES,
    describeXp,
    levelForXp,
    rankForLevel,
};
