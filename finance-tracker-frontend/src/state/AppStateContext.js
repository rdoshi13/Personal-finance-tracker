import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { deleteTransaction, getTransactions, getYearSummary } from '../api/transactions';
import { getBudgets, toBudgetMap } from '../api/budgets';
import { claimQuest, getProgress, getQuests } from '../api/progress';
import { periodKeyOf, summarize } from '../lib/money';

const AppStateContext = createContext(null);

const THEME_KEY = 'finance-tracker-theme';

const currentPeriodKey = () => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * The original app opened on the current month and showed four $0.00 cards whenever
 * that month happened to be empty, which read as a broken app. Landing on the most
 * recent month that actually holds data fixes that; empty months are still reachable
 * from the month strip and get a real empty state instead of zeroes.
 */
const pickInitialPeriod = (transactions) => {
    if (!transactions.length) return currentPeriodKey();
    const keys = transactions.map((t) => periodKeyOf(t.date)).sort();
    const latest = keys[keys.length - 1];
    const now = currentPeriodKey();
    return keys.includes(now) ? now : latest;
};

const emptyToast = { id: 0, title: '', sub: '', kind: '' };

export const AppStateProvider = ({ children, user, onLogout }) => {
    const [transactions, setTransactions] = useState([]);
    const [budgets, setBudgets] = useState({});
    const [progress, setProgress] = useState(null);
    const [quests, setQuests] = useState([]);
    const [summary, setSummary] = useState([]);
    const [period, setPeriod] = useState(currentPeriodKey);
    const [periodTouched, setPeriodTouched] = useState(false);
    const [view, setView] = useState('dashboard');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [toasts, setToasts] = useState([]);
    const [theme, setTheme] = useState(
        () => window.localStorage.getItem(THEME_KEY) || 'dark'
    );

    const [filters, setFilters] = useState({ q: '', type: 'all', category: 'all', from: '', to: '' });
    const [sort, setSort] = useState({ key: 'date', dir: 'desc' });

    const pushToast = useCallback((title, sub, kind) => {
        const id = Date.now() + Math.random();
        setToasts((current) => [...current, { ...emptyToast, id, title, sub, kind }]);
        setTimeout(() => {
            setToasts((current) => current.filter((t) => t.id !== id));
        }, 3600);
    }, []);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        window.localStorage.setItem(THEME_KEY, theme);
    }, [theme]);

    const [year] = useMemo(() => [Number(period.split('-')[0])], [period]);

    const loadCore = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [txns, budgetPayload, progressPayload] = await Promise.all([
                getTransactions(),
                getBudgets().catch(() => ({ budgets: [] })),
                getProgress().catch(() => null),
            ]);
            const list = Array.isArray(txns) ? txns : [];
            setTransactions(list);
            setBudgets(toBudgetMap(budgetPayload));
            setProgress(progressPayload);
            setPeriod((current) => (periodTouched ? current : pickInitialPeriod(list)));
        } catch (loadError) {
            setError(loadError.message || 'Failed to load your data');
        } finally {
            setLoading(false);
        }
    }, [periodTouched]);

    useEffect(() => { loadCore(); }, [loadCore]);

    // Quests and the year summary are period-scoped, so they refresh on month change.
    const loadPeriodData = useCallback(async () => {
        const [y, m] = period.split('-');
        const [questPayload, summaryPayload] = await Promise.all([
            getQuests(y, Number(m)).catch(() => ({ quests: [] })),
            getYearSummary(y).catch(() => ({ months: [] })),
        ]);
        setQuests(questPayload.quests || []);
        setSummary(summaryPayload.months || []);
    }, [period]);

    useEffect(() => { loadPeriodData(); }, [loadPeriodData, transactions.length]);

    const monthTransactions = useMemo(
        () => transactions.filter((t) => periodKeyOf(t.date) === period),
        [transactions, period]
    );

    const totals = useMemo(() => summarize(monthTransactions), [monthTransactions]);

    const previousTotals = useMemo(() => {
        let [y, m] = period.split('-').map(Number);
        m -= 1;
        if (m === 0) { m = 12; y -= 1; }
        const key = `${y}-${String(m).padStart(2, '0')}`;
        return summarize(transactions.filter((t) => periodKeyOf(t.date) === key));
    }, [transactions, period]);

    const categories = useMemo(
        () => Array.from(new Set(transactions.map((t) => (t.category || 'Uncategorized').trim() || 'Uncategorized'))).sort(),
        [transactions]
    );

    const periodsWithData = useMemo(
        () => new Set(transactions.map((t) => periodKeyOf(t.date))),
        [transactions]
    );

    const latestPeriodWithData = useMemo(() => {
        const keys = Array.from(periodsWithData).sort();
        return keys[keys.length - 1] || null;
    }, [periodsWithData]);

    const goToPeriod = useCallback((next) => {
        setPeriodTouched(true);
        setPeriod(next);
    }, []);

    const stepPeriod = useCallback((direction) => {
        setPeriodTouched(true);
        setPeriod((current) => {
            let [y, m] = current.split('-').map(Number);
            m += direction;
            if (m < 1) { m = 12; y -= 1; }
            if (m > 12) { m = 1; y += 1; }
            return `${y}-${String(m).padStart(2, '0')}`;
        });
    }, []);

    const refreshProgress = useCallback(async () => {
        const payload = await getProgress().catch(() => null);
        if (payload) setProgress(payload);
    }, []);

    const claim = useCallback(async (questId) => {
        const [y, m] = period.split('-');
        try {
            const result = await claimQuest(y, Number(m), questId);
            pushToast(`+${result.awarded} XP`, 'Quest complete', 'xp');
            if (result.leveledUp) {
                setTimeout(() => pushToast(`Level ${result.level}`, `You are now a ${result.rank}`, 'win'), 450);
            }
            await Promise.all([refreshProgress(), loadPeriodData()]);
        } catch (claimError) {
            pushToast('Could not claim', claimError.message, '');
        }
    }, [period, pushToast, refreshProgress, loadPeriodData]);

    const removeTransaction = useCallback(async (id) => {
        const target = transactions.find((t) => (t._id || t.id) === id);
        setTransactions((current) => current.filter((t) => (t._id || t.id) !== id));
        try {
            await deleteTransaction(id);
            pushToast('Transaction removed', target ? target.name : '', '');
            await refreshProgress();
        } catch (deleteError) {
            pushToast('Delete failed', deleteError.message, '');
            loadCore();
        }
    }, [transactions, pushToast, refreshProgress, loadCore]);

    const value = useMemo(() => ({
        user, onLogout,
        transactions, monthTransactions, categories, budgets, setBudgets,
        progress, quests, summary, totals, previousTotals,
        period, goToPeriod, stepPeriod, periodsWithData, latestPeriodWithData, year,
        view, setView, filters, setFilters, sort, setSort,
        loading, error, theme, setTheme,
        toasts, pushToast, claim, removeTransaction, reload: loadCore, refreshProgress,
    }), [
        user, onLogout, transactions, monthTransactions, categories, budgets, progress, quests,
        summary, totals, previousTotals, period, goToPeriod, stepPeriod, periodsWithData,
        latestPeriodWithData, year, view, filters, sort, loading, error, theme, toasts,
        pushToast, claim, removeTransaction, loadCore, refreshProgress,
    ]);

    return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => {
    const context = useContext(AppStateContext);
    if (!context) throw new Error('useAppState must be used inside AppStateProvider');
    return context;
};

export { pickInitialPeriod, currentPeriodKey };
