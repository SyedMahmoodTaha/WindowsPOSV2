import { useState } from "react";
import { FaArrowLeft, FaBolt } from "react-icons/fa6";
import { Link, useLocation } from "react-router-dom";
import { quickActionOptions, readQuickActionIds, saveQuickActionIds } from "../utils/quickActions";
import { getCurrentUser } from "../utils/auth";

const QuickActionSettings = () => {
    const location = useLocation();
    const role = getCurrentUser()?.role;
    const [selectedIds, setSelectedIds] = useState(readQuickActionIds);
    const [message, setMessage] = useState("");

    const toggleAction = (actionId) => {
        setSelectedIds((currentIds) => currentIds.includes(actionId)
            ? currentIds.filter((id) => id !== actionId)
            : [...currentIds, actionId]);
        setMessage("");
    };

    const saveSettings = (event) => {
        event.preventDefault();
        saveQuickActionIds(selectedIds);
        setMessage("Quick action settings saved");
    };

    return (
        <main className="min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto max-w-2xl">
                <div className="mb-8 flex items-center gap-4">
                    <Link to={location.state?.from || "/more-settings"} className="rounded-full p-3 text-[#d3d3d3] transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label="Back to More Settings">
                        <FaArrowLeft />
                    </Link>
                    <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Home screen</p>
                        <h1 className="text-3xl font-semibold">Quick Action Settings</h1>
                    </div>
                </div>

                <form onSubmit={saveSettings} className="rounded-[24px] bg-[#2a2a2a] p-5 shadow-lg sm:p-6">
                    <div className="mb-5 flex items-center gap-3">
                        <FaBolt className="text-[#d3d3d3]" />
                        <p className="text-sm text-[#ababab]">Choose which shortcuts appear in Quick Actions on the home screen.</p>
                    </div>
                    <div className="grid gap-3">
                        {quickActionOptions.map(({ id, label, description, icon: Icon, roles }) => {
                            const restricted = roles && !roles.includes(role);
                            return (
                                <label key={id} className={`flex items-center gap-3 rounded-[14px] border border-[#444] bg-[#1f1f1f] p-4 ${restricted ? "opacity-60" : "cursor-pointer"}`}>
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(id)}
                                        disabled={restricted}
                                        onChange={() => toggleAction(id)}
                                        className="size-4 accent-[#d3d3d3]"
                                    />
                                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#3a3a3a] text-[#d3d3d3]">
                                        <Icon className="size-4" />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block font-semibold">{label}</span>
                                        <span className="mt-1 block text-xs text-[#ababab]">{restricted ? "Available to Admin and Manager roles" : description}</span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <button type="submit" className="rounded-[12px] bg-[#d3d3d3] px-5 py-3 font-semibold text-[#1a1a1a] transition-colors hover:bg-white">Save quick actions</button>
                        {message && <p className="text-sm text-[#a7d7a7]" role="status">{message}</p>}
                    </div>
                </form>
            </div>
        </main>
    );
};

export default QuickActionSettings;
