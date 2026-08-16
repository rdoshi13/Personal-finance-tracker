import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { initialsOf } from '../../lib/money';
import { FlameIcon, GridIcon, ListIcon, MedalIcon, StarIcon, TrendIcon } from './icons';

const NAV = [
    { id: 'dashboard', label: 'Dashboard', Icon: GridIcon },
    { id: 'transactions', label: 'Transactions', Icon: ListIcon },
    { id: 'quests', label: 'Quests', Icon: StarIcon },
    { id: 'achievements', label: 'Achievements', Icon: MedalIcon },
];

const Sidebar = () => {
    const {
        user, onLogout, view, setView, progress, quests,
        monthTransactions, transactions,
    } = useAppState();

    // The streak is derived from the same history the server uses, so the sidebar and
    // the achievement stay in agreement.
    const streak = React.useMemo(() => {
        const byMonth = {};
        transactions.forEach((t) => {
            const d = new Date(t.date);
            const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
            const amount = Number(t.amount) || 0;
            byMonth[key] = byMonth[key] || 0;
            byMonth[key] += t.type === 'income' ? amount : -amount;
        });
        const keys = Object.keys(byMonth).sort();
        if (!keys.length) return 0;
        let count = 0;
        let cursor = keys[keys.length - 1];
        while (byMonth[cursor] !== undefined && byMonth[cursor] > 0) {
            count += 1;
            let [y, m] = cursor.split('-').map(Number);
            m -= 1;
            if (m === 0) { m = 12; y -= 1; }
            cursor = `${y}-${String(m).padStart(2, '0')}`;
        }
        return count;
    }, [transactions]);

    const counts = {
        transactions: monthTransactions.length,
        quests: quests.filter((q) => q.claimable).length,
        achievements: (progress?.achievements || []).filter((a) => a.earned).length,
    };

    return (
        <aside className="bq-side">
            <div className="bq-brand">
                <span className="bq-brand-m"><TrendIcon size={16} strokeWidth="2.3" /></span>
                <div>
                    <div className="bq-brand-n">Budget Quest</div>
                    <div className="bq-brand-s">Level up your money</div>
                </div>
            </div>

            {progress && (
                <div className="bq-player">
                    <div className="bq-plv">
                        <div className="bq-lvl">{progress.level}</div>
                        <div>
                            <div className="bq-rank">{progress.rank}</div>
                            <div className="bq-rank-s">Level {progress.level}</div>
                        </div>
                    </div>
                    <div
                        className="bq-xpbar"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={progress.perLevel}
                        aria-valuenow={progress.intoLevel}
                        aria-label="Experience toward next level"
                    >
                        <div className="bq-xpfill" style={{ width: `${(progress.intoLevel / progress.perLevel) * 100}%` }} />
                    </div>
                    <div className="bq-xpmeta">
                        <span>{progress.xp.toLocaleString()} XP</span>
                        <span>{progress.toNextLevel} to next</span>
                    </div>
                    <div className="bq-streak">
                        <FlameIcon size={14} style={{ color: 'var(--gold)' }} />
                        <span><b>{streak}</b> month saving streak</span>
                    </div>
                </div>
            )}

            <nav className="bq-nav" aria-label="Sections">
                <div className="bq-nav-l">Play</div>
                {NAV.map(({ id, label, Icon }) => (
                    <button
                        key={id}
                        type="button"
                        className={view === id ? 'on' : ''}
                        aria-current={view === id ? 'page' : undefined}
                        onClick={() => setView(id)}
                    >
                        <Icon />
                        {label}
                        {counts[id] > 0 && <span className="bq-cnt">{counts[id]}</span>}
                    </button>
                ))}
            </nav>

            <div className="bq-side-f">
                <div className="bq-av">{initialsOf(user?.name || user?.email || '?')}</div>
                <div style={{ minWidth: 0 }}>
                    <div className="bq-mail">{user?.email}</div>
                    <button type="button" className="bq-signout" onClick={onLogout}>Sign out</button>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
