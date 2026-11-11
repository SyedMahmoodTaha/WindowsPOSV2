import { useEffect, useState } from "react";
import { FaArrowLeft, FaLocationDot, FaRightFromBracket, FaTruckFast } from "react-icons/fa6";
import { Link } from "react-router-dom";
import {
    isDeliveryCloudConfigured,
    clearStaleRiderLocations,
    listenDeliveryManager,
    signInDeliveryManager,
    signOutDeliveryManager,
    subscribeDeliveryOrders,
    subscribeDeliveryRiders,
    syncDeliveryOrders,
} from "../utils/deliveryCloud";
import { readOrders } from "../utils/orderStorage";

const formatDate = (value) => {
    if (!value) return "Not shared";
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? "Not shared" : date.toLocaleString();
};

const formatCurrency = (amount) => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
}).format(Math.round(Number(amount) || 0));

const Delivery = () => {
    const [manager, setManager] = useState(null);
    const [riders, setRiders] = useState([]);
    const [orders, setOrders] = useState([]);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
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

    useEffect(() => {
        if (!manager || riders.length === 0) return undefined;
        const clearStale = () => {
            void clearStaleRiderLocations(riders).catch((error) => {
                setMessage(`Could not clear an expired rider location: ${error.message}`);
            });
        };
        clearStale();
        const timer = window.setInterval(clearStale, 30000);
        return () => window.clearInterval(timer);
    }, [manager, riders]);

    const submitLogin = async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
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

    const showLocation = (rider) => {
        if (!(rider.activeCount > 0 && rider.lastLocation?.updatedAt)) return false;
        const updatedAt = typeof rider.lastLocation.updatedAt.toDate === "function"
            ? rider.lastLocation.updatedAt.toDate().getTime()
            : new Date(rider.lastLocation.updatedAt).getTime();
        return Number.isFinite(updatedAt) && now - updatedAt <= 120000;
    };

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
                        <div className="mb-7 grid gap-3 sm:grid-cols-3">
                            {[
                                ["Available", orders.filter((order) => order.status === "available").length],
                                ["With rider / on way", orders.filter((order) => ["with_rider", "on_way"].includes(order.status)).length],
                                ["Rider accounts", riders.filter((rider) => rider.enabled !== false).length],
                            ].map(([label, count]) => <section key={label} className="rounded-[16px] bg-[#2a2a2a] p-4"><p className="text-sm text-[#ababab]">{label}</p><p className="mt-1 text-2xl font-semibold">{count}</p></section>)}
                        </div>

                        <section className="mb-8">
                            <h2 className="mb-3 text-xl font-semibold">Rider accounts</h2>
                            {riders.length === 0 ? <p className="rounded-[16px] bg-[#2a2a2a] p-5 text-sm text-[#ababab]">No rider accounts configured yet. Add their Firebase rider profiles as described in `DAPP/README.md`.</p> : (
                                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                    {riders.map((rider) => (
                                        <article key={rider.uid} className="rounded-[16px] bg-[#2a2a2a] p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div><h3 className="font-semibold">{rider.name || rider.email || "Rider"}</h3><p className="mt-1 text-sm text-[#ababab]">{rider.email || "No email"}{rider.phone ? ` · ${rider.phone}` : ""}</p></div>
                                                <span className="rounded-full bg-[#3a3a3a] px-2 py-1 text-xs">{rider.enabled === false ? "Disabled" : `${Number(rider.activeCount) || 0}/5 active`}</span>
                                            </div>
                                            <p className="mt-3 text-sm text-[#ababab]">Area: {rider.area || "Not set"}</p>
                                            {showLocation(rider) ? (
                                                <a className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[#d3d3d3] underline" href={`https://maps.google.com/?q=${rider.lastLocation.latitude},${rider.lastLocation.longitude}`} target="_blank" rel="noreferrer">
                                                    <FaLocationDot /> Live location · {formatDate(rider.lastLocation.updatedAt)}
                                                </a>
                                            ) : <p className="mt-3 text-xs text-[#8f8f8f]">Location not being shared</p>}
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section>
                            <h2 className="mb-3 text-xl font-semibold">Delivery orders</h2>
                            {orders.length === 0 ? <p className="rounded-[16px] bg-[#2a2a2a] p-5 text-sm text-[#ababab]">No delivery orders have synced yet.</p> : (
                                <div className="grid gap-3 md:grid-cols-2">
                                    {orders.map((order) => (
                                        <article key={order.id} className="rounded-[16px] bg-[#2a2a2a] p-4">
                                            <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">#{order.orderNumber || order.posOrderId}</h3><span className="rounded-full bg-[#3a3a3a] px-2 py-1 text-xs capitalize">{String(order.status || "").replaceAll("_", " ")}</span></div>
                                            <p className="mt-2 text-sm">{order.customerName || "Customer"}{order.phone ? ` · ${order.phone}` : ""}</p>
                                            <p className="mt-1 text-sm text-[#ababab]">{order.address || "No address on order"}</p>
                                            <p className="mt-2 text-sm font-semibold">{formatCurrency(order.total)}{order.riderName ? ` · ${order.riderName}` : ""}</p>
                                            <p className="mt-1 text-xs text-[#ababab]">Prepaid: cash {formatCurrency((Number(order.prepaidCashPaise) || 0) / 100)} · online {formatCurrency((Number(order.prepaidOnlinePaise) || 0) / 100)}</p>
                                            {order.paymentBreakdown && <p className="mt-1 text-xs text-[#ababab]">Rider collected: cash {formatCurrency(order.paymentBreakdown.collectedCashPaise / 100)} · online {formatCurrency(order.paymentBreakdown.collectedOnlinePaise / 100)}</p>}
                                            {order.lastAmendment && <p className="mt-2 rounded-lg bg-[#352d20] p-2 text-xs text-[#ffe0a6]">Updated after pickup · total now {formatCurrency(order.lastAmendment.newTotalPaise / 100)}</p>}
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>
                        <p className="mt-7 flex items-center gap-2 text-xs text-[#8f8f8f]"><FaTruckFast /> Rider GPS is visible only while they are actively sharing it during an active delivery.</p>
                    </>
                )}
            </div>
        </main>
    );
};

export default Delivery;
