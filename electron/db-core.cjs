const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const { categories: seededCategories, menuItems: seededMenuItems } = require("./menu-seed.cjs");

const defaultCatalog = {
    categories: seededCategories,
    menuItems: seededMenuItems,
};

const getDataDirectory = (app) => {
    const sharedDir = path.join(app.getPath("appData"), "Lassi Shop POS Windows");
    const originalUserData = app.getPath("userData");

    fs.mkdirSync(sharedDir, { recursive: true });
    if (originalUserData !== sharedDir) {
        app.setPath("userData", sharedDir);
    }

    return app.getPath("userData");
};
const dbPath = (app) => path.join(getDataDirectory(app), "pfl.sqlite");
let sqliteDb = null;

const normalizeIdentifier = (value) => {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    return /^[A-Za-z0-9_]+$/.test(trimmed) ? trimmed : "";
};

const initializeDatabase = (app) => {
    if (sqliteDb) return sqliteDb;
    sqliteDb = new Database(dbPath(app), { fileMustExist: false });
    sqliteDb.pragma("journal_mode = WAL");
    sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            name TEXT,
            category TEXT,
            price REAL,
            diet TEXT,
            favorite INTEGER DEFAULT 0,
            variations TEXT DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS tables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            username TEXT NOT NULL UNIQUE,
            password TEXT,
            role TEXT
        );
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payload TEXT
        );
        CREATE TABLE IF NOT EXISTS customers (
            id TEXT PRIMARY KEY,
            phone_key TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL,
            address TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);
    
    // Populate default data if tables are empty
    const itemCount = sqliteDb.prepare("SELECT COUNT(*) as count FROM items").get().count;
    if (itemCount === 0) {
        const insertCategory = sqliteDb.prepare("INSERT INTO categories (name) VALUES (?)");
        const insertMany = sqliteDb.transaction((rows) => rows.forEach((row) => insertCategory.run(row)));
        insertMany(defaultCatalog.categories);

        const insertItem = sqliteDb.prepare("INSERT INTO items (code, name, category, price, diet, favorite, variations) VALUES (?, ?, ?, ?, ?, ?, ?)");
        const insertItems = sqliteDb.transaction((rows) => rows.forEach((row) => insertItem.run(
            row.code ?? "",
            row.name ?? "",
            row.category ?? "",
            Number(row.price || 0),
            row.diet ?? "veg",
            row.favorite ? 1 : 0,
            JSON.stringify(row.variations || [])
        )));
        insertItems(defaultCatalog.menuItems);

        const insertTable = sqliteDb.prepare("INSERT INTO tables (name) VALUES (?)");
        const insertTables = sqliteDb.transaction((rows) => rows.forEach((row) => insertTable.run(row)));
        insertTables(["R1", "R2", "R3", "L1", "L2", "L3", "L4", "F1", "F2", "F3", "F4", "F5", "F6"]);
    }
    
    return sqliteDb;
};

const listDbTables = (app) => {
    const db = initializeDatabase(app);
    return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
};

const getCatalogFromDb = (app) => {
    const db = initializeDatabase(app);
    const categories = db.prepare("SELECT name FROM categories ORDER BY name").all().map((row) => row.name);
    const menuItems = db.prepare("SELECT * FROM items ORDER BY id").all().map((item) => ({
        ...item,
        id: Number(item.id),
        price: Number(item.price || 0),
        favorite: Boolean(item.favorite),
        variations: (() => {
            try {
                return JSON.parse(item.variations || "[]");
            } catch {
                return [];
            }
        })(),
    }));

    return { categories: categories.length ? categories : defaultCatalog.categories, menuItems: menuItems.length ? menuItems : defaultCatalog.menuItems };
};

const saveCatalogToDb = (app, catalog) => {
    const db = initializeDatabase(app);
    const safeCategories = Array.isArray(catalog?.categories) ? catalog.categories : [];
    const safeMenuItems = Array.isArray(catalog?.menuItems) ? catalog.menuItems : [];

    db.prepare("DELETE FROM categories").run();
    if (safeCategories.length) {
        const insertCategory = db.prepare("INSERT INTO categories (name) VALUES (?)");
        const insertMany = db.transaction((rows) => rows.forEach((row) => insertCategory.run(row)));
        insertMany(safeCategories);
    }

    db.prepare("DELETE FROM items").run();
    if (safeMenuItems.length) {
        const insertItem = db.prepare("INSERT INTO items (code, name, category, price, diet, favorite, variations) VALUES (?, ?, ?, ?, ?, ?, ?)");
        const insertMany = db.transaction((rows) => rows.forEach((row) => insertItem.run(
            row.code ?? "",
            row.name ?? "",
            row.category ?? "",
            Number(row.price || 0),
            row.diet ?? "veg",
            row.favorite ? 1 : 0,
            JSON.stringify(row.variations || [])
        )));
        insertMany(safeMenuItems);
    }

    return getCatalogFromDb(app);
};

const getTableNamesFromDb = (app) => {
    const db = initializeDatabase(app);
    return db.prepare("SELECT name FROM tables ORDER BY name").all().map((row) => row.name);
};

const saveTablesToDb = (app, tables) => {
    const db = initializeDatabase(app);
    const nextTables = Array.isArray(tables) ? tables : [];
    db.prepare("DELETE FROM tables").run();
    if (nextTables.length) {
        const insertTable = db.prepare("INSERT INTO tables (name) VALUES (?)");
        const insertMany = db.transaction((rows) => rows.forEach((row) => insertTable.run(row)));
        insertMany(nextTables);
    }
    return nextTables;
};

const getOrdersFromDb = (app) => {
    const db = initializeDatabase(app);
    const rows = db.prepare("SELECT id, payload FROM orders ORDER BY id DESC").all();
    return rows
        .map((row) => {
            if (!row.payload) return null;
            try {
                const payload = JSON.parse(row.payload);
                return payload && typeof payload === "object" ? payload : null;
            } catch {
                return null;
            }
        })
        .filter(Boolean);
};

const normalizeCustomerPhone = (phone) => String(phone || "").replace(/\D/g, "");
const customerIdForOrder = (order) => {
    const phoneKey = normalizeCustomerPhone(order?.orderDetails?.phone);
    return phoneKey ? `phone:${phoneKey}` : (typeof order?.customerId === "string" ? order.customerId : "");
};

const upsertCustomerFromOrder = (db, order) => {
    const phoneKey = normalizeCustomerPhone(order?.orderDetails?.phone);
    if (!phoneKey) return null;

    const orderDate = new Date(order?.createdAt || Date.now());
    const updatedAt = Number.isNaN(orderDate.getTime()) ? new Date().toISOString() : orderDate.toISOString();
    const id = `phone:${phoneKey}`;
    db.prepare(`
        INSERT INTO customers (id, phone_key, name, phone, address, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '', ?, ?)
        ON CONFLICT(phone_key) DO UPDATE SET
            name = CASE WHEN excluded.name <> '' AND excluded.updated_at >= customers.updated_at THEN excluded.name ELSE customers.name END,
            phone = excluded.phone,
            address = CASE WHEN excluded.address <> '' AND excluded.updated_at >= customers.updated_at THEN excluded.address ELSE customers.address END,
            updated_at = MAX(customers.updated_at, excluded.updated_at)
    `).run(
        id,
        phoneKey,
        String(order?.orderDetails?.customerName || "").trim(),
        String(order?.orderDetails?.phone || "").trim(),
        String(order?.orderDetails?.address || "").trim(),
        updatedAt,
        updatedAt,
    );
    return id;
};

const getCustomersFromDb = (app, { includeFinancial = false } = {}) => {
    const db = initializeDatabase(app);
    const orders = getOrdersFromDb(app);
    for (const order of orders) upsertCustomerFromOrder(db, order);

    const profiles = db.prepare("SELECT * FROM customers ORDER BY updated_at DESC, name COLLATE NOCASE").all();
    const ordersByCustomer = new Map();
    for (const order of orders) {
        const customerId = customerIdForOrder(order);
        if (!customerId) continue;
        const customerOrders = ordersByCustomer.get(customerId) || [];
        customerOrders.push(order);
        ordersByCustomer.set(customerId, customerOrders);
    }

    return profiles.map((profile) => {
        const history = (ordersByCustomer.get(profile.id) || [])
            .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
        const completedOrders = history.filter((order) => order.status === "completed");
        const orderHistory = history.map((order) => ({
            id: order.id,
            orderNumber: order.orderNumber || "",
            createdAt: order.createdAt || "",
            orderType: order.orderType || "",
            status: order.status || "",
            cart: (order.cart || []).map((item) => ({
                name: item.name || "",
                quantity: Number(item.quantity || 1),
                ...(includeFinancial ? { price: Number(item.price || 0) } : {}),
            })),
            ...(includeFinancial ? { total: Number(order.total || 0) } : {}),
        }));
        return {
            id: profile.id,
            name: profile.name,
            phone: profile.phone,
            address: profile.address,
            notes: profile.notes,
            createdAt: profile.created_at,
            updatedAt: profile.updated_at,
            totalOrders: completedOrders.length,
            ...(includeFinancial ? { lifetimeSpend: completedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0) } : {}),
            lastOrderAt: history[0]?.createdAt || "",
            orders: orderHistory,
        };
    });
};

const getCustomerByPhoneFromDb = (app, phone) => {
    const phoneKey = normalizeCustomerPhone(phone);
    if (!/^\d{10}$/.test(phoneKey)) throw new Error("Enter a valid 10-digit phone number.");
    const db = initializeDatabase(app);
    for (const order of getOrdersFromDb(app)) upsertCustomerFromOrder(db, order);
    const profile = db.prepare("SELECT id, name, phone, address FROM customers WHERE phone_key = ?").get(phoneKey);
    return profile || null;
};

const updateCustomerNotesInDb = (app, customerId, notes) => {
    const db = initializeDatabase(app);
    const result = db.prepare("UPDATE customers SET notes = ?, updated_at = ? WHERE id = ?")
        .run(notes, new Date().toISOString(), customerId);
    if (!result.changes) throw new Error("Customer record was not found.");
    return { ok: true };
};

const saveOrdersToDb = (app, orders) => {
    const db = initializeDatabase(app);
    const nextOrders = Array.isArray(orders) ? orders : [];
    for (const order of nextOrders) upsertCustomerFromOrder(db, order);
    db.prepare("DELETE FROM orders").run();
    if (nextOrders.length) {
        const insertOrder = db.prepare("INSERT INTO orders (payload) VALUES (?)");
        const insertMany = db.transaction((rows) => rows.forEach((row) => insertOrder.run(JSON.stringify(row))));
        insertMany(nextOrders);
    }
    return nextOrders;
};

const prepareCleanWindowsData = (app) => {
    if (process.platform !== "win32") return false;
    const dataDirectory = getDataDirectory(app);
    const markerPath = path.join(dataDirectory, ".clean-sales-initialized");
    if (fs.existsSync(markerPath)) return false;
    initializeDatabase(app).prepare("DELETE FROM orders").run();
    fs.writeFileSync(markerPath, new Date().toISOString());
    return true;
};

const getDbTableData = (app, tableName) => {
    const safeTable = normalizeIdentifier(tableName);
    if (!safeTable) throw new Error("Invalid table name");
    const db = initializeDatabase(app);
    const columns = db.prepare(`PRAGMA table_info("${safeTable}")`).all();
    const rows = db.prepare(`SELECT * FROM "${safeTable}" ORDER BY 1`).all();
    return {
        columns: columns.map((column) => ({ name: column.name, type: column.type, notnull: !!column.notnull, pk: !!column.pk })),
        rows,
    };
};

const insertDbRow = (app, { tableName, row = {} }) => {
    const safeTable = normalizeIdentifier(tableName);
    if (!safeTable) throw new Error("Invalid table name");
    const columns = Object.keys(row || {}).filter((column) => normalizeIdentifier(column));
    if (!columns.length) throw new Error("No columns provided");
    const db = initializeDatabase(app);
    const placeholders = columns.map(() => "?").join(", ");
    const sql = `INSERT INTO "${safeTable}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders})`;
    const info = db.prepare(sql).run(...columns.map((column) => row[column]));
    return { ok: true, lastInsertId: info.lastInsertRowid };
};

const updateDbRow = (app, { tableName, idColumn, idValue, row = {} }) => {
    const safeTable = normalizeIdentifier(tableName);
    const safeIdColumn = normalizeIdentifier(idColumn);
    if (!safeTable || !safeIdColumn) throw new Error("Invalid table or id column");
    const columns = Object.keys(row || {}).filter((column) => normalizeIdentifier(column));
    if (!columns.length) throw new Error("No columns provided");
    const db = initializeDatabase(app);
    const assignments = columns.map((column) => `"${column}" = ?`).join(", ");
    const sql = `UPDATE "${safeTable}" SET ${assignments} WHERE "${safeIdColumn}" = ?`;
    const info = db.prepare(sql).run(...columns.map((column) => row[column]), idValue);
    return { ok: true, changes: info.changes };
};

const deleteDbRow = (app, { tableName, idColumn, idValue }) => {
    const safeTable = normalizeIdentifier(tableName);
    const safeIdColumn = normalizeIdentifier(idColumn);
    if (!safeTable || !safeIdColumn) throw new Error("Invalid table or id column");
    const db = initializeDatabase(app);
    const info = db.prepare(`DELETE FROM "${safeTable}" WHERE "${safeIdColumn}" = ?`).run(idValue);
    return { ok: true, changes: info.changes };
};

module.exports = {
    dbPath,
    defaultCatalog,
    initializeDatabase,
    listDbTables,
    getCatalogFromDb,
    saveCatalogToDb,
    getTableNamesFromDb,
    saveTablesToDb,
    getOrdersFromDb,
    saveOrdersToDb,
    getCustomersFromDb,
    getCustomerByPhoneFromDb,
    updateCustomerNotesInDb,
    prepareCleanWindowsData,
    getDbTableData,
    insertDbRow,
    updateDbRow,
    deleteDbRow,
};
