import { initializeApp, getApps } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
    collection,
    doc,
    getDoc,
    getFirestore,
    onSnapshot,
    runTransaction,
    serverTimestamp,
    updateDoc,
} from "firebase/firestore";

const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isDeliveryCloudConfigured = Object.values(config).every(Boolean);
const app = isDeliveryCloudConfigured
    ? getApps().find((candidate) => candidate.name === "tyep-delivery") || initializeApp(config, "tyep-delivery")
    : null;
export const deliveryAuth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

const requireCloud = () => {
    if (!db || !deliveryAuth) {
        throw new Error("Delivery cloud is not configured. Add the Firebase web app settings to the POS .env file and restart the app.");
    }
    return { db, auth: deliveryAuth };
};

const riderRef = (uid) => doc(requireCloud().db, "deliveryRiders", uid);

export const signInDeliveryManager = async (email, password) => {
    const { auth, db: firestore } = requireCloud();
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    const profile = await getDoc(doc(firestore, "deliveryRiders", credential.user.uid));
    if (!profile.exists() || profile.data().role !== "manager" || profile.data().enabled === false) {
        await signOut(auth);
        throw new Error("This Firebase account is not enabled as a delivery manager.");
    }
    return { uid: credential.user.uid, ...profile.data() };
};

export const signOutDeliveryManager = async () => {
    if (deliveryAuth?.currentUser) await signOut(deliveryAuth);
};

export const listenDeliveryManager = (callback) => {
    if (!deliveryAuth) return () => {};
    return onAuthStateChanged(deliveryAuth, async (user) => {
        if (!user) {
            callback(null);
            return;
        }
        try {
            const profile = await getDoc(riderRef(user.uid));
            callback(profile.exists() && profile.data().role === "manager" && profile.data().enabled !== false
                ? { uid: user.uid, ...profile.data() }
                : null);
        } catch (error) {
            callback(null, error);
        }
    });
};

const getDeliveryPayload = (order) => ({
    posOrderId: String(order.id),
    orderNumber: String(order.orderNumber || order.id),
    customerName: String(order.orderDetails?.customerName || ""),
    phone: String(order.orderDetails?.phone || ""),
    address: String(order.orderDetails?.address || ""),
    items: (Array.isArray(order.cart) ? order.cart : []).map(({ name, quantity, note }) => ({
        name: String(name || ""),
        quantity: Number(quantity) || 0,
        note: String(note || ""),
    })),
    total: Number(order.total) || 0,
    totalPaise: Math.round((Number(order.total) || 0) * 100),
    prepaidCashPaise: Math.max(0, Math.round(Number(order.deliveryPayment?.prepaidCashPaise) || 0)),
    prepaidOnlinePaise: Math.max(0, Math.round(Number(order.deliveryPayment?.prepaidOnlinePaise) || 0)),
    orderNote: String(order.orderNote || ""),
    posStatus: String(order.status || ""),
    posUpdatedAt: order.updatedAt || order.createdAt || new Date().toISOString(),
});

const summarizeItemChanges = (before, after) => {
    const quantityByItem = (items) => {
        const quantities = new Map();
        for (const item of items || []) {
            const key = JSON.stringify([item.name || "", item.note || "", Number(item.price) || 0]);
            const existing = quantities.get(key) || { name: item.name || "", note: item.note || "", quantity: 0 };
            existing.quantity += Number(item.quantity) || 0;
            quantities.set(key, existing);
        }
        return quantities;
    };
    const oldQuantities = quantityByItem(before);
    const newQuantities = quantityByItem(after);
    const addedItems = [];
    const removedItems = [];
    for (const [key, next] of newQuantities) {
        const difference = next.quantity - (oldQuantities.get(key)?.quantity || 0);
        if (difference > 0) addedItems.push({ ...next, quantity: difference });
    }
    for (const [key, old] of oldQuantities) {
        const difference = old.quantity - (newQuantities.get(key)?.quantity || 0);
        if (difference > 0) removedItems.push({ ...old, quantity: difference });
    }
    return { addedItems, removedItems };
};

export const syncDeliveryOrders = async (orders) => {
    const { auth, db: firestore } = requireCloud();
    if (auth.currentUser?.uid !== undefined) {
        const manager = await getDoc(doc(firestore, "deliveryRiders", auth.currentUser.uid));
        if (!manager.exists() || manager.data().role !== "manager" || manager.data().enabled === false) return;
    } else {
        return;
    }

    for (const order of orders) {
        if (order.orderType !== "Delivery") continue;
        const reference = doc(firestore, "deliveryOrders", String(order.id));
        const payload = getDeliveryPayload(order);
        await runTransaction(firestore, async (transaction) => {
            const existing = await transaction.get(reference);
            if (existing.exists()) {
                const current = existing.data();
                const changed = Object.entries(payload).some(([key, value]) => JSON.stringify(current[key]) !== JSON.stringify(value));
                if (!changed) return;
                const update = { ...payload, updatedAt: serverTimestamp() };
                if (["with_rider", "on_way"].includes(current.status)) {
                    const itemChanges = summarizeItemChanges(current.items, payload.items);
                    const totalChanged = Number(current.totalPaise) !== payload.totalPaise;
                    const addressChanged = current.address !== payload.address;
                    const prepaidChanged = Number(current.prepaidCashPaise || 0) !== payload.prepaidCashPaise
                        || Number(current.prepaidOnlinePaise || 0) !== payload.prepaidOnlinePaise;
                    if (itemChanges.addedItems.length || itemChanges.removedItems.length
                        || totalChanged || addressChanged || prepaidChanged) {
                        const amendment = {
                            changedAt: new Date().toISOString(),
                            previousTotalPaise: Number(current.totalPaise) || Math.round((Number(current.total) || 0) * 100),
                            newTotalPaise: payload.totalPaise,
                            ...itemChanges,
                            addressChanged,
                        };
                        update.amendments = [...(Array.isArray(current.amendments) ? current.amendments : []), amendment].slice(-20);
                        update.lastAmendment = amendment;
                    }
                }
                transaction.update(reference, update);
                return;
            }
            if (order.status === "completed") return;
            transaction.set(reference, {
                ...payload,
                status: "available",
                riderUid: null,
                riderName: null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        });
    }
};

export const startDeliveryOrderSync = () => {
    if (!isDeliveryCloudConfigured || !deliveryAuth) return () => {};
    let signedInManager = false;
    const publish = (event) => {
        if (!signedInManager) return;
        try {
            const orders = JSON.parse(localStorage.getItem("pfl-orders-v2") || "[]");
            const orderId = event?.detail?.orderId;
            const ordersToSync = Array.isArray(orders)
                ? orderId === undefined
                    ? orders.filter((order) => order.orderType === "Delivery" && order.status !== "completed")
                    : orders.filter((order) => String(order.id) === String(orderId))
                : [];
            void syncDeliveryOrders(ordersToSync)
                .catch((error) => {
                    console.error("Could not sync delivery orders to the cloud:", error);
                    window.dispatchEvent(new CustomEvent("pfl-delivery-sync-error", { detail: { message: error.message } }));
                });
        } catch (error) {
            console.error("Could not read local orders for delivery sync:", error);
        }
    };
    const unsubscribeAuth = onAuthStateChanged(deliveryAuth, async (user) => {
        signedInManager = false;
        if (!user) return;
        try {
            const profile = await getDoc(riderRef(user.uid));
            signedInManager = profile.exists() && profile.data().role === "manager" && profile.data().enabled !== false;
            publish();
        } catch (error) {
            console.error("Could not verify delivery manager for order sync:", error);
        }
    });
    window.addEventListener("pfl-orders-updated", publish);
    window.addEventListener("online", publish);
    return () => {
        unsubscribeAuth();
        window.removeEventListener("pfl-orders-updated", publish);
        window.removeEventListener("online", publish);
    };
};

export const subscribeDeliveryOrders = (callback, onError) => {
    const { db: firestore } = requireCloud();
    return onSnapshot(collection(firestore, "deliveryOrders"), (snapshot) => {
        callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    }, onError);
};

export const subscribeDeliveryRiders = (callback, onError) => {
    const { db: firestore } = requireCloud();
    return onSnapshot(collection(firestore, "deliveryRiders"), (snapshot) => {
        callback(snapshot.docs
            .filter((entry) => entry.data().role === "rider")
            .map((entry) => ({ uid: entry.id, ...entry.data() })));
    }, onError);
};

export const clearStaleRiderLocations = async (riders) => {
    const staleBefore = Date.now() - 120000;
    const staleRiders = riders.filter((rider) => {
        const updatedAt = rider.lastLocation?.updatedAt;
        if (!updatedAt) return false;
        const timestamp = typeof updatedAt.toDate === "function" ? updatedAt.toDate().getTime() : new Date(updatedAt).getTime();
        return Number.isFinite(timestamp) && timestamp < staleBefore;
    });
    await Promise.all(staleRiders.map((rider) => updateDoc(riderRef(rider.uid), { lastLocation: null })));
};
