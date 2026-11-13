import { useEffect, useState } from "react";
import { FaArrowLeft, FaXmark } from "react-icons/fa6";
import { Link, useNavigate } from "react-router-dom";
import { completeOrderWithInventory, readOrders } from "../utils/orderStorage";

const formatCurrency = (amount) => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
}).format(Math.round(amount));

const formatElapsed = (createdAt, now) => {
    const elapsedSeconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
    if (!Number.isFinite(elapsedSeconds)) return "--:--:--";
    const hours = String(Math.floor(elapsedSeconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, "0");
    const seconds = String(elapsedSeconds % 60).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
};

const Orders = () => {
    const [orders, setOrders] = useState(readOrders);
    const [orderView, setOrderView] = useState("parcel");
    const [previewOrder, setPreviewOrder] = useState(null);
    const [now, setNow] = useState(Date.now);
    const [completionMessage, setCompletionMessage] = useState("");
    const [completingOrderId, setCompletingOrderId] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        const refreshOrders = () => setOrders(readOrders());
        window.addEventListener("pfl-orders-updated", refreshOrders);
        window.addEventListener("storage", refreshOrders);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("pfl-orders-updated", refreshOrders);
            window.removeEventListener("storage", refreshOrders);
        };
    }, []);

    const editableOrders = orders.filter((order) => order.orderType === "Parcel" && order.status !== "completed" || order.orderType === "Takeaway" && order.status !== "completed");
    const deliveryOrders = orders.filter((order) => order.orderType === "Delivery" && order.status !== "completed");
    const tableOrders = orders.filter((order) => order.orderType === "Table" && order.status !== "completed");
    const visibleOrders = orderView === "parcel" ? editableOrders : orderView === "delivery" ? deliveryOrders : tableOrders;
    const openOrder = (order) => navigate("/new-order", { state: { from: "/Orders", existingOrder: order } });
    const completeOrder = async (order) => {
        setCompletingOrderId(order.id);
        setCompletionMessage("");
        try {
            const result = await completeOrderWithInventory(order.id);
            if (!result.ok) {
                setCompletionMessage(result.reason);
                return;
            }
            setOrders(readOrders());
            setPreviewOrder(null);
        } catch (error) {
            console.error("Could not complete order or update inventory:", error);
            setCompletionMessage(`Could not complete this order: ${error.message}`);
        } finally {
            setCompletingOrderId(null);
        }
    };
    const renderOrders = (sectionOrders, editable) => sectionOrders.map((order) => (
        <article key={order.id} className={`flex aspect-[4/3] flex-col overflow-hidden rounded-[16px] p-4 text-[#1a1a1a] ${order.status === "kot" ? "bg-[#fff3b0]" : "bg-[#d3d3d3]"} ${editable ? "cursor-pointer transition-transform hover:-translate-y-1" : ""}`} onClick={editable ? () => setPreviewOrder(order) : undefined} onKeyDown={editable ? (event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setPreviewOrder(order); } } : undefined} role={editable ? "button" : undefined} tabIndex={editable ? 0 : undefined}>
            <div className="flex items-start justify-between gap-2 border-b border-black/20 pb-2"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold">#{order.orderNumber}</h2><span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-semibold uppercase">{order.status === "kot" ? "KOT" : "Saved"}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${order.paymentStatus === "paid" ? "bg-[#a6f0c7] text-[#163b28]" : "bg-[#f08080] text-[#471515]"}`}>{order.paymentStatus === "paid" ? "Paid" : "Due"}</span></div><p className="mt-1 text-xs">{order.orderType === "Table" ? `Table ${order.orderDetails?.tableNumber || "Unassigned"}` : order.orderType}{(order.orderType === "Parcel" || order.orderType === "Takeaway") && order.orderDetails?.customerName ? ` · ${order.orderDetails.customerName}` : ""}</p></div><div className="text-right text-xs"><p>{new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p><p className="mt-1 font-semibold tabular-nums" aria-label="Time since order was created">{formatElapsed(order.createdAt, now)}</p><p className="mt-1 font-semibold">{formatCurrency(order.total)}</p></div></div>
            <div className="scrollbar-hide mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto text-xs">{order.cart.map((item) => <div key={`${order.id}-${item.id}`} className="flex justify-between gap-4"><span>{item.quantity} x {item.name}{item.note ? ` (${item.note})` : ""}</span><span>{formatCurrency(item.price * item.quantity)}</span></div>)}</div>
            {order.orderNote && <p className="mt-2 truncate border-t border-black/20 pt-2 text-xs">Note: {order.orderNote}</p>}
            <button type="button" onClick={(event) => { event.stopPropagation(); void completeOrder(order); }} disabled={completingOrderId === order.id} className="mt-3 w-full rounded-[10px] bg-black/10 px-3 py-2 text-xs font-semibold transition-colors hover:bg-black/20 disabled:opacity-50">{completingOrderId === order.id ? "Updating stock..." : "Completed"}</button>
        </article>
    ));

    return (
        <main className="min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto max-w-5xl">
                <div className="mb-8 flex items-center gap-4">
                    <Link to="/" className="rounded-full p-3 text-[#d3d3d3] transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label="Back to home">
                        <FaArrowLeft />
                    </Link>
                    <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Point of sale</p>
                        <h1 className="text-3xl font-semibold">Orders</h1>
                    </div>
                </div>

                {completionMessage && <p role="alert" className="mb-4 rounded-[12px] border border-[#754b32] bg-[#35251c] px-4 py-3 text-sm text-[#ffd1a8]">{completionMessage}</p>}
                {orders.length === 0 ? <section className="rounded-[24px] bg-[#2a2a2a] p-10 text-center text-[#ababab]">No saved orders yet</section> : <div><div className="mb-5 grid grid-cols-3 rounded-[12px] bg-[#2a2a2a] p-1"><button type="button" onClick={() => setOrderView("parcel")} className={`rounded-[10px] px-2 py-2 text-sm font-semibold transition-colors ${orderView === "parcel" ? "bg-[#d3d3d3] text-[#1a1a1a]" : "text-[#ababab] hover:text-[#f5f5f5]"}`}>Parcel / Takeaway</button><button type="button" onClick={() => setOrderView("delivery")} className={`rounded-[10px] px-2 py-2 text-sm font-semibold transition-colors ${orderView === "delivery" ? "bg-[#d3d3d3] text-[#1a1a1a]" : "text-[#ababab] hover:text-[#f5f5f5]"}`}>Deliveries</button><button type="button" onClick={() => setOrderView("table")} className={`rounded-[10px] px-2 py-2 text-sm font-semibold transition-colors ${orderView === "table" ? "bg-[#d3d3d3] text-[#1a1a1a]" : "text-[#ababab] hover:text-[#f5f5f5]"}`}>Tables</button></div><h2 className="mb-3 text-xl font-semibold">{orderView === "parcel" ? "Parcel / Takeaway" : orderView === "delivery" ? "Deliveries" : "Tables"}</h2>{visibleOrders.length === 0 ? <div className="rounded-[16px] bg-[#2a2a2a] p-6 text-[#ababab]">{orderView === "parcel" ? "No parcel or takeaway orders" : orderView === "delivery" ? "No delivery orders" : "No table orders"}</div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{renderOrders(visibleOrders, true)}</div>}</div>}
            </div>
            {previewOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewOrder(null); }}>
                    <section role="dialog" aria-modal="true" aria-labelledby="order-preview-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[16px] bg-[#2a2a2a] p-5 text-[#f5f5f5] shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-[#444] pb-4">
                            <div>
                                <p className="text-sm uppercase tracking-[0.16em] text-[#ababab]">{previewOrder.orderType}{(previewOrder.orderType === "Parcel" || previewOrder.orderType === "Takeaway") && previewOrder.orderDetails?.customerName ? ` · ${previewOrder.orderDetails.customerName}` : ""}</p>
                                <h2 id="order-preview-title" className="mt-1 text-2xl font-semibold">Order #{previewOrder.orderNumber || previewOrder.id}</h2>
                                <p className="mt-1 text-sm text-[#ababab]">{new Date(previewOrder.createdAt).toLocaleString()} · {formatElapsed(previewOrder.createdAt, now)} elapsed</p>
                            </div>
                            <button type="button" onClick={() => setPreviewOrder(null)} className="rounded-full p-2 text-[#ababab] transition-colors hover:bg-[#3a3a3a] hover:text-white" aria-label="Close preview">
                                <FaXmark />
                            </button>
                        </div>
                        <div className="space-y-2 border-b border-[#444] py-4 text-sm">
                            {previewOrder.orderDetails?.customerName && <p className="flex justify-between gap-4"><span className="text-[#ababab]">Customer</span><span className="text-right">{previewOrder.orderDetails.customerName}</span></p>}
                            {previewOrder.orderDetails?.phone && <p className="flex justify-between gap-4"><span className="text-[#ababab]">Phone</span><span className="text-right">{previewOrder.orderDetails.phone}</span></p>}
                            {previewOrder.orderDetails?.address && <p className="flex justify-between gap-4"><span className="text-[#ababab]">Address</span><span className="text-right">{previewOrder.orderDetails.address}</span></p>}
                            {previewOrder.orderDetails?.tableNumber && <p className="flex justify-between gap-4"><span className="text-[#ababab]">Table</span><span className="text-right">{previewOrder.orderDetails.tableNumber}</span></p>}
                        </div>
                        <div className="space-y-2 border-b border-[#444] py-4 text-sm">
                            {(previewOrder.cart || []).map((item) => <div key={`${previewOrder.id}-${item.id}`} className="flex justify-between gap-4"><span>{item.quantity} × {item.name}{item.note ? ` (${item.note})` : ""}</span><span className="shrink-0">{formatCurrency(item.price * item.quantity)}</span></div>)}
                            {previewOrder.orderNote && <p className="border-t border-[#444] pt-2 text-[#ababab]">Note: {previewOrder.orderNote}</p>}
                        </div>
                        <p className="flex justify-between py-2 text-sm"><span className="text-[#ababab]">Payment status</span><strong>{previewOrder.paymentStatus === "paid" ? "Paid" : "Due"}</strong></p>
                        <p className="flex justify-between py-4 text-lg"><span>Total</span><strong>{formatCurrency(previewOrder.total)}</strong></p>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setPreviewOrder(null)} className="rounded-[10px] border border-[#555] px-4 py-3 text-sm font-semibold text-[#f5f5f5] transition-colors hover:bg-[#3a3a3a]">Close preview</button>
                            <button type="button" onClick={() => openOrder(previewOrder)} className="rounded-[10px] bg-[#d3d3d3] px-4 py-3 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-white">Edit order</button>
                        </div>
                    </section>
                </div>
            )}
        </main>
    );
};

export default Orders;