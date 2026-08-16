import React, { useState } from 'react';
import { useAppState } from '../state/AppStateContext';
import QuestCard from '../components/game/QuestCard';
import { periodLabel } from '../lib/money';

const QuestsView = () => {
    const { quests, claim, period } = useAppState();
    const [claimingId, setClaimingId] = useState(null);

    const handleClaim = async (questId) => {
        setClaimingId(questId);
        await claim(questId);
        setClaimingId(null);
    };

    const claimable = quests.filter((q) => q.claimable).length;

    return (
        <section className="bq-panel">
            <div className="bq-ph">
                <span className="bq-pt">Quests for {periodLabel(period)}</span>
                <span className="bq-grow" />
                <span className="bq-pn">
                    {claimable ? `${claimable} ready to claim` : 'Each month starts fresh'}
                </span>
            </div>
            <div className="bq-pb">
                {quests.length
                    ? quests.map((quest) => (
                        <QuestCard
                            key={quest.id}
                            quest={quest}
                            onClaim={handleClaim}
                            claiming={claimingId === quest.id}
                        />
                    ))
                    : <p style={{ color: 'var(--ink-3)', margin: 0 }}>No quests for this month yet.</p>}
            </div>
        </section>
    );
};

export default QuestsView;
