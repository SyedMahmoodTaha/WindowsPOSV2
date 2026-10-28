import { useEffect, useMemo, useState } from "react";
import { FaArrowLeft, FaCalendarDays, FaChartColumn, FaDatabase, FaDollarSign, FaFloppyDisk, FaPlus, FaReceipt, FaTrashCan } from "react-icons/fa6";
import { Link } from "react-router-dom";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const normalizeValue = (value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
};

const getDayKey = (dateString) => {
    const date = new Date(dateString);
    const utc = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return utc.toISOString().slice(0, 10);
};

const getMonthKey = (dateString) => {
    const date = new Date(dateString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const getYearKey = (dateString) => {
    const date = new Date(dateString);
    return String(date.getFullYear());
};

const buildDailyReport = (orders, referenceDate = new Date()) => {
    const entries = [];
    for (let index = 6; index >= 0; index -= 1) {
        const date = new Date(referenceDate);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - index);
        entries.push({
            key: date.toISOString().slice(0, 10),
            label: DAY_LABELS[date.getDay()],
            date: date.toLocaleDateString(),
            amount: 0,
            orders: 0,
            avgTicket: 0,
        });
    }

    orders.forEach((order) => {
        const dayKey = getDayKey(order.createdAt || new Date().toISOString());
        const match = entries.find((entry) => entry.key === dayKey);
        if (!match) return;
        match.amount += Number(order.total || 0);
        match.orders += 1;
    });

    entries.forEach((entry) => {
        entry.avgTicket = entry.orders > 0 ? entry.amount / entry.orders : 0;
    });

    return entries;
};

const buildMonthlyReport = (orders, referenceDate = new Date()) => {
    const entries = [];
    for (let index = 4; index >= 0; index -= 1) {
        const date = new Date(referenceDate);
        date.setDate(1);
        date.setMonth(date.getMonth() - index);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        entries.push({
            key: monthKey,
            label: `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`,
            amount: 0,
            orders: 0,
            avgTicket: 0,
        });
    }

    orders.forEach((order) => {
        const monthKey = getMonthKey(order.createdAt || new Date().toISOString());
        const match = entries.find((entry) => entry.key === monthKey);
        if (!match) return;
        match.amount += Number(order.total || 0);
        match.orders += 1;
    });

    entries.forEach((entry) => {
        entry.avgTicket = entry.orders > 0 ? entry.amount / entry.orders : 0;
    });

    return entries;
};

const buildYearlyReport = (orders, referenceDate = new Date()) => {
    const currentYear = referenceDate.getFullYear();
    const entries = [];
    for (let index = 4; index >= 0; index -= 1) {
        const year = currentYear - index;
        entries.push({
            key: String(year),
            label: String(year),
            amount: 0,
            orders: 0,
            avgTicket: 0,
        });
    }

    orders.forEach((order) => {
        const yearKey = getYearKey(order.createdAt || new Date().toISOString());
        const match = entries.find((entry) => entry.key === yearKey);
        if (!match) return;
        match.amount += Number(order.total || 0);
        match.orders += 1;
    });

    entries.forEach((entry) => {
        entry.avgTicket = entry.orders > 0 ? entry.amount / entry.orders : 0;
    });

    return entries;
};

const SqliteDbViewer = () => {
    const [tables, setTables] = useState([]);
    const [selectedTable, setSelectedTable] = useState("");
    const [columns, setColumns] = useState([]);
    const [rows, setRows] = useState([]);
    const [message, setMessage] = useState("");
    const [isBusy, setIsBusy] = useState(false);
    const [newRow, setNewRow] = useState({});
    const [editingId, setEditingId] = useState(null);
    const [editDraft, setEditDraft] = useState({});
    const [reportPeriod, setReportPeriod] = useState("daily");
    const [reportOrders, setReportOrders] = useState([]);
    const [reportDate, setReportDate] = useState(() => new Date());

    const idColumn = columns.find((column) => column.pk)?.name || "id";

    const loadTables = async () => {
        if (!window.pflDesktop) {
            setMessage("This viewer works inside the desktop app only.");
            return;
        }

        const nextTables = await window.pflDesktop.getDbTables();
        setTables(nextTables);
        if (!selectedTable && nextTables.length) setSelectedTable(nextTables[0]);
    };

    const loadReportOrders = async () => {
        if (!window.pflDesktop) return;
        const nextOrders = await window.pflDesktop.getOrders();
        setReportOrders(Array.isArray(nextOrders) ? nextOrders : []);
    };

    const loadTable = async (tableName) => {
        if (!window.pflDesktop || !tableName) return;
        const result = await window.pflDesktop.getDbTable(tableName);
        setColumns(result.columns || []);
        setRows(result.rows || []);
        setEditingId(null);
        setEditDraft({});
        setNewRow({});
    };

    useEffect(() => {
        loadTables();
        loadReportOrders();
    }, []);

    useEffect(() => {
        if (selectedTable) loadTable(selectedTable);
    }, [selectedTable]);

    useEffect(() => {
        const refreshReportDate = () => setReportDate(new Date());
        const intervalId = window.setInterval(refreshReportDate, 60 * 1000);
        return () => window.clearInterval(intervalId);
    }, []);

    const selectedReport = useMemo(() => {
        if (reportPeriod === "monthly") return buildMonthlyReport(reportOrders, reportDate);
        if (reportPeriod === "yearly") return buildYearlyReport(reportOrders, reportDate);
        return buildDailyReport(reportOrders, reportDate);
    }, [reportDate, reportOrders, reportPeriod]);

    const summary = useMemo(() => {
        const totalRevenue = selectedReport.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
        const totalOrders = selectedReport.reduce((sum, entry) => sum + Number(entry.orders || 0), 0);
        const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
        const peakEntry = selectedReport.reduce((best, entry) => {
            if (!best || Number(entry.amount || 0) > Number(best.amount || 0)) return entry;
            return best;
        }, null);

        return {
            totalRevenue,
            totalOrders,
            avgTicket,
            peakEntry,
        };
    }, [selectedReport]);

    const maxAmount = selectedReport.length ? Math.max(...selectedReport.map((entry) => Number(entry.amount || 0))) : 0;

    const handleAddRow = async (event) => {
        event.preventDefault();
        if (!selectedTable || !window.pflDesktop) return;

        const payload = {};
        columns.forEach((column) => {
            if (column.name === idColumn) return;
            payload[column.name] = newRow[column.name] ?? "";
        });

        setIsBusy(true);
        const result = await window.pflDesktop.insertDbRow({ tableName: selectedTable, row: payload });
        setIsBusy(false);

        if (result?.ok) {
            setMessage("Row added");
            await loadTable(selectedTable);
            return;
        }

        setMessage(result?.error || "Unable to add row");
    };

    const handleEditRow = async (event) => {
        event.preventDefault();
        if (!selectedTable || !window.pflDesktop || editingId === null) return;

        const payload = { ...editDraft };
        delete payload[idColumn];

        setIsBusy(true);
        const result = await window.pflDesktop.updateDbRow({
            tableName: selectedTable,
            idColumn,
            idValue: editingId,
            row: payload,
        });
        setIsBusy(false);

        if (result?.ok) {
            setMessage("Row updated");
            await loadTable(selectedTable);
            return;
        }

        setMessage(result?.error || "Unable to update row");
    };

    const handleDeleteRow = async (row) => {
        if (!selectedTable || !window.pflDesktop) return;

        const rowId = row[idColumn];
        if (rowId === undefined || rowId === null) return;

        const confirmed = window.confirm(`Delete row ${rowId} from ${selectedTable}?`);
        if (!confirmed) return;

        setIsBusy(true);
        const result = await window.pflDesktop.deleteDbRow({
            tableName: selectedTable,
            idColumn,
            idValue: rowId,
        });
        setIsBusy(false);

        if (result?.ok) {
            setMessage("Row deleted");
            await loadTable(selectedTable);
            return;
        }

        setMessage(result?.error || "Unable to delete row");
    };

    if (!window.pflDesktop) {
        return (
            <main className="min-h-screen bg-[#1f1f1f] p-6 text-[#f5f5f5]">
                <div className="mx-auto max-w-4xl rounded-[20px] bg-[#2a2a2a] p-6">
                    <p className="text-lg font-semibold">SQLite database viewer</p>
                    <p className="mt-2 text-sm text-[#ababab]">Open this page inside the Electron desktop app to view and edit the database.</p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto max-w-7xl">
                <div className="mb-6 flex items-center gap-4">
                    <Link to="/developer" className="rounded-full p-3 text-[#d3d3d3] hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label="Back to developer mode">
                        <FaArrowLeft />
                    </Link>
                    <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Database tools</p>
                        <h1 className="text-3xl font-semibold">SQLite viewer</h1>
                    </div>
                </div>

                <section className="mb-6 rounded-[20px] bg-[#2a2a2a] p-5">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-2 text-[#d3d3d3]">
                            <FaChartColumn />
                            <h2 className="text-lg font-semibold">Sales report</h2>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { id: "daily", label: "Daily" },
                                { id: "monthly", label: "Monthly" },
                                { id: "yearly", label: "Yearly" },
                            ].map((button) => (
                                <button
                                    key={button.id}
                                    type="button"
                                    onClick={() => setReportPeriod(button.id)}
                                    className={`rounded-[8px] px-3 py-1.5 text-xs font-semibold transition ${reportPeriod === button.id ? "bg-[#d3d3d3] text-[#1a1a1a]" : "bg-[#3a3a3a] text-[#ababab]"}`}
                                >
                                    {button.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mb-4 grid gap-3 md:grid-cols-4">
                        <div className="rounded-[16px] bg-[#1f1f1f] p-4">
                            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[#ababab]">
                                <FaDollarSign className="text-[#a6f0c7]" /> Revenue
                            </div>
                            <p className="text-2xl font-semibold text-[#f5f5f5]">₹{summary.totalRevenue.toLocaleString()}</p>
                        </div>
                        <div className="rounded-[16px] bg-[#1f1f1f] p-4">
                            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[#ababab]">
                                <FaReceipt className="text-[#f7d78c]" /> Orders
                            </div>
                            <p className="text-2xl font-semibold text-[#f5f5f5]">{summary.totalOrders}</p>
                        </div>
                        <div className="rounded-[16px] bg-[#1f1f1f] p-4">
                            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[#ababab]">
                                <FaCalendarDays className="text-[#8ad0ff]" /> Avg ticket
                            </div>
                            <p className="text-2xl font-semibold text-[#f5f5f5]">₹{Math.round(summary.avgTicket).toLocaleString()}</p>
                        </div>
                        <div className="rounded-[16px] bg-[#1f1f1f] p-4">
                            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[#ababab]">
                                <FaChartColumn className="text-[#d5b4ff]" /> Peak
                            </div>
                            <p className="text-xl font-semibold text-[#f5f5f5]">{summary.peakEntry ? summary.peakEntry.label : "N/A"}</p>
                            <p className="text-xs text-[#ababab]">₹{summary.peakEntry ? Number(summary.peakEntry.amount || 0).toLocaleString() : 0}</p>
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-[16px] border border-[#3a3a3a]">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-[#333333] text-[#ababab]">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Period</th>
                                    <th className="px-3 py-2 font-medium">Revenue</th>
                                    <th className="px-3 py-2 font-medium">Orders</th>
                                    <th className="px-3 py-2 font-medium">Avg ticket</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedReport.map((entry) => (
                                    <tr key={entry.key} className="border-t border-[#3a3a3a] bg-[#2a2a2a]">
                                        <td className="px-3 py-2 font-medium text-[#d3d3d3]">{entry.label}</td>
                                        <td className="px-3 py-2 text-[#a6f0c7]">₹{Number(entry.amount || 0).toLocaleString()}</td>
                                        <td className="px-3 py-2 text-[#f5f5f5]">{entry.orders}</td>
                                        <td className="px-3 py-2 text-[#f5f5f5]">₹{Math.round(Number(entry.avgTicket || 0)).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="rounded-[20px] bg-[#2a2a2a] p-5">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div className="flex items-center gap-2 text-[#d3d3d3]">
                            <FaDatabase />
                            <label className="text-sm font-medium">Table</label>
                        </div>
                        <select
                            value={selectedTable}
                            onChange={(event) => setSelectedTable(event.target.value)}
                            className="field min-w-[220px]"
                        >
                            <option value="">Select table</option>
                            {tables.map((table) => (
                                <option key={table} value={table}>{table}</option>
                            ))}
                        </select>
                    </div>

                    {selectedTable && (
                        <>
                            <form onSubmit={handleAddRow} className="mb-6 grid gap-2 rounded-[16px] bg-[#333333] p-4 md:grid-cols-2 xl:grid-cols-3">
                                {columns.filter((column) => column.name !== idColumn).map((column) => (
                                    <label key={column.name} className="grid gap-1 text-xs uppercase tracking-[0.12em] text-[#ababab]">
                                        {column.name}
                                        <input
                                            className="field"
                                            value={normalizeValue(newRow[column.name] ?? "")}
                                            onChange={(event) => setNewRow((current) => ({ ...current, [column.name]: event.target.value }))}
                                            placeholder={column.name}
                                        />
                                    </label>
                                ))}
                                <div className="flex items-end justify-end md:col-span-2 xl:col-span-3">
                                    <button type="submit" disabled={isBusy} className="rounded-[10px] bg-[#d3d3d3] px-4 py-2 text-sm font-semibold text-[#1a1a1a] disabled:opacity-60">
                                        <span className="inline-flex items-center gap-2"><FaPlus /> Add row</span>
                                    </button>
                                </div>
                            </form>

                            <div className="overflow-x-auto rounded-[16px] border border-[#3a3a3a]">
                                <table className="min-w-full text-left text-sm">
                                    <thead className="bg-[#333333] text-[#ababab]">
                                        <tr>
                                            {columns.map((column) => (
                                                <th key={column.name} className="whitespace-nowrap px-3 py-2 font-medium">{column.name}</th>
                                            ))}
                                            <th className="px-3 py-2 font-medium">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row) => (
                                            <tr key={row[idColumn]} className="border-t border-[#3a3a3a] bg-[#2a2a2a]">
                                                {columns.map((column) => {
                                                    const value = row[column.name];
                                                    const isEditing = editingId === row[idColumn];
                                                    return (
                                                        <td key={`${row[idColumn]}-${column.name}`} className="px-3 py-2 align-top">
                                                            {isEditing ? (
                                                                <input
                                                                    className="field min-w-[120px]"
                                                                    value={normalizeValue(editDraft[column.name] ?? "")}
                                                                    onChange={(event) => setEditDraft((current) => ({ ...current, [column.name]: event.target.value }))}
                                                                />
                                                            ) : (
                                                                <span className="block max-w-[180px] truncate">{normalizeValue(value)}</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td className="px-3 py-2">
                                                    {editingId === row[idColumn] ? (
                                                        <div className="flex gap-2">
                                                            <button type="button" onClick={handleEditRow} disabled={isBusy} className="rounded-[8px] bg-[#d3d3d3] px-3 py-1 text-xs font-semibold text-[#1a1a1a] disabled:opacity-60">
                                                                <span className="inline-flex items-center gap-1"><FaFloppyDisk /> Save</span>
                                                            </button>
                                                            <button type="button" onClick={() => { setEditingId(null); setEditDraft({}); }} className="rounded-[8px] bg-[#3a3a3a] px-3 py-1 text-xs font-semibold text-[#f5f5f5]">
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex gap-2">
                                                            <button type="button" onClick={() => { setEditingId(row[idColumn]); setEditDraft({ ...row }); }} className="rounded-[8px] bg-[#3a3a3a] px-3 py-1 text-xs font-semibold text-[#f5f5f5]">
                                                                Edit
                                                            </button>
                                                            <button type="button" onClick={() => handleDeleteRow(row)} className="rounded-[8px] bg-[#f08080] px-3 py-1 text-xs font-semibold text-[#1a1a1a]">
                                                                <span className="inline-flex items-center gap-1"><FaTrashCan /> Delete</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {message && <p className="mt-4 text-sm text-[#a7d7a7]">{message}</p>}
                </section>
            </div>
        </main>
    );
};

export default SqliteDbViewer;
