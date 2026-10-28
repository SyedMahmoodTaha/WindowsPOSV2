import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaSearch } from "react-icons/fa";
import { FaUserCircle } from "react-icons/fa";
import { FaSignOutAlt } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, getManageableUsers, readUsers, signOut } from "../../utils/auth";
import { readCatalogAsync } from "../../utils/catalog";
import ThemeToggle from "./themeToggle";
const logo = `${import.meta.env.BASE_URL}Logo.png`;
const Header = () => {
    const navigate = useNavigate();
    const user = getCurrentUser();
    const containerRef = useRef(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [catalog, setCatalog] = useState({ menuItems: [], categories: [] });
    const [users, setUsers] = useState([]);

    useEffect(() => {
        const refreshSearchData = async () => {
            const nextCatalog = await readCatalogAsync();
            setCatalog(nextCatalog || { menuItems: [], categories: [] });
            const nextUsers = await getManageableUsers().catch(() => readUsers());
            setUsers(nextUsers || readUsers());
        };

        void refreshSearchData();
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!containerRef.current?.contains(event.target)) {
                setIsProfileOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const searchResults = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return [];

        const baseRoutes = [
            { label: "Home", path: "/", section: "Navigate" },
            { label: "New Order", path: "/new-order", section: "Navigate" },
            { label: "Tables", path: "/Tables", section: "Navigate" },
            { label: "Orders", path: "/Orders", section: "Navigate" },
            { label: "Printer Settings", path: "/settings", section: "Settings" },
            { label: "Network Sync", path: "/settings", section: "Settings" },
            { label: "Bill Printing Preferences", path: "/bill-printing-preferences", section: "Settings" },
            ...(["Admin", "Manager", "Assistant Manager"].includes(user?.role) ? [
                { label: "Developer Mode", path: "/developer", section: "Navigate" },
            ] : []),
            ...(["Admin", "Manager"].includes(user?.role) ? [
                { label: "All Orders", path: "/all-orders", section: "Navigate" },
                { label: "Customers", path: "/customers", section: "Navigate" },
            ] : []),
            ...(user?.role === "Admin" ? [
                { label: "Admin Settings", path: "/admin-settings", section: "Navigate" },
            ] : []),
        ];

        const routes = baseRoutes.filter((route) => route.label.toLowerCase().includes(query) || route.section.toLowerCase().includes(query));

        const userResults = (users || []).filter((account) => {
            return `${account.name} ${account.username} ${account.role}`.toLowerCase().includes(query);
        }).map((account) => ({ label: `${account.name} (${account.role})`, path: "/Auth", section: "Users", user: account }));

        const menuResults = (catalog.menuItems || []).filter((item) => {
            return item.name.toLowerCase().includes(query) || item.category.toLowerCase().includes(query) || String(item.code).toLowerCase().includes(query);
        }).map((item) => ({ label: `${item.name} · ${item.category}`, path: "/new-order", section: "Menu", item }));

        return [...routes, ...userResults, ...menuResults].slice(0, 10);
    }, [catalog, searchQuery, users, user?.role]);

    const handleSignOut = () => {
        signOut();
        setIsProfileOpen(false);
        navigate("/Auth", { replace: true });
    };

    const handleResultClick = (result) => {
        setSearchQuery("");
        if (result.path) {
            if (result.user) {
                navigate(result.path, { state: { from: "/", selectedUsername: result.user.username } });
                return;
            }
            if (result.item) {
                navigate(result.path, { state: { from: "/", selectedMenuItem: result.item } });
                return;
            }
            navigate(result.path);
        }
    };

    return(
       <header ref={containerRef} className="relative flex flex-col gap-3 bg-[#1a1a1a] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 sm:justify-start">
            <div className="flex items-center gap-2">
                <img src={logo} className="h-8 w-8" alt="Logo" />
                <h1 className="text-base font-semibold text-[#f5f5f5] sm:text-lg">Lassi Shop</h1>
            </div>
        </div>

        <div className="relative w-full sm:max-w-[520px]">
            <div className="flex items-center gap-3 rounded-[15px] border border-[#2e2e2e] bg-[#1f1f1f] px-3 py-2 shadow-inner shadow-black/20 sm:gap-4 sm:px-5">
                <FaSearch className="text-sm text-[#f5f5f5] sm:text-base" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search everything..."
                    className="w-full bg-transparent text-sm text-[#f5f5f5] outline-none placeholder:text-[#777] sm:text-base"
                    aria-label="Global search"
                />
            </div>
            {searchQuery.trim() && (
                <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-40 rounded-[18px] border border-[#3a3a3a] bg-[#1f1f1f] p-2 shadow-2xl">
                    {searchResults.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-[#ababab]">No matches found</div>
                    ) : (
                        searchResults.map((result, index) => (
                            <button key={`${result.section}-${result.label}-${index}`} type="button" onClick={() => handleResultClick(result)} className="flex w-full items-center justify-between rounded-[12px] px-3 py-2 text-left transition-colors hover:bg-[#2a2a2a]">
                                <div>
                                    <div className="text-sm font-medium text-[#f5f5f5]">{result.label}</div>
                                    <div className="text-[10px] uppercase tracking-[0.14em] text-[#ababab]">{result.section}</div>
                                </div>
                                {result.user && <span className="rounded-full bg-[#2a2a2a] px-2 py-1 text-[10px] text-[#d3d3d3]">{result.user.role}</span>}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>

        <div className="flex items-center justify-end sm:justify-center">
            <div className="relative w-full sm:w-auto">
                <div role="button" tabIndex={0} onClick={() => setIsProfileOpen((value) => !value)} onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setIsProfileOpen((value) => !value);
                    }
                }} className="flex cursor-pointer items-center gap-3 rounded-full px-2 py-1 text-left transition-colors hover:bg-[#2a2a2a]" aria-label="Open account menu">
                    <FaUserCircle className="text-3xl text-[#f5f5f5] sm:text-4xl" />
                    <div className="flex min-w-0 flex-col items-start">
                        <h1 className="max-w-[140px] truncate text-sm font-semibold text-[#f5f5f5] sm:max-w-none sm:text-base">{user?.name}</h1>
                        <p className="text-[10px] font-medium text-[#ababab] sm:text-xs">{user?.role}</p>
                    </div>
                </div>
                {isProfileOpen && (
                    <div className="absolute right-0 top-[calc(100%+12px)] z-50 w-[min(18rem,calc(100vw-2rem))] rounded-[18px] border border-[#3a3a3a] bg-[#1f1f1f] p-4 shadow-2xl">
                        <div className="mb-4 flex items-center gap-3 rounded-[12px] bg-[#2a2a2a] p-3">
                            <FaUserCircle className="text-2xl text-[#d3d3d3]" />
                            <div>
                                <div className="font-semibold text-[#f5f5f5]">{user?.name}</div>
                                <div className="text-xs text-[#ababab]">{user?.role}</div>
                            </div>
                        </div>
                        <div className="mb-3 flex items-center justify-between rounded-[12px] border border-[#444] bg-[#1f1f1f] px-3 py-2">
                            <span className="text-sm text-[#ababab]">Dark mode</span>
                            <ThemeToggle />
                        </div>
                        <button type="button" onClick={handleSignOut} className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#d3d3d3] px-3 py-2 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-white">
                            <FaSignOutAlt />
                            Logout
                        </button>
                    </div>
                )}
            </div>
        </div>
       </header>
    )
}

export default Header