const SYNC_STORAGE_KEY = "pfl-sync-settings-v1";
let clientSocket = null;

export const getSyncSettings = async () => {
    if (window.pflDesktop?.getSyncSettings) {
        try {
            const desktopSettings = await window.pflDesktop.getSyncSettings();
            if (desktopSettings) {
                localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(desktopSettings));
                return desktopSettings;
            }
        } catch {
        }
    }

    try {
        const value = localStorage.getItem(SYNC_STORAGE_KEY);
        return value ? JSON.parse(value) : { mode: "standalone", host: "", port: 4099 };
    } catch {
        return { mode: "standalone", host: "", port: 4099 };
    }
};

export const setSyncSettings = async (settings) => {
    const next = { mode: settings?.mode || "standalone", host: settings?.host || "", port: Number(settings?.port || 4099), enabled: Boolean(settings?.enabled) };
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(next));
    if (window.pflDesktop && window.pflDesktop.setSyncSettings) {
        await window.pflDesktop.setSyncSettings(next);
    }
    if (next.enabled && next.mode === "client") connectSyncClient(next);
    else disconnectSyncClient();
    return next;
};

export const pushOrdersToHost = async (orders) => {
    try {
        const settings = await getSyncSettings();
        if (!settings?.enabled) return;

        if (settings.mode === "client" && settings.host) {
            const socket = window.__pflSyncSocket;
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: "orders-sync",
                    orders,
                    from: "client",
                    syncedAt: new Date().toISOString(),
                }));
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
    window.__pflSyncSocket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
};

export const connectSyncClient = (settings) => {
    disconnectSyncClient();
    if (!settings?.enabled || settings.mode !== "client" || !settings.host) return;

    const socket = new WebSocket(`ws://${settings.host}:${settings.port}`);
    clientSocket = socket;
    window.__pflSyncSocket = socket;
    socket.addEventListener("open", () => {
        socket.send(JSON.stringify({ type: "ping", from: "client" }));
    });

    socket.addEventListener("message", (event) => {
        try {
            const payload = JSON.parse(event.data);
            if (payload?.type === "orders-sync" && Array.isArray(payload.orders)) {
                localStorage.setItem("pfl-orders-v2", JSON.stringify(payload.orders));
                if (window.pflDesktop?.saveOrders) {
                    void window.pflDesktop.saveOrders(payload.orders).catch((error) => {
                        console.error("Could not save synced orders to SQLite:", error);
                    });
                }
                window.dispatchEvent(new Event("pfl-orders-updated"));
            }
        } catch {
        }
    });

    socket.addEventListener("close", () => {
        if (clientSocket === socket) {
            clientSocket = null;
            window.__pflSyncSocket = null;
        }
        console.warn("POS sync disconnected");
    });

    socket.addEventListener("error", () => {
        console.warn("POS sync unavailable on the same network");
    });

};
