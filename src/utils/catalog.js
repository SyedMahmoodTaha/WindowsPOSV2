import { pushSharedDataToHost } from "./networkSync";

export const CATALOG_STORAGE_KEY = "pfl-catalog-v1";
export const TABLES_STORAGE_KEY = "pfl-tables-v1";
const TABLES_INITIALIZED_KEY = "pfl-tables-initialized-v1";

export const defaultMenuItems = [
    { id: 1, code: "1", name: "Classic Burger", category: "Burger", price: 8.5, diet: "veg", favorite: true },
    { id: 2, code: "2", name: "Chicken Burger", category: "Burger", price: 9.5, diet: "non-veg" },
    { id: 3, code: "3", name: "Margherita Pizza", category: "Pizza", price: 10, diet: "veg" },
    { id: 4, code: "4", name: "Chicken Tikka Pizza", category: "Pizza", price: 12, diet: "non-veg", favorite: true },
    { id: 5, code: "5", name: "Mango Lassi", category: "Lassi", price: 5, diet: "veg" },
    { id: 6, code: "6", name: "Classic Lassi", category: "Lassi", price: 4.5, diet: "veg", favorite: true },
    { id: 7, code: "7", name: "Berry Smoothie", category: "Smoothies", price: 6, diet: "veg", favorite: true },
    { id: 8, code: "8", name: "Tropical Smoothie", category: "Smoothies", price: 6.5, diet: "veg" },
    { id: 9, code: "9", name: "Masala Chai", category: "Hot Drinks", price: 3, diet: "veg" },
    { id: 10, code: "10", name: "Samosa Plate", category: "Snacks", price: 6, diet: "veg" },
    { id: 11, code: "11", name: "Chicken Roll", category: "Snacks", price: 7.5, diet: "non-veg" },
];

export const defaultCategories = ["Favourites", "All", "Burger", "Pizza", "Lassi", "Smoothies", "Hot Drinks", "Snacks"];
export const defaultTables = ["R1", "R2", "R3", "L1", "L2", "L3", "L4", "F1", "F2", "F3", "F4", "F5", "F6"];

const readJson = (key, fallback) => {
    try {
        return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
        return fallback;
    }
};

export const readCatalog = () => {
    return { menuItems: defaultMenuItems, categories: defaultCategories, ingredients: [], inventoryEnabled: false };
};

export const readCatalogAsync = async () => {
    if (window.pflDesktop && window.pflDesktop.getCatalog) {
        try {
            const catalog = await window.pflDesktop.getCatalog();
            return {
                ...catalog,
                ingredients: Array.isArray(catalog?.ingredients) ? catalog.ingredients : [],
                inventoryEnabled: Boolean(catalog?.inventoryEnabled),
            };
        } catch (error) {
            console.error("Error reading catalog from DB:", error);
            const catalog = readJson(CATALOG_STORAGE_KEY, readCatalog());
            return {
                ...catalog,
                ingredients: Array.isArray(catalog?.ingredients) ? catalog.ingredients : [],
                inventoryEnabled: Boolean(catalog?.inventoryEnabled),
            };
        }
    }
    const catalog = readJson(CATALOG_STORAGE_KEY, readCatalog());
    return {
        ...catalog,
        ingredients: Array.isArray(catalog?.ingredients) ? catalog.ingredients : [],
        inventoryEnabled: Boolean(catalog?.inventoryEnabled),
    };
};

export const saveCatalog = async (catalog) => {
    if (window.pflDesktop && window.pflDesktop.saveCatalog) {
        await window.pflDesktop.saveCatalog(catalog);
    } else {
        localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
    }
    void pushSharedDataToHost("catalog-sync", { catalog });
    window.dispatchEvent(new Event("pfl-catalog-updated"));
    return catalog;
};

export const readTables = () => {
    return defaultTables;
};

export const readTablesAsync = async () => {
    if (window.pflDesktop && window.pflDesktop.getTables) {
        try {
            return await window.pflDesktop.getTables();
        } catch (error) {
            console.error("Error reading tables from DB:", error);
            const storedTables = localStorage.getItem(TABLES_STORAGE_KEY);
            if (storedTables === "[]" && !localStorage.getItem(TABLES_INITIALIZED_KEY)) return defaultTables;
            return storedTables === null ? defaultTables : readJson(TABLES_STORAGE_KEY, defaultTables);
        }
    }
    const storedTables = localStorage.getItem(TABLES_STORAGE_KEY);
    if (storedTables === "[]" && !localStorage.getItem(TABLES_INITIALIZED_KEY)) return defaultTables;
    return storedTables === null ? defaultTables : readJson(TABLES_STORAGE_KEY, defaultTables);
};

export const saveTables = async (tables) => {
    if (window.pflDesktop && window.pflDesktop.saveTables) {
        await window.pflDesktop.saveTables(tables);
    } else {
        localStorage.setItem(TABLES_STORAGE_KEY, JSON.stringify(tables));
        localStorage.setItem(TABLES_INITIALIZED_KEY, "true");
    }
    void pushSharedDataToHost("tables-sync", { tables });
    window.dispatchEvent(new Event("pfl-catalog-updated"));
    return tables;
};