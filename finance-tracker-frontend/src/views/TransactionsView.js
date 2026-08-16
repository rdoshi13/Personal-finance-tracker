import React, { useMemo } from 'react';
import { useAppState } from '../state/AppStateContext';
import { categoryColor } from '../lib/categoryColor';
import { isIncome, money, summarize } from '../lib/money';
import { PlusIcon, TrashIcon } from '../components/shell/icons';

const COLUMNS = [
    { key: 'date', label: 'Date', sortable: true },
    { key: 'name', label: 'Name', sortable: true },
    { key: 'category', label: 'Category', sortable: true },
    { key: 'description', label: 'Description', sortable: false },
    { key: 'amount', label: 'Amount', sortable: true, right: true },
];

const TransactionsView = ({ onAdd }) => {
    const {
        monthTransactions, categories, filters, setFilters, sort, setSort, removeTransaction,
    } = useAppState();

    const rows = useMemo(() => {
        let list = [...monthTransactions];
        const q = filters.q.trim().toLowerCase();

        if (q) {
            list = list.filter(
                (t) =>
                    String(t.name || '').toLowerCase().includes(q) ||
                    String(t.description || '').toLowerCase().includes(q)
            );
        }
        if (filters.type !== 'all') {
            list = filters.type === 'income'
                ? list.filter(isIncome)
                : list.filter((t) => !isIncome(t));
        }
        if (filters.category !== 'all') {
            list = list.filter((t) => (t.category || 'Uncategorized') === filters.category);
        }
        if (filters.from) list = list.filter((t) => new Date(t.date) >= new Date(`${filters.from}T00:00:00Z`));
        if (filters.to) list = list.filter((t) => new Date(t.date) <= new Date(`${filters.to}T23:59:59Z`));

        const direction = sort.dir === 'asc' ? 1 : -1;
        return list.sort((a, b) => {
            if (sort.key === 'amount') return (Number(a.amount) - Number(b.amount)) * direction;
            if (sort.key === 'date') return (new Date(a.date) - new Date(b.date)) * direction;
            return String(a[sort.key] || '').localeCompare(String(b[sort.key] || '')) * direction;
        });
    }, [monthTransactions, filters, sort]);

    const shownTotals = useMemo(() => summarize(rows), [rows]);

    const toggleSort = (key) =>
        setSort((current) => ({
            key,
            dir: current.key === key && current.dir === 'desc' ? 'asc' : 'desc',
        }));

    const update = (patch) => setFilters((current) => ({ ...current, ...patch }));

    return (
        <section className="bq-panel">
            <div className="bq-ph">
                <span className="bq-pt">Transactions</span>
                <span className="bq-pn">{rows.length} of {monthTransactions.length}</span>
                <span className="bq-grow" />
                <button type="button" className="bq-btn bq-btn-sm" onClick={onAdd}>
                    <PlusIcon size={13} strokeWidth="2.4" /> New
                </button>
            </div>

            <div className="bq-frow">
                <div className="bq-fld" style={{ flex: 1, minWidth: 180 }}>
                    <label htmlFor="bq-q">Search</label>
                    <input
                        id="bq-q" className="bq-inp" type="search" placeholder="Name or description"
                        value={filters.q} onChange={(e) => update({ q: e.target.value })}
                    />
                </div>
                <div className="bq-fld">
                    <label htmlFor="bq-type">Type</label>
                    <select id="bq-type" className="bq-inp" value={filters.type} onChange={(e) => update({ type: e.target.value })}>
                        <option value="all">All</option>
                        <option value="income">Income</option>
                        <option value="outflow">Expense</option>
                    </select>
                </div>
                <div className="bq-fld">
                    <label htmlFor="bq-cat">Category</label>
                    <select id="bq-cat" className="bq-inp" value={filters.category} onChange={(e) => update({ category: e.target.value })}>
                        <option value="all">All categories</option>
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="bq-fld">
                    <label htmlFor="bq-from">From</label>
                    <input id="bq-from" className="bq-inp" type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} />
                </div>
                <div className="bq-fld">
                    <label htmlFor="bq-to">To</label>
                    <input id="bq-to" className="bq-inp" type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} />
                </div>
                <button
                    type="button"
                    className="bq-btn"
                    onClick={() => setFilters({ q: '', type: 'all', category: 'all', from: '', to: '' })}
                >
                    Clear
                </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table className="bq-table">
                    <thead>
                        <tr>
                            {COLUMNS.map((col) => (
                                <th
                                    key={col.key}
                                    className={`${col.sortable ? 'sortable' : ''} ${col.right ? 'r' : ''}`}
                                    onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                                    aria-sort={
                                        sort.key === col.key
                                            ? (sort.dir === 'asc' ? 'ascending' : 'descending')
                                            : undefined
                                    }
                                    scope="col"
                                >
                                    {col.label}
                                    {sort.key === col.key && (
                                        <span style={{ opacity: .5, fontSize: 9, marginLeft: 4 }}>
                                            {sort.dir === 'asc' ? '▲' : '▼'}
                                        </span>
                                    )}
                                </th>
                            ))}
                            <th className="r" scope="col"><span className="bq-sr-only" /></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length ? rows.map((t) => {
                            const id = t._id || t.id;
                            const income = isIncome(t);
                            return (
                                <tr key={id}>
                                    <td className="bq-num" style={{ color: 'var(--ink-2)' }}>
                                        {new Date(t.date).toISOString().slice(0, 10)}
                                    </td>
                                    <td className="bq-tn">{t.name}</td>
                                    <td>
                                        <span className="bq-tag">
                                            <span className="bq-cdot" style={{ background: categoryColor(t.category) }} />
                                            {t.category || 'Uncategorized'}
                                        </span>
                                    </td>
                                    <td><div className="bq-tdesc">{t.description || '—'}</div></td>
                                    <td className={`bq-tamt bq-num ${income ? 'bq-pos' : 'bq-neg'}`}>
                                        <span className={`bq-dirt ${income ? 'cr' : 'dr'}`}>{income ? 'CR' : 'DR'}</span>
                                        {money(t.amount)}
                                    </td>
                                    <td className="bq-tamt">
                                        <span className="bq-ract">
                                            <button
                                                type="button"
                                                className="bq-mini"
                                                aria-label={`Delete ${t.name}`}
                                                onClick={() => removeTransaction(id)}
                                            >
                                                <TrashIcon size={11} strokeWidth="2.2" />
                                            </button>
                                        </span>
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr>
                                <td colSpan={6} style={{ padding: 34, textAlign: 'center', color: 'var(--ink-3)' }}>
                                    No transactions match these filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div style={{ padding: '11px 15px', color: 'var(--ink-3)', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span>{rows.length} shown</span>
                <span>
                    Net of shown ·{' '}
                    <strong className={`bq-num ${shownTotals.net >= 0 ? 'bq-pos' : 'bq-neg'}`}>
                        {shownTotals.net >= 0 ? '+' : '−'}{money(shownTotals.net)}
                    </strong>
                </span>
            </div>
        </section>
    );
};

export default TransactionsView;
