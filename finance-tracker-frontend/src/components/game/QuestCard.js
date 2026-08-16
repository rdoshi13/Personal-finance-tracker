import React from 'react';
import { CheckIcon, ClockIcon } from '../shell/icons';

const QuestCard = ({ quest, onClaim, claiming }) => {
    const className = [
        'bq-quest',
        quest.done && !quest.unavailable ? 'done' : '',
        quest.unavailable ? 'off' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={className}>
            <div className="bq-qrow">
                <span className="bq-qic">
                    {quest.done && !quest.unavailable ? <CheckIcon size={14} strokeWidth="2.6" /> : <ClockIcon size={14} />}
                </span>
                <span>
                    <span className="bq-qn">{quest.name}</span><br />
                    <span className="bq-qd">{quest.description}</span>
                </span>
                <span className="bq-qxp">+{quest.xp} XP</span>
            </div>

            <div
                className="bq-qtrack"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(quest.progress || 0)}
                aria-label={`${quest.name} progress`}
            >
                <div className="bq-qfill" style={{ width: `${quest.progress || 0}%` }} />
            </div>

            <div className="bq-qfoot">
                <span>{quest.label}</span>
                {quest.claimed ? (
                    <button type="button" className="bq-claim" disabled>Claimed</button>
                ) : quest.claimable ? (
                    <button type="button" className="bq-claim" disabled={claiming} onClick={() => onClaim(quest.id)}>
                        {claiming ? 'Claiming…' : 'Claim reward'}
                    </button>
                ) : (
                    <span>{quest.unavailable ? 'Locked' : 'In progress'}</span>
                )}
            </div>
        </div>
    );
};

export default QuestCard;
