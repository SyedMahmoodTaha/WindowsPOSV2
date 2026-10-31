import { useEffect, useMemo, useState } from "react";
import { FaArrowLeft, FaBoxArchive, FaChartColumn, FaChartPie, FaDollarSign, FaReceipt } from "react-icons/fa6";
import { Link } from "react-router-dom";
import { readOrders } from "../utils/orderStorage";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const getLocalDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const getDayKey = (dateString) => {
    const date = new Date(dateString);
    return Number.isNaN(date.getTime()) ? "" : getLocalDateKey(date);
};

const getMonthKey = (dateString) => {
    const date = new Date(dateString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const getYearKey = (dateString) => {
    const date = new Date(dateString);
    return String(date.getFullYear());
};

const getWeekStart = (date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return start;
};

const getPeriodRange = (period, referenceDate) => {
    const start = new Date(referenceDate);
    start.setHours(0, 0, 0, 0);
    if (period === "daily" || period === "date") {
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return { start, end };
    }
    if (period === "weekly") {
        const weekStart = getWeekStart(start);
        const end = new Date(weekStart);
        end.setDate(end.getDate() + 7);
        return { start: weekStart, end };
    }
    if (period === "monthly") {
        start.setDate(1);
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        return { start, end };
    }
    start.setMonth(0, 1);
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    return { start, end };
};

const buildDailyReport = (orders, referenceDate = new Date()) => {
    const lastSevenDays = [];
    for (let index = 6; index >= 0; index -= 1) {
        const date = new Date(referenceDate);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - index);
        lastSevenDays.push({
            key: getLocalDateKey(date),
            label: DAY_LABELS[date.getDay()],
            date: date.toLocaleDateString(),
            amount: 0,
            orders: 0,
        });
    }

    orders.forEach((order) => {
        const dayKey = getDayKey(order.createdAt || new Date().toISOString());
        const match = lastSevenDays.find((entry) => entry.key === dayKey);
        if (!match) return;
        match.amount += Number(order.total || 0);
        match.orders += 1;
    });

    return lastSevenDays;
};

const buildWeeklyReport = (orders, referenceDate = new Date()) => {
    const currentWeek = getWeekStart(referenceDate);
    const weeks = [];
    for (let index = 7; index >= 0; index -= 1) {
        const start = new Date(currentWeek);
        start.setDate(start.getDate() - index * 7);
        weeks.push({
            key: getLocalDateKey(start),
            label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
            amount: 0,
            orders: 0,
        });
    }

    orders.forEach((order) => {
        const date = new Date(order.createdAt || "");
        if (Number.isNaN(date.getTime())) return;
        const weekKey = getLocalDateKey(getWeekStart(date));
        const match = weeks.find((entry) => entry.key === weekKey);
        if (!match) return;
        match.amount += Number(order.total || 0);
        match.orders += 1;
    });

    return weeks;
};

const buildMonthlyReport = (orders, referenceDate = new Date()) => {
    const months = [];
    for (let index = 4; index >= 0; index -= 1) {
        const date = new Date(referenceDate);
        date.setDate(1);
        date.setMonth(date.getMonth() - index);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        months.push({
            key: monthKey,
            label: `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`,
            amount: 0,
            orders: 0,
        });
    }

    // Remove duplicates while preserving order
    const seen = new Set();
    const uniqueMonths = [];
    months.forEach((month) => {
        if (!seen.has(month.key)) {
            seen.add(month.key);
            uniqueMonths.push(month);
        }
    });

    orders.forEach((order) => {
        const monthKey = getMonthKey(order.createdAt || new Date().toISOString());
        const match = uniqueMonths.find((entry) => entry.key === monthKey);
        if (!match) return;
        match.amount += Number(order.total || 0);
        match.orders += 1;
    });

    return uniqueMonths;
};

const buildYearlyReport = (orders, referenceDate = new Date()) => {
    const years = [];
    const currentYear = referenceDate.getFullYear();
    for (let i = 4; i >= 0; i -= 1) {
        years.push({
            key: String(currentYear - i),
            label: String(currentYear - i),
            amount: 0,
            orders: 0,
        });
    }

    // First pass: find min and max years from actual data
    let minYear = currentYear;
    let maxYear = currentYear;
    
    orders.forEach((order) => {
        const yearKey = parseInt(getYearKey(order.createdAt || new Date().toISOString()), 10);
        if (yearKey < minYear) minYear = yearKey;
        if (yearKey > maxYear) maxYear = yearKey;
    });

    // Build years array from min to max (or at least show current + 4 years back)
    const yearsToShow = [];
    const startYear = Math.min(minYear, currentYear - 4);
    for (let year = startYear; year <= maxYear; year += 1) {
        yearsToShow.push({
            key: String(year),
            label: String(year),
            amount: 0,
            orders: 0,
        });
    }

    // Aggregate data
    orders.forEach((order) => {
        const yearKey = getYearKey(order.createdAt || new Date().toISOString());
        const match = yearsToShow.find((entry) => entry.key === yearKey);
        if (!match) return;
        match.amount += Number(order.total || 0);
        match.orders += 1;
    });

    return yearsToShow;
};

const buildRecentSales = (orders) => {
    return orders
        .slice(0, 6)
        .map((order) => ({
            id: order.orderNumber || `#${order.id}`,
            time: order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--",
            total: Number(order.total || 0),
            channel: order.orderType || "Walk-in",
            cashier: order.orderDetails?.customerName || order.orderType || "System",
        }));
};

const buildCategoryMix = (orders) => {
    const stats = new Map();

    orders.forEach((order) => {
        (order.cart || []).forEach((item) => {
            const categoryName = item.category || "General";
            const previous = stats.get(categoryName) || { label: categoryName, value: 0, color: "#d3d3d3" };
            previous.value += Number(item.quantity || 1);
            stats.set(categoryName, previous);
        });
    });

    const colors = ["#f7d78c", "#f5a623", "#8ad0ff", "#a6f0c7", "#d5b4ff", "#ff9a9a", "#9ee493"];
    const entries = [...stats.values()];
    const total = entries.reduce((sum, entry) => sum + entry.value, 0) || 1;

    const percentages = entries.map((entry) => ({
        ...entry,
        value: (entry.value / total) * 100,
        color: colors[entries.indexOf(entry) % colors.length],
    }));

    // Ensure percentages add up to 100% by adjusting the last entry
    const sumPercentages = percentages.slice(0, -1).reduce((sum, p) => sum + Math.round(p.value), 0);
    const lastPercentage = Math.max(0, 100 - sumPercentages);

    return percentages.map((entry, index) => ({
        ...entry,
        value: index === percentages.length - 1 ? lastPercentage : Math.round(entry.value),
    }));
};

const buildTopItems = (orders) => {
    const stats = new Map();

    orders.forEach((order) => {
        (order.cart || []).forEach((item) => {
            const name = item.name || "Item";
            const quantity = Number(item.quantity || 1);
            const revenue = Number(item.price || 0) * quantity;
            const current = stats.get(name) || { name, sales: 0, revenue: 0 };
            current.sales += quantity;
            current.revenue += revenue;
            stats.set(name, current);
        });
    });

    return [...stats.values()]
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 4);
};

const AdminSettings = () => {
    const [activeTab, setActiveTab] = useState("sales");
    const [reportPeriod, setReportPeriod] = useState("daily");
    const [orders, setOrders] = useState(() => readOrders());
    const [reportDate, setReportDate] = useState(() => new Date());
    const [selectedDate, setSelectedDate] = useState(() => getLocalDateKey(new Date()));
    const [reportMessage, setReportMessage] = useState("");

    useEffect(() => {
        const refreshOrders = () => setOrders(readOrders());
        window.addEventListener("pfl-orders-updated", refreshOrders);
        window.addEventListener("storage", refreshOrders);
        return () => {
            window.removeEventListener("pfl-orders-updated", refreshOrders);
            window.removeEventListener("storage", refreshOrders);
        };
    }, []);

    useEffect(() => {
        const refreshReportDate = () => setReportDate(new Date());
        const intervalId = window.setInterval(refreshReportDate, 60 * 1000);
        return () => window.clearInterval(intervalId);
    }, []);

    const dailyReport = useMemo(() => buildDailyReport(orders, reportDate), [orders, reportDate]);
    const weeklyReport = useMemo(() => buildWeeklyReport(orders, reportDate), [orders, reportDate]);
    const monthlyReport = useMemo(() => buildMonthlyReport(orders, reportDate), [orders, reportDate]);
    const yearlyReport = useMemo(() => buildYearlyReport(orders, reportDate), [orders, reportDate]);
    const periodReferenceDate = useMemo(
        () => reportPeriod === "date" ? new Date(`${selectedDate}T00:00:00`) : reportDate,
        [reportPeriod, reportDate, selectedDate],
    );
    const periodRange = useMemo(() => getPeriodRange(reportPeriod, periodReferenceDate), [reportPeriod, periodReferenceDate]);
    const periodOrders = useMemo(() => orders.filter((order) => {
        const createdAt = new Date(order.createdAt || "");
        return !Number.isNaN(createdAt.getTime()) && createdAt >= periodRange.start && createdAt < periodRange.end;
    }), [orders, periodRange]);
    const recentSales = useMemo(() => buildRecentSales(periodOrders), [periodOrders]);
    const categoryMix = useMemo(() => buildCategoryMix(periodOrders), [periodOrders]);
    const topItems = useMemo(() => buildTopItems(periodOrders), [periodOrders]);

    const selectedReport = useMemo(() => {
        if (reportPeriod === "date") return buildDailyReport(orders, periodReferenceDate);
        if (reportPeriod === "daily") return dailyReport;
        if (reportPeriod === "weekly") return weeklyReport;
        if (reportPeriod === "monthly") return monthlyReport;
        return yearlyReport;
    }, [dailyReport, monthlyReport, orders, periodReferenceDate, reportPeriod, weeklyReport, yearlyReport]);

    const totals = useMemo(() => {
        const totalSales = periodOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
        const totalOrders = periodOrders.length;
        const averageTicket = totalOrders > 0 ? totalSales / totalOrders : 0;
        return { totalSales, totalOrders, averageTicket };
    }, [periodOrders]);

    const periodLabel = {
        daily: "Today",
        weekly: "This week",
        monthly: "This month",
        yearly: "This year",
        date: Number.isNaN(periodReferenceDate.getTime())
            ? "Selected date"
            : periodReferenceDate.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }),
    }[reportPeriod];

    const maxAmount = selectedReport.length ? Math.max(...selectedReport.map((entry) => Number(entry.amount || 0))) : 0;
    const pieGradient = useMemo(() => {
        if (!categoryMix.length) return "conic-gradient(#2a2a2a 0% 100%)";
        let current = 0;
        const stops = categoryMix.map((slice) => {
            const start = current;
            current += Number(slice.value || 0);
            return `${slice.color || "#d3d3d3"} ${start}% ${current}%`;
        });
        return `conic-gradient(${stops.join(", ")})`;
    }, [categoryMix]);

    const hasData = orders.length > 0;

    const exportReportToExcel = async () => {
        if (!window.pflDesktop || !window.pflDesktop.exportSalesReport) {
            setReportMessage("Export is available in the desktop app only.");
            return;
        }

        try {
            const result = await window.pflDesktop.exportSalesReport({ orders });
            if (result?.ok && result.filePath) {
                setReportMessage(`Sales report exported to ${result.filePath}`);
                return;
            }
            if (result?.canceled) {
                setReportMessage("Export canceled");
                return;
            }
            throw new Error(result?.error || "Export failed");
        } catch (error) {
            setReportMessage(error.message || "Could not export sales report");
        }
    };

    return (
        <main className="min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto max-w-7xl">
                <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link to="/" className="rounded-full p-3 text-[#d3d3d3] hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label="Back to home">
                            <FaArrowLeft />
                        </Link>
                        <div>
                            <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Admin</p>
                            <h1 className="text-3xl font-semibold">Settings</h1>
                        </div>
                    </div>
                    <Link to="/all-orders" className="inline-flex items-center gap-2 rounded-[10px] border border-[#555] bg-[#2a2a2a] px-4 py-3 text-sm font-semibold text-[#f5f5f5] transition-colors hover:bg-[#3a3a3a]"><FaBoxArchive className="text-[#d3d3d3]" /> All Orders</Link>
                </div>

                {!hasData ? (
                    <div className="rounded-[24px] bg-[#2a2a2a] p-8 shadow-lg">
                        <h2 className="mb-3 text-2xl font-semibold">No sales data yet</h2>
                        <p className="max-w-2xl text-[#ababab]">
                            This dashboard is ready to show live sales and reports as soon as your restaurant data is saved in the app.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="mb-6 flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={() => setActiveTab("sales")}
                                className={`flex items-center gap-2 rounded-[12px] px-4 py-3 text-sm font-semibold transition ${activeTab === "sales" ? "bg-[#d3d3d3] text-[#1a1a1a]" : "bg-[#2a2a2a] text-[#f5f5f5]"}`}
                            >
                                <FaReceipt />
                                Sales
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab("reports")}
                                className={`flex items-center gap-2 rounded-[12px] px-4 py-3 text-sm font-semibold transition ${activeTab === "reports" ? "bg-[#d3d3d3] text-[#1a1a1a]" : "bg-[#2a2a2a] text-[#f5f5f5]"}`}
                            >
                                <FaChartColumn />
                                Reports
                            </button>
                        </div>

                        <div className="mb-6 grid gap-4 md:grid-cols-3">
                            <div className="rounded-[20px] bg-[#2a2a2a] p-5 shadow-lg">
                                <div className="mb-2 flex items-center gap-3 text-[#ababab]">
                                    <FaDollarSign className="text-[#a6f0c7]" />
                                    <span className="text-sm uppercase tracking-[0.16em]">Revenue · {periodLabel}</span>
                                </div>
                                <p className="text-3xl font-semibold">₹{totals.totalSales.toLocaleString()}</p>
                            </div>

                            <div className="rounded-[20px] bg-[#2a2a2a] p-5 shadow-lg">
                                <div className="mb-2 flex items-center gap-3 text-[#ababab]">
                                    <FaReceipt className="text-[#f7d78c]" />
                                    <span className="text-sm uppercase tracking-[0.16em]">Orders · {periodLabel}</span>
                                </div>
                                <p className="text-3xl font-semibold">{totals.totalOrders}</p>
                            </div>

                            <div className="rounded-[20px] bg-[#2a2a2a] p-5 shadow-lg">
                                <div className="mb-2 flex items-center gap-3 text-[#ababab]">
                                    <FaChartPie className="text-[#8ad0ff]" />
                                    <span className="text-sm uppercase tracking-[0.16em]">Avg Ticket · {periodLabel}</span>
                                </div>
                                <p className="text-3xl font-semibold">₹{Math.round(totals.averageTicket).toLocaleString()}</p>
                            </div>
                        </div>

                        {activeTab === "sales" ? (
                            <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
                                <section className="rounded-[24px] bg-[#2a2a2a] p-5 shadow-lg">
                                    <div className="mb-5 flex items-center justify-between gap-3">
                                        <h2 className="text-xl font-semibold">Sales Overview</h2>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setReportPeriod("daily")}
                                                className={`rounded-[8px] px-3 py-1 text-xs font-semibold transition ${reportPeriod === "daily" ? "bg-[#d3d3d3] text-[#1a1a1a]" : "bg-[#3a3a3a] text-[#ababab]"}`}
                                            >
                                                Daily
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setReportPeriod("weekly")}
                                                className={`rounded-[8px] px-3 py-1 text-xs font-semibold transition ${reportPeriod === "weekly" ? "bg-[#d3d3d3] text-[#1a1a1a]" : "bg-[#3a3a3a] text-[#ababab]"}`}
                                            >
                                                Weekly
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setReportPeriod("monthly")}
                                                className={`rounded-[8px] px-3 py-1 text-xs font-semibold transition ${reportPeriod === "monthly" ? "bg-[#d3d3d3] text-[#1a1a1a]" : "bg-[#3a3a3a] text-[#ababab]"}`}
                                            >
                                                Monthly
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setReportPeriod("yearly")}
                                                className={`rounded-[8px] px-3 py-1 text-xs font-semibold transition ${reportPeriod === "yearly" ? "bg-[#d3d3d3] text-[#1a1a1a]" : "bg-[#3a3a3a] text-[#ababab]"}`}
                                            >
                                                Yearly
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setReportPeriod("date")}
                                                className={`rounded-[8px] px-3 py-1 text-xs font-semibold transition ${reportPeriod === "date" ? "bg-[#d3d3d3] text-[#1a1a1a]" : "bg-[#3a3a3a] text-[#ababab]"}`}
                                            >
                                                Specific date
                                            </button>
                                            {reportPeriod === "date" && (
                                                <input
                                                    type="date"
                                                    value={selectedDate}
                                                    onChange={(event) => {
                                                        if (event.target.value) setSelectedDate(event.target.value);
                                                    }}
                                                    aria-label="Select revenue date"
                                                    className="rounded-[8px] border border-[#555] bg-[#1f1f1f] px-2 py-1 text-xs text-[#f5f5f5] outline-none focus:border-[#d3d3d3]"
                                                />
                                            )}
                                            <button
                                                type="button"
                                                onClick={exportReportToExcel}
                                                className="rounded-[8px] bg-[#1f6fff] px-3 py-1 text-xs font-semibold text-white transition hover:bg-[#2a7fff]"
                                            >
                                                Export Excel
                                            </button>
                                        </div>
                                    </div>

                                    {reportMessage && <p className="mb-4 text-sm text-[#a7d7a7]">{reportMessage}</p>}

                                    <div className="flex flex-col gap-4">
                                        <div className="overflow-x-auto pb-4">
                                            <svg viewBox="0 0 1000 320" className="w-full min-w-full" style={{ height: "auto", minHeight: "300px" }} preserveAspectRatio="none">
                                                {/* Grid lines */}
                                                <line x1="60" y1="220" x2="950" y2="220" stroke="#3a3a3a" strokeWidth="1" />
                                                <line x1="60" y1="165" x2="950" y2="165" stroke="#3a3a3a" strokeWidth="1" strokeDasharray="4" opacity="0.5" />
                                                <line x1="60" y1="110" x2="950" y2="110" stroke="#3a3a3a" strokeWidth="1" strokeDasharray="4" opacity="0.5" />
                                                <line x1="60" y1="55" x2="950" y2="55" stroke="#3a3a3a" strokeWidth="1" strokeDasharray="4" opacity="0.5" />

                                                {/* Y-axis */}
                                                <line x1="60" y1="20" x2="60" y2="220" stroke="#555" strokeWidth="2" />
                                                {/* X-axis */}
                                                <line x1="60" y1="220" x2="950" y2="220" stroke="#555" strokeWidth="2" />

                                                {/* Y-axis labels */}
                                                <text x="55" y="225" textAnchor="end" fontSize="11" fill="#ababab">0</text>
                                                <text x="55" y="170" textAnchor="end" fontSize="11" fill="#ababab">{Math.round(maxAmount / 4)}</text>
                                                <text x="55" y="115" textAnchor="end" fontSize="11" fill="#ababab">{Math.round(maxAmount / 2)}</text>
                                                <text x="55" y="60" textAnchor="end" fontSize="11" fill="#ababab">{Math.round((maxAmount * 3) / 4)}</text>

                                                {/* Bars */}
                                                {selectedReport.map((entry, idx) => {
                                                    const barWidth = 890 / selectedReport.length;
                                                    const x = 70 + (idx * barWidth) + barWidth * 0.1;
                                                    const barHeight = (Number(entry.amount || 0) / (maxAmount || 1)) * 200;
                                                    const y = 220 - barHeight;
                                                    const width = barWidth * 0.8;
                                                    return (
                                                        <g key={entry.key}>
                                                            <rect x={x} y={y} width={width} height={barHeight} fill="#d3d3d3" rx="3" />
                                                            <text x={x + width / 2} y="250" textAnchor="middle" fontSize="10" fill="#ababab" fontWeight="500">{entry.label}</text>
                                                            <text x={x + width / 2} y="267" textAnchor="middle" fontSize="8" fill="#888">₹{(Number(entry.amount || 0) / 1000).toFixed(1)}k</text>
                                                        </g>
                                                    );
                                                })}
                                            </svg>
                                        </div>

                                        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 text-center text-xs">
                                            {selectedReport.map((entry) => (
                                                <div key={entry.key} className="rounded-[8px] bg-[#1f1f1f] p-2">
                                                    <p className="font-medium text-[#d3d3d3] text-[11px]">{entry.label}</p>
                                                    <p className="text-[#a6f0c7] text-[10px]">₹{entry.amount.toLocaleString()}</p>
                                                    <p className="text-[#ababab] text-[9px]">{entry.orders} orders</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </section>

                                <section className="rounded-[24px] bg-[#2a2a2a] p-5 shadow-lg">
                                    <h2 className="mb-5 text-xl font-semibold">Recent Sales</h2>
                                    <div className="space-y-3">
                                        {recentSales.map((sale) => (
                                            <div key={`${sale.id}-${sale.time}`} className="flex items-center justify-between gap-3 rounded-[14px] bg-[#1f1f1f] p-3">
                                                <div>
                                                    <p className="font-medium">{sale.id}</p>
                                                    <p className="text-xs text-[#ababab]">{sale.cashier} · {sale.channel}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-semibold text-[#d3d3d3]">₹{sale.total}</p>
                                                    <p className="text-xs text-[#ababab]">{sale.time}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>
                        ) : (
                            <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
                                <section className="rounded-[24px] bg-[#2a2a2a] p-5 shadow-lg">
                                    <h2 className="mb-5 text-xl font-semibold">Category Breakdown</h2>
                                    <div className="flex items-center justify-center">
                                        <div className="relative flex size-48 items-center justify-center rounded-full" style={{ background: pieGradient }}>
                                            <div className="flex size-24 items-center justify-center rounded-full bg-[#1f1f1f] text-center text-sm font-semibold">
                                                {categoryMix.reduce((sum, item) => sum + Number(item.value || 0), 0)}%
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-5 space-y-2">
                                        {categoryMix.map((category) => (
                                            <div key={category.label} className="flex items-center justify-between gap-3 text-sm text-[#d3d3d3]">
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-block size-3 rounded-full" style={{ background: category.color || "#d3d3d3" }} />
                                                    {category.label}
                                                </div>
                                                <span>{category.value}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                <section className="rounded-[24px] bg-[#2a2a2a] p-5 shadow-lg">
                                    <h2 className="mb-5 text-xl font-semibold">Top Items</h2>
                                    <div className="space-y-4">
                                        {topItems.map((item, index) => (
                                            <div key={item.name} className="rounded-[14px] bg-[#1f1f1f] p-3">
                                                <div className="mb-2 flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="font-medium">{index + 1}. {item.name}</p>
                                                        <p className="text-xs text-[#ababab]">{item.sales} sold</p>
                                                    </div>
                                                    <p className="text-sm font-semibold text-[#a6f0c7]">₹{Number(item.revenue || 0).toLocaleString()}</p>
                                                </div>
                                                <div className="h-2 overflow-hidden rounded-full bg-[#3a3a3a]">
                                                    <div
                                                        className="h-full rounded-full bg-[#d3d3d3]"
                                                        style={{
                                                            width: `${Math.min((Number(item.sales || 0) / Math.max(...topItems.map((it) => Number(it.sales || 0)), 1)) * 100, 100)}%`,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>
                        )}
                    </>
                )}
            </div>
        </main>
    );
};

export default AdminSettings;
