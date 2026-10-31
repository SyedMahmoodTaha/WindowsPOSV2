import { useEffect, useState } from "react";
import { FaArrowLeft, FaPrint, FaReceipt } from "react-icons/fa6";
import { Link } from "react-router-dom";
import { readWebPrinterSettings, saveWebPrinterSettings } from "../utils/orderStorage";

const Settings = () => {
    const [printers, setPrinters] = useState([]);
    const [settings, setSettings] = useState({ kitchen: "", cashier: "" });
    const [message, setMessage] = useState("");

    useEffect(() => {
        const loadSettings = async () => {
            if (window.pflDesktop) {
                try {
                    const [availablePrinters, savedSettings] = await Promise.all([window.pflDesktop.getPrinters(), window.pflDesktop.getPrinterSettings()]);
                    setPrinters(availablePrinters);
                    setSettings(Object.fromEntries(["kitchen", "cashier"].map((destination) => {
                        const value = savedSettings?.[destination];
                        if (value && typeof value === "object" && value.host) return [destination, { type: "ip", host: value.host, port: Number(value.port) || 9100 }];
                        if (typeof value === "string" && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value.trim())) return [destination, { type: "ip", host: value.trim(), port: 9100 }];
                        return [destination, value || ""];
                    })));
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
            </div>
        </main>
    );
};

export default Settings;
