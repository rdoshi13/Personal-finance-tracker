import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { LockIcon, MedalIcon } from '../components/shell/icons';

const AchievementsView = () => {
    const { progress } = useAppState();
    const achievements = progress?.achievements || [];
    const earned = achievements.filter((a) => a.earned).length;

    if (!achievements.length) {
        return <p style={{ color: 'var(--ink-3)' }}>Loading achievements…</p>;
    }

    return (
        <>
            <div className="bq-qh">
                <span className="bq-qt">
                    <MedalIcon size={16} style={{ color: 'var(--gold)' }} />
                    {earned} of {achievements.length} unlocked
                </span>
            </div>
            <div className="bq-badges">
                {achievements.map((badge) => (
                    <div key={badge.id} className={`bq-badge ${badge.earned ? 'unl' : 'lock'}`}>
                        <div className="bq-bic">
                            {badge.earned ? <MedalIcon size={22} /> : <LockIcon size={22} />}
                        </div>
                        <div className="bq-bn">{badge.name}</div>
                        <div className="bq-bd">{badge.description}</div>
                        <div className="bq-bs">{badge.earned ? 'Unlocked' : 'Locked'}</div>
                    </div>
                ))}
            </div>
        </>
    );
};

export default AchievementsView;
