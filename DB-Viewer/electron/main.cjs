const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const XLSX = require("xlsx");
const { authenticateAdmin, readUsers } = require("./auth.cjs");
const authenticatedUsers = new Map();

const requireAdmin = (event) => {
    if (authenticatedUsers.get(event.sender.id)?.role !== "Admin") {
        throw new Error("Admin sign-in is required for this operation.");
    }
};

const {
    initializeDatabase,
    getSalesOverview,
    getSalesReportData,
    updateOrderRecord,
    deleteOrderRecord,
} = require("./db-core.cjs");

const createWindow = () => {
    const window = new BrowserWindow({
        width: 1400,
        height: 900,
        show: false,
        backgroundColor: "#1f1f1f",
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    window.once("ready-to-show", () => window.show());
    window.loadFile(path.join(__dirname, "../dist/index.html"));
    return window;
};

app.whenReady().then(() => {
    const envPath = app.isPackaged
        ? path.join(process.resourcesPath, ".env")
        : path.join(__dirname, "../.env");
    const appDataPath = process.platform === "win32"
        ? path.join(app.getPath("appData"), "Lassi Shop POS Windows")
        : path.join(app.getPath("appData"), "Lassi Shop POS");
    fs.mkdirSync(appDataPath, { recursive: true });
    app.setPath("userData", appDataPath);

    ipcMain.handle("pfl:authenticate", (event, credentials = {}) => {
        const account = authenticateAdmin(readUsers({
            envPath,
            usersPath: path.join(app.getPath("userData"), "users.json"),
        }), credentials);
        if (!account) {
            authenticatedUsers.delete(event.sender.id);
            return null;
        }
        authenticatedUsers.set(event.sender.id, { username: account.username, role: account.role });
        event.sender.once("destroyed", () => authenticatedUsers.delete(event.sender.id));
        initializeDatabase();
        return account;
    });
    ipcMain.handle("pfl:sign-out", (event) => authenticatedUsers.delete(event.sender.id));
    ipcMain.handle("pfl:get-sales-overview", (event) => {
        requireAdmin(event);
        return getSalesOverview();
    });
    ipcMain.handle("pfl:get-sales-report", (event) => {
        requireAdmin(event);
        return getSalesReportData();
    });
    ipcMain.handle("pfl:export-sales-report", async (event, payload = {}) => {
        requireAdmin(event);
        try {
            const workbook = XLSX.utils.book_new();
            const overview = payload.overview || {};
            const dailySales = Array.isArray(payload.dailySales) ? payload.dailySales : [];
            const recentOrders = Array.isArray(payload.recentOrders) ? payload.recentOrders : [];

            const overviewSheet = XLSX.utils.json_to_sheet([
                { Metric: "Total Revenue", Value: Number(overview.totalRevenue || 0) },
                { Metric: "Total Orders", Value: Number(overview.totalOrders || 0) },
                { Metric: "Average Order Value", Value: Number(overview.averageOrderValue || 0) },
                { Metric: "Items Sold", Value: Number(overview.itemsSold || 0) },
                { Metric: "Today Revenue", Value: Number(overview.todayRevenue || 0) },
            ]);
            XLSX.utils.book_append_sheet(workbook, overviewSheet, "Overview");

            const dailySheet = XLSX.utils.json_to_sheet(dailySales.map((day) => ({
                Date: day.date,
                Orders: Number(day.orders || 0),
                Items: Number(day.items || 0),
                Revenue: Number(day.revenue || 0),
            })));
            XLSX.utils.book_append_sheet(workbook, dailySheet, "Daily Sales");

            const recentSheet = XLSX.utils.json_to_sheet(recentOrders.map((order) => ({
                OrderId: order.id ?? "",
                OrderNumber: order.orderNumber ?? "",
                Date: order.createdAt ? new Date(order.createdAt).toISOString() : "",
                Type: order.orderType ?? "",
                Table: order.table ?? "",
                Status: order.status ?? "",
                Total: Number(order.total || 0),
            })));
            XLSX.utils.book_append_sheet(workbook, recentSheet, "Recent Orders");

            const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
            const { canceled, filePath } = await dialog.showSaveDialog({
                title: "Export sales report",
                defaultPath: path.join(app.getPath("downloads"), "pfl-sales-report.xlsx"),
                filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
            });

            if (canceled || !filePath) {
                return { ok: false, canceled: true };
            }

            fs.writeFileSync(filePath, buffer);
            return { ok: true, filePath };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    });
    ipcMain.handle("pfl:update-order-record", (event, payload) => {
        requireAdmin(event);
        try {
            return { ok: true, order: updateOrderRecord(payload || {}) };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    });
    ipcMain.handle("pfl:delete-order-record", (event, payload) => {
        requireAdmin(event);
        try {
            const orderId = Number(payload?.orderId ?? payload);
            return deleteOrderRecord(orderId);
        } catch (error) {
            return { ok: false, error: error.message };
        }
    });

    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
