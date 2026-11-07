import { useEffect, useState } from "react";
import { FaPrint, FaPlus, FaUtensils, FaUsers, FaWifi } from "react-icons/fa6";
import { MdOutlineTableBar } from "react-icons/md";
import { GoListOrdered } from "react-icons/go";
import { Link } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";

const getGreeting = (hour) => {
    if (hour >= 19) return "Night Owl";
    if (hour >= 12) return "Good Afternoon";
    return "Good Morning";
};

const formatTime = (date) => date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
}).replaceAll(":", "-");

const formatDate = (date) => [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    date.getFullYear(),
].join("-");

const Home = () => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const currentUser = getCurrentUser();

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const actions = [
        { label: "New Order", icon: FaPlus, path: "/new-order" },
        { label: "Tables", icon: MdOutlineTableBar, path:"/Tables" },
        { label: "Orders", icon: GoListOrdered, path: "/Orders" },
        { label: "Printer Settings", icon: FaPrint, path: "/settings" },
        ...(["Admin", "Manager", "Assistant Manager"].includes(currentUser?.role) ? [
            { label: "Customers", icon: FaUsers, path: "/customers" },
        ] : []),
        ...(currentUser?.role === "Admin" ? [
            { label: "Network Sync", icon: FaWifi, path: "/network-sync" },
            { label: "Settings", icon: FaUtensils, path: "/admin-settings" },
            { label: "Developer Mode", icon: FaUtensils, path: "/developer" },
        ] : []),
        ...(["Manager", "Assistant Manager"].includes(currentUser?.role) ? [
            { label: "All Orders", icon: GoListOrdered, path: "/all-orders" },
        ] : []),
        ...(currentUser?.role === "Assistant Manager" ? [
            { label: "My Account", icon: FaUtensils, path: "/developer" },
        ] : []),
        ...(currentUser?.role === "Manager" ? [
            { label: "Menu & Staff", icon: FaUtensils, path: "/developer" },
        ] : []),
    ];

    return(
    <section className="min-h-[calc(100vh-4rem)] overflow-hidden bg-[#1f1f1f] px-6 py-8 text-[#f5f5f5]">
        <div className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-6 rounded-[24px] bg-[#2a2a2a] p-6 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-8">
                <div>
                    <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-[#ababab]">Welcome back, {currentUser?.role || "User"}</p>
                    <h1 className="text-3xl font-semibold sm:text-4xl">{getGreeting(currentTime.getHours())}</h1>
                    <p className="mt-2 text-[#ababab]">Ready to serve something delicious?</p>
                </div>
                <div className="flex flex-col sm:items-end">
                    <time className="text-3xl font-semibold tracking-wider text-[#d3d3d3] sm:text-4xl" dateTime={currentTime.toISOString()}>
                        {formatTime(currentTime)}
                    </time>
                    <time className="mt-1 text-sm font-medium tracking-wider text-[#ababab]" dateTime={currentTime.toISOString()}>
                        {formatDate(currentTime)}
                    </time>
                </div>
            </div>

            <div className="mt-8">
                <div className="mb-4 flex items-center gap-3">
                    <FaUtensils className="text-[#d3d3d3]" />
                    <h2 className="text-xl font-semibold">Quick Actions</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {actions.map(({ label, icon: Icon, path }) => {
                        const actionClassName = "quick-action-card flex items-center gap-4 rounded-[20px] bg-[#2a2a2a] p-5 text-left transition-all duration-200 hover:-translate-y-1 hover:bg-[#d3d3d3] hover:text-[#1a1a1a] active:translate-y-0 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#d3d3d3]";
                        const actionContent = <>
                            <span className="quick-action-icon flex size-11 items-center justify-center rounded-full bg-[#3a3a3a] text-[#f5f5f5]">
                                <Icon className="size-5" />
                            </span>
                            <span className="font-medium">{label}</span>
                        </>;

                        return path ? (
                            <Link key={label} to={path} state={path === "/Tables" ? { from: "/" } : undefined} className={actionClassName}>{actionContent}</Link>
                        ) : (
                            <button key={label} type="button" className={actionClassName}>{actionContent}</button>
                        );
                    })}
                </div>
            </div>
        </div>
       </section>
    )
}

export default Home