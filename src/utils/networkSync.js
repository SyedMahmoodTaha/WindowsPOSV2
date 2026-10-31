const SYNC_STORAGE_KEY = "pfl-sync-settings-v1";
const SYNC_CLIENT_TOKEN_KEY = "pfl-sync-client-token-v1";
const SYNC_CLIENT_NAME_KEY = "pfl-sync-client-name-v1";
let clientSocket = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
let activeClientSettings = null;
let pendingOrdersSnapshot = null;

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
    const next = { mode: settings?.mode || "standalone", host: settings?.host || "", port: Number(settings?.port || 4099), enabled: Boolean(settings?.enabled) };
    try {
        const previous = JSON.parse(localStorage.getItem(SYNC_STORAGE_KEY) || "{}");
        if (previous.mode === "client" && next.mode === "client" && (previous.host !== next.host || Number(previous.port) !== next.port)) {
            localStorage.removeItem(SYNC_CLIENT_TOKEN_KEY);
        }
    } catch (error) {
        console.error("Could not compare saved sync settings:", error);
    }
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(next));
    if (window.pflDesktop && window.pflDesktop.setSyncSettings) {
        await window.pflDesktop.setSyncSettings(next);
    }
    if (next.enabled && next.mode === "client") connectSyncClient(next);
    else disconnectSyncClient();
    return next;
};

const sendOrdersSnapshot = (socket, orders) => {
    if (socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({
        type: "orders-sync",
        orders,
        from: "client",
        syncedAt: new Date().toISOString(),
    }));
    return true;
};

export const pushOrdersToHost = async (orders) => {
    try {
        const settings = await getSyncSettings();
        if (!settings?.enabled) return;

        if (settings.mode === "client" && settings.host) {
            const socket = clientSocket;
            if (socket && window.__pflSyncStatus === "connected" && sendOrdersSnapshot(socket, orders)) {
                pendingOrdersSnapshot = null;
            } else {
                pendingOrdersSnapshot = orders;
                if (!activeClientSettings) activeClientSettings = settings;
                if (!socket || socket.readyState === WebSocket.CLOSED) openSyncClient(activeClientSettings);
            }
            return;
        }

        if (settings.mode === "host" && window.pflDesktop && window.pflDesktop.syncOrders) {
            await window.pflDesktop.syncOrders(orders);
        }
    } catch (error) {
        console.error("Could not push orders to host:", error);
    }
};

export const disconnectSyncClient = () => {
    const socket = clientSocket;
    clientSocket = null;
    activeClientSettings = null;
    pendingOrdersSnapshot = null;
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

const applyOrdersSnapshot = (orders) => {
    localStorage.setItem("pfl-orders-v2", JSON.stringify(orders));
    if (window.pflDesktop?.saveOrders) {
        void window.pflDesktop.saveOrders(orders).catch((error) => {
            console.error("Could not save synced orders to SQLite:", error);
        });
    }
    window.dispatchEvent(new Event("pfl-orders-updated"));
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
                setClientSyncStatus("not-approved");
                return;
            }
            if (payload?.type !== "orders-sync" || !Array.isArray(payload.orders)) return;
            if (window.__pflSyncStatus !== "connected") return;
            if (pendingOrdersSnapshot) {
                const pending = pendingOrdersSnapshot;
                pendingOrdersSnapshot = null;
                sendOrdersSnapshot(socket, pending);
                return;
            }
            applyOrdersSnapshot(payload.orders);
        } catch (error) {
            console.error("Could not process orders from POS sync host:", error);
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
            console.warn("POS sync disconnected by the host administrator");
            return;
        }
        if (event.code === 4003) {
            activeClientSettings = null;
            localStorage.removeItem(SYNC_CLIENT_TOKEN_KEY);
            setClientSyncStatus("not-approved");
            console.warn("POS sync access was rejected or revoked by the host");
            return;
        }
        console.warn("POS sync disconnected");
        setClientSyncStatus("disconnected");
        scheduleSyncReconnect();
    });

    socket.addEventListener("error", () => {
        console.warn("POS sync unavailable on the same network");
    });
};

export const connectSyncClient = (settings) => {
    disconnectSyncClient();
    if (!settings?.enabled || settings.mode !== "client" || !settings.host) return;
    activeClientSettings = settings;
    reconnectDelay = 1000;
    setClientSyncStatus("connecting");
    openSyncClient(settings);
};
