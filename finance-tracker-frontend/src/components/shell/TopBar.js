import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { periodLabel } from '../../lib/money';
import { MoonIcon, PlusIcon, SearchIcon, SunIcon, UploadIcon } from './icons';

const TITLES = {
    dashboard: 'Dashboard',
    transactions: 'Transactions',
    quests: 'Quests',
    achievements: 'Achievements',
};

const TopBar = ({ onAdd, onImport, onOpenPalette }) => {
    const { view, period, theme, setTheme } = useAppState();

    return (
        <header className="bq-top">
            <div>
                <div className="bq-title">{TITLES[view]}</div>
                <div className="bq-sub">{periodLabel(period)}</div>
            </div>
            <div className="bq-grow" />

            <button type="button" className="bq-cmdbtn" onClick={onOpenPalette}>
                <SearchIcon size={13} />
                <span className="g">Search or run a command</span>
                <kbd className="bq-kbd">⌘K</kbd>
            </button>

            <button type="button" className="bq-ib" onClick={onImport} aria-label="Import statement">
                <UploadIcon size={15} />
            </button>
            <button
                type="button"
                className="bq-ib"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
                {theme === 'dark' ? <SunIcon size={15} /> : <MoonIcon size={15} />}
            </button>
            <button type="button" className="bq-btn bq-btn-g" onClick={onAdd}>
                <PlusIcon size={14} strokeWidth="2.4" />
                Add
            </button>
        </header>
    );
};

export default TopBar;
