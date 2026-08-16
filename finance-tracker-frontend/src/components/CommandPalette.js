import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppState } from '../state/AppStateContext';
import { money, periodKeyOf } from '../lib/money';
import { ListIcon, PlusIcon } from './shell/icons';

const CommandPalette = ({ open, onClose, onAdd, onImport }) => {
    const { setView, stepPeriod, goToPeriod, theme, setTheme, transactions } = useAppState();
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(0);
    const inputRef = useRef(null);

    useEffect(() => {
        if (open) {
            setQuery('');
            setSelected(0);
            // Focus after the overlay paints, otherwise the caret lands nowhere.
            const id = setTimeout(() => inputRef.current?.focus(), 30);
            return () => clearTimeout(id);
        }
        return undefined;
    }, [open]);

    const commands = useMemo(() => [
        { label: 'Add transaction', sub: 'Open the form', run: onAdd },
        { label: 'Import statement', sub: 'Upload a CSV or PDF', run: onImport },
        { label: 'Go to Dashboard', sub: 'View', run: () => setView('dashboard') },
        { label: 'Go to Transactions', sub: 'View', run: () => setView('transactions') },
        { label: 'Go to Quests', sub: 'View', run: () => setView('quests') },
        { label: 'Go to Achievements', sub: 'View', run: () => setView('achievements') },
        { label: 'Next month', sub: 'Move forward', run: () => stepPeriod(1) },
        { label: 'Previous month', sub: 'Move back', run: () => stepPeriod(-1) },
        {
            label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
            sub: 'Appearance',
            run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
        },
    ], [onAdd, onImport, setView, stepPeriod, theme, setTheme]);

    const items = useMemo(() => {
        const q = query.trim().toLowerCase();
        const matchedCommands = commands
            .filter((c) => !q || c.label.toLowerCase().includes(q))
            .map((c) => ({ ...c, kind: 'command' }));

        if (!q) return matchedCommands;

        const matchedTransactions = transactions
            .filter((t) => String(t.name || '').toLowerCase().includes(q))
            .slice(0, 5)
            .map((t) => ({
                kind: 'transaction',
                label: t.name,
                sub: `${new Date(t.date).toISOString().slice(0, 10)} · ${money(t.amount)}`,
                run: () => {
                    goToPeriod(periodKeyOf(t.date));
                    setView('transactions');
                },
            }));

        return [...matchedCommands, ...matchedTransactions];
    }, [query, commands, transactions, goToPeriod, setView]);

    if (!open) return null;

    const run = (index) => {
        const item = items[index];
        if (!item) return;
        onClose();
        item.run();
    };

    const handleKeyDown = (event) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelected((s) => (items.length ? (s + 1) % items.length : 0));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelected((s) => (items.length ? (s - 1 + items.length) % items.length : 0));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            run(selected);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
        }
    };

    return (
        <div
            className="bq-ov"
            role="presentation"
            onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            <div className="bq-modal" role="dialog" aria-modal="true" aria-label="Command palette">
                <input
                    ref={inputRef}
                    className="bq-palin"
                    placeholder="Search transactions or run a command…"
                    value={query}
                    autoComplete="off"
                    onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
                    onKeyDown={handleKeyDown}
                />
                <div className="bq-pallist">
                    {items.length ? items.map((item, index) => (
                        <button
                            type="button"
                            key={`${item.kind}-${item.label}-${index}`}
                            className={`bq-palit ${index === selected ? 'sel' : ''}`}
                            onMouseEnter={() => setSelected(index)}
                            onClick={() => run(index)}
                        >
                            <span className="pi">
                                {item.kind === 'transaction' ? <ListIcon size={13} /> : <PlusIcon size={13} />}
                            </span>
                            <span>
                                <span className="pl">{item.label}</span><br />
                                <span className="ps">{item.sub}</span>
                            </span>
                        </button>
                    )) : (
                        <div style={{ padding: 22, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                            Nothing matches.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CommandPalette;
