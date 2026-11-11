import { useEffect, useRef, useState } from "react";
import {
    advanceOrder,
    claimOrder,
    isConfigured,
    observeAssigned,
    observeAuth,
    observeAvailable,
    observeProfile,
    signIn,
    signOutRider,
    updateLocation,
} from "./firebase";

const formatDate = (value) => {
    if (!value) return "";
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const moneyText = (paise) => `₹${(Math.max(0, Number(paise) || 0) / 100).toFixed(2)}`;
const getBalanceDuePaise = (order) => {
    const total = Number(order.totalPaise) || Math.round((Number(order.total) || 0) * 100);
    return Math.max(0, total - (Number(order.prepaidCashPaise) || 0) - (Number(order.prepaidOnlinePaise) || 0));
};

const getDirectionsUrl = (address) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

const PreviewApp = ({ onExit }) => (
    <main className="shell">
        <div className="preview-banner">DESIGN PREVIEW · SAMPLE ORDERS ONLY</div>
        <header className="topbar">
            <div><p className="eyebrow">Tyep Delivery</p><h1>Hello, Ayaan</h1><p className="muted">Keen area · 2/5 active orders</p></div>
            <button type="button" className="icon-button" aria-label="Preview account">A</button>
        </header>
        <button type="button" className="location-button"><span className="pulse" />Share live location for active deliveries</button>
        <section className="section">
            <div className="section-heading"><h2>Your deliveries</h2><span>2</span></div>
            <article className="order-card">
                <div className="order-heading"><strong>#1042</strong><span className="status">Picked up</span></div>
                <p className="customer">Sara Khan · <a href="tel:9876543210">98765 43210</a></p>
                <p className="address">12 Green Park Lane, near City Pharmacy</p>
                <a className="directions" href={getDirectionsUrl("12 Green Park Lane")} target="_blank" rel="noreferrer">Open directions ↗</a>
                <ul><li>2 × Classic Lassi</li><li>1 × Chicken Roll · no onion</li></ul>
                <div className="order-footer"><span>₹420</span><span>Picked up · 7:34 PM</span></div>
                <button type="button" className="primary">Start delivery</button>
            </article>
            <article className="order-card">
                <div className="order-heading"><strong>#1043</strong><span className="status">On the way</span></div>
                <p className="customer">Hamza Ali · <a href="tel:9876501234">98765 01234</a></p>
                <p className="address">8 Market Road, Keen</p>
                <a className="directions" href={getDirectionsUrl("8 Market Road, Keen")} target="_blank" rel="noreferrer">Open directions ↗</a>
                <ul><li>1 × Mango Lassi</li><li>2 × Paneer Wrap</li><li>1 × Gulab Jamun</li></ul>
                <p className="balance-due">Collect ₹320.00 · ₹0.00 cash + ₹300.00 online prepaid</p>
                <AmendmentNotice amendment={{ addedItems: [{ name: "Gulab Jamun", quantity: 1 }], previousTotalPaise: 56000, newTotalPaise: 62000 }} />
                <div className="payment-fields">
                    <p>Collect remaining ₹320.00</p>
                    <label>Cash<input inputMode="decimal" placeholder="₹0.00" readOnly /></label>
                    <label>Online<input inputMode="decimal" placeholder="₹0.00" readOnly /></label>
                </div>
                <button type="button" className="primary">Mark delivered</button>
            </article>
        </section>
        <section className="section">
            <div className="section-heading"><h2>Available orders</h2><span>3</span></div>
            <article className="order-card">
                <div className="order-heading"><strong>#1044</strong><span className="status">Available</span></div>
                <p className="customer">Mina Patel · <a href="tel:9876512345">98765 12345</a></p>
                <p className="address">24 Garden Street, Keen</p>
                <a className="directions" href={getDirectionsUrl("24 Garden Street, Keen")} target="_blank" rel="noreferrer">Open directions ↗</a>
                <ul><li>1 × Sweet Lassi</li><li>1 × Veg Biryani</li></ul>
                <div className="order-footer"><span>₹350</span><span>Nearby</span></div>
                <button type="button" className="primary" disabled>Pick up this order</button>
                <p className="irreversible">Picking up assigns this order to you and cannot be undone.</p>
            </article>
        </section>
        <p className="footnote">Preview only. Sample content; actions do not contact POS or save changes.</p>
        <button type="button" className="secondary preview-exit" onClick={onExit}>Back to setup</button>
    </main>
);

const DeliveryApp = () => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [available, setAvailable] = useState([]);
    const [assigned, setAssigned] = useState([]);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busyId, setBusyId] = useState("");
    const [sharing, setSharing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [paymentDrafts, setPaymentDrafts] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const watchId = useRef(null);
    const lastSentAt = useRef(0);
    const activeCount = Number(profile?.activeCount) || 0;

    useEffect(() => observeAuth((nextUser) => {
        setUser(nextUser);
        setProfile(null);
        setProfileLoaded(false);
        setAvailable([]);
        setAssigned([]);
        setSharing(false);
    }), []);

    useEffect(() => {
        if (!user) return undefined;
        const fail = (reason) => setError(`Could not load deliveries: ${reason.message}`);
        const stopProfile = observeProfile(user.uid, (nextProfile) => {
            setProfile(nextProfile);
            setProfileLoaded(true);
            if ((Number(nextProfile?.activeCount) || 0) < 1) setSharing(false);
        }, fail);
        const stopAvailable = observeAvailable(setAvailable, fail);
        const stopAssigned = observeAssigned(user.uid, setAssigned, fail);
        return () => {
            stopProfile();
            stopAvailable();
            stopAssigned();
        };
    }, [user]);

    useEffect(() => {
        if (!sharing || activeCount < 1 || !navigator.geolocation) {
            if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current);
            watchId.current = null;
            return undefined;
        }
        watchId.current = navigator.geolocation.watchPosition((position) => {
            const now = Date.now();
            if (now - lastSentAt.current < 30000) return;
            lastSentAt.current = now;
            void updateLocation(position).catch((reason) => setError(`Could not share location: ${reason.message}`));
        }, (reason) => {
            setError(`Location sharing stopped: ${reason.message}`);
            setSharing(false);
            void updateLocation(null).catch((updateError) => setError(`Could not clear shared location: ${updateError.message}`));
        }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 });
        return () => {
            if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current);
            watchId.current = null;
        };
    }, [sharing, activeCount]);

    useEffect(() => {
        const stopSharingWhenHidden = (event) => {
            if ((!document.hidden && event.type !== "pagehide") || !sharing) return;
            setSharing(false);
            void updateLocation(null).catch((reason) => setError(`Could not stop location sharing: ${reason.message}`));
        };
        document.addEventListener("visibilitychange", stopSharingWhenHidden);
        window.addEventListener("pagehide", stopSharingWhenHidden);
        return () => {
            document.removeEventListener("visibilitychange", stopSharingWhenHidden);
            window.removeEventListener("pagehide", stopSharingWhenHidden);
        };
    }, [sharing]);

    const handleLogin = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            await signIn(email, password);
            setPassword("");
        } catch (reason) {
            setError(reason.message);
        } finally {
            setBusy(false);
        }
    };

    const doAction = async (id, action) => {
        setBusyId(id);
        setError("");
        setNotice("");
        try {
            await action();
            setNotice("Delivery updated.");
        } catch (reason) {
            setError(reason.message);
        } finally {
            setBusyId("");
        }
    };

    const updatePaymentDraft = (id, method, value) => {
        setPaymentDrafts((current) => ({
            ...current,
            [id]: { cash: "", online: "", ...current[id], [method]: value },
        }));
    };

    const completeDelivery = (order) => {
        const balanceDuePaise = getBalanceDuePaise(order);
        const draft = paymentDrafts[order.id] || { cash: "", online: "" };
        const cashPaise = Math.round((Number(draft.cash) || 0) * 100);
        const onlinePaise = Math.round((Number(draft.online) || 0) * 100);
        if (cashPaise < 0 || onlinePaise < 0 || cashPaise + onlinePaise !== balanceDuePaise) {
            setError(`Enter cash and online amounts that add up to the remaining balance of ${moneyText(balanceDuePaise)}.`);
            return;
        }
        void doAction(order.id, () => advanceOrder(order, { cashPaise, onlinePaise }));
    };

    const toggleLocation = async () => {
        setError("");
        if (sharing) {
            setSharing(false);
            try {
                await updateLocation(null);
                setNotice("Location sharing stopped.");
            } catch (reason) {
                setError(`Could not stop location sharing: ${reason.message}`);
            }
            return;
        }
        if (!navigator.geolocation) {
            setError("This device or browser does not support location sharing.");
            return;
        }
        setSharing(true);
        setNotice("Location sharing starts after you allow location access.");
    };

    if (!isConfigured) {
        if (showPreview) return <PreviewApp onExit={() => setShowPreview(false)} />;
        return <main className="shell"><section className="panel"><div className="brand-mark">T</div><p className="eyebrow">Tyep Delivery</p><h1>Setup needed</h1><p className="muted">Connect Firebase to use real rider accounts and live POS orders.</p><button className="primary preview-entry" type="button" onClick={() => setShowPreview(true)}>Preview rider app</button><p className="footnote">This preview uses sample orders only.</p></section></main>;
    }

    if (!user) {
        return (
            <main className="shell">
                <section className="panel login-panel">
                    <div className="brand-mark">T</div>
                    <p className="eyebrow">Tyep Delivery</p>
                    <h1>Rider sign in</h1>
                    <p className="muted">Sign in with the account provided by your shop.</p>
                    {error && <p className="alert" role="alert">{error}</p>}
                    <form onSubmit={handleLogin}>
                        <label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                        <button className="primary" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
                    </form>
                </section>
            </main>
        );
    }

    if (profile?.role === "manager") {
        return <main className="shell"><section className="panel"><p className="eyebrow">Tyep Delivery</p><h1>Rider account required</h1><p className="muted">This is the POS delivery-manager account. Sign in with a rider account to use this app.</p><button className="secondary" onClick={() => void signOutRider()}>Sign out</button></section></main>;
    }

    if (!profile && !profileLoaded) {
        return <main className="shell"><section className="panel"><p className="muted">Checking your rider account…</p></section></main>;
    }
    if (!profile) {
        return <main className="shell"><section className="panel"><p className="eyebrow">Tyep Delivery</p><h1>Account not ready</h1><p className="muted">Ask your manager to enable your rider account, then sign in again.</p><button className="secondary" onClick={() => void signOutRider()}>Sign out</button></section></main>;
    }

    const statusLabel = { with_rider: "Picked up", on_way: "On the way" };
    const nextLabel = { with_rider: "Start delivery", on_way: "Mark delivered" };

    return (
        <main className="shell">
            <header className="topbar">
                <div><p className="eyebrow">Tyep Delivery</p><h1>Hello, {profile.name || "Rider"}</h1><p className="muted">{profile.area || "Your delivery area"} · {activeCount}/5 active orders</p></div>
                <button className="icon-button" aria-label="Sign out" onClick={() => { setSharing(false); void signOutRider(); }}>↪</button>
            </header>

            {error && <p className="alert" role="alert">{error}</p>}
            {notice && <p className="notice" role="status">{notice}</p>}
            {profile.enabled === false && <p className="alert">Your rider account is disabled. Please contact your manager.</p>}

            {activeCount > 0 && profile.enabled !== false && (
                <button type="button" className={`location-button ${sharing ? "sharing" : ""}`} onClick={() => void toggleLocation()}>
                    <span className="pulse" />{sharing ? "Live location sharing · tap to stop" : "Share live location for active deliveries"}
                </button>
            )}

            <section className="section">
                <div className="section-heading"><h2>Your deliveries</h2><span>{assigned.length}</span></div>
                {assigned.length === 0 ? <p className="empty">No active deliveries. Pick an order when you are ready.</p> : assigned.map((order) => (
                    <article className="order-card" key={order.id}>
                        <div className="order-heading"><strong>#{order.orderNumber || order.id}</strong><span className="status">{statusLabel[order.status] || order.status}</span></div>
                        <p className="customer">{order.customerName || "Customer"}{order.phone && <> · <a href={`tel:${order.phone}`}>{order.phone}</a></>}</p>
                        <p className="address">{order.address || "No delivery address"}</p>
                        {order.address && <a className="directions" href={getDirectionsUrl(order.address)} target="_blank" rel="noreferrer">Open directions ↗</a>}
                        <ul>{(order.items || []).map((item, index) => <li key={`${item.name}-${index}`}>{item.quantity} × {item.name}{item.note ? ` · ${item.note}` : ""}</li>)}</ul>
                        <div className="order-footer"><span>Total {moneyText(order.totalPaise ?? Math.round((Number(order.total) || 0) * 100))}</span><span>{formatDate(order.pickedUpAt)}</span></div>
                        <p className={`balance-due ${getBalanceDuePaise(order) === 0 ? "paid" : ""}`}>
                            {getBalanceDuePaise(order) === 0 ? "PAID · collect nothing" : `Collect ${moneyText(getBalanceDuePaise(order))}`}
                            {" · prepaid: "}
                            {moneyText(order.prepaidCashPaise || 0)} cash + {moneyText(order.prepaidOnlinePaise || 0)} online
                        </p>
                        {order.lastAmendment && <AmendmentNotice amendment={order.lastAmendment} />}
                        {order.status === "on_way" && (
                            getBalanceDuePaise(order) > 0
                                ? <div className="payment-fields">
                                    <p>Collect remaining {moneyText(getBalanceDuePaise(order))}</p>
                                    <label>Cash<input inputMode="decimal" type="number" min="0" step="0.01" value={paymentDrafts[order.id]?.cash || ""} onChange={(event) => updatePaymentDraft(order.id, "cash", event.target.value)} /></label>
                                    <label>Online<input inputMode="decimal" type="number" min="0" step="0.01" value={paymentDrafts[order.id]?.online || ""} onChange={(event) => updatePaymentDraft(order.id, "online", event.target.value)} /></label>
                                </div>
                                : <p className="fully-paid">This order is fully paid. No payment collection needed.</p>
                        )}
                        <button className="primary" disabled={busyId === order.id || profile.enabled === false} onClick={() => order.status === "on_way" ? completeDelivery(order) : void doAction(order.id, () => advanceOrder(order))}>{busyId === order.id ? "Updating..." : nextLabel[order.status] || "Update status"}</button>
                    </article>
                ))}
            </section>

            <section className="section">
                <div className="section-heading"><h2>Available orders</h2><span>{available.length}</span></div>
                {activeCount >= 5 && <p className="empty">You have reached the five active order limit. Mark one delivered to pick another.</p>}
                {available.length === 0 ? <p className="empty">No unclaimed delivery orders right now.</p> : available.map((order) => (
                    <article className="order-card" key={order.id}>
                        <div className="order-heading"><strong>#{order.orderNumber || order.id}</strong><span className="status">Available</span></div>
                        <p className="customer">{order.customerName || "Customer"}{order.phone && <> · <a href={`tel:${order.phone}`}>{order.phone}</a></>}</p>
                        <p className="address">{order.address || "No delivery address"}</p>
                        {order.address && <a className="directions" href={getDirectionsUrl(order.address)} target="_blank" rel="noreferrer">Open directions ↗</a>}
                        <ul>{(order.items || []).map((item, index) => <li key={`${item.name}-${index}`}>{item.quantity} × {item.name}{item.note ? ` · ${item.note}` : ""}</li>)}</ul>
                        <div className="order-footer"><span>Total {moneyText(order.totalPaise ?? Math.round((Number(order.total) || 0) * 100))}</span><span>{order.orderNote || ""}</span></div>
                        <p className={`balance-due ${getBalanceDuePaise(order) === 0 ? "paid" : ""}`}>
                            {getBalanceDuePaise(order) === 0
                                ? "PAID · collect nothing"
                                : `Collect ${moneyText(getBalanceDuePaise(order))} · ${moneyText(order.prepaidCashPaise || 0)} cash + ${moneyText(order.prepaidOnlinePaise || 0)} online prepaid`}
                        </p>
                        <button className="primary" disabled={busyId === order.id || activeCount >= 5 || profile.enabled === false} onClick={() => void doAction(order.id, () => claimOrder(order.id))}>{busyId === order.id ? "Claiming..." : "Pick up this order"}</button>
                        <p className="irreversible">Picking up assigns this order to you and cannot be undone.</p>
                    </article>
                ))}
            </section>
            <footer className="footnote">Orders update when you are online. Keep this app open for live location sharing.</footer>
        </main>
    );
};

const AmendmentNotice = ({ amendment }) => (
    <div className="amendment-notice">
        <strong>POS updated this order after pickup</strong>
        {amendment.addedItems?.length > 0 && <p>Added: {amendment.addedItems.map((item) => `${item.quantity} × ${item.name}`).join(", ")}</p>}
        {amendment.removedItems?.length > 0 && <p>Removed: {amendment.removedItems.map((item) => `${item.quantity} × ${item.name}`).join(", ")}</p>}
        {amendment.addressChanged && <p>Delivery address was changed.</p>}
        {amendment.previousTotalPaise !== amendment.newTotalPaise && (
            <p>Total changed from {moneyText(amendment.previousTotalPaise)} to {moneyText(amendment.newTotalPaise)}.</p>
        )}
    </div>
);

export default DeliveryApp;
