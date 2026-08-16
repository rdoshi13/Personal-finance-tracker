import React, { useCallback, useEffect, useState } from 'react';
import { useAppState } from '../../state/AppStateContext';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MonthStrip from './MonthStrip';
import StatusBar from './StatusBar';
import Toasts from './Toasts';
import CommandPalette from '../CommandPalette';
import DashboardView from '../../views/DashboardView';
import TransactionsView from '../../views/TransactionsView';
import QuestsView from '../../views/QuestsView';
import AchievementsView from '../../views/AchievementsView';
import AddTransaction from '../../AddTransaction';
import ImportStatementModal from '../ImportStatementModal';

const AppShell = () => {
    const { view, loading, error, reload, refreshProgress, pushToast } = useAppState();
    const [adding, setAdding] = useState(false);
    const [importing, setImporting] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);

    const openAdd = useCallback(() => setAdding(true), []);
    const openImport = useCallback(() => setImporting(true), []);

    const handleSaved = useCallback(async () => {
        setAdding(false);
        await reload();
        await refreshProgress();
        pushToast('Transaction saved', 'Your totals have been updated', 'xp');
    }, [reload, refreshProgress, pushToast]);

    const handleImported = useCallback(async () => {
        setImporting(false);
        await reload();
        await refreshProgress();
        pushToast('Statement imported', 'New transactions are in', 'xp');
    }, [reload, refreshProgress, pushToast]);

    // Shortcuts are ignored while typing so '/' and 'n' stay usable inside inputs.
    useEffect(() => {
        const onKeyDown = (event) => {
            const tag = document.activeElement?.tagName || '';
            const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(tag) || document.activeElement?.isContentEditable;

            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setPaletteOpen(true);
                return;
            }
            if (event.key === 'Escape') {
                setPaletteOpen(false);
                return;
            }
            if (typing || paletteOpen || adding || importing) return;

            if (event.key === 'n' || event.key === 'N') {
                event.preventDefault();
                openAdd();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [paletteOpen, adding, importing, openAdd]);

    return (
        <div className="bq-shell">
            <Sidebar />

            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <TopBar onAdd={openAdd} onImport={openImport} onOpenPalette={() => setPaletteOpen(true)} />

                <main className="bq-main">
                    <MonthStrip />

                    {error && (
                        <div className="bq-empty" style={{ marginBottom: 14 }}>
                            <h3>Could not load your data</h3>
                            <p>{error}</p>
                            <button type="button" className="bq-btn bq-btn-p" onClick={reload}>Try again</button>
                        </div>
                    )}

                    {loading && !error && (
                        <div className="bq-panel"><div className="bq-pb" style={{ color: 'var(--ink-3)' }}>Loading…</div></div>
                    )}

                    {!loading && !error && (
                        <>
                            {view === 'dashboard' && <DashboardView onAdd={openAdd} />}
                            {view === 'transactions' && <TransactionsView onAdd={openAdd} />}
                            {view === 'quests' && <QuestsView />}
                            {view === 'achievements' && <AchievementsView />}
                        </>
                    )}
                </main>

                <StatusBar />
            </div>

            {adding && (
                <div className="bq-ov" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setAdding(false); }}>
                    <div className="bq-modal" role="dialog" aria-modal="true" aria-label="Add transaction">
                        <div style={{ padding: 16 }}>
                            <AddTransaction onSaved={handleSaved} onCancel={() => setAdding(false)} editingTransaction={null} />
                        </div>
                    </div>
                </div>
            )}

            {importing && (
                <ImportStatementModal onClose={() => setImporting(false)} onImported={handleImported} />
            )}

            <CommandPalette
                open={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                onAdd={openAdd}
                onImport={openImport}
            />

            <Toasts />
        </div>
    );
};

export default AppShell;
