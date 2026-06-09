import React, { useMemo, useState } from 'react';
import { importTransactions, previewTransactionImport } from '../api/transactions';

const CATEGORY_OPTIONS = ['Salary', 'Freelance', 'Investment', 'Interest', 'Bonus', 'Gift', 'Tax Refund', 'Groceries', 'Housing', 'Transport', 'Health', 'Food', 'Entertainment', 'Transfer', 'Credit Card Payment', 'Subscription', 'Streaming', 'Software', 'Utilities', 'Cloud', 'Gym', 'Membership', 'Misc'];
const TYPE_OPTIONS = ['expense', 'income', 'subscription'];

const getRowKey = (row, index) => row.importHash || `${row.rowNumber || 'row'}-${index}`;
const isImportableRow = (row) =>
    row.status !== 'duplicate' &&
    Boolean(row.date) &&
    Boolean(String(row.name || '').trim()) &&
    Number(row.amount) > 0 &&
    TYPE_OPTIONS.includes(row.type);

const ImportStatementModal = ({ onClose, onImported }) => {
    const [sourceAccount, setSourceAccount] = useState('');
    const [previewData, setPreviewData] = useState(null);
    const [rows, setRows] = useState([]);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState('');
    const [summary, setSummary] = useState(null);

    const importableCount = useMemo(() => rows.filter(isImportableRow).length, [rows]);

    const handleFileChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setError('');
        setSummary(null);
        setIsPreviewing(true);

        try {
            const data = await previewTransactionImport(file, sourceAccount);
            setPreviewData(data);
            setRows(Array.isArray(data.rows) ? data.rows : []);
        } catch (previewError) {
            setPreviewData(null);
            setRows([]);
            setError(previewError.message || 'Failed to preview statement import');
        } finally {
            setIsPreviewing(false);
        }
    };

    const updateRow = (index, field, value) => {
        setRows((previousRows) =>
            previousRows.map((row, rowIndex) =>
                rowIndex === index
                    ? {
                        ...row,
                        [field]: value,
                        status: row.status === 'ready' ? row.status : 'ready',
                        errors: field ? [] : row.errors,
                    }
                    : row
            )
        );
    };

    const handleImport = async () => {
        setError('');
        setSummary(null);
        setIsImporting(true);

        try {
            const data = await importTransactions(rows.filter(isImportableRow), {
                filename: previewData?.filename || '',
                fileHash: previewData?.fileHash || '',
                sourceAccount,
            });
            setSummary(data);
            onImported(data.transactions || []);
        } catch (importError) {
            setError(importError.message || 'Failed to import transactions');
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="form-modal-overlay" onClick={onClose} role="presentation">
            <div className="form-modal-content import-modal-content" onClick={(event) => event.stopPropagation()}>
                <button
                    type="button"
                    className="modal-close-button"
                    onClick={onClose}
                    aria-label="Close import statement"
                >
                    ×
                </button>

                <div className="form-container import-modal">
                    <h2 className="transaction-form-title">Import Statement</h2>

                    <div className="import-controls">
                        <label className="transaction-form-field">
                            <span>Source account</span>
                            <input
                                type="text"
                                value={sourceAccount}
                                onChange={(event) => setSourceAccount(event.target.value)}
                                placeholder="Optional account nickname"
                            />
                        </label>
                        <label className="transaction-form-field">
                            <span>Statement file</span>
                            <input
                                type="file"
                                accept=".csv,.pdf,text/csv,application/pdf"
                                onChange={handleFileChange}
                                disabled={isPreviewing || isImporting}
                            />
                        </label>
                    </div>

                    {isPreviewing && <p className="filter-summary">Reading statement...</p>}
                    {error && <p className="error-text">{error}</p>}
                    {previewData && (
                        <div className="import-summary-grid" aria-label="Import preview summary">
                            <span>Total rows: {previewData.totalRows}</span>
                            <span>Ready: {previewData.summary?.ready || 0}</span>
                            <span>Duplicates: {previewData.summary?.duplicate || 0}</span>
                            <span>Invalid: {previewData.summary?.invalid || 0}</span>
                        </div>
                    )}
                    {summary && (
                        <p className="success-text">
                            Imported {summary.imported}, skipped {summary.skipped}, failed {summary.failed}.
                        </p>
                    )}

                    {rows.length > 0 && (
                        <>
                            <div className="import-table-wrap">
                                <table className="import-table">
                                    <thead>
                                        <tr>
                                            <th>Status</th>
                                            <th>Date</th>
                                            <th>Name</th>
                                            <th>Amount</th>
                                            <th>Type</th>
                                            <th>Category</th>
                                            <th>Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row, index) => (
                                            <tr key={getRowKey(row, index)} className={`import-row-${row.status}`}>
                                                <td>
                                                    <span className="import-status">{row.status}</span>
                                                    {row.errors?.length > 0 && (
                                                        <span className="import-row-error">{row.errors.join(', ')}</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <input
                                                        type="date"
                                                        value={row.date || ''}
                                                        onChange={(event) => updateRow(index, 'date', event.target.value)}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        value={row.name || ''}
                                                        onChange={(event) => updateRow(index, 'name', event.target.value)}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={row.amount || ''}
                                                        onChange={(event) => updateRow(index, 'amount', event.target.value)}
                                                    />
                                                </td>
                                                <td>
                                                    <select
                                                        value={row.type || 'expense'}
                                                        onChange={(event) => updateRow(index, 'type', event.target.value)}
                                                    >
                                                        {TYPE_OPTIONS.map((typeOption) => (
                                                            <option key={typeOption} value={typeOption}>
                                                                {typeOption}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <select
                                                        value={CATEGORY_OPTIONS.includes(row.category) ? row.category : 'Misc'}
                                                        onChange={(event) => updateRow(index, 'category', event.target.value)}
                                                    >
                                                        {CATEGORY_OPTIONS.map((categoryOption) => (
                                                            <option key={categoryOption} value={categoryOption}>
                                                                {categoryOption}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        value={row.description || ''}
                                                        onChange={(event) => updateRow(index, 'description', event.target.value)}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="form-buttons">
                                <button
                                    type="button"
                                    disabled={isImporting || importableCount === 0}
                                    onClick={handleImport}
                                >
                                    {isImporting ? 'Importing...' : `Import ${importableCount} transactions`}
                                </button>
                                <button type="button" className="secondary-button" onClick={onClose} disabled={isImporting}>
                                    Close
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportStatementModal;
