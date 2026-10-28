import { useEffect, useState } from "react";
import { FaArrowLeft, FaPrint, FaReceipt } from "react-icons/fa6";
import { Link } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";
import { readWebPrinterSettings, readWebSyncSettings, saveWebPrinterSettings } from "../utils/orderStorage";
import { setSyncSettings as persistSyncSettings } from "../utils/networkSync";

const Settings = () => {
    const currentUser = getCurrentUser();
    const isAdmin = currentUser?.role === "Admin";
    const [printers, setPrinters] = useState([]);
    const [settings, setSettings] = useState({ kitchen: "", cashier: "" });
    const [syncSettings, setSyncSettings] = useState({ enabled: false, mode: "host", host: "", port: 4099 });
    const [message, setMessage] = useState("");
    const [syncMessage, setSyncMessage] = useState("");

    useEffect(() => {
        const loadSettings = async () => {
            if (window.pflDesktop) {
                try {
                    const [availablePrinters, savedSettings, savedSyncSettings] = await Promise.all([window.pflDesktop.getPrinters(), window.pflDesktop.getPrinterSettings(), window.pflDesktop.getSyncSettings()]);
                    setPrinters(availablePrinters);
                    setSettings(Object.fromEntries(["kitchen", "cashier"].map((destination) => {
                        const value = savedSettings?.[destination];
                        if (value && typeof value === "object" && value.host) return [destination, { type: "ip", host: value.host, port: Number(value.port) || 9100 }];
                        if (typeof value === "string" && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value.trim())) return [destination, { type: "ip", host: value.trim(), port: 9100 }];
                        return [destination, value || ""];
                    })));
                    setSyncSettings({
                        enabled: Boolean(savedSyncSettings?.enabled),
                        mode: savedSyncSettings?.mode === "client" ? "client" : "host",
                        host: savedSyncSettings?.host || "",
                        port: Number(savedSyncSettings?.port || 4099),
                    });
                    return;
                } catch {
                    setMessage("Could not load installed printers");
                    return;
                }
            }

            const savedSettings = readWebPrinterSettings();
            setSettings(Object.fromEntries(["kitchen", "cashier"].map((destination) => {
                const value = savedSettings?.[destination];
                if (value && typeof value === "object" && value.host) return [destination, { type: "ip", host: value.host, port: Number(value.port) || 9100 }];
                if (typeof value === "string" && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value.trim())) return [destination, { type: "ip", host: value.trim(), port: 9100 }];
                return [destination, value || ""];
            })));
            setSyncSettings(readWebSyncSettings());
        };

        void loadSettings();
    }, []);

    const saveSettings = async (event) => {
        event.preventDefault();
        if (window.pflDesktop) {
            await window.pflDesktop.setPrinterSettings(settings);
        } else {
            saveWebPrinterSettings(settings);
        }
        setMessage("Printer settings saved");
    };

    const saveSyncSettings = async (event) => {
        event.preventDefault();
        const next = {
            enabled: Boolean(syncSettings.enabled),
            mode: syncSettings.mode === "client" ? "client" : "host",
            host: String(syncSettings.host || "").trim(),
            port: Number(syncSettings.port || 4099),
        };
        const savedSettings = await persistSyncSettings(next);
        setSyncSettings(savedSettings);
        setSyncMessage(next.enabled ? (next.mode === "host" ? "Master sync enabled on this machine." : `Client mode connected to ${next.host || "master host"}:${next.port}`) : "Sync disabled");
    };

    return (
        <main className="min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto max-w-2xl">
                <div className="mb-8 flex items-center gap-4"><Link to="/" className="rounded-full p-3 text-[#d3d3d3] hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label="Back to home"><FaArrowLeft /></Link><div><p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Desktop setup</p><h1 className="text-3xl font-semibold">Printer settings</h1></div></div>
                <form onSubmit={saveSettings} className="rounded-[24px] bg-[#2a2a2a] p-6 shadow-lg">
                    <div className="mb-6 flex items-center gap-3"><FaPrint className="text-[#d3d3d3]" /><p className="text-[#ababab]">Choose an installed printer or enter a network printer IP.</p></div>
                    {["kitchen", "cashier"].map((destination) => <label key={destination} className="mb-4 grid gap-2 text-sm font-medium capitalize text-[#ababab]">{destination} printer<select value={typeof settings[destination] === "object" ? "ip" : "system"} onChange={(event) => setSettings((current) => ({ ...current, [destination]: event.target.value === "ip" ? { type: "ip", host: "", port: 9100 } : "" }))} className="rounded-[12px] border border-[#444] bg-[#1f1f1f] px-3 py-3 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]"><option value="system">Installed printer</option><option value="ip">Network printer IP</option></select>{typeof settings[destination] === "object" ? <div className="grid grid-cols-[1fr_6rem] gap-2"><input required placeholder="192.168.1.50" value={settings[destination].host} onChange={(event) => setSettings((current) => ({ ...current, [destination]: { ...current[destination], host: event.target.value.trim() } }))} className="rounded-[12px] border border-[#444] bg-[#1f1f1f] px-3 py-3 text-[#f5f5f5] outline-none" /><input required type="text" inputMode="numeric" placeholder="9100" value={settings[destination].port} onChange={(event) => setSettings((current) => ({ ...current, [destination]: { ...current[destination], port: Number(event.target.value) || 9100 } }))} className="rounded-[12px] border border-[#444] bg-[#1f1f1f] px-3 py-3 text-[#f5f5f5] outline-none" /></div> : <select required value={settings[destination]} onChange={(event) => setSettings((current) => ({ ...current, [destination]: event.target.value }))} className="rounded-[12px] border border-[#444] bg-[#1f1f1f] px-3 py-3 text-[#f5f5f5] outline-none"><option value="">Select installed printer</option>{printers.map((printer) => <option key={printer.name} value={printer.name}>{printer.displayName || printer.name}</option>)}</select>}</label>)}
                    <Link to="/bill-printing-preferences" className="mt-6 flex items-center gap-3 rounded-[14px] border border-[#444] bg-[#1f1f1f] px-4 py-4 text-sm font-semibold text-[#f5f5f5] transition-colors hover:bg-[#3a3a3a]"><FaReceipt className="text-[#d3d3d3]" /><span><span className="block">Bill printing preference</span><span className="mt-1 block text-xs font-normal text-[#ababab]">Choose or create a completely editable bill layout</span></span></Link>
                    <div className="mt-6 flex flex-col gap-3 sm:flex-row"><button type="submit" className="rounded-[12px] bg-[#d3d3d3] px-5 py-3 font-semibold text-[#1a1a1a] hover:bg-white">Save printer settings</button></div>
                    {message && <p className="mt-4 text-sm text-[#a7d7a7]">{message}</p>}
                </form>

                {isAdmin && (
                    <form onSubmit={saveSyncSettings} className="mt-8 rounded-[24px] bg-[#2a2a2a] p-6 shadow-lg">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Network sync</p>
                                <h2 className="text-2xl font-semibold">Master / Client mode</h2>
                            </div>
                            <label className="inline-flex items-center gap-2 text-sm text-[#ababab]">
                                <input type="checkbox" checked={syncSettings.enabled} onChange={(event) => setSyncSettings((current) => ({ ...current, enabled: event.target.checked }))} className="h-4 w-4 accent-[#d3d3d3]" />
                                Enabled
                            </label>
                        </div>

                        <div className="mb-4 grid gap-3 sm:grid-cols-2">
                            <label className="rounded-[14px] border border-[#444] bg-[#1f1f1f] p-3 text-sm text-[#f5f5f5]">
                                <input type="radio" name="sync-mode" checked={syncSettings.mode === "host"} onChange={() => setSyncSettings((current) => ({ ...current, mode: "host" }))} className="mr-2 accent-[#d3d3d3]" />
                                Host (master server)
                            </label>
                            <label className="rounded-[14px] border border-[#444] bg-[#1f1f1f] p-3 text-sm text-[#f5f5f5]">
                                <input type="radio" name="sync-mode" checked={syncSettings.mode === "client"} onChange={() => setSyncSettings((current) => ({ ...current, mode: "client" }))} className="mr-2 accent-[#d3d3d3]" />
                                Client
                            </label>
                        </div>

                        {syncSettings.mode === "client" && (
                            <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
                                <input
                                    type="text"
                                    value={syncSettings.host}
                                    onChange={(event) => setSyncSettings((current) => ({ ...current, host: event.target.value }))}
                                    placeholder="192.168.1.20"
                                    className="rounded-[12px] border border-[#444] bg-[#1f1f1f] px-3 py-3 text-[#f5f5f5] outline-none placeholder:text-[#777] focus:border-[#d3d3d3]"
                                />
                                <input
                                    type="number"
                                    min="1"
                                    max="65535"
                                    value={syncSettings.port}
                                    onChange={(event) => setSyncSettings((current) => ({ ...current, port: Number(event.target.value || 4099) }))}
                                    className="rounded-[12px] border border-[#444] bg-[#1f1f1f] px-3 py-3 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]"
                                />
                            </div>
                        )}

                        {syncSettings.mode === "host" && (
                            <p className="mt-3 text-sm text-[#ababab]">This machine will act as the master sync host and push updates to clients on the same LAN.</p>
                        )}

                        <button type="submit" className="mt-5 rounded-[12px] bg-[#d3d3d3] px-5 py-3 font-semibold text-[#1a1a1a] hover:bg-white">Save sync settings</button>
                        {syncMessage && <p className="mt-4 text-sm text-[#a7d7a7]">{syncMessage}</p>}
                    </form>
                )}
            </div>
        </main>
    );
};

export default Settings;
