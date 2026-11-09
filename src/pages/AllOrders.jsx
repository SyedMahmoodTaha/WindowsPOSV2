import { useEffect, useState } from "react";
import { FaArrowLeft, FaEye, FaPrint, FaXmark } from "react-icons/fa6";
import { Link, useLocation } from "react-router-dom";
import { printOrder, readOrders } from "../utils/orderStorage";
import { getCurrentUser } from "../utils/auth";

const formatCurrency = (amount) => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
}).format(Math.round(Number(amount) || 0));

const formatDateTime = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
};

const getOrderLocation = (order) => order.orderType === "Table"
    ? `Table ${order.orderDetails?.tableNumber || "Unassigned"}`
    : order.orderType || "Walk-in";

const AllOrders = () => {
    const location = useLocation();
    const user = getCurrentUser();
    const canViewFinancialDetails = user?.role === "Admin";
    const backPath = location.state?.from === "/more-settings"
        ? "/more-settings"
        : canViewFinancialDetails ? "/admin-settings" : "/";
    const [orders, setOrders] = useState(readOrders);
    const [search, setSearch] = useState("");
    const [viewOrder, setViewOrder] = useState(null);
    const completedOrders = orders.filter((order) => order.status === "completed");
    const searchTerm = search.trim().toLowerCase();
    const visibleOrders = completedOrders.filter((order) => [
        order.orderNumber,
        order.orderType,
        order.orderDetails?.customerName,
        order.orderDetails?.phone,
        order.orderDetails?.tableNumber,
    ].some((value) => String(value || "").toLowerCase().includes(searchTerm)));

    useEffect(() => {
        const refreshOrders = () => setOrders(readOrders());
        window.addEventListener("pfl-orders-updated", refreshOrders);
        window.addEventListener("storage", refreshOrders);
        return () => {
            window.removeEventListener("pfl-orders-updated", refreshOrders);
            window.removeEventListener("storage", refreshOrders);
        };
    }, []);

    return (
        <main className="min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto max-w-5xl">
                <div className="mb-6 flex items-center gap-4 sm:mb-8">
                    <Link to={backPath} className="rounded-full p-3 text-[#d3d3d3] transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label={backPath === "/more-settings" ? "Back to More Settings" : canViewFinancialDetails ? "Back to settings" : "Back to home"}>
                        <FaArrowLeft />
                    </Link>
                    <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Order history</p>
                        <h1 className="text-3xl font-semibold">All Orders</h1>
                    </div>
                </div>

                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-[#ababab]">{completedOrders.length} completed {completedOrders.length === 1 ? "order" : "orders"}</p>
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search order, customer, phone, or table"
                        aria-label="Search completed orders"
                        className="w-full rounded-[10px] border border-[#444] bg-[#2a2a2a] px-3 py-3 text-sm text-[#f5f5f5] outline-none placeholder:text-[#777] focus:border-[#d3d3d3] sm:max-w-sm"
                    />
                </div>

                {visibleOrders.length === 0 ? (
                    <section className="rounded-[16px] bg-[#2a2a2a] p-8 text-center text-[#ababab]">
                        {completedOrders.length === 0 ? "Completed orders will appear here." : "No completed orders match this search."}
                    </section>
                ) : (
                    <div className="divide-y divide-[#3a3a3a] border-y border-[#3a3a3a]">
                        {visibleOrders.map((order) => (
                            <article key={order.id} className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="font-semibold">#{order.orderNumber || order.id}</h2>
                                        <span className="rounded-full bg-[#a6f0c7] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#163b28]">Completed</span>
                                    </div>
                                    <p className="mt-1 text-sm text-[#ababab]">{getOrderLocation(order)} · {formatDateTime(order.createdAt)}</p>
                                    {canViewFinancialDetails && <p className="mt-1 text-sm font-semibold">{formatCurrency(order.total)}</p>}
                                </div>
                                <div className="flex shrink-0 gap-2">
                                    <button type="button" onClick={() => setViewOrder(order)} className="inline-flex items-center gap-2 rounded-[10px] border border-[#555] px-3 py-2 text-sm font-medium text-[#f5f5f5] transition-colors hover:bg-[#3a3a3a]" aria-label={`View order ${order.orderNumber || order.id}`}>
                                        <FaEye /> <span>View</span>
                                    </button>
                                    {canViewFinancialDetails && <button type="button" onClick={() => printOrder(order, "cashier")} className="inline-flex items-center gap-2 rounded-[10px] bg-[#d3d3d3] px-3 py-2 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-white" aria-label={`Reprint order ${order.orderNumber || order.id}`}>
                                        <FaPrint /> <span>Reprint</span>
                                    </button>}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>

            {viewOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewOrder(null); }}>
                    <section role="dialog" aria-modal="true" aria-labelledby="all-order-view-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[16px] bg-[#2a2a2a] p-5 text-[#f5f5f5] shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-[#444] pb-4">
                            <div>
                                <p className="text-sm uppercase tracking-[0.16em] text-[#ababab]">{getOrderLocation(viewOrder)}</p>
                                <h2 id="all-order-view-title" className="mt-1 text-2xl font-semibold">Order #{viewOrder.orderNumber || viewOrder.id}</h2>
                                <p className="mt-1 text-sm text-[#ababab]">{formatDateTime(viewOrder.createdAt)}</p>
                            </div>
                            <button type="button" onClick={() => setViewOrder(null)} className="rounded-full p-2 text-[#ababab] transition-colors hover:bg-[#3a3a3a] hover:text-white" aria-label="Close order details">
                                <FaXmark />
                            </button>
                        </div>

                        <div className="space-y-2 border-b border-[#444] py-4 text-sm">
                            {viewOrder.orderDetails?.customerName && <p className="flex justify-between gap-4"><span className="text-[#ababab]">Customer</span><span className="text-right">{viewOrder.orderDetails.customerName}</span></p>}
                            {viewOrder.orderDetails?.phone && <p className="flex justify-between gap-4"><span className="text-[#ababab]">Phone</span><span className="text-right">{viewOrder.orderDetails.phone}</span></p>}
                            {viewOrder.orderDetails?.address && <p className="flex justify-between gap-4"><span className="text-[#ababab]">Address</span><span className="text-right">{viewOrder.orderDetails.address}</span></p>}
                            {viewOrder.cashier && <p className="flex justify-between gap-4"><span className="text-[#ababab]">Cashier</span><span className="text-right">{viewOrder.cashier}</span></p>}
                        </div>

                        <div className="space-y-3 py-4">
                            {(viewOrder.cart || []).map((item, index) => (
                                <div key={`${item.id || item.name}-${index}`} className="flex justify-between gap-4 text-sm">
                                    <span>{item.quantity || 1} × {item.name}{item.note ? <span className="block text-xs text-[#ababab]">{item.note}</span> : null}</span>
                                    {canViewFinancialDetails && <span className="shrink-0">{formatCurrency(Number(item.price || 0) * Number(item.quantity || 1))}</span>}
                                </div>
                            ))}
                        </div>

                        {viewOrder.orderNote && <p className="border-t border-[#444] py-3 text-sm"><span className="text-[#ababab]">Order note: </span>{viewOrder.orderNote}</p>}
                        {canViewFinancialDetails && <div className="space-y-2 border-t border-[#444] pt-4 text-sm">
                            {viewOrder.subtotal !== undefined && <p className="flex justify-between"><span className="text-[#ababab]">Subtotal</span><span>{formatCurrency(viewOrder.subtotal)}</span></p>}
                            {Number(viewOrder.charges?.Delivery || viewOrder.deliveryCharge || 0) > 0 && <p className="flex justify-between"><span className="text-[#ababab]">Delivery</span><span>{formatCurrency(viewOrder.charges?.Delivery || viewOrder.deliveryCharge)}</span></p>}
                            {Number(viewOrder.charges?.Parcel || viewOrder.parcelCharge || 0) > 0 && <p className="flex justify-between"><span className="text-[#ababab]">Parcel</span><span>{formatCurrency(viewOrder.charges?.Parcel || viewOrder.parcelCharge)}</span></p>}
                            {Number(viewOrder.discount || 0) > 0 && <p className="flex justify-between"><span className="text-[#ababab]">Discount</span><span>-{formatCurrency(viewOrder.discount)}</span></p>}
                            <p className="flex justify-between text-lg font-semibold"><span>Total</span><span>{formatCurrency(viewOrder.total)}</span></p>
                        </div>}

                        {canViewFinancialDetails && <button type="button" onClick={() => printOrder(viewOrder, "cashier")} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#d3d3d3] px-4 py-3 font-semibold text-[#1a1a1a] transition-colors hover:bg-white">
                            <FaPrint /> Reprint receipt
                        </button>}
                    </section>
                </div>
            )}
        </main>
    );
};

export default AllOrders;