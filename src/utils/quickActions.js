import { FaBoxOpen, FaChartLine, FaGear, FaPrint, FaPlus, FaTruckFast, FaUsers, FaWifi } from "react-icons/fa6";
import { GoListOrdered } from "react-icons/go";
import { MdOutlineTableBar } from "react-icons/md";

const QUICK_ACTIONS_STORAGE_KEY = "pfl-quick-actions-v1";

export const quickActionOptions = [
    { id: "new-order", label: "New Order", description: "Start a new customer order", icon: FaPlus, path: "/new-order" },
    { id: "tables", label: "Tables", description: "View and manage table orders", icon: MdOutlineTableBar, path: "/Tables" },
    { id: "orders", label: "Orders", description: "Review saved orders", icon: GoListOrdered, path: "/Orders" },
    { id: "delivery", label: "Delivery", description: "Manage delivery orders", icon: FaTruckFast, path: "/delivery", roles: ["Admin", "Manager"] },
    { id: "printer-settings", label: "Printer Settings", description: "Choose cashier and kitchen printers", icon: FaPrint, path: "/settings" },
    { id: "inventory", label: "Inventory", description: "Stock management", icon: FaBoxOpen, path: "/inventory" },
    { id: "my-account", label: "My Account", description: "Update your profile and contact details", icon: FaGear, path: "/my-account" },
    { id: "bill-printing-preferences", label: "Bill Printing Preferences", description: "Configure cashier and kitchen print layouts", icon: FaGear, path: "/bill-printing-preferences" },
    { id: "customers", label: "Customers", description: "Customer profiles and service history", icon: FaUsers, path: "/customers", roles: ["Admin", "Manager", "Assistant Manager"] },
    { id: "all-orders", label: "All Orders", description: "Review completed orders", icon: GoListOrdered, path: "/all-orders", roles: ["Admin", "Manager", "Assistant Manager"] },
    { id: "staff-users", label: "Staff & Users", description: "View staff profiles and manage login accounts", icon: FaUsers, path: "/staff-users", roles: ["Admin", "Manager"] },
    { id: "admin-settings", label: "Admin Settings", description: "Sales and operations reports", icon: FaChartLine, path: "/admin-settings", roles: ["Admin"] },
    { id: "network-sync", label: "Network Sync", description: "Connect approved devices on the local network", icon: FaWifi, path: "/network-sync", roles: ["Admin"] },
    { id: "developer", label: "Menu Management", description: "Manage menu items and categories", icon: FaGear, path: "/developer", roles: ["Admin", "Manager", "Assistant Manager"] },
];

export const defaultQuickActionIds = ["new-order", "tables", "orders", "delivery", "printer-settings"];

export const readQuickActionIds = () => {
    try {
        const savedIds = JSON.parse(localStorage.getItem(QUICK_ACTIONS_STORAGE_KEY));
        if (!Array.isArray(savedIds)) return defaultQuickActionIds;
        return savedIds.filter((id) => quickActionOptions.some((action) => action.id === id));
    } catch {
        return defaultQuickActionIds;
    }
};

export const saveQuickActionIds = (ids) => {
    const validIds = ids.filter((id) => quickActionOptions.some((action) => action.id === id));
    localStorage.setItem(QUICK_ACTIONS_STORAGE_KEY, JSON.stringify([...new Set(validIds)]));
};
