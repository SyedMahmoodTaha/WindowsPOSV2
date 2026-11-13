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
    updateRiderPresence,
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

const makePreviewOrders = () => [
    {
        id: "1042", orderNumber: "1042", status: "with_rider", riderUid: "ayaan",
        customerName: "Sara Khan", phone: "98765 43210", address: "12 Green Park Lane, near City Pharmacy",
        items: [{ name: "Classic Lassi", quantity: 2 }, { name: "Chicken Roll", quantity: 1, note: "No onion" }],
        totalPaise: 42000, prepaidCashPaise: 0, prepaidOnlinePaise: 0,
    },
    {
        id: "1043", orderNumber: "1043", status: "on_way", riderUid: "ayaan",
        customerName: "Hamza Ali", phone: "98765 01234", address: "8 Market Road, Keen",
        items: [{ name: "Mango Lassi", quantity: 1 }, { name: "Paneer Wrap", quantity: 2 }, { name: "Gulab Jamun", quantity: 1 }],
        totalPaise: 62000, prepaidCashPaise: 0, prepaidOnlinePaise: 30000,
        lastAmendment: { addedItems: [{ name: "Gulab Jamun", quantity: 1 }], previousTotalPaise: 56000, newTotalPaise: 62000 },
    },
    {
        id: "1044", orderNumber: "1044", status: "available", riderUid: null,
        customerName: "Mina Patel", phone: "98765 12345", address: "24 Garden Street, Keen",
        items: [{ name: "Sweet Lassi", quantity: 1 }, { name: "Veg Biryani", quantity: 1 }],
        totalPaise: 35000, prepaidCashPaise: 0, prepaidOnlinePaise: 0,
    },
    {
        id: "1045", orderNumber: "1045", status: "available", riderUid: null,
        customerName: "Rohan Mehta", phone: "98765 67890", address: "4 Rose Avenue, Keen",
        items: [{ name: "Family Meal Box", quantity: 1 }],
        totalPaise: 28000, prepaidCashPaise: 0, prepaidOnlinePaise: 28000,
    },
    {
        id: "1046", orderNumber: "1046", status: "available", riderUid: null,
        customerName: "Nisha Verma", phone: "98765 43210", address: "31 Lake View Road, Keen",
        items: [{ name: "Chicken Biryani", quantity: 1 }, { name: "Mango Lassi", quantity: 2 }],
        totalPaise: 47500, prepaidCashPaise: 10000, prepaidOnlinePaise: 20000,
    },
];

const PreviewApp = ({ onExit }) => {
    const [orders, setOrders] = useState(makePreviewOrders);
    const [orderTab, setOrderTab] = useState("picked-up");
    const [paymentDrafts, setPaymentDrafts] = useState({ "1043": { cash: "220", online: "100" } });
    const [notice, setNotice] = useState("");
    const activeOrders = orders.filter((order) => order.riderUid === "ayaan" && ["with_rider", "on_way"].includes(order.status));
    const availableOrders = orders.filter((order) => order.status === "available");
    const activeCount = activeOrders.length;

    const updateOrder = (orderId, update) => {
        setOrders((current) => current.map((order) => order.id === orderId ? { ...order, ...update } : order));
    };

    const claimOrder = (order) => {
        if (activeCount >= 5) return;
        updateOrder(order.id, { status: "with_rider", riderUid: "ayaan", riderName: "Ayaan" });
        setNotice(`#${order.orderNumber} picked up and assigned to Ayaan. This cannot be undone.`);
    };

    const advancePreviewOrder = (order) => {
        if (order.status === "with_rider") {
            updateOrder(order.id, { status: "on_way" });
            setNotice(`#${order.orderNumber} is now on the way.`);
            return;
        }
        const due = getBalanceDuePaise(order);
        const draft = paymentDrafts[order.id] || { cash: "", online: "" };
        const cashPaise = Math.round((Number(draft.cash) || 0) * 100);
        const onlinePaise = Math.round((Number(draft.online) || 0) * 100);
        if (cashPaise + onlinePaise !== due) {
            setNotice(`Enter a cash and online split that totals ${moneyText(due)} to complete this demo order.`);
            return;
        }
        updateOrder(order.id, {
            status: "delivered",
            riderUid: "ayaan",
            paymentBreakdown: {
                prepaidCashPaise: order.prepaidCashPaise,
                prepaidOnlinePaise: order.prepaidOnlinePaise,
                collectedCashPaise: cashPaise,
                collectedOnlinePaise: onlinePaise,
            },
        });
        setNotice(due ? `#${order.orderNumber} delivered. Cash and online collection recorded.` : `#${order.orderNumber} delivered. No payment was due.`);
    };

    const simulatePosEdit = (order) => {
        const previousTotalPaise = order.totalPaise;
        const addedItem = { name: "Masala Fries", quantity: 1 };
        updateOrder(order.id, {
            items: [...order.items, addedItem],
            totalPaise: previousTotalPaise + 8000,
            lastAmendment: {
                addedItems: [addedItem],
                previousTotalPaise,
                newTotalPaise: previousTotalPaise + 8000,
            },
        });
        setNotice(`The POS added Masala Fries to #${order.orderNumber}. The rider now sees the new item and revised balance.`);
    };

    const simulateNewOrder = () => {
        const nextNumber = String(Math.max(...orders.map((order) => Number(order.orderNumber))) + 1);
        setOrders((current) => [...current, {
            id: nextNumber, orderNumber: nextNumber, status: "available", riderUid: null,
            customerName: "New customer", phone: "98765 11111", address: "6 Station Road, Keen",
            items: [{ name: "Paneer Wrap", quantity: 2 }],
            totalPaise: 32000, prepaidCashPaise: 0, prepaidOnlinePaise: 0,
        }]);
        setNotice(`New sample order #${nextNumber} arrived from the POS and is now available to riders.`);
    };

    const setPayment = (orderId, method, value) => {
        setPaymentDrafts((current) => ({
            ...current,
            [orderId]: { cash: "", online: "", ...current[orderId], [method]: value },
        }));
    };

    const resetDemo = () => {
        setOrders(makePreviewOrders());
        setPaymentDrafts({ "1043": { cash: "220", online: "100" } });
        setNotice("Demo reset. Explore the picked-up and available-order tabs.");
    };

    const statusText = { available: "Available", with_rider: "Picked up", on_way: "On the way", delivered: "Delivered" };
    const renderOrder = (order, mode) => {
        const isAssigned = order.riderUid === "ayaan" && ["with_rider", "on_way"].includes(order.status);
        const due = getBalanceDuePaise(order);
        return (
            <article className="order-card" key={order.id}>
                <div className="order-heading"><strong>#{order.orderNumber}</strong><span className={`status status-${order.status}`}>{statusText[order.status]}</span></div>
                <p className="customer">{order.customerName} · <a href={`tel:${order.phone}`}>{order.phone}</a></p>
                <p className="address">{order.address}</p>
                {mode === "rider" && <a className="directions" href={getDirectionsUrl(order.address)} target="_blank" rel="noreferrer">Open directions ↗</a>}
                <ul>{order.items.map((item, index) => <li key={`${item.name}-${index}`}>{item.quantity} × {item.name}{item.note ? ` · ${item.note}` : ""}</li>)}</ul>
                <div className="order-footer">
                    <span>Total {moneyText(order.totalPaise)}</span>
                    <span>{order.status === "delivered" ? "Completed" : mode === "manager" && order.riderName ? `Rider: ${order.riderName}` : "Keen area"}</span>
                </div>
                {mode === "rider" && (isAssigned || order.status === "delivered") && (
                    <p className={`balance-due ${due === 0 ? "paid" : ""}`}>
                        {order.status === "delivered" ? "Delivered · " : due === 0 ? "PAID · collect nothing · " : `Collect ${moneyText(due)} · `}
                        prepaid: {moneyText(order.prepaidCashPaise)} cash + {moneyText(order.prepaidOnlinePaise)} online
                        {order.paymentBreakdown && <><br />Collected: {moneyText(order.paymentBreakdown.collectedCashPaise)} cash + {moneyText(order.paymentBreakdown.collectedOnlinePaise)} online</>}
                    </p>
                )}
                {order.lastAmendment && isAssigned && <AmendmentNotice amendment={order.lastAmendment} />}
                {mode === "rider" && order.status === "on_way" && due > 0 && (
                    <div className="payment-fields">
                        <p>Enter collection for the remaining {moneyText(due)}</p>
                        <label>Cash<input aria-label={`Cash collected for order ${order.orderNumber}`} type="number" min="0" step="0.01" value={paymentDrafts[order.id]?.cash || ""} onChange={(event) => setPayment(order.id, "cash", event.target.value)} placeholder="0.00" /></label>
                        <label>Online<input aria-label={`Online collected for order ${order.orderNumber}`} type="number" min="0" step="0.01" value={paymentDrafts[order.id]?.online || ""} onChange={(event) => setPayment(order.id, "online", event.target.value)} placeholder="0.00" /></label>
                    </div>
                )}
                {mode === "rider" && order.status === "available" && (
                    <>
                        <p className={`balance-due ${due === 0 ? "paid" : ""}`}>{due === 0 ? "Fully prepaid · collect nothing" : `Collect ${moneyText(due)} on delivery`}</p>
                        <button type="button" className="primary" disabled={activeCount >= 5} onClick={() => claimOrder(order)}>
                            {activeCount >= 5 ? "5-order limit reached" : "Pick up this order"}
                        </button>
                        <p className="irreversible">First rider to pick it up gets it. Pickup cannot be undone.</p>
                    </>
                )}
                {mode === "rider" && isAssigned && (
                    <>
                        <button type="button" className="primary" onClick={() => advancePreviewOrder(order)}>
                            {order.status === "with_rider" ? "Start delivery" : "Mark delivered"}
                        </button>
                        {order.id === "1042" && !order.lastAmendment && (
                            <button type="button" className="secondary compact-button" onClick={() => simulatePosEdit(order)}>Simulate POS item update</button>
                        )}
                    </>
                )}
                {mode === "manager" && <p className="manager-payment">Prepaid {moneyText(order.prepaidCashPaise)} cash · {moneyText(order.prepaidOnlinePaise)} online {order.paymentBreakdown ? `· Collected ${moneyText(order.paymentBreakdown.collectedCashPaise)} cash + ${moneyText(order.paymentBreakdown.collectedOnlinePaise)} online` : ""}</p>}
            </article>
        );
    };

    return (
        <main className="shell preview-shell">
            <div className="preview-banner"><span className="preview-live-dot" /> INTERACTIVE DEMO · SAMPLE DATA ONLY · NO REAL ORDERS</div>
            <header className="preview-heading">
                <div><p className="eyebrow">Tyep Delivery</p><h1>Delivery, made simpler.</h1><p className="muted">A connected view for the people taking orders and the people delivering them.</p></div>
                <button type="button" className="secondary reset-button" onClick={resetDemo}>Reset demo</button>
            </header>
            <div className="rider-dashboard">
                <div className="demo-intro">
                    <div><p className="eyebrow">RIDER DASHBOARD</p><h2>Hi, Ayaan <span className="online-tag">Keen area</span></h2><p className="muted">Choose orders that fit your route. Your active deliveries stay here.</p></div>
                    <div className="capacity"><strong>{activeCount}<span>/5</span></strong><small>orders with you</small></div>
                </div>
                <div className="rider-dashboard-stats">
                    <article><span>Orders given to you</span><strong>{activeCount}</strong><small>Your current deliveries</small></article>
                    <article><span>Available orders</span><strong>{availableOrders.length}</strong><small>Ready to be picked up</small></article>
                    <article><span>On the way</span><strong>{activeOrders.filter((order) => order.status === "on_way").length}</strong><small>Currently out for delivery</small></article>
                    <article><span>Delivered</span><strong>{orders.filter((order) => order.status === "delivered" && order.riderUid === "ayaan").length}</strong><small>Completed in this demo</small></article>
                </div>
            </div>
            <nav className="preview-tabs order-tabs" aria-label="Filter delivery orders">
                <button type="button" className={orderTab === "picked-up" ? "selected" : ""} onClick={() => setOrderTab("picked-up")}>Picked-up <span>{activeOrders.length} orders</span></button>
                <button type="button" className={orderTab === "available" ? "selected" : ""} onClick={() => setOrderTab("available")}>Available orders <span>{availableOrders.length} waiting</span></button>
            </nav>
            {notice && <p className="notice demo-notice" role="status">{notice}</p>}

            <div className="preview-content rider-demo">
                {orderTab === "picked-up" ? (
                    <section className="section">
                        <div className="section-heading"><div><h2>Picked-up orders</h2><p className="section-caption">Your assigned deliveries · claims cannot be undone</p></div><span>{activeOrders.length}</span></div>
                        {activeOrders.length ? <div className="demo-order-list">{activeOrders.map((order) => renderOrder(order, "rider"))}</div> : <p className="empty">No picked-up orders. Open Available orders to choose a delivery.</p>}
                    </section>
                ) : (
                    <section className="section">
                        <div className="section-heading"><div><h2>Available orders</h2><p className="section-caption">First come, first served · choose orders near your route</p></div><span>{availableOrders.length}</span></div>
                        <div className="demo-tools">
                            <span>Up to five active orders</span>
                            <button type="button" className="secondary compact-button" onClick={simulateNewOrder}>＋ Simulate incoming order</button>
                        </div>
                        {availableOrders.length ? <div className="demo-order-list">{availableOrders.map((order) => renderOrder(order, "rider"))}</div> : <p className="empty">No available sample orders right now.</p>}
                    </section>
                )}
                <div className="demo-callouts">
                    <span>✓ Up to five orders</span><span>✓ Cash + online split</span><span>✓ Prepaid-aware balances</span><span>✓ POS changes are visible</span>
                </div>
                <p className="footnote">Demo controls only simulate sample activity. They do not connect to Firebase or change real POS orders.</p>
            </div>
            <p className="footnote">Interactive preview · sample content only · Firebase setup is not required</p>
            <button type="button" className="secondary preview-exit" onClick={onExit}>Back to setup</button>
        </main>
    );
};

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
    const [busy, setBusy] = useState(false);
    const [paymentDrafts, setPaymentDrafts] = useState({});
    const [activeTab, setActiveTab] = useState("picked-up");
    const [newOrderAlert, setNewOrderAlert] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const seenAvailableOrderIds = useRef(null);
    const alertedOrderIds = useRef(new Set());
    const activeCount = Number(profile?.activeCount) || 0;

    const showNewOrderAlert = (alert) => {
        if (!alert?.orderId || alertedOrderIds.current.has(alert.orderId)) return;
        alertedOrderIds.current.add(alert.orderId);
        setNewOrderAlert(alert);
        setActiveTab("available");
    };

    useEffect(() => observeAuth((nextUser) => {
        setUser(nextUser);
        setProfile(null);
        setProfileLoaded(false);
        setAvailable([]);
        setAssigned([]);
        setNewOrderAlert(null);
        seenAvailableOrderIds.current = null;
        alertedOrderIds.current.clear();
    }), []);

    useEffect(() => {
        if (!user) return undefined;
        const stopProfile = observeProfile(user.uid, (nextProfile) => {
            setProfile(nextProfile);
            setProfileLoaded(true);
            if (nextProfile?.enabled === false) {
                setAvailable([]);
                setAssigned([]);
            }
        }, (reason) => setError(`Could not load rider account: ${reason.message}`));
        return stopProfile;
    }, [user]);

    useEffect(() => {
        if (!user || profile?.role !== "rider" || profile.enabled === false) return undefined;
        const fail = (reason) => setError(`Could not load deliveries: ${reason.message}`);
        const stopAvailable = observeAvailable((nextAvailable) => {
            setAvailable(nextAvailable);
            const nextIds = new Set(nextAvailable.map((order) => order.id));
            if (seenAvailableOrderIds.current === null) {
                seenAvailableOrderIds.current = nextIds;
                return;
            }
            const newlyAvailable = nextAvailable.filter((order) => !seenAvailableOrderIds.current.has(order.id));
            for (const order of nextAvailable) seenAvailableOrderIds.current.add(order.id);
            const newest = newlyAvailable[0];
            if (newest) {
                showNewOrderAlert({
                    orderId: newest.id,
                    orderNumber: newest.orderNumber || newest.id,
                    body: `New delivery available · ${moneyText(getBalanceDuePaise(newest))} to collect`,
                });
            }
        }, fail);
        const stopAssigned = observeAssigned(user.uid, setAssigned, fail);
        return () => {
            stopAvailable();
            stopAssigned();
        };
    }, [user, profile?.role, profile?.enabled]);

    useEffect(() => {
        if (!user || profile?.role !== "rider" || profile.enabled === false) return undefined;
        const updatePresence = () => {
            if (document.visibilityState !== "visible") return;
            void updateRiderPresence().catch((reason) => setError(`Could not update online status: ${reason.message}`));
        };
        updatePresence();
        const timer = window.setInterval(updatePresence, 30000);
        document.addEventListener("visibilitychange", updatePresence);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", updatePresence);
        };
    }, [user, profile?.role, profile?.enabled]);

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

    const handleSignOut = async () => {
        setBusy(true);
        setError("");
        try {
            await signOutRider();
        } catch (reason) {
            setError(`Could not sign out cleanly: ${reason.message}`);
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
    const ordersOnTheWay = assigned.filter((order) => order.status === "on_way").length;

    const renderRiderOrder = (order, isAvailable = false) => {
        const due = getBalanceDuePaise(order);
        return (
            <article className="order-card rider-order-card" key={order.id}>
                <div className="order-heading">
                    <strong>Order #{order.orderNumber || order.id}</strong>
                    <span className={`status ${isAvailable ? "status-available" : `status-${order.status}`}`}>
                        {isAvailable ? "Available" : statusLabel[order.status] || order.status}
                    </span>
                </div>
                <p className="customer">{order.customerName || "Customer"}{order.phone && <> · <a href={`tel:${order.phone}`}>{order.phone}</a></>}</p>
                <p className="address">{order.address || "No delivery address"}</p>
                {order.address && <a className="directions" href={getDirectionsUrl(order.address)} target="_blank" rel="noreferrer">Open directions ↗</a>}
                <ul>{(order.items || []).map((item, index) => <li key={`${item.name}-${index}`}>{item.quantity} × {item.name}{item.note ? ` · ${item.note}` : ""}</li>)}</ul>
                <div className="order-footer">
                    <span>Total {moneyText(order.totalPaise ?? Math.round((Number(order.total) || 0) * 100))}</span>
                    <span>{order.orderNote || formatDate(order.pickedUpAt)}</span>
                </div>
                <p className={`balance-due ${due === 0 ? "paid" : ""}`}>
                    {due === 0 ? "PAID · collect nothing" : `Collect ${moneyText(due)}`}
                    {!isAvailable && <> · prepaid {moneyText(order.prepaidCashPaise || 0)} cash + {moneyText(order.prepaidOnlinePaise || 0)} online</>}
                    {isAvailable && due > 0 && <> · already paid {moneyText((Number(order.prepaidCashPaise) || 0) + (Number(order.prepaidOnlinePaise) || 0))}</>}
                </p>
                {order.lastAmendment && <AmendmentNotice amendment={order.lastAmendment} />}
                {!isAvailable && order.status === "on_way" && due > 0 && (
                    <div className="payment-fields">
                        <p>Collect remaining {moneyText(due)}</p>
                        <label>Cash<input inputMode="decimal" type="number" min="0" step="0.01" value={paymentDrafts[order.id]?.cash || ""} onChange={(event) => updatePaymentDraft(order.id, "cash", event.target.value)} /></label>
                        <label>Online<input inputMode="decimal" type="number" min="0" step="0.01" value={paymentDrafts[order.id]?.online || ""} onChange={(event) => updatePaymentDraft(order.id, "online", event.target.value)} /></label>
                    </div>
                )}
                {isAvailable ? (
                    <>
                        <button className="primary" disabled={busyId === order.id || activeCount >= 5 || profile.enabled === false} onClick={() => void doAction(order.id, () => claimOrder(order.id))}>
                            {busyId === order.id ? "Claiming..." : activeCount >= 5 ? "5-order limit reached" : "Pick up this order"}
                        </button>
                        <p className="irreversible">First rider to confirm gets this order. Pickup cannot be undone.</p>
                    </>
                ) : (
                    <button className="primary" disabled={busyId === order.id || profile.enabled === false} onClick={() => order.status === "on_way" ? completeDelivery(order) : void doAction(order.id, () => advanceOrder(order))}>
                        {busyId === order.id ? "Updating..." : nextLabel[order.status] || "Update status"}
                    </button>
                )}
            </article>
        );
    };

    return (
        <main className="shell rider-app-shell">
            <header className="topbar rider-topbar">
                <div className="rider-brand"><span className="rider-brand-mark">T</span><div><p className="eyebrow">TYEP DELIVERY</p><h1>{profile.name || "Rider"}</h1><p className="muted">{profile.area || "Your delivery area"} · signed in</p></div></div>
                <button className="icon-button" aria-label="Sign out" onClick={() => void handleSignOut()}>↪</button>
            </header>

            {error && <p className="alert" role="alert">{error}</p>}
            {notice && <p className="notice" role="status">{notice}</p>}
            {profile.enabled === false && <p className="alert">Your rider account is disabled. Please contact your manager.</p>}
            {newOrderAlert && (
                <aside className="incoming-alert" role="status">
                    <span className="incoming-alert-icon">↗</span>
                    <div><strong>New order available · #{newOrderAlert.orderNumber}</strong><p>{newOrderAlert.body}</p></div>
                    <button type="button" aria-label="Dismiss new order alert" onClick={() => setNewOrderAlert(null)}>×</button>
                </aside>
            )}

            <section className="rider-overview">
                <div className="overview-copy"><p className="eyebrow">YOUR SHIFT AT A GLANCE</p><h2>Ready for your next delivery?</h2><p>Choose orders that fit your route. Pickups are first come, first served.</p></div>
                <div className="capacity"><strong>{activeCount}<span>/5</span></strong><small>active orders</small></div>
            </section>

            <section className="rider-stats" aria-label="Delivery summary">
                <article><span>Your deliveries</span><strong>{activeCount}</strong><small>Orders picked up</small></article>
                <article><span>Available orders</span><strong>{available.length}</strong><small>Waiting for a rider</small></article>
                <article><span>On the way</span><strong>{ordersOnTheWay}</strong><small>In transit now</small></article>
            </section>
            <p className="footnote alert-availability">New-order alerts appear here while the app is open and connected.</p>

            <nav className="rider-tabs" aria-label="Delivery orders">
                <button type="button" className={activeTab === "picked-up" ? "selected" : ""} aria-pressed={activeTab === "picked-up"} onClick={() => setActiveTab("picked-up")}>
                    <span>Your deliveries</span><b>{assigned.length}</b>
                </button>
                <button type="button" className={activeTab === "available" ? "selected" : ""} aria-pressed={activeTab === "available"} onClick={() => { setActiveTab("available"); setNewOrderAlert(null); }}>
                    <span>Available orders</span><b>{available.length}</b>
                </button>
            </nav>

            {activeTab === "picked-up" ? (
                <section className="section rider-order-section">
                    <div className="section-heading"><div><h2>Your deliveries</h2><p className="section-caption">Move each order forward as you deliver it.</p></div><span>{assigned.length}</span></div>
                    {assigned.length === 0 ? <p className="empty">No picked-up orders yet. Check Available orders when you are ready.</p> : <div className="live-order-list">{assigned.map((order) => renderRiderOrder(order))}</div>}
                </section>
            ) : (
                <section className="section rider-order-section">
                    <div className="section-heading"><div><h2>Available orders</h2><p className="section-caption">Choose an order when it suits your area and route.</p></div><span>{available.length}</span></div>
                    {activeCount >= 5 && <p className="empty limit-notice">You have reached the five-order limit. Mark one delivered before picking up another.</p>}
                    {available.length === 0 ? <p className="empty">No unclaimed orders right now. New orders will appear here automatically.</p> : <div className="live-order-list">{available.map((order) => renderRiderOrder(order, true))}</div>}
                </section>
            )}
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
