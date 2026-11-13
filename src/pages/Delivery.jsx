import { useEffect, useState } from "react";
import { FaArrowLeft, FaRightFromBracket, FaTruckFast } from "react-icons/fa6";
import { Link } from "react-router-dom";
import {
    createDeliveryRider,
    isDeliveryCloudConfigured,
    listenDeliveryManager,
    signInDeliveryManager,
    signOutDeliveryManager,
    setDeliveryRiderEnabled,
    subscribeDeliveryOrders,
    subscribeDeliveryRiders,
    syncDeliveryOrders,
} from "../utils/deliveryCloud";
import { readOrders } from "../utils/orderStorage";

const formatCurrency = (amount) => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
}).format(Math.round(Number(amount) || 0));

const orderStatuses = {
    available: { label: "Available", className: "bg-[#493b21] text-[#f6d88c]" },
    with_rider: { label: "Picked up", className: "bg-[#26364a] text-[#b8d7ff]" },
    on_way: { label: "On the way", className: "bg-[#26364a] text-[#b8d7ff]" },
    delivered: { label: "Delivered", className: "bg-[#203328] text-[#b7f0cc]" },
};

const Delivery = () => {
    const [manager, setManager] = useState(null);
    const [riders, setRiders] = useState([]);
    const [orders, setOrders] = useState([]);
    const [previewOrder, setPreviewOrder] = useState(null);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const [success, setSuccess] = useState("");
    const [busy, setBusy] = useState(false);
    const [riderDraft, setRiderDraft] = useState({
        name: "",
        email: "",
        password: "",
        phone: "",
        area: "",
    });
    const [savingRider, setSavingRider] = useState(false);
    const [riderActionUid, setRiderActionUid] = useState("");
    const [now, setNow] = useState(Date.now);

    useEffect(() => {
        const unsubscribe = listenDeliveryManager((profile, error) => {
            setManager(profile);
            if (error) setMessage(`Could not check the Firebase account: ${error.message}`);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        const handleSyncError = (event) => {
            setMessage(`Could not sync delivery orders: ${event.detail?.message || "Unknown sync error"}`);
        };
        window.addEventListener("pfl-delivery-sync-error", handleSyncError);
        return () => window.removeEventListener("pfl-delivery-sync-error", handleSyncError);
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 30000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!previewOrder) return undefined;
        const closeOnEscape = (event) => {
            if (event.key === "Escape") setPreviewOrder(null);
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [previewOrder]);

    useEffect(() => {
        if (!manager) return undefined;
        const handleError = (error) => setMessage(`Could not load delivery data: ${error.message}`);
        const stopOrders = subscribeDeliveryOrders(setOrders, handleError);
        const stopRiders = subscribeDeliveryRiders(setRiders, handleError);
        void syncDeliveryOrders(readOrders()).catch((error) => {
            setMessage(`Could not publish POS delivery orders: ${error.message}`);
        });
        return () => {
            stopOrders();
            stopRiders();
        };
    }, [manager]);

    const submitLogin = async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        setSuccess("");
        try {
            const profile = await signInDeliveryManager(email, password);
            setManager(profile);
            setPassword("");
        } catch (error) {
            setMessage(error.message);
        } finally {
            setBusy(false);
        }
    };

    const submitRider = async (event) => {
        event.preventDefault();
        setSavingRider(true);
        setMessage("");
        setSuccess("");
        try {
            await createDeliveryRider(riderDraft);
            setRiderDraft({ name: "", email: "", password: "", phone: "", area: "" });
            setSuccess("Rider account created. Share the email and initial password privately with the rider.");
        } catch (error) {
            setMessage(`Could not add rider: ${error.message}`);
        } finally {
            setSavingRider(false);
        }
    };

    const toggleRiderAccess = async (rider) => {
        const enabled = rider.enabled === false;
        const activeOrders = orders.filter((order) => order.riderUid === rider.uid
            && ["with_rider", "on_way"].includes(order.status));
        if (!enabled && ((Number(rider.activeCount) || 0) > 0 || activeOrders.length > 0)) {
            setMessage("This rider still has active deliveries. Complete them before removing access.");
            return;
        }
        const action = enabled ? "restore access to" : "remove access for";
        if (!window.confirm(`Are you sure you want to ${action} ${rider.name || rider.email}? This keeps their Firebase account and delivery history; you can change this later.`)) {
            return;
        }

        setRiderActionUid(rider.uid);
        setMessage("");
        setSuccess("");
        try {
            await setDeliveryRiderEnabled(rider.uid, enabled);
            setSuccess(enabled
                ? `${rider.name || rider.email} can sign in to the rider app again.`
                : `${rider.name || rider.email} can no longer access the rider app.`);
        } catch (error) {
            setMessage(`Could not update rider access: ${error.message}`);
        } finally {
            setRiderActionUid("");
        }
    };

    const isRiderOnline = (rider) => {
        const lastSeenAt = rider.lastSeenAt;
        if (!lastSeenAt) return false;
        const timestamp = typeof lastSeenAt.toDate === "function" ? lastSeenAt.toDate().getTime() : new Date(lastSeenAt).getTime();
        return rider.enabled !== false && Number.isFinite(timestamp) && now - timestamp <= 90000;
    };

    const ongoingOrders = orders.filter((order) => order.status !== "delivered");
    const deliveredOrders = orders.filter((order) => order.status === "delivered");
    const selectedOrder = previewOrder
        ? orders.find((order) => order.id === previewOrder.id) || previewOrder
        : null;
    const renderOrderCards = (sectionOrders) => sectionOrders.map((order) => {
        const status = orderStatuses[order.status] || {
            label: String(order.status || "Unknown").replaceAll("_", " "),
            className: "bg-[#3a3a3a] text-[#d3d3d3]",
        };
        const riderLabel = order.riderName || (order.status === "available" ? "Waiting for rider" : "Rider not listed");
        return (
            <button
                type="button"
                key={order.id}
                onClick={() => setPreviewOrder(order)}
                aria-label={`Preview delivery order ${order.orderNumber || order.posOrderId}`}
                className="group w-full rounded-[16px] border border-[#393939] bg-[#2a2a2a] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#666] hover:bg-[#303030] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3d3d3]"
            >
                <span className="flex items-start justify-between gap-3">
                    <span>
                        <span className="block text-lg font-semibold">#{order.orderNumber || order.posOrderId}</span>
                        <span className="mt-1 block text-sm text-[#ababab]">{order.customerName || "Customer"}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
                </span>
                <span className="mt-3 block truncate text-sm text-[#c5c5c5]">{order.address || "No delivery address"}</span>
                <span className="mt-4 flex items-end justify-between gap-3 border-t border-[#414141] pt-3">
                    <span>
                        <span className="block text-xs text-[#8f8f8f]">Rider</span>
                        <span className="mt-1 block max-w-[190px] truncate text-sm">{riderLabel}</span>
                    </span>
                    <span className="text-right">
                        <span className="block text-xs text-[#8f8f8f]">Order total</span>
                        <span className="mt-1 block text-base font-semibold">{formatCurrency(order.total)}</span>
                    </span>
                </span>
                <span className="mt-3 block text-xs text-[#ababab] group-hover:text-white">Open order preview</span>
            </button>
        );
    });

    return (
        <main className="min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto max-w-6xl">
                <header className="mb-7 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link to="/" className="rounded-full p-3 text-[#d3d3d3] hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label="Back to home"><FaArrowLeft /></Link>
                        <div>
                            <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Delivery operations</p>
                            <h1 className="text-3xl font-semibold">Delivery</h1>
                        </div>
                    </div>
                    {manager && <button type="button" onClick={() => void signOutDeliveryManager()} className="inline-flex items-center gap-2 rounded-[10px] border border-[#555] px-3 py-2 text-sm hover:bg-[#3a3a3a]"><FaRightFromBracket /> Sign out</button>}
                </header>

                {!isDeliveryCloudConfigured && (
                    <section className="mb-5 rounded-[16px] border border-[#684f2b] bg-[#352d20] p-5 text-sm text-[#ffe0a6]">
                        Add your Firebase web app settings to the POS `.env` file and restart the app. Follow the setup steps in `DAPP/README.md`.
                    </section>
                )}
                {message && <p role="alert" className="mb-5 rounded-[12px] border border-[#754b32] bg-[#35251c] px-4 py-3 text-sm text-[#ffd1a8]">{message}</p>}
                {success && <p role="status" className="mb-5 rounded-[12px] border border-[#41624f] bg-[#203328] px-4 py-3 text-sm text-[#b7f0cc]">{success}</p>}

                {!manager ? (
                    <section className="mx-auto max-w-md rounded-[20px] bg-[#2a2a2a] p-6">
                        <h2 className="text-xl font-semibold">Connect delivery service</h2>
                        <p className="mt-2 text-sm text-[#ababab]">Sign in with the Firebase delivery-manager account configured for this POS.</p>
                        <form onSubmit={submitLogin} className="mt-5 grid gap-4">
                            <label className="grid gap-2 text-sm text-[#ababab]">Firebase email<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="field" /></label>
                            <label className="grid gap-2 text-sm text-[#ababab]">Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="field" /></label>
                            <button disabled={!isDeliveryCloudConfigured || busy} className="rounded-[12px] bg-[#d3d3d3] px-4 py-3 font-semibold text-[#1a1a1a] disabled:opacity-50">{busy ? "Connecting..." : "Connect POS"}</button>
                        </form>
                    </section>
                ) : (
                    <>
                        <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {[
                                ["Ongoing orders", ongoingOrders.length],
                                ["Delivered", deliveredOrders.length],
                                ["Rider accounts", riders.filter((rider) => rider.enabled !== false).length],
                                ["Online now", riders.filter(isRiderOnline).length],
                            ].map(([label, count]) => <section key={label} className="rounded-[16px] border border-[#393939] bg-[#2a2a2a] p-4"><p className="text-sm text-[#ababab]">{label}</p><p className="mt-1 text-2xl font-semibold">{count}</p></section>)}
                        </div>

                        <section className="mb-8">
                            <div className="mb-4 flex items-end justify-between gap-3">
                                <div>
                                    <h2 className="text-xl font-semibold">Ongoing</h2>
                                    <p className="mt-1 text-sm text-[#ababab]">Available for pickup, picked up, and on the way</p>
                                </div>
                                <span className="rounded-full bg-[#2a2a2a] px-3 py-1 text-sm text-[#ababab]">{ongoingOrders.length}</span>
                            </div>
                            {ongoingOrders.length === 0
                                ? <p className="rounded-[16px] border border-dashed border-[#444] bg-[#252525] p-6 text-sm text-[#ababab]">No ongoing delivery orders.</p>
                                : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{renderOrderCards(ongoingOrders)}</div>}
                        </section>

                        <section className="mb-8">
                            <div className="mb-4 flex items-end justify-between gap-3">
                                <div>
                                    <h2 className="text-xl font-semibold">Delivered</h2>
                                    <p className="mt-1 text-sm text-[#ababab]">Completed delivery orders</p>
                                </div>
                                <span className="rounded-full bg-[#2a2a2a] px-3 py-1 text-sm text-[#ababab]">{deliveredOrders.length}</span>
                            </div>
                            {deliveredOrders.length === 0
                                ? <p className="rounded-[16px] border border-dashed border-[#444] bg-[#252525] p-6 text-sm text-[#ababab]">Delivered orders will appear here.</p>
                                : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{renderOrderCards(deliveredOrders)}</div>}
                        </section>

                        <section className="border-t border-[#3b3b3b] pt-7">
                            <h2 className="mb-1 text-xl font-semibold">Manage riders</h2>
                            <p className="mb-4 text-xs text-[#8f8f8f]"><FaTruckFast className="mr-1 inline" /> Online status expires when the rider app stops checking in. Removing access disables the rider profile but keeps their Firebase login and delivery history.</p>
                            <form onSubmit={submitRider} className="mb-5 rounded-[16px] bg-[#2a2a2a] p-5">
                                <h3 className="font-semibold">Add a rider</h3>
                                <p className="mt-1 text-xs text-[#ababab]">This creates the rider's Firebase sign-in and POS delivery profile. Note the initial password before submitting; it is not emailed.</p>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <label className="grid gap-2 text-sm text-[#ababab]">Rider name<input required value={riderDraft.name} onChange={(event) => setRiderDraft((current) => ({ ...current, name: event.target.value }))} className="field" /></label>
                                    <label className="grid gap-2 text-sm text-[#ababab]">Email<input required type="email" autoComplete="email" value={riderDraft.email} onChange={(event) => setRiderDraft((current) => ({ ...current, email: event.target.value }))} className="field" /></label>
                                    <label className="grid gap-2 text-sm text-[#ababab]">Initial password<input required type="password" minLength={6} autoComplete="new-password" value={riderDraft.password} onChange={(event) => setRiderDraft((current) => ({ ...current, password: event.target.value }))} className="field" /></label>
                                    <label className="grid gap-2 text-sm text-[#ababab]">Phone (optional)<input type="tel" value={riderDraft.phone} onChange={(event) => setRiderDraft((current) => ({ ...current, phone: event.target.value }))} className="field" /></label>
                                    <label className="grid gap-2 text-sm text-[#ababab] sm:col-span-2">Preferred area (optional)<input value={riderDraft.area} onChange={(event) => setRiderDraft((current) => ({ ...current, area: event.target.value }))} className="field" /></label>
                                </div>
                                <button type="submit" disabled={savingRider} className="mt-4 rounded-[10px] bg-[#d3d3d3] px-4 py-2.5 text-sm font-semibold text-[#1a1a1a] disabled:opacity-50">{savingRider ? "Creating rider..." : "Create rider account"}</button>
                            </form>
                            {riders.length === 0 ? <p className="rounded-[16px] bg-[#2a2a2a] p-5 text-sm text-[#ababab]">No riders have been added yet. Create the first rider using the form above.</p> : (
                                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                    {riders.map((rider) => (
                                        <article key={rider.uid} className="rounded-[16px] bg-[#2a2a2a] p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div><h3 className="font-semibold">{rider.name || rider.email || "Rider"}</h3><p className="mt-1 text-sm text-[#ababab]">{rider.email || "No email"}{rider.phone ? ` · ${rider.phone}` : ""}</p></div>
                                                <span className={`rounded-full px-2 py-1 text-xs ${isRiderOnline(rider) ? "bg-[#203328] text-[#b7f0cc]" : "bg-[#3a3a3a] text-[#ababab]"}`}>{rider.enabled === false ? "Disabled" : isRiderOnline(rider) ? "Online now" : "Offline"}</span>
                                            </div>
                                            <p className="mt-3 text-sm text-[#ababab]">Area: {rider.area || "Not set"} · {Number(rider.activeCount) || 0}/5 active orders</p>
                                            <button
                                                type="button"
                                                disabled={riderActionUid === rider.uid
                                                    || (rider.enabled !== false && ((Number(rider.activeCount) || 0) > 0
                                                        || orders.some((order) => order.riderUid === rider.uid && ["with_rider", "on_way"].includes(order.status))))}
                                                onClick={() => void toggleRiderAccess(rider)}
                                                className="mt-4 rounded-[10px] border border-[#666] px-3 py-2 text-xs font-semibold hover:bg-[#3a3a3a] disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                {riderActionUid === rider.uid
                                                    ? "Updating..."
                                                    : rider.enabled === false
                                                        ? "Restore access"
                                                        : "Remove access"}
                                            </button>
                                            {rider.enabled !== false && ((Number(rider.activeCount) || 0) > 0
                                                || orders.some((order) => order.riderUid === rider.uid && ["with_rider", "on_way"].includes(order.status))) && (
                                                <p className="mt-2 text-xs text-[#ababab]">Finish active deliveries before removing access.</p>
                                            )}
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>

                    </>
                )}
            </div>
            {selectedOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewOrder(null); }}>
                    <section role="dialog" aria-modal="true" aria-labelledby="delivery-preview-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[18px] border border-[#444] bg-[#2a2a2a] p-5 text-[#f5f5f5] shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-[#444] pb-4">
                            <div>
                                <p className="text-sm uppercase tracking-[0.16em] text-[#ababab]">Delivery order</p>
                                <h2 id="delivery-preview-title" className="mt-1 text-2xl font-semibold">#{selectedOrder.orderNumber || selectedOrder.posOrderId}</h2>
                            </div>
                            <button type="button" onClick={() => setPreviewOrder(null)} className="rounded-full px-3 py-1 text-2xl leading-none text-[#ababab] transition-colors hover:bg-[#3a3a3a] hover:text-white" aria-label="Close preview">&times;</button>
                        </div>
                        <div className="space-y-2 border-b border-[#444] py-4 text-sm">
                            <p className="flex justify-between gap-4"><span className="text-[#ababab]">Status</span><strong>{orderStatuses[selectedOrder.status]?.label || String(selectedOrder.status || "Unknown").replaceAll("_", " ")}</strong></p>
                            <p className="flex justify-between gap-4"><span className="text-[#ababab]">Customer</span><span className="text-right">{selectedOrder.customerName || "Not provided"}</span></p>
                            {selectedOrder.phone && <p className="flex justify-between gap-4"><span className="text-[#ababab]">Phone</span><a href={`tel:${selectedOrder.phone}`} className="text-right underline">{selectedOrder.phone}</a></p>}
                            <p className="flex justify-between gap-4"><span className="text-[#ababab]">Address</span><span className="max-w-[65%] text-right">{selectedOrder.address || "No address provided"}</span></p>
                            {selectedOrder.riderName && <p className="flex justify-between gap-4"><span className="text-[#ababab]">Rider</span><span className="text-right">{selectedOrder.riderName}</span></p>}
                        </div>
                        <div className="space-y-3 border-b border-[#444] py-4 text-sm">
                            <h3 className="font-semibold">Items</h3>
                            {(selectedOrder.items || []).length === 0
                                ? <p className="text-[#ababab]">No item details available.</p>
                                : (selectedOrder.items || []).map((item, index) => (
                                    <p key={`${item.name}-${index}`} className="flex justify-between gap-4">
                                        <span>{Number(item.quantity) || 0} × {item.name || "Item"}{item.note && <span className="block text-xs text-[#ababab]">{item.note}</span>}</span>
                                    </p>
                                ))}
                            {selectedOrder.orderNote && <p className="border-t border-[#444] pt-3 text-[#ababab]">Note: {selectedOrder.orderNote}</p>}
                        </div>
                        <div className="space-y-2 border-b border-[#444] py-4 text-sm">
                            <p className="flex justify-between"><span className="text-[#ababab]">Order total</span><strong>{formatCurrency(selectedOrder.total)}</strong></p>
                            <p className="flex justify-between"><span className="text-[#ababab]">Prepaid cash</span><span>{formatCurrency((Number(selectedOrder.prepaidCashPaise) || 0) / 100)}</span></p>
                            <p className="flex justify-between"><span className="text-[#ababab]">Prepaid online</span><span>{formatCurrency((Number(selectedOrder.prepaidOnlinePaise) || 0) / 100)}</span></p>
                            {selectedOrder.paymentBreakdown && (
                                <>
                                    <p className="flex justify-between"><span className="text-[#ababab]">Rider collected cash</span><span>{formatCurrency((Number(selectedOrder.paymentBreakdown.collectedCashPaise) || 0) / 100)}</span></p>
                                    <p className="flex justify-between"><span className="text-[#ababab]">Rider collected online</span><span>{formatCurrency((Number(selectedOrder.paymentBreakdown.collectedOnlinePaise) || 0) / 100)}</span></p>
                                </>
                            )}
                        </div>
                        {selectedOrder.lastAmendment && <p className="mt-4 rounded-[10px] bg-[#352d20] p-3 text-sm text-[#ffe0a6]">Order updated after pickup. Revised total: {formatCurrency(selectedOrder.lastAmendment.newTotalPaise / 100)}.</p>}
                        <button type="button" onClick={() => setPreviewOrder(null)} className="mt-5 w-full rounded-[10px] bg-[#d3d3d3] px-4 py-3 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-white">Close preview</button>
                    </section>
                </div>
            )}
        </main>
    );
};

export default Delivery;
