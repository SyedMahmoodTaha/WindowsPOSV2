const SYNC_STORAGE_KEY = "pfl-sync-settings-v1";
const SYNC_CLIENT_TOKEN_KEY = "pfl-sync-client-token-v1";
const SYNC_CLIENT_NAME_KEY = "pfl-sync-client-name-v1";
const PENDING_SYNC_KEY = "pfl-sync-pending-v1";
let clientSocket = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
let activeClientSettings = null;

const setClientSyncStatus = (status) => {
    window.__pflSyncStatus = status;
    window.dispatchEvent(new Event("pfl-sync-status-updated"));
};

const getSyncClientName = () => {
    let name = localStorage.getItem(SYNC_CLIENT_NAME_KEY);
    if (!name) {
        name = `POS-${crypto.randomUUID().slice(0, 8)}`;
        localStorage.setItem(SYNC_CLIENT_NAME_KEY, name);
    }
    return name;
};

const readPendingUpdates = () => {
    try {
        const value = JSON.parse(localStorage.getItem(PENDING_SYNC_KEY));
        return value && typeof value === "object" ? value : {};
    } catch (error) {
        console.error("Could not read pending POS sync updates:", error);
        return {};
    }
};

const writePendingUpdates = (updates) => {
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(updates));
};

export const getSyncSettings = async () => {
    if (window.pflDesktop?.getSyncSettings) {
        try {
            const desktopSettings = await window.pflDesktop.getSyncSettings();
            if (desktopSettings) {
                localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(desktopSettings));
                return desktopSettings;
            }
        } catch (error) {
            console.error("Could not load desktop sync settings:", error);
        }
    }

    try {
        const value = localStorage.getItem(SYNC_STORAGE_KEY);
        return value ? JSON.parse(value) : { mode: "standalone", host: "", port: 4099 };
    } catch (error) {
        console.error("Could not parse saved sync settings:", error);
        return { mode: "standalone", host: "", port: 4099 };
    }
};

export const setSyncSettings = async (settings) => {
    const next = {
        mode: settings?.mode || "standalone",
        host: settings?.host || "",
        port: Number(settings?.port || 4099),
        enabled: Boolean(settings?.enabled),
    };
    let reconnectToNewHost = false;
    try {
        const previous = JSON.parse(localStorage.getItem(SYNC_STORAGE_KEY) || "{}");
        if (previous.mode === "client" && next.mode === "client"
            && (previous.host !== next.host || Number(previous.port) !== next.port)) {
            localStorage.removeItem(SYNC_CLIENT_TOKEN_KEY);
            writePendingUpdates({});
            reconnectToNewHost = true;
        }
    } catch (error) {
        console.error("Could not compare saved sync settings:", error);
    }
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(next));
    if (window.pflDesktop?.setSyncSettings) await window.pflDesktop.setSyncSettings(next);
    if (reconnectToNewHost || next.mode !== "client" || !next.enabled) disconnectSyncClient();
    if (next.enabled && next.mode === "client") connectSyncClient(next);
    return next;
};

const sendPendingUpdates = () => {
    if (!clientSocket || clientSocket.readyState !== WebSocket.OPEN || window.__pflSyncStatus !== "connected") return;
    for (const update of Object.values(readPendingUpdates())) {
        clientSocket.send(JSON.stringify(update));
    }
};

const queueUpdate = (type, payload) => {
    const updates = readPendingUpdates();
    const key = type === "customer-notes-sync" ? `${type}:${payload.customerId}` : type;
    const previousDeletedIds = type === "orders-sync" && Array.isArray(updates[key]?.deletedOrderIds)
        ? updates[key].deletedOrderIds
        : [];
    updates[key] = {
        type,
        ...payload,
        ...(type === "orders-sync" ? {
            deletedOrderIds: [...new Set([...previousDeletedIds, ...(payload.deletedOrderIds || [])])],
        } : {}),
        updateId: crypto.randomUUID(),
        from: "client",
    };
    writePendingUpdates(updates);
    sendPendingUpdates();
    if ((!clientSocket || clientSocket.readyState === WebSocket.CLOSED) && activeClientSettings) {
        openSyncClient(activeClientSettings);
    }
};

export const pushOrdersToHost = async (orders, deletedOrderIds = []) => {
    try {
        const settings = await getSyncSettings();
        if (!settings?.enabled) return;
        if (settings.mode === "client" && settings.host) {
            activeClientSettings = settings;
            queueUpdate("orders-sync", { orders, deletedOrderIds, syncedAt: new Date().toISOString() });
            return;
        }
        if (settings.mode === "host" && window.pflDesktop?.syncOrders) {
            await window.pflDesktop.syncOrders(orders);
        }
    } catch (error) {
        console.error("Could not push orders to host:", error);
    }
};

export const pushSharedDataToHost = async (type, payload) => {
    try {
        const settings = await getSyncSettings();
        if (!settings?.enabled || settings.mode !== "client" || !settings.host) return;
        activeClientSettings = settings;
        queueUpdate(type, payload);
    } catch (error) {
        console.error(`Could not push ${type} to host:`, error);
    }
};

export const disconnectSyncClient = () => {
    const socket = clientSocket;
    clientSocket = null;
    activeClientSettings = null;
    window.__pflSyncSocket = null;
    setClientSyncStatus("disconnected");
    if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
};

const scheduleSyncReconnect = () => {
    if (!activeClientSettings || reconnectTimer !== null) return;
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        if (activeClientSettings) openSyncClient(activeClientSettings);
    }, delay);
};

export const applySyncSnapshot = async (snapshot, persist = true) => {
    if (snapshot?.type !== "sync-state" || snapshot.version !== 1) {
        console.error("Ignoring an unsupported POS sync snapshot.");
        return;
    }

    const pendingUpdates = readPendingUpdates();
    if (snapshot.ackUpdateId) {
        for (const [key, update] of Object.entries(pendingUpdates)) {
            if (update.updateId === snapshot.ackUpdateId) delete pendingUpdates[key];
        }
        writePendingUpdates(pendingUpdates);
    }

    if (persist && window.pflDesktop?.applySyncState) {
        try {
            await window.pflDesktop.applySyncState(snapshot);
        } catch (error) {
            console.error("Could not persist POS data from sync host:", error);
            return;
        }
    } else if (!window.pflDesktop) {
        localStorage.setItem("pfl-catalog-v1", JSON.stringify(snapshot.catalog));
        localStorage.setItem("pfl-tables-v1", JSON.stringify(snapshot.tables));
    }

    try {
        const currentUser = JSON.parse(sessionStorage.getItem("pfl-auth-user"));
        if (currentUser) {
            const syncedUser = snapshot.users.find((user) =>
                user.username === currentUser.username || user.originalUsername === currentUser.username,
            );
            if (!syncedUser || syncedUser.username !== currentUser.username || syncedUser.role !== currentUser.role) {
                sessionStorage.removeItem("pfl-auth-user");
                await window.pflDesktop?.signOut?.();
                window.location.reload();
                return;
            }
        }
    } catch (error) {
        console.error("Could not reconcile the signed-in user with sync data:", error);
    }

    localStorage.setItem("pfl-catalog-v1", JSON.stringify(snapshot.catalog));
    localStorage.setItem("pfl-tables-v1", JSON.stringify(snapshot.tables));
    localStorage.setItem("pfl-orders-v2", JSON.stringify(snapshot.orders));
    localStorage.setItem("pfl-printer-settings-v1", JSON.stringify(snapshot.printerSettings));
    window.dispatchEvent(new Event("pfl-orders-updated"));
    window.dispatchEvent(new Event("pfl-catalog-updated"));
    window.dispatchEvent(new Event("pfl-customers-updated"));
    window.dispatchEvent(new Event("pfl-printer-settings-updated"));
    sendPendingUpdates();
};

const openSyncClient = (settings) => {
    if (!settings?.enabled || settings.mode !== "client" || !settings.host) return;
    if (clientSocket && clientSocket.readyState < WebSocket.CLOSING) return;

    let socket;
    try {
        socket = new WebSocket(`ws://${settings.host}:${settings.port}`);
    } catch (error) {
        console.error("Could not connect to POS sync host:", error);
        scheduleSyncReconnect();
        return;
    }
    clientSocket = socket;
    window.__pflSyncSocket = socket;
    setClientSyncStatus("connecting");
    socket.addEventListener("open", () => {
        reconnectDelay = 1000;
        const token = localStorage.getItem(SYNC_CLIENT_TOKEN_KEY);
        if (token) {
            socket.send(JSON.stringify({ type: "authenticate", token }));
            setClientSyncStatus("authenticating");
        } else {
            socket.send(JSON.stringify({ type: "connection-request", clientName: getSyncClientName() }));
            setClientSyncStatus("requesting-approval");
        }
    });

    socket.addEventListener("message", (event) => {
        try {
            const payload = JSON.parse(event.data);
            if (payload?.type === "connection-pending") {
                setClientSyncStatus("waiting-approval");
                return;
            }
            if (payload?.type === "sync-authorized") {
                if (payload.token) localStorage.setItem(SYNC_CLIENT_TOKEN_KEY, payload.token);
                setClientSyncStatus("connected");
                return;
            }
            if (payload?.type === "auth-rejected" || payload?.type === "auth-required") {
                localStorage.removeItem(SYNC_CLIENT_TOKEN_KEY);
                activeClientSettings = null;
                setClientSyncStatus("not-approved");
                return;
            }
            if (payload?.type === "sync-state" && window.__pflSyncStatus === "connected") {
                void applySyncSnapshot(payload);
            }
        } catch (error) {
            console.error("Could not process data from POS sync host:", error);
        }
    });

    socket.addEventListener("close", (event) => {
        if (clientSocket === socket) {
            clientSocket = null;
            window.__pflSyncSocket = null;
        }
        if (event.code === 4001) {
            activeClientSettings = null;
            setClientSyncStatus("disconnected-by-host");
            return;
        }
        if (event.code === 4003) {
            activeClientSettings = null;
            localStorage.removeItem(SYNC_CLIENT_TOKEN_KEY);
            setClientSyncStatus("not-approved");
            return;
        }
        setClientSyncStatus("disconnected");
        scheduleSyncReconnect();
    });

    socket.addEventListener("error", () => {
        console.warn("POS sync host is unavailable on this network");
    });
};

export const connectSyncClient = (settings) => {
    if (!settings?.enabled || settings.mode !== "client" || !settings.host) {
        disconnectSyncClient();
        return;
    }
    if (clientSocket && clientSocket.readyState < WebSocket.CLOSING) return;
    activeClientSettings = settings;
    openSyncClient(settings);
};
