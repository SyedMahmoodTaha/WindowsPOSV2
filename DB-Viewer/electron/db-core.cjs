const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const os = require("os");

const getDataDirectory = () => process.platform === "win32"
    ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Lassi Shop POS Windows")
    : path.join(os.homedir(), "Library", "Application Support", "Lassi Shop POS");
const dbPath = () => path.join(getDataDirectory(), "pfl.sqlite");
let sqliteDb = null;

const normalizeIdentifier = (value) => {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    return /^[A-Za-z0-9_]+$/.test(trimmed) ? trimmed : "";
};

const initializeDatabase = () => {
    if (sqliteDb) return sqliteDb;
    const dbFile = dbPath();
    
    // Ensure the directory exists
    const dbDir = path.dirname(dbFile);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    
    sqliteDb = new Database(dbFile, { fileMustExist: false });
    sqliteDb.pragma("journal_mode = WAL");
    
    return sqliteDb;
};

const listDbTables = () => {
    const db = initializeDatabase();
    return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
};

const getDbTableData = (tableName) => {
    const safeTable = normalizeIdentifier(tableName);
    if (!safeTable) throw new Error("Invalid table name");
    const db = initializeDatabase();
    const columns = db.prepare(`PRAGMA table_info("${safeTable}")`).all();
    const rows = db.prepare(`SELECT * FROM "${safeTable}" ORDER BY 1`).all();
    return {
        columns: columns.map((column) => ({ name: column.name, type: column.type, notnull: !!column.notnull, pk: !!column.pk })),
        rows,
    };
};

const parseOrderPayload = (payload) => {
    if (!payload) return null;
    try {
        const order = JSON.parse(payload);
        return order && typeof order === "object" ? order : null;
    } catch {
        return null;
    }
};

const getSalesOverview = () => {
    const db = initializeDatabase();
    const orders = db.prepare("SELECT payload FROM orders ORDER BY id DESC").all()
        .map((row) => parseOrderPayload(row.payload))
        .filter(Boolean);

    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const totalOrders = orders.length;
    const itemsSold = orders.reduce((sum, order) => {
        const cart = Array.isArray(order.cart) ? order.cart : [];
        return sum + cart.reduce((count, item) => count + Number(item.quantity || 0), 0);
    }, 0);
    const averageOrderValue = totalOrders ? totalRevenue / totalOrders : 0;

    const todayKey = new Date().toISOString().slice(0, 10);
    const todayRevenue = orders.reduce((sum, order) => {
        const orderDate = order.createdAt ? new Date(order.createdAt).toISOString().slice(0, 10) : null;
        return orderDate === todayKey ? sum + Number(order.total || 0) : sum;
    }, 0);

    const salesByType = Object.entries(orders.reduce((accumulator, order) => {
        const type = order.orderType || "Unassigned";
        accumulator[type] = (accumulator[type] || 0) + Number(order.total || 0);
        return accumulator;
    }, {})).sort((a, b) => b[1] - a[1]);

    return {
        totalRevenue,
        totalOrders,
        averageOrderValue,
        itemsSold,
        todayRevenue,
        salesByType,
    };
};

const getSalesReportData = () => {
    const db = initializeDatabase();
    const rows = db.prepare("SELECT id, payload FROM orders ORDER BY id DESC").all();
    const orders = rows
        .map((row) => {
            const order = parseOrderPayload(row.payload);
            if (!order) return null;
            return { ...order, id: row.id };
        })
        .filter(Boolean);

    const dailyMap = new Map();
    orders.forEach((order) => {
        const dateKey = order.createdAt ? new Date(order.createdAt).toISOString().slice(0, 10) : "unknown";
        const entry = dailyMap.get(dateKey) || { date: dateKey, orders: 0, revenue: 0, items: 0 };
        entry.orders += 1;
        entry.revenue += Number(order.total || 0);
        entry.items += Array.isArray(order.cart)
            ? order.cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
            : 0;
        dailyMap.set(dateKey, entry);
    });

    const dailySales = [...dailyMap.values()].sort((a, b) => b.date.localeCompare(a.date));
    const recentOrders = orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber || "-",
        createdAt: order.createdAt || null,
        orderType: order.orderType || "Unassigned",
        table: order.orderDetails?.tableNumber || "-",
        status: order.status || "saved",
        total: Number(order.total || 0),
    })).slice(0, 20);

    return { dailySales, recentOrders };
};

const getOrderRecord = (orderId) => {
    const db = initializeDatabase();
    const numericId = Number(orderId);
    const row = Number.isFinite(numericId)
        ? db.prepare("SELECT id, payload FROM orders WHERE id = ?").get(numericId)
        : null;

    const candidate = row ?? db.prepare("SELECT id, payload FROM orders ORDER BY id DESC").all().find((entry) => {
        const parsed = parseOrderPayload(entry.payload);
        return parsed && String(parsed.id ?? "") === String(orderId);
    });

    if (!candidate?.payload) return null;
    const order = parseOrderPayload(candidate.payload);
    if (!order) return null;
    return { ...order, id: candidate.id };
};

const updateOrderRecord = ({ orderId, changes = {} }) => {
    const existingOrder = getOrderRecord(orderId);
    if (!existingOrder) throw new Error("Order not found");

    const nextOrder = {
        ...existingOrder,
        ...changes,
        id: existingOrder.id,
        orderDetails: {
            ...(existingOrder.orderDetails || {}),
            ...(changes.orderDetails || {}),
        },
    };

    if (changes.table !== undefined && changes.table !== null) {
        nextOrder.orderDetails = { ...nextOrder.orderDetails, tableNumber: changes.table };
    }
    if (changes.total !== undefined) {
        nextOrder.total = Number(changes.total || 0);
    }

    const db = initializeDatabase();
    db.prepare("UPDATE orders SET payload = ? WHERE id = ?").run(JSON.stringify(nextOrder), existingOrder.id);
    return nextOrder;
};

const deleteOrderRecord = (orderId) => {
    const db = initializeDatabase();
    const info = db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
    return { ok: true, changes: info.changes };
};

const insertDbRow = ({ tableName, row = {} }) => {
    const safeTable = normalizeIdentifier(tableName);
    if (!safeTable) throw new Error("Invalid table name");
    const columns = Object.keys(row || {}).filter((column) => normalizeIdentifier(column));
    if (!columns.length) throw new Error("No columns provided");
    const db = initializeDatabase();
    const placeholders = columns.map(() => "?").join(", ");
    const sql = `INSERT INTO "${safeTable}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders})`;
    const info = db.prepare(sql).run(...columns.map((column) => row[column]));
    return { ok: true, lastInsertId: info.lastInsertRowid };
};

const updateDbRow = ({ tableName, idColumn, idValue, row = {} }) => {
    const safeTable = normalizeIdentifier(tableName);
    const safeIdColumn = normalizeIdentifier(idColumn);
    if (!safeTable || !safeIdColumn) throw new Error("Invalid table or id column");
    const columns = Object.keys(row || {}).filter((column) => normalizeIdentifier(column));
    if (!columns.length) throw new Error("No columns provided");
    const db = initializeDatabase();
    const assignments = columns.map((column) => `"${column}" = ?`).join(", ");
    const sql = `UPDATE "${safeTable}" SET ${assignments} WHERE "${safeIdColumn}" = ?`;
    const info = db.prepare(sql).run(...columns.map((column) => row[column]), idValue);
    return { ok: true, changes: info.changes };
};

const deleteDbRow = ({ tableName, idColumn, idValue }) => {
    const safeTable = normalizeIdentifier(tableName);
    const safeIdColumn = normalizeIdentifier(idColumn);
    if (!safeTable || !safeIdColumn) throw new Error("Invalid table or id column");
    const db = initializeDatabase();
    const info = db.prepare(`DELETE FROM "${safeTable}" WHERE "${safeIdColumn}" = ?`).run(idValue);
    return { ok: true, changes: info.changes };
};

module.exports = {
    dbPath,
    initializeDatabase,
    listDbTables,
    getDbTableData,
    getSalesOverview,
    getSalesReportData,
    getOrderRecord,
    updateOrderRecord,
    deleteOrderRecord,
    insertDbRow,
    updateDbRow,
    deleteDbRow,
};
