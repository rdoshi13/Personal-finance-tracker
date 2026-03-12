import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import TransactionsSection from './components/TransactionsSection';
import MonthlyReportSection from './components/MonthlyReportSection';
import MonthlySummaryCards from './components/MonthlySummaryCards';
import { deleteTransaction, getMonthlyReport, getTransactions } from './api/transactions';

const THEME_STORAGE_KEY = 'finance-tracker-theme';
const currentDate = new Date();
const defaultYear = String(currentDate.getFullYear());
const defaultMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
const currentYear = currentDate.getFullYear();
const currentMonthIndex = currentDate.getMonth();

const getMonthDateRange = (year, month) => {
    const startDate = new Date(`${year}-${month}-01T00:00:00`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    return { startDate, endDate };
};

const buildBreakdownByTypeFromTransactions = (transactions, year, month) => {
    const { startDate, endDate } = getMonthDateRange(year, month);

    return transactions.reduce((breakdown, transaction) => {
        if (!transaction?.date) return breakdown;

        const transactionDate = new Date(transaction.date);
        if (Number.isNaN(transactionDate.getTime())) return breakdown;
        if (transactionDate < startDate || transactionDate >= endDate) return breakdown;

        const category = transaction.category || 'Uncategorized';
        const amount = Number(transaction.amount) || 0;
        const normalizedType = String(transaction.type || '').toLowerCase();
        const typeKey = normalizedType === 'income' ? 'income' : 'outflow';

        if (!breakdown[typeKey][category]) {
            breakdown[typeKey][category] = { total: 0, transactions: 0 };
        }

        breakdown[typeKey][category].total += amount;
        breakdown[typeKey][category].transactions += 1;
        return breakdown;
    }, { income: {}, outflow: {} });
};

const hasTypedBreakdown = (data) => {
    const incomeEntries = Object.keys(data?.breakdownByType?.income || {});
    const outflowEntries = Object.keys(data?.breakdownByType?.outflow || {});
    return incomeEntries.length > 0 || outflowEntries.length > 0;
};

const countBreakdownEntries = (breakdown) =>
    Object.keys(breakdown?.income || {}).length + Object.keys(breakdown?.outflow || {}).length;
const formatCurrency = (value) =>
    new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
    }).format(Number(value) || 0);
const sortEntriesByTotalDesc = (entries) =>
    [...entries].sort(([, leftSummary], [, rightSummary]) => (rightSummary?.total ?? 0) - (leftSummary?.total ?? 0));
const getMonthlyTransactions = (sourceTransactions, year, month) => {
    const { startDate, endDate } = getMonthDateRange(year, month);
    return sourceTransactions
        .filter((transaction) => {
            if (!transaction?.date) return false;
            const transactionDate = new Date(transaction.date);
            if (Number.isNaN(transactionDate.getTime())) return false;
            return transactionDate >= startDate && transactionDate < endDate;
        })
        .sort((left, right) => {
            const leftDate = new Date(left.date).getTime();
            const rightDate = new Date(right.date).getTime();
            return rightDate - leftDate;
        });
};

const MoonIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 13.4A8.5 8.5 0 1 1 10.6 3a7 7 0 1 0 10.4 10.4z" />
    </svg>
);

const SunIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4a1 1 0 0 1 1 1v1.5a1 1 0 0 1-2 0V5a1 1 0 0 1 1-1zm0 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 4a1 1 0 0 1 1 1v1.5a1 1 0 0 1-2 0V21a1 1 0 0 1 1-1zm8-9a1 1 0 0 1 1 1 1 1 0 0 1-1 1h-1.5a1 1 0 0 1 0-2H20zM5.5 12a1 1 0 0 1 0 2H4a1 1 0 0 1-1-1 1 1 0 0 1 1-1h1.5zm11.08 5.58a1 1 0 0 1 1.41 0l1.06 1.06a1 1 0 0 1-1.41 1.41l-1.06-1.06a1 1 0 0 1 0-1.41zM5.95 4.95a1 1 0 0 1 1.41 0l1.06 1.06a1 1 0 1 1-1.41 1.41L5.95 6.36a1 1 0 0 1 0-1.41zm12.1 0a1 1 0 0 1 0 1.41l-1.06 1.06a1 1 0 0 1-1.41-1.41l1.06-1.06a1 1 0 0 1 1.41 0zm-12.1 12.1a1 1 0 0 1 1.41 0l1.06 1.06a1 1 0 0 1-1.41 1.41L5.95 18.46a1 1 0 0 1 0-1.41z" />
    </svg>
);

const Report = () => {
    const [theme, setTheme] = useState(() => {
        const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        return savedTheme === 'dark' ? 'dark' : 'light';
    });
    const [reportData, setReportData] = useState(null);
    const [reportError, setReportError] = useState('');
    const [isReportLoading, setIsReportLoading] = useState(false);
    const [transactions, setTransactions] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedType, setSelectedType] = useState('all');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [year, setYear] = useState(defaultYear);
    const [month, setMonth] = useState(defaultMonth);
    const [isFormVisible, setFormVisible] = useState(false); // Toggle form visibility
    const [isTransactionEditMode, setTransactionEditMode] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState(null);
    const reportEntries = Object.entries(reportData?.report || {});
    const categoryOptions = Array.from(
        new Set(
            transactions
                .map((transaction) => transaction.category || 'Uncategorized')
                .filter(Boolean)
        )
    ).sort((left, right) => left.localeCompare(right));
    const monthlySummary = transactions.reduce((summary, transaction) => {
        if (!transaction?.date) return summary;

        const transactionDate = new Date(transaction.date);
        if (Number.isNaN(transactionDate.getTime())) return summary;

        const isCurrentMonth =
            transactionDate.getFullYear() === currentYear &&
            transactionDate.getMonth() === currentMonthIndex;

        if (!isCurrentMonth) return summary;

        const amount = Number(transaction.amount) || 0;
        summary.transactionCount += 1;

        if (transaction.type === 'income') {
            summary.income += amount;
        } else if (transaction.type === 'expense' || transaction.type === 'subscription') {
            summary.expenses += amount;
        }

        summary.net = summary.income - summary.expenses;
        return summary;
    }, {
        income: 0,
        expenses: 0,
        net: 0,
        transactionCount: 0,
    });
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const filteredTransactions = transactions.filter((transaction) => {
        const transactionDate = transaction?.date ? new Date(transaction.date) : null;
        const hasValidDate = transactionDate && !Number.isNaN(transactionDate.getTime());

        const matchesType = selectedType === 'all' || transaction.type === selectedType;
        const matchesCategory =
            selectedCategory === 'all' || (transaction.category || 'Uncategorized') === selectedCategory;

        const searchBlob = [
            transaction.name,
            transaction.description,
            transaction.category,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        const matchesSearch = !normalizedSearch || searchBlob.includes(normalizedSearch);

        const startBoundary = startDate ? new Date(`${startDate}T00:00:00`) : null;
        const endBoundary = endDate ? new Date(`${endDate}T23:59:59.999`) : null;
        const matchesStartDate = !startBoundary || (hasValidDate && transactionDate >= startBoundary);
        const matchesEndDate = !endBoundary || (hasValidDate && transactionDate <= endBoundary);

        return matchesType && matchesCategory && matchesSearch && matchesStartDate && matchesEndDate;
    });

    const formatDate = (dateValue) => {
        if (!dateValue) return 'No date';
        const parsedDate = new Date(dateValue);
        return Number.isNaN(parsedDate.getTime()) ? 'Invalid date' : parsedDate.toLocaleDateString();
    };

    const openAddForm = () => {
        setEditingTransaction(null);
        setFormVisible(true);
    };

    const openEditForm = (transaction) => {
        setEditingTransaction(transaction);
        setFormVisible(true);
    };

    const toggleTransactionEditMode = () => {
        setTransactionEditMode((previousMode) => !previousMode);
    };
    const toggleTheme = () => {
        setTheme((previousTheme) => (previousTheme === 'dark' ? 'light' : 'dark'));
    };

    const closeForm = () => {
        setFormVisible(false);
        setEditingTransaction(null);
    };

    const clearTransactionFilters = () => {
        setSearchQuery('');
        setSelectedType('all');
        setSelectedCategory('all');
        setStartDate('');
        setEndDate('');
    };

    const handleTransactionSaved = (savedTransaction, mode) => {
        if (mode === 'edit') {
            setTransactions((previousTransactions) =>
                previousTransactions.map((transaction) =>
                    transaction._id === savedTransaction._id ? savedTransaction : transaction
                )
            );
        } else {
            setTransactions((previousTransactions) => [savedTransaction, ...previousTransactions]);
        }

        closeForm();
    };

    // Fetch the report data from the backend
    const fetchReport = async () => {
        setIsReportLoading(true);
        setReportError('');

        try {
            const data = await getMonthlyReport(year, month);
            const dataHasTypedBreakdown = hasTypedBreakdown(data);

            let transactionsForBreakdown = transactions;
            if (!dataHasTypedBreakdown && transactionsForBreakdown.length === 0) {
                try {
                    const fetchedTransactions = await getTransactions();
                    transactionsForBreakdown = Array.isArray(fetchedTransactions) ? fetchedTransactions : [];
                    if (transactionsForBreakdown.length > 0) {
                        setTransactions(transactionsForBreakdown);
                    }
                } catch (transactionError) {
                    console.error('Error fetching transactions for report fallback:', transactionError);
                }
            }

            const fallbackBreakdown = buildBreakdownByTypeFromTransactions(transactionsForBreakdown, year, month);
            const normalizedData = dataHasTypedBreakdown || countBreakdownEntries(fallbackBreakdown) === 0
                ? data
                : { ...data, breakdownByType: fallbackBreakdown };
            setReportData(normalizedData);
        } catch (error) {
            console.error('Error fetching report:', error);
            setReportData(null);
            setReportError(error.message || 'Failed to fetch report');
        } finally {
            setIsReportLoading(false);
        }
    };

    // Fetch all transactions from the backend
    const fetchTransactions = async () => {
        try {
            const data = await getTransactions();
            setTransactions(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching transactions:', error);
        }
    };

    // Generate a PDF from the report data
    const generatePDF = async () => {
        if (!reportData) return;

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 12;
        const contentWidth = pageWidth - margin * 2;
        const monthDate = new Date(`${year}-${month}-01T00:00:00`);
        const monthLabel = Number.isNaN(monthDate.getTime())
            ? `${month}/${year}`
            : monthDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

        let transactionsForExport = transactions;
        if (transactionsForExport.length === 0) {
            try {
                const fetchedTransactions = await getTransactions();
                transactionsForExport = Array.isArray(fetchedTransactions) ? fetchedTransactions : [];
                if (transactionsForExport.length > 0) {
                    setTransactions(transactionsForExport);
                }
            } catch (error) {
                console.error('Error fetching transactions for PDF export:', error);
            }
        }
        const monthlyTransactions = getMonthlyTransactions(transactionsForExport, year, month);

        const totalIncome = Number(reportData.totalIncome) || 0;
        const totalExpenses = Number(reportData.totalExpenses) || 0;
        const netAmount = totalIncome - totalExpenses;
        const incomeEntries = sortEntriesByTotalDesc(Object.entries(reportData?.breakdownByType?.income || {}));
        const typedOutflowEntries = sortEntriesByTotalDesc(Object.entries(reportData?.breakdownByType?.outflow || {}));
        const fallbackCombinedEntries = sortEntriesByTotalDesc(reportEntries);
        const outflowEntries = typedOutflowEntries.length > 0 || incomeEntries.length > 0
            ? typedOutflowEntries
            : fallbackCombinedEntries;
        const topIncomeEntry = incomeEntries[0];
        const topOutflowEntry = outflowEntries[0];

        let yPos = margin;

        const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;
        const ensureSpace = (requiredHeight) => {
            if (yPos + requiredHeight <= pageHeight - margin) return;
            doc.addPage();
            yPos = margin;
        };

        const drawMetricCard = (xPos, cardWidth, title, value, colorRgb) => {
            doc.setFillColor(247, 248, 250);
            doc.setDrawColor(225, 229, 235);
            doc.rect(xPos, yPos, cardWidth, 20, 'FD');
            doc.setTextColor(107, 114, 128);
            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'normal');
            doc.text(title.toUpperCase(), xPos + 2.5, yPos + 5.5);
            doc.setTextColor(colorRgb[0], colorRgb[1], colorRgb[2]);
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.text(formatCurrency(value), xPos + 2.5, yPos + 13.5);
        };

        const drawBreakdownSection = ({
            title,
            entries,
            totalAmount,
            shareLabel,
            fillRgb,
            emptyMessage,
        }) => {
            ensureSpace(12);
            doc.setFillColor(243, 244, 246);
            doc.rect(margin, yPos, contentWidth, 8, 'F');
            doc.setTextColor(31, 41, 55);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(title, margin + 2, yPos + 5.3);
            yPos += 10;

            if (entries.length === 0) {
                ensureSpace(8);
                doc.setTextColor(107, 114, 128);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.text(emptyMessage, margin + 2, yPos + 4);
                yPos += 8;
                return;
            }

            const maxTotal = entries.reduce(
                (currentMax, [, summary]) => Math.max(currentMax, Number(summary?.total) || 0),
                0
            );

            entries.forEach(([category, summary]) => {
                const total = Number(summary?.total) || 0;
                const transactionCount = Number(summary?.transactions) || 0;
                const share = totalAmount > 0 ? total / totalAmount : 0;
                const fillWidthRatio = maxTotal > 0 ? total / maxTotal : 0;

                ensureSpace(14);
                const categoryText = String(category);
                const amountText = formatCurrency(total);
                doc.setTextColor(31, 41, 55);
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.text(categoryText, margin + 2, yPos + 4);
                doc.text(amountText, pageWidth - margin - 2 - doc.getTextWidth(amountText), yPos + 4);

                yPos += 6;
                const trackX = margin + 2;
                const trackY = yPos;
                const trackWidth = contentWidth - 4;
                doc.setFillColor(225, 231, 237);
                doc.rect(trackX, trackY, trackWidth, 2.4, 'F');
                doc.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
                const filledWidth = fillWidthRatio > 0 ? Math.max(trackWidth * fillWidthRatio, 1.5) : 0;
                if (filledWidth > 0) {
                    doc.rect(trackX, trackY, filledWidth, 2.4, 'F');
                }

                yPos += 4.6;
                const leftMetaText = `${transactionCount} ${transactionCount === 1 ? 'transaction' : 'transactions'}`;
                const rightMetaText = `${formatPercent(share)} of ${shareLabel}`;
                doc.setTextColor(107, 114, 128);
                doc.setFontSize(8.3);
                doc.setFont('helvetica', 'normal');
                doc.text(leftMetaText, margin + 2, yPos + 1.8);
                doc.text(rightMetaText, pageWidth - margin - 2 - doc.getTextWidth(rightMetaText), yPos + 1.8);

                yPos += 5.8;
            });
        };

        // Header
        doc.setFillColor(37, 99, 235);
        doc.rect(margin, yPos, contentWidth, 16, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Personal Financial Tracker', margin + 3, yPos + 6.5);
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        doc.text('Monthly Report Export', margin + 3, yPos + 12.2);
        yPos += 22;

        doc.setTextColor(31, 41, 55);
        doc.setFontSize(15);
        doc.setFont('helvetica', 'bold');
        doc.text('Monthly Report', margin, yPos);
        yPos += 5.5;
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        doc.text(monthLabel, margin, yPos);
        yPos += 6;

        // Summary cards
        const metricGap = 4;
        const metricCardWidth = (contentWidth - metricGap * 2) / 3;
        drawMetricCard(margin, metricCardWidth, 'Total Income', totalIncome, [22, 128, 61]);
        drawMetricCard(margin + metricCardWidth + metricGap, metricCardWidth, 'Total Expenses', totalExpenses, [180, 35, 24]);
        drawMetricCard(
            margin + (metricCardWidth + metricGap) * 2,
            metricCardWidth,
            'Net',
            netAmount,
            netAmount >= 0 ? [22, 128, 61] : [180, 35, 24]
        );
        yPos += 24;

        // Top insights
        if (topIncomeEntry || topOutflowEntry) {
            ensureSpace(8);
            const insightParts = [];
            if (topIncomeEntry) {
                insightParts.push(`Top income: ${topIncomeEntry[0]} (${formatCurrency(topIncomeEntry[1]?.total)})`);
            }
            if (topOutflowEntry) {
                insightParts.push(`Top outflow: ${topOutflowEntry[0]} (${formatCurrency(topOutflowEntry[1]?.total)})`);
            }
            doc.setTextColor(75, 85, 99);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text(insightParts.join('   |   '), margin, yPos + 3.5);
            yPos += 8;
        }

        drawBreakdownSection({
            title: 'Income by Category',
            entries: incomeEntries,
            totalAmount: totalIncome,
            shareLabel: 'monthly income',
            fillRgb: [16, 185, 129],
            emptyMessage: 'No income categories for the selected month.',
        });
        yPos += 2;
        drawBreakdownSection({
            title: 'Expenses & Subscriptions by Category',
            entries: outflowEntries,
            totalAmount: totalExpenses,
            shareLabel: 'monthly outflow',
            fillRgb: [239, 68, 68],
            emptyMessage: 'No expense or subscription categories for the selected month.',
        });
        yPos += 3;

        // Transactions table
        const tableColumns = [
            { key: 'date', label: 'Date', ratio: 0.14 },
            { key: 'type', label: 'Type', ratio: 0.12 },
            { key: 'name', label: 'Name', ratio: 0.18 },
            { key: 'category', label: 'Category', ratio: 0.16 },
            { key: 'amount', label: 'Amount', ratio: 0.14 },
            { key: 'description', label: 'Description', ratio: 0.26 },
        ];
        const tablePadding = 1.6;
        const tableLineHeight = 3.9;
        const tableHeaderHeight = 8;
        const columnWidths = tableColumns.map((column) => contentWidth * column.ratio);
        const totalColumnWidth = columnWidths.reduce((sum, width) => sum + width, 0);
        // Keep right border aligned with content width despite floating point math.
        if (totalColumnWidth !== contentWidth) {
            columnWidths[columnWidths.length - 1] += contentWidth - totalColumnWidth;
        }

        const drawTableHeader = () => {
            ensureSpace(tableHeaderHeight + 1);
            doc.setFillColor(232, 238, 247);
            doc.setDrawColor(189, 199, 213);
            doc.rect(margin, yPos, contentWidth, tableHeaderHeight, 'FD');

            let xPos = margin;
            tableColumns.forEach((column, columnIndex) => {
                const columnWidth = columnWidths[columnIndex];
                doc.setDrawColor(189, 199, 213);
                doc.rect(xPos, yPos, columnWidth, tableHeaderHeight, 'S');
                doc.setTextColor(55, 65, 81);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.8);
                doc.text(column.label, xPos + tablePadding, yPos + 5);
                xPos += columnWidth;
            });

            yPos += tableHeaderHeight;
        };

        ensureSpace(10);
        doc.setTextColor(31, 41, 55);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Transactions (Selected Month)', margin, yPos + 4);
        yPos += 6.5;

        if (monthlyTransactions.length === 0) {
            ensureSpace(8);
            doc.setTextColor(107, 114, 128);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text('No transactions found for this month.', margin, yPos + 3);
            yPos += 6;
        } else {
            drawTableHeader();

            monthlyTransactions.forEach((transaction) => {
                const rowData = {
                    date: transaction.date ? new Date(transaction.date).toLocaleDateString('en-US') : 'No date',
                    type: String(transaction.type || 'N/A').replace(/^./, (char) => char.toUpperCase()),
                    name: transaction.name || 'Unnamed transaction',
                    category: transaction.category || 'Uncategorized',
                    amount: formatCurrency(transaction.amount),
                    description: transaction.description || 'No description',
                };

                const wrappedCells = tableColumns.map((column, columnIndex) =>
                    doc.splitTextToSize(
                        String(rowData[column.key] ?? ''),
                        Math.max(columnWidths[columnIndex] - tablePadding * 2, 4)
                    )
                );
                const maxLines = wrappedCells.reduce((max, lines) => Math.max(max, lines.length || 1), 1);
                const rowHeight = maxLines * tableLineHeight + tablePadding * 2;

                if (yPos + rowHeight > pageHeight - margin) {
                    doc.addPage();
                    yPos = margin;
                    drawTableHeader();
                }

                let xPos = margin;
                wrappedCells.forEach((lines, columnIndex) => {
                    const columnWidth = columnWidths[columnIndex];
                    doc.setDrawColor(210, 216, 225);
                    doc.rect(xPos, yPos, columnWidth, rowHeight, 'S');
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8.4);
                    doc.setTextColor(31, 41, 55);
                    doc.text(lines, xPos + tablePadding, yPos + tablePadding + tableLineHeight - 1);
                    xPos += columnWidth;
                });

                yPos += rowHeight;
            });
        }

        doc.save(`monthly_report_${year}_${month}.pdf`);
    };

    // Delete a specific transaction from its list row
    const handleDelete = async (transactionId) => {
        if (!window.confirm('Are you sure you want to delete this transaction?')) return;

        try {
            await deleteTransaction(transactionId);

            setTransactions((previousTransactions) =>
                previousTransactions.filter((transaction) => transaction._id !== transactionId)
            );

            if (editingTransaction?._id === transactionId) {
                closeForm();
            }
        } catch (error) {
            console.error('Error deleting transaction:', error);
        }
    };

    // Fetch transactions when the component loads
    useEffect(() => {
        fetchTransactions();
    }, []);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }, [theme]);

    return (
        <div className="container">
            <button
                type="button"
                className="theme-toggle theme-toggle-floating"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
                {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>

            <header className="app-header">
                <h1>Personal Financial Tracker</h1>
            </header>

            <MonthlySummaryCards
                income={monthlySummary.income}
                expenses={monthlySummary.expenses}
                net={monthlySummary.net}
                transactionCount={monthlySummary.transactionCount}
            />

            <TransactionsSection
                transactions={filteredTransactions}
                totalTransactionsCount={transactions.length}
                isFormVisible={isFormVisible}
                isTransactionEditMode={isTransactionEditMode}
                editingTransaction={editingTransaction}
                searchQuery={searchQuery}
                selectedType={selectedType}
                selectedCategory={selectedCategory}
                categoryOptions={categoryOptions}
                startDate={startDate}
                endDate={endDate}
                onOpenAddForm={openAddForm}
                onToggleTransactionEditMode={toggleTransactionEditMode}
                onOpenEditForm={openEditForm}
                onCloseForm={closeForm}
                onTransactionSaved={handleTransactionSaved}
                onDelete={handleDelete}
                onSearchQueryChange={setSearchQuery}
                onTypeChange={setSelectedType}
                onCategoryChange={setSelectedCategory}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
                onClearFilters={clearTransactionFilters}
                formatDate={formatDate}
            />

            <MonthlyReportSection
                year={year}
                month={month}
                onYearChange={setYear}
                onMonthChange={setMonth}
                isReportLoading={isReportLoading}
                onFetchReport={fetchReport}
                onGeneratePDF={generatePDF}
                reportData={reportData}
                reportError={reportError}
                reportEntries={reportEntries}
            />

        </div>
    );
};

export default Report;
