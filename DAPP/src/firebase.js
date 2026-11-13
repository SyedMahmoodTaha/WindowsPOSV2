import { initializeApp, getApps } from "firebase/app";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import {
    collection,
    doc,
    getFirestore,
    onSnapshot,
    query,
    runTransaction,
    serverTimestamp,
    updateDoc,
    where,
} from "firebase/firestore";

const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const isConfigured = Object.values(config).every(Boolean);
const app = isConfigured
    ? getApps().find((candidate) => candidate.name === "tyep-delivery")
        || initializeApp(config, "tyep-delivery")
    : null;
export const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

const requireCloud = () => {
    if (!db || !auth) throw new Error("Firebase is not configured for this app.");
    return { db, auth };
};

export const observeAuth = (callback) => {
    if (!auth) return () => {};
    return onAuthStateChanged(auth, callback);
};

export const signIn = async (email, password) => {
    const { auth: firebaseAuth } = requireCloud();
    return signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
};

export const signOutRider = async () => {
    const { auth: firebaseAuth } = requireCloud();
    await signOut(firebaseAuth);
};

export const observeProfile = (uid, callback, onError) => {
    const { db: firestore } = requireCloud();
    return onSnapshot(doc(firestore, "deliveryRiders", uid), (snapshot) => {
        callback(snapshot.exists() ? snapshot.data() : null);
    }, onError);
};

export const observeAvailable = (callback, onError) => {
    const { db: firestore } = requireCloud();
    const availableQuery = query(collection(firestore, "deliveryOrders"), where("status", "==", "available"));
    return onSnapshot(availableQuery, (snapshot) => {
        callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    }, onError);
};

export const observeAssigned = (uid, callback, onError) => {
    const { db: firestore } = requireCloud();
    const assignedQuery = query(collection(firestore, "deliveryOrders"), where("riderUid", "==", uid));
    return onSnapshot(assignedQuery, (snapshot) => {
        callback(snapshot.docs
            .map((entry) => ({ id: entry.id, ...entry.data() }))
            .filter((order) => order.status !== "delivered"));
    }, onError);
};

export const claimOrder = async (id) => {
    const { db: firestore, auth: firebaseAuth } = requireCloud();
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error("Sign in to pick up an order.");
    const deliveryRef = doc(firestore, "deliveryOrders", String(id));
    const profileRef = doc(firestore, "deliveryRiders", user.uid);
    return runTransaction(firestore, async (transaction) => {
        const [deliverySnapshot, profileSnapshot] = await Promise.all([
            transaction.get(deliveryRef),
            transaction.get(profileRef),
        ]);
        if (!deliverySnapshot.exists() || deliverySnapshot.data().status !== "available") {
            throw new Error("Another rider already picked up this order.");
        }
        if (!profileSnapshot.exists() || profileSnapshot.data().role !== "rider" || profileSnapshot.data().enabled === false) {
            throw new Error("Your rider account is not enabled.");
        }
        const profile = profileSnapshot.data();
        const count = Number(profile.activeCount) || 0;
        if (count >= 5) throw new Error("You already have five active orders.");
        transaction.update(profileRef, {
            activeCount: count + 1,
            lastActionOrderId: String(id),
        });
        transaction.update(deliveryRef, {
            status: "with_rider",
            riderUid: user.uid,
            riderName: profile.name || user.email || "Delivery rider",
            pickedUpAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    });
};

export const advanceOrder = async (order, paymentBreakdown) => {
    const { db: firestore, auth: firebaseAuth } = requireCloud();
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error("Sign in to update this delivery.");
    const deliveryRef = doc(firestore, "deliveryOrders", String(order.id));
    const profileRef = doc(firestore, "deliveryRiders", user.uid);
    return runTransaction(firestore, async (transaction) => {
        const [deliverySnapshot, profileSnapshot] = await Promise.all([
            transaction.get(deliveryRef),
            transaction.get(profileRef),
        ]);
        if (!deliverySnapshot.exists()
            || deliverySnapshot.data().riderUid !== user.uid
            || deliverySnapshot.data().status !== order.status) {
            throw new Error("This delivery changed or is not assigned to you. Refresh and try again.");
        }
        if (!profileSnapshot.exists()) throw new Error("Your rider profile could not be found.");
        if (order.status === "with_rider") {
            transaction.update(deliveryRef, {
                status: "on_way",
                onWayAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        } else if (order.status === "on_way") {
            const currentOrder = deliverySnapshot.data();
            const totalPaise = Number(currentOrder.totalPaise) || Math.round((Number(currentOrder.total) || 0) * 100);
            const prepaidCashPaise = Math.max(0, Number(currentOrder.prepaidCashPaise) || 0);
            const prepaidOnlinePaise = Math.max(0, Number(currentOrder.prepaidOnlinePaise) || 0);
            const balanceDuePaise = totalPaise - prepaidCashPaise - prepaidOnlinePaise;
            if (!paymentBreakdown
                || !Number.isSafeInteger(paymentBreakdown.cashPaise)
                || !Number.isSafeInteger(paymentBreakdown.onlinePaise)
                || paymentBreakdown.cashPaise < 0
                || paymentBreakdown.onlinePaise < 0
                || balanceDuePaise < 0
                || paymentBreakdown.cashPaise + paymentBreakdown.onlinePaise !== balanceDuePaise) {
                throw new Error("Cash and online amounts must add up to the exact remaining balance.");
            }
            const activeCount = Math.max(0, (Number(profileSnapshot.data().activeCount) || 0) - 1);
            transaction.update(deliveryRef, {
                status: "delivered",
                deliveredAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                paymentBreakdown: {
                    prepaidCashPaise,
                    prepaidOnlinePaise,
                    collectedCashPaise: paymentBreakdown.cashPaise,
                    collectedOnlinePaise: paymentBreakdown.onlinePaise,
                },
            });
            transaction.update(profileRef, {
                activeCount,
                lastActionOrderId: String(order.id),
            });
        } else {
            throw new Error("Delivery status cannot move backward.");
        }
    });
};

export const updateRiderPresence = async () => {
    const { auth: firebaseAuth, db: firestore } = requireCloud();
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error("Sign in before updating rider presence.");
    await updateDoc(doc(firestore, "deliveryRiders", user.uid), {
        lastSeenAt: serverTimestamp(),
    });
};
