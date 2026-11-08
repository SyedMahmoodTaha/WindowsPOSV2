import { FaArrowLeft, FaBoxOpen, FaChartLine, FaGear, FaUsers, FaWifi } from "react-icons/fa6";
import { GoListOrdered } from "react-icons/go";
import { Link } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";

const MoreSettings = () => {
    const role = getCurrentUser()?.role;
    const options = [
        { label: "Inventory", description: "Stock management", icon: FaBoxOpen, path: "/inventory" },
        { label: "Bill Printing Preferences", description: "Configure cashier and kitchen print layouts", icon: FaGear, path: "/bill-printing-preferences" },
        ...(["Admin", "Manager", "Assistant Manager"].includes(role) ? [
            { label: "Customers", description: "Customer profiles and service history", icon: FaUsers, path: "/customers" },
            { label: "All Orders", description: "Review completed orders", icon: GoListOrdered, path: "/all-orders" },
        ] : []),
        ...(role === "Admin" ? [
            { label: "Admin Settings", description: "Sales and operations reports", icon: FaChartLine, path: "/admin-settings" },
            { label: "Network Sync", description: "Connect approved devices on the local network", icon: FaWifi, path: "/network-sync" },
            { label: "Developer Mode", description: "Manage menu, staff, and POS setup", icon: FaGear, path: "/developer" },
            { label: "SQLite Database Viewer", description: "Inspect local POS database", icon: FaGear, path: "/sqlite-db-viewer" },
        ] : []),
        ...(role === "Manager" ? [
            { label: "Menu & Staff", description: "Manage menu items, categories, and permitted staff accounts", icon: FaGear, path: "/developer" },
        ] : []),
        ...(role === "Assistant Manager" ? [
            { label: "My Account", description: "Change your account password", icon: FaGear, path: "/developer" },
        ] : []),
    ];

    return (
        <main className="min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto max-w-6xl">
                <div className="mb-8 flex items-center gap-4">
                    <Link to="/" className="rounded-full p-3 text-[#d3d3d3] transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label="Back to home">
                        <FaArrowLeft />
                    </Link>
                    <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">{role || "POS"} options</p>
                        <h1 className="text-3xl font-semibold">More Settings</h1>
                    </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {options.map(({ label, description, icon: Icon, path }) => (
                        <Link key={label} to={path} className="flex items-start gap-4 rounded-[20px] bg-[#2a2a2a] p-5 transition-colors hover:bg-[#353535] focus:outline-none focus:ring-2 focus:ring-[#d3d3d3]">
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#3a3a3a] text-[#d3d3d3]">
                                <Icon className="size-5" />
                            </span>
                            <span>
                                <span className="block font-semibold">{label}</span>
                                <span className="mt-1 block text-sm text-[#ababab]">{description}</span>
                            </span>
                        </Link>
                    ))}
                </div>
            </div>
        </main>
    );
};

export default MoreSettings;
