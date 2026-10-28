import { useEffect, useState } from "react";
import { FaArrowLeft } from "react-icons/fa6";
import { Link, useNavigate } from "react-router-dom";
import { readOrders, updateOrder } from "../utils/orderStorage";

const formatCurrency = (amount) => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
}).format(Math.round(amount));

const Orders = () => {
    const [orders, setOrders] = useState(readOrders);
    const [orderView, setOrderView] = useState("parcel");
    const navigate = useNavigate();

    useEffect(() => {
        const refreshOrders = () => setOrders(readOrders());
        window.addEventListener("pfl-orders-updated", refreshOrders);
        window.addEventListener("storage", refreshOrders);
        return () => {
            window.removeEventListener("pfl-orders-updated", refreshOrders);
            window.removeEventListener("storage", refreshOrders);
        };
    }, []);

    const editableOrders = orders.filter((order) => order.orderType === "Parcel" && order.status !== "completed" || order.orderType === "Takeaway" && order.status !== "completed");
    const deliveryOrders = orders.filter((order) => order.orderType === "Delivery" && order.status !== "completed");
    const tableOrders = orders.filter((order) => order.orderType === "Table" && order.status !== "completed");
    const visibleOrders = orderView === "parcel" ? editableOrders : orderView === "delivery" ? deliveryOrders : tableOrders;
    const openOrder = (order) => navigate("/new-order", { state: { from: "/Orders", existingOrder: order } });
    const renderOrders = (sectionOrders, editable) => sectionOrders.map((order) => (
        <article key={order.id} className={`flex aspect-[4/3] flex-col overflow-hidden rounded-[16px] p-4 text-[#1a1a1a] ${order.status === "kot" ? "bg-[#fff3b0]" : "bg-[#d3d3d3]"} ${editable ? "cursor-pointer transition-transform hover:-translate-y-1" : ""}`} onClick={editable ? () => openOrder(order) : undefined} onKeyDown={editable ? (event) => { if (event.key === "Enter" || event.key === " ") openOrder(order); } : undefined} role={editable ? "button" : undefined} tabIndex={editable ? 0 : undefined}>
            <div className="flex items-start justify-between gap-2 border-b border-black/20 pb-2"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold">#{order.orderNumber}</h2><span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-semibold uppercase">{order.status === "kot" ? "KOT" : "Saved"}</span></div><p className="mt-1 text-xs">{order.orderType === "Table" ? `Table ${order.orderDetails?.tableNumber || "Unassigned"}` : order.orderType}</p></div><div className="text-right text-xs"><p>{new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p><p className="mt-1 font-semibold">{formatCurrency(order.total)}</p></div></div>
            <div className="scrollbar-hide mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto text-xs">{order.cart.map((item) => <div key={`${order.id}-${item.id}`} className="flex justify-between gap-4"><span>{item.quantity} x {item.name}{item.note ? ` (${item.note})` : ""}</span><span>{formatCurrency(item.price * item.quantity)}</span></div>)}</div>
            {order.orderNote && <p className="mt-2 truncate border-t border-black/20 pt-2 text-xs">Note: {order.orderNote}</p>}
            <button type="button" onClick={(event) => { event.stopPropagation(); updateOrder(order.id, { status: "completed" }); }} className="mt-3 w-full rounded-[10px] bg-black/10 px-3 py-2 text-xs font-semibold transition-colors hover:bg-black/20">Completed</button>
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

                {orders.length === 0 ? <section className="rounded-[24px] bg-[#2a2a2a] p-10 text-center text-[#ababab]">No saved orders yet</section> : <div><div className="mb-5 grid grid-cols-3 rounded-[12px] bg-[#2a2a2a] p-1"><button type="button" onClick={() => setOrderView("parcel")} className={`rounded-[10px] px-2 py-2 text-sm font-semibold transition-colors ${orderView === "parcel" ? "bg-[#d3d3d3] text-[#1a1a1a]" : "text-[#ababab] hover:text-[#f5f5f5]"}`}>Parcel / Takeaway</button><button type="button" onClick={() => setOrderView("delivery")} className={`rounded-[10px] px-2 py-2 text-sm font-semibold transition-colors ${orderView === "delivery" ? "bg-[#d3d3d3] text-[#1a1a1a]" : "text-[#ababab] hover:text-[#f5f5f5]"}`}>Deliveries</button><button type="button" onClick={() => setOrderView("table")} className={`rounded-[10px] px-2 py-2 text-sm font-semibold transition-colors ${orderView === "table" ? "bg-[#d3d3d3] text-[#1a1a1a]" : "text-[#ababab] hover:text-[#f5f5f5]"}`}>Tables</button></div><h2 className="mb-3 text-xl font-semibold">{orderView === "parcel" ? "Parcel / Takeaway" : orderView === "delivery" ? "Deliveries" : "Tables"}</h2>{visibleOrders.length === 0 ? <div className="rounded-[16px] bg-[#2a2a2a] p-6 text-[#ababab]">{orderView === "parcel" ? "No parcel or takeaway orders" : orderView === "delivery" ? "No delivery orders" : "No table orders"}</div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{renderOrders(visibleOrders, true)}</div>}</div>}
            </div>
        </main>
    );
};

export default Orders;