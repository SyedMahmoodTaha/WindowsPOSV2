import { useCallback, useEffect, useState } from "react";
import { FaArrowLeft, FaWifi } from "react-icons/fa6";
import { Link, useLocation } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";
import { getSyncSettings, setSyncSettings as persistSyncSettings } from "../utils/networkSync";

const defaultSyncSettings = { enabled: false, mode: "host", host: "", port: 4099 };

const NetworkSync = () => {
    const location = useLocation();
    const backPath = location.state?.from === "/more-settings" ? "/more-settings" : "/";
    const [settings, setSettings] = useState(defaultSyncSettings);
    const [status, setStatus] = useState({ hostRunning: false, clients: [], pendingClients: [], approvedClients: [] });
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const isAdmin = getCurrentUser()?.role === "Admin";
    const isDesktop = Boolean(window.pflDesktop);

    const refreshStatus = useCallback(async () => {
        if (window.pflDesktop?.getSyncStatus) {
            const nextStatus = await window.pflDesktop.getSyncStatus();
            const clientSyncState = window.__pflSyncStatus || "disconnected";
            setStatus({
                ...nextStatus,
                clientSyncState,
                clientConnected: clientSyncState === "connected",
                clientConnecting: ["connecting", "authenticating", "requesting-approval"].includes(clientSyncState),
            });
            return;
        }
        const socket = window.__pflSyncSocket;
        const clientSyncState = window.__pflSyncStatus || (socket?.readyState === WebSocket.OPEN ? "waiting-approval" : "disconnected");
        setStatus({
            hostRunning: false,
            clients: [],
            clientSyncState,
            clientConnected: clientSyncState === "connected",
            clientConnecting: ["connecting", "authenticating", "requesting-approval"].includes(clientSyncState),
        });
    }, []);

    useEffect(() => {
        let mounted = true;
        const loadSettings = async () => {
            try {
                const saved = await getSyncSettings();
                if (mounted) setSettings({
                    ...defaultSyncSettings,
                    ...saved,
                    enabled: Boolean(saved?.enabled),
                    mode: saved?.mode === "client" ? "client" : "host",
                    host: String(saved?.host || ""),
                    port: Number(saved?.port || 4099),
                });
            } catch (loadError) {
                if (mounted) setError(`Could not load sync settings: ${loadError.message}`);
            }
        };
        void loadSettings();
        const refresh = () => {
            void refreshStatus().catch((statusError) => {
                if (mounted) setError(`Could not load sync status: ${statusError.message}`);
            });
        };
        refresh();
        const intervalId = window.setInterval(refresh, 2000);
        return () => {
            mounted = false;
            window.clearInterval(intervalId);
        };
    }, [refreshStatus]);

    const saveSettings = async (event) => {
        event.preventDefault();
        setIsSaving(true);
        setError("");
        setMessage("");
        try {
            const saved = await persistSyncSettings({
                ...settings,
                enabled: Boolean(settings.enabled),
                mode: settings.mode === "client" ? "client" : "host",
                host: String(settings.host || "").trim(),
                port: Number(settings.port || 4099),
            });
            setSettings({ ...defaultSyncSettings, ...saved });
            setMessage(saved.enabled
                ? saved.mode === "host" ? `Sync host enabled on port ${saved.port}.` : `Client configured for ${saved.host}:${saved.port}.`
                : "Network sync disabled.");
            await refreshStatus();
        } catch (saveError) {
            setError(`Could not save sync settings: ${saveError.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const disconnectClient = async (clientId) => {
        setError("");
        try {
            const disconnected = await window.pflDesktop.disconnectSyncClient(clientId);
            if (!disconnected) {
                setError("That client has already disconnected.");
                await refreshStatus();
                return;
            }
            setMessage(`${clientId} disconnected.`);
            await refreshStatus();
        } catch (disconnectError) {
            setError(`Could not disconnect client: ${disconnectError.message}`);
        }
    };

    const handlePendingRequest = async (requestId, approve) => {
        setError("");
        try {
            const result = await window.pflDesktop[approve ? "approveSyncClient" : "rejectSyncClient"](requestId);
            if (!result) {
                setError("That connection request is no longer active.");
                await refreshStatus();
                return;
            }
            setMessage(approve
                ? "Client approved. A connection token was generated and delivered automatically."
                : "Connection request rejected.");
            await refreshStatus();
        } catch (requestError) {
            setError(`Could not ${approve ? "approve" : "reject"} request: ${requestError.message}`);
        }
    };

    const revokeClient = async (clientId) => {
        setError("");
        try {
            const revoked = await window.pflDesktop.revokeSyncClient(clientId);
            if (!revoked) {
                setError("That approved client is no longer registered.");
                await refreshStatus();
                return;
            }
            setMessage("Client access revoked.");
            await refreshStatus();
        } catch (revokeError) {
            setError(`Could not revoke client access: ${revokeError.message}`);
        }
    };

    if (!isAdmin) {
        return <main className="min-h-screen bg-[#1f1f1f] px-4 py-10 text-center text-[#f5f5f5]">Network sync settings require an Admin account.</main>;
    }

    const connectionLabel = settings.mode === "host"
        ? status.hostRunning ? "Host running" : settings.enabled ? "Starting / unavailable" : "Disabled"
        : status.clientConnected ? "Approved and connected"
            : status.clientSyncState === "waiting-approval" ? "Waiting for host approval"
                : status.clientSyncState === "not-approved" ? "Approval required"
                    : status.clientSyncState === "disconnected-by-host" ? "Disconnected by host"
                        : status.clientConnecting ? "Connecting to host" : settings.enabled ? "Disconnected" : "Disabled";

    return (
        <main className="min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto max-w-3xl">
                <div className="mb-8 flex items-center gap-4">
                    <Link to={backPath} className="rounded-full p-3 text-[#d3d3d3] hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label={backPath === "/more-settings" ? "Back to More Settings" : "Back to home"}><FaArrowLeft /></Link>
                    <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Desktop setup</p>
                        <h1 className="text-3xl font-semibold">Network Sync</h1>
                    </div>
                </div>

                <section className="mb-6 rounded-[24px] bg-[#2a2a2a] p-6 shadow-lg">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <FaWifi className="text-[#a6f0c7]" />
                            <div>
                                <p className="text-sm uppercase tracking-[0.16em] text-[#ababab]">Current connection</p>
                                <h2 className="mt-1 text-xl font-semibold">{connectionLabel}</h2>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-3xl font-semibold tabular-nums">{settings.mode === "host" ? status.clients?.length || 0 : status.clientConnected ? 1 : 0}</p>
                            <p className="text-xs text-[#ababab]">{settings.mode === "host" ? "connected clients" : "host connection"}</p>
                        </div>
                    </div>
                    {!isDesktop && <p className="mt-4 text-sm text-[#f7d78c]">Web mode can connect as a client, but running a sync host and managing connected clients requires the desktop app.</p>}
                    {settings.mode === "host" && settings.enabled && !status.hostRunning && <p className="mt-4 text-sm text-[#f7d78c]">The sync host is not running. Check that the selected port is available and the local network allows connections.</p>}
                    {settings.mode === "host" && <p className="mt-4 text-sm text-[#f7d78c]">Sync uses unencrypted LAN traffic (ws://). Approve only devices you trust and use a trusted network.</p>}
                    {settings.mode === "client" && settings.enabled && !status.clientConnected && <p className="mt-4 text-sm text-[#f7d78c]">This client is not connected. Verify the host address, port, and network connection.</p>}
                    {settings.mode === "client" && status.clientSyncState === "waiting-approval" && <p className="mt-4 text-sm text-[#f7d78c]">A connection request was sent. An Admin must approve it on the host.</p>}
                    {settings.mode === "client" && status.clientSyncState === "not-approved" && <p className="mt-4 text-sm text-[#f7d78c]">The host has not approved this device, or its access was revoked. Ask the host Admin to approve a new request, then save these settings to retry.</p>}
                </section>

                {settings.mode === "host" && (
                    <section className="mb-6 rounded-[24px] bg-[#2a2a2a] p-6 shadow-lg">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-xl font-semibold">Connection requests</h2>
                            <span className="rounded-full bg-[#f7d78c]/15 px-3 py-1 text-sm font-semibold text-[#f7d78c]">{status.pendingClients?.length || 0} pending</span>
                        </div>
                        {!status.pendingClients?.length ? (
                            <p className="mt-3 rounded-[12px] bg-[#1f1f1f] p-4 text-sm text-[#ababab]">No pending device requests.</p>
                        ) : (
                            <ul className="mt-3 divide-y divide-[#444]">
                                {status.pendingClients.map((request) => (
                                    <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                                        <div>
                                            <p className="font-semibold">{request.name} <span className="font-normal text-[#ababab]">· {request.address}</span></p>
                                            <p className="mt-1 text-xs text-[#ababab]">Requested {new Date(request.requestedAt).toLocaleString()}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => void handlePendingRequest(request.id, false)} className="rounded-[10px] border border-[#555] px-3 py-2 text-sm font-semibold text-[#ababab] hover:bg-[#3a3a3a]">Reject</button>
                                            <button type="button" onClick={() => void handlePendingRequest(request.id, true)} className="rounded-[10px] bg-[#a6f0c7] px-3 py-2 text-sm font-semibold text-[#163b28] hover:bg-[#c1f7da]">Approve &amp; connect</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}

                {settings.mode === "host" && (
                    <section className="mb-6 rounded-[24px] bg-[#2a2a2a] p-6 shadow-lg">
                        <h2 className="text-xl font-semibold">Approved devices</h2>
                        {!status.approvedClients?.length ? (
                            <p className="mt-3 rounded-[12px] bg-[#1f1f1f] p-4 text-sm text-[#ababab]">No devices have been approved.</p>
                        ) : (
                            <ul className="mt-3 divide-y divide-[#444]">
                                {status.approvedClients.map((client) => (
                                    <li key={client.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                                        <div>
                                            <p className="font-semibold">{client.name || client.id} <span className="font-normal text-[#ababab]">· {client.connected ? "Connected" : "Offline"}</span></p>
                                            <p className="mt-1 text-xs text-[#ababab]">Approved {new Date(client.approvedAt).toLocaleString()}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            {client.connected && <button type="button" onClick={() => void disconnectClient(client.id)} className="rounded-[10px] border border-[#555] px-3 py-2 text-sm font-semibold text-[#ababab] hover:bg-[#3a3a3a]">Disconnect</button>}
                                            <button type="button" onClick={() => void revokeClient(client.id)} className="rounded-[10px] border border-[#754646] px-3 py-2 text-sm font-semibold text-[#ffb4b4] hover:bg-[#5a3030]">Revoke</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}

                <form onSubmit={saveSettings} className="rounded-[24px] bg-[#2a2a2a] p-6 shadow-lg">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Configuration</p>
                            <h2 className="text-2xl font-semibold">Master / Client mode</h2>
                        </div>
                        <label className="inline-flex items-center gap-2 text-sm text-[#ababab]">
                            <input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))} className="h-4 w-4 accent-[#d3d3d3]" />
                            Enabled
                        </label>
                    </div>
                    <div className="mb-4 grid gap-3 sm:grid-cols-2">
                        <label className="rounded-[14px] border border-[#444] bg-[#1f1f1f] p-3 text-sm text-[#f5f5f5]">
                            <input type="radio" name="sync-mode" checked={settings.mode === "host"} onChange={() => setSettings((current) => ({ ...current, mode: "host" }))} className="mr-2 accent-[#d3d3d3]" />
                            Host (master server)
                        </label>
                        <label className="rounded-[14px] border border-[#444] bg-[#1f1f1f] p-3 text-sm text-[#f5f5f5]">
                            <input type="radio" name="sync-mode" checked={settings.mode === "client"} onChange={() => setSettings((current) => ({ ...current, mode: "client" }))} className="mr-2 accent-[#d3d3d3]" />
                            Client
                        </label>
                    </div>
                    {settings.mode === "client" && (
                        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
                            <input type="text" required={settings.enabled} value={settings.host} onChange={(event) => setSettings((current) => ({ ...current, host: event.target.value }))} placeholder="192.168.1.20" className="rounded-[12px] border border-[#444] bg-[#1f1f1f] px-3 py-3 text-[#f5f5f5] outline-none placeholder:text-[#777] focus:border-[#d3d3d3]" aria-label="Sync host address" />
                            <input type="number" min="1" max="65535" required value={settings.port} onChange={(event) => setSettings((current) => ({ ...current, port: Number(event.target.value || 4099) }))} className="rounded-[12px] border border-[#444] bg-[#1f1f1f] px-3 py-3 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" aria-label="Sync port" />
                        </div>
                    )}
                    {settings.mode === "host" && <label className="grid max-w-40 gap-2 text-sm text-[#ababab]">Host port<input type="number" min="1" max="65535" required value={settings.port} onChange={(event) => setSettings((current) => ({ ...current, port: Number(event.target.value || 4099) }))} className="rounded-[12px] border border-[#444] bg-[#1f1f1f] px-3 py-3 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" /></label>}
                    <button type="submit" disabled={isSaving} className="mt-5 rounded-[12px] bg-[#d3d3d3] px-5 py-3 font-semibold text-[#1a1a1a] hover:bg-white disabled:opacity-50">{isSaving ? "Saving…" : "Save sync settings"}</button>
                    {message && <p className="mt-4 text-sm text-[#a7d7a7]" role="status">{message}</p>}
                    {error && <p className="mt-4 text-sm text-[#ffb4b4]" role="alert">{error}</p>}
                </form>
            </div>
        </main>
    );
};

export default NetworkSync;
