const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const WebSocket = require("ws");
const XLSX = require("xlsx");
const {
    initializeDatabase,
    defaultCatalog,
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
} = require("./db-core.cjs");

const envPath = app.isPackaged ? path.join(process.resourcesPath, ".env") : path.join(__dirname, "../.env");
try {
    fs.readFileSync(envPath, "utf8").split(/\r?\n/).forEach((line) => {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
    });
} catch {
}

const configuredAccounts = [
    { name: process.env.VITE_CASHIER_NAME, username: process.env.VITE_CASHIER_USERNAME, password: process.env.VITE_CASHIER_PASSWORD, role: "Cashier" },
    { name: process.env.VITE_ADMIN_NAME, username: process.env.VITE_ADMIN_USERNAME, password: process.env.VITE_ADMIN_PASSWORD, role: "Admin" },
];
const authenticatedUsers = new Map();

const sharedUserDataDir = path.join(app.getPath("appData"), "Lassi Shop POS Windows");
fs.mkdirSync(sharedUserDataDir, { recursive: true });
if (app.getPath("userData") !== sharedUserDataDir) app.setPath("userData", sharedUserDataDir);

const settingsPath = () => path.join(app.getPath("userData"), "printer-settings.json");
const syncSettingsPath = () => path.join(app.getPath("userData"), "sync-settings.json");
const usersPath = () => path.join(app.getPath("userData"), "users.json");
const readSyncSettings = () => {
    try {
        const saved = JSON.parse(fs.readFileSync(syncSettingsPath(), "utf8"));
        return {
            mode: saved?.mode === "client" ? "client" : "host",
            enabled: Boolean(saved?.enabled),
            host: String(saved?.host || "").trim(),
            port: Number(saved?.port || 4099),
        };
    } catch {
        return { mode: "host", enabled: false, host: "", port: 4099 };
    }
};
const writeSyncSettings = (settings = {}) => {
    const next = {
        mode: settings?.mode === "client" ? "client" : "host",
        enabled: Boolean(settings?.enabled),
        host: String(settings?.host || "").trim(),
        port: Number(settings?.port || 4099),
    };
    fs.writeFileSync(syncSettingsPath(), JSON.stringify(next, null, 2));
    return next;
};
const readUsers = () => {
    try {
        const storedUsers = JSON.parse(fs.readFileSync(usersPath(), "utf8"));
        if (!Array.isArray(storedUsers)) throw new Error("users.json must contain an array");
        const configuredUsers = configuredAccounts.map((user) => {
            const override = storedUsers.find((stored) => stored.originalUsername === user.username || stored.username === user.username);
            return { ...user, ...override, originalUsername: override?.originalUsername || user.username };
        });
        return configuredUsers.concat(storedUsers.filter((stored) => !configuredAccounts.some((configured) => stored.originalUsername === configured.username || stored.username === configured.username)));
    } catch (error) {
        if (error.code !== "ENOENT") console.error("Could not read users.json:", error.message);
        return configuredAccounts;
    }
};
const writeUsers = (users) => {
    if (!Array.isArray(users)) throw new Error("Users must be an array");
    const targetPath = usersPath();
    const temporaryPath = `${targetPath}.tmp`;
    try {
        fs.writeFileSync(temporaryPath, JSON.stringify(users, null, 2), "utf8");
        fs.renameSync(temporaryPath, targetPath);
        return users;
    } catch (error) {
        try { fs.rmSync(temporaryPath, { force: true }); } catch {}
        throw error;
    }
};
const requireAuthenticatedUser = (event, roles) => {
    const user = authenticatedUsers.get(event.sender.id);
    if (!user) throw new Error("Sign in is required for this operation.");
    if (roles && !roles.includes(user.role)) throw new Error("Your account is not permitted to perform this operation.");
    return user;
};
const canManageUserTarget = (currentUser, target) => {
    if (currentUser.role === "Admin") return true;
    if (currentUser.role === "Manager") {
        return target.username === currentUser.username || ["Assistant Manager", "Cashier"].includes(target.role);
    }
    return currentUser.role === "Assistant Manager" && target.username === currentUser.username;
};
const publicUser = (user) => ({
    name: user.name,
    username: user.username,
    role: user.role,
    originalUsername: user.originalUsername || user.username,
});
const setManagedUsers = (event, users) => {
    const currentUser = requireAuthenticatedUser(event, ["Admin", "Manager", "Assistant Manager"]);
    if (!Array.isArray(users)) throw new Error("Users must be a list.");
    const existingUsers = readUsers();

    if (currentUser.role === "Admin") {
        const updatedUsers = users.map((user) => {
            const originalUsername = String(user.originalUsername || user.username || "").trim();
            const existing = existingUsers.find((candidate) => candidate.originalUsername === originalUsername || candidate.username === originalUsername);
            const password = typeof user.password === "string" && user.password.length ? user.password : existing?.password;
            if (!user.username || !user.name || !password) throw new Error(`Name, username, and password are required for ${user.username || "each account"}.`);
            return { ...user, password, originalUsername };
        });
        if (new Set(updatedUsers.map((user) => user.username)).size !== updatedUsers.length) {
            throw new Error("Usernames must be unique.");
        }
        writeUsers(updatedUsers);
        const updatedCurrentUser = updatedUsers.find((user) => user.originalUsername === currentUser.username || user.username === currentUser.username);
        if (updatedCurrentUser) authenticatedUsers.set(event.sender.id, { username: updatedCurrentUser.username, role: updatedCurrentUser.role });
        return updatedUsers.map(publicUser);
    }

    const manageableUsers = existingUsers.filter((target) => canManageUserTarget(currentUser, target));
    if (users.length !== manageableUsers.length) throw new Error("You cannot add or remove user accounts.");
    const submittedUsers = new Map(users.map((user) => [user.originalUsername || user.username, user]));
    if (submittedUsers.size !== manageableUsers.length) throw new Error("The user list contains duplicate accounts.");

    let passwordChanged = false;
    const updatedUsers = existingUsers.map((target) => {
        const targetKey = target.originalUsername || target.username;
        const submitted = submittedUsers.get(targetKey);
        if (!submitted) return target;
        if (submitted.name !== target.name || submitted.username !== target.username || submitted.role !== target.role) {
            throw new Error("You can only change passwords for permitted accounts.");
        }
        if (submitted.password !== undefined) {
            if (typeof submitted.password !== "string" || !submitted.password.length) throw new Error("Enter a new password.");
            passwordChanged = true;
            return { ...target, password: submitted.password };
        }
        return target;
    });
    if (!passwordChanged) throw new Error("Enter a new password.");
    writeUsers(updatedUsers);
    return manageableUsers.map((target) => {
        const updated = updatedUsers.find((candidate) => (candidate.originalUsername || candidate.username) === (target.originalUsername || target.username));
        return publicUser(updated);
    });
};
const saveCatalogWithRole = (event, catalog) => {
    const user = requireAuthenticatedUser(event, ["Admin", "Manager"]);
    if (user.role === "Manager") {
        const currentCatalog = getCatalogFromDb(app);
        const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
        if (!Array.isArray(catalog?.menuItems)) throw new Error("Menu items must be a list.");
        if (new Set(categories).size !== categories.length || categories.some((category) => typeof category !== "string" || !category.trim())) {
            throw new Error("Categories must be unique, non-empty names.");
        }
        if (currentCatalog.categories.some((category) => !categories.includes(category))) {
            throw new Error("Managers can add categories but cannot remove existing categories.");
        }
    }
    return saveCatalogToDb(app, catalog);
};
const normalizePrinterSetting = (value) => {
    if (typeof value === "object" && value && value.host) {
        return {
            type: value.type === "ip" ? "ip" : "ip",
            host: String(value.host || "").trim(),
            port: Number(value.port || 9100),
        };
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return "";
        if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(trimmed)) {
            return { type: "ip", host: trimmed, port: 9100 };
        }
        return trimmed;
    }
    return "";
};

const defaultReceiptOptions = {
    logo: true,
    businessName: true,
    items: true,
    dateTime: true,
    billNumber: true,
    billType: true,
    cashierName: true,
    customerName: true,
    phone: true,
    address: true,
    deliveryCharges: true,
    parcelCharges: true,
    subtotal: true,
    itemPrice: true,
    total: true,
    discount: true,
    note: true,
    tableNumber: true,
    footer: true,
};

const defaultBillTemplates = [
    { id: "classic", name: "Classic 80mm", layout: "classic", paperWidth: 80, alignment: "center", businessName: "Lassi Shop", footerText: "Thank you for visiting us", headerText: "", fields: defaultReceiptOptions },
    { id: "kitchen-compact", kotTemplateVersion: 2, name: "Kitchen KOT 58mm", layout: "kot", paperWidth: 58, alignment: "center", dividerStyle: "dotted", fontFamily: "verdana", fontSize: 14, titleSize: 16, businessNameSize: 14, horizontalPaddingMm: 3, kotBottomFeedLines: 0, businessName: "Lassi Shop", footerText: "", headerText: "", fields: { ...defaultReceiptOptions, logo: false, customerName: true, phone: false, address: false, deliveryCharges: false, parcelCharges: false, subtotal: false, itemPrice: false, total: false, discount: false, footer: false, dateTime: true, billNumber: true, billType: true, cashierName: false, tableNumber: true, businessName: true }, fieldOrder: ["dateTime", "billNumber", "billType", "divider:kot-customer", "customerName", "tableNumber", "businessName", "divider:kot-items", "items", "divider:kot-notes", "note"], dividers: [{ id: "kot-customer", label: "" }, { id: "kot-items", label: "" }, { id: "kot-notes", label: "" }], fieldLabels: { dateTime: "", billNumber: "KOT -", billType: "", customerName: "Name", businessName: "Biller", tableNumber: "Table No", item: "Item", quantity: "Qty.", note: "Customer Notes" } },
    { id: "minimal", name: "Minimal receipt", layout: "minimal", paperWidth: 80, alignment: "center", businessName: "Lassi Shop", footerText: "Thank you for visiting us", headerText: "", fields: { ...defaultReceiptOptions, logo: false, address: false, note: false, footer: false } },
    { id: "customer", name: "Customer details", layout: "customer", paperWidth: 80, alignment: "center", businessName: "Lassi Shop", footerText: "Thank you for visiting us", headerText: "Freshly prepared for you", fields: defaultReceiptOptions },
];

const normalizeReceiptOptions = (value = {}) => ({
    ...defaultReceiptOptions,
    ...(value && typeof value === "object" ? value : {}),
});

const normalizeBillTemplates = (value) => {
    if (!Array.isArray(value) || value.length === 0) return defaultBillTemplates;
    const templates = value.map((template) => {
        const saved = template && typeof template === "object" ? template : {};
        const defaultKot = defaultBillTemplates.find((entry) => entry.id === "kitchen-compact");
        if (saved.id === "kitchen-compact" && !(Number(saved.kotTemplateVersion) >= 2)) {
            const previousDefaultOrder = ["dateTime", "billNumber", "billType", "customerName", "tableNumber", "divider:kot-biller", "businessName", "divider:kot-items", "items", "divider:kot-notes", "note"];
            const usesPreviousDefaultOrder = !Array.isArray(saved.fieldOrder)
                || JSON.stringify(saved.fieldOrder) === JSON.stringify(previousDefaultOrder);
            return {
                ...saved,
                ...defaultKot,
                ...saved,
                name: saved.name || defaultKot.name,
                businessName: saved.businessName || defaultKot.businessName,
                fields: { ...defaultKot.fields, ...saved.fields },
                fieldLabels: { ...defaultKot.fieldLabels, ...saved.fieldLabels },
                fieldOrder: usesPreviousDefaultOrder ? defaultKot.fieldOrder : saved.fieldOrder || defaultKot.fieldOrder,
                dividers: usesPreviousDefaultOrder ? defaultKot.dividers : saved.dividers || defaultKot.dividers,
                kotTemplateVersion: 2,
            };
        }
        return {
            ...defaultBillTemplates[0],
            ...saved,
            paperWidth: Number(saved.paperWidth) || 80,
            fields: normalizeReceiptOptions(saved.fields),
        };
    });
    if (!templates.some((template) => template.id === "kitchen-compact")) {
        templates.push(defaultBillTemplates.find((template) => template.id === "kitchen-compact"));
    }
    return templates;
};

const readPrinterSettings = () => {
    try {
        const saved = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
        return {
            kitchen: normalizePrinterSetting(saved?.kitchen),
            cashier: normalizePrinterSetting(saved?.cashier),
            receiptOptions: normalizeReceiptOptions(saved?.receiptOptions || saved?.options),
            billTemplates: normalizeBillTemplates(saved?.billTemplates),
            selectedBillTemplateId: saved?.selectedBillTemplateId || "classic",
            selectedBillTemplateIds: saved?.selectedBillTemplateIds || { kitchen: "kitchen-compact", cashier: "classic" },
            printCashierToKitchen: saved?.printCashierToKitchen === true,
        };
    } catch {
        return {
            kitchen: normalizePrinterSetting(process.env.PFL_KITCHEN_PRINTER || ""),
            cashier: normalizePrinterSetting(process.env.PFL_CASHIER_PRINTER || ""),
            receiptOptions: normalizeReceiptOptions(),
            billTemplates: defaultBillTemplates,
            selectedBillTemplateId: "classic",
            selectedBillTemplateIds: { kitchen: "kitchen-compact", cashier: "classic" },
            printCashierToKitchen: false,
        };
    }
};

const resolvePrinterSetting = async (event, destination) => {
    const configured = readPrinterSettings()[destination];
    if (configured && (typeof configured === "string" ? configured.trim() : configured.host)) {
        return configured;
    }
    if (!event?.sender?.getPrintersAsync) return configured;
    try {
        const printers = await event.sender.getPrintersAsync();
        if (!printers?.length) return configured;
        const fallbackPrinter = printers[0]?.name || printers[0]?.displayName || "";
        return fallbackPrinter || configured;
    } catch {
        return configured;
    }
};

const writePrinterSettings = (settings) => {
    const current = readPrinterSettings();
    const normalized = {
        kitchen: normalizePrinterSetting(settings?.kitchen),
        cashier: normalizePrinterSetting(settings?.cashier),
        receiptOptions: normalizeReceiptOptions(settings?.receiptOptions || settings?.options),
        billTemplates: normalizeBillTemplates(settings?.billTemplates || current.billTemplates),
        selectedBillTemplateId: settings?.selectedBillTemplateId || current.selectedBillTemplateId || "classic",
        selectedBillTemplateIds: settings?.selectedBillTemplateIds || current.selectedBillTemplateIds || { kitchen: "kitchen-compact", cashier: "classic" },
        printCashierToKitchen: settings?.printCashierToKitchen ?? current.printCashierToKitchen ?? false,
    };
    fs.writeFileSync(settingsPath(), JSON.stringify(normalized, null, 2));
    return normalized;
};

const createEscPosReceipt = (order, destination, template) => {
    const paperColumns = template?.paperWidth === 58 ? 32 : 42;
    const isKotTemplate = template?.layout === "kot";
    const thermalRightMargin = Math.min(5, Math.max(0, Number(template?.thermalRightMargin ?? 2)));
    const horizontalPaddingMm = Math.min(8, Math.max(0, Number(template?.horizontalPaddingMm ?? 3)));
    const horizontalPaddingColumns = isKotTemplate
        ? Math.min(4, Math.max(0, Math.round(horizontalPaddingMm * paperColumns / (template?.paperWidth === 58 ? 58 : 80))))
        : 0;
    const width = isKotTemplate ? paperColumns - horizontalPaddingColumns * 2 : paperColumns - thermalRightMargin;
    const add = (line = "") => output.push(line);
    const output = [];
    const fontSize = Math.min(24, Math.max(10, Number(template?.fontSize) || 14));
    const textMode = (size) => size >= 16 ? 0x18 : size >= 13 ? 0x08 : 0x00;
    const escText = (text, size = fontSize, shouldBold = true) => `\x1b\x21${String.fromCharCode(textMode(size) | (shouldBold ? 0x08 : 0x00))}${text}\x1b\x21\x00`;
    const bold = (text, size = fontSize) => escText(text, size, true);
    const alignment = template?.alignment || "center";
    const padding = isKotTemplate ? 0 : Math.min(4, Math.max(0, Math.floor(Number(template?.contentPadding || 0) / 3)));
    const wrapText = (value, maxWidth) => {
        const lines = [];
        for (const paragraph of String(value ?? "").split(/\r?\n/)) {
            let line = "";
            for (const word of paragraph.split(/\s+/).filter(Boolean)) {
                if (word.length > maxWidth) {
                    if (line) lines.push(line);
                    line = "";
                    for (let index = 0; index < word.length; index += maxWidth) {
                        const part = word.slice(index, index + maxWidth);
                        if (part.length === maxWidth) lines.push(part);
                        else line = part;
                    }
                } else if (!line) line = word;
                else if (line.length + word.length + 1 <= maxWidth) line += ` ${word}`;
                else {
                    lines.push(line);
                    line = word;
                }
            }
            if (line) lines.push(line);
        }
        return lines.length ? lines : [""];
    };
    const addWrappedText = (text, size = fontSize, shouldBold = true) => {
        if (!String(text ?? "")) return;
        wrapText(text, Math.max(1, width - padding * 2)).forEach((line) => add(escText(line, size, shouldBold)));
    };
    const leftRight = (left, right, options = {}) => {
        const rightLines = wrapText(right, Math.max(1, Math.min(10, width - padding - 1)));
        const leftWidth = Math.max(1, width - padding - rightLines[0].length - 1);
        const leftLines = wrapText(left, leftWidth);
        const lineCount = Math.max(leftLines.length, rightLines.length);
        return Array.from({ length: lineCount }, (_, index) => {
            const leftText = leftLines[index] || "";
            const rightText = rightLines[index] || "";
            const spaces = " ".repeat(Math.max(width - padding - leftText.length - rightText.length, 1));
            const formattedLeft = options.boldLeft ? bold(leftText, options.size || fontSize) : leftText;
            const formattedRight = options.boldRight ? bold(rightText, options.size || fontSize) : rightText;
            return `${" ".repeat(padding)}${formattedLeft}${spaces}${formattedRight}`;
        }).join("\n");
    };
    const dividerStyle = ["dotted", "dashed", "solid", "double", "none"].includes(template?.dividerStyle) ? template.dividerStyle : "dashed";
    const dividerCharacter = dividerStyle === "dotted" ? "." : dividerStyle === "double" ? "=" : "-";
    const dashLine = dividerStyle === "none" ? "" : dividerCharacter.repeat(width - padding);
    const labels = { billNumber: "Bill", billType: "Type", dateTime: "Date", tableNumber: "Table", customerName: "Customer", phone: "Phone", subtotal: "Subtotal", deliveryCharges: "Delivery", parcelCharges: "Parcel", discount: "Discount", total: "Total", item: "Item", quantity: "Qty", itemPrice: "Amount", note: "Note", ...(template?.fieldLabels || {}) };
    const title = isKotTemplate ? "" : (template?.titleText || template?.headerText || (destination === "kitchen" ? "KITCHEN KOT" : "CASHIER BILL"));

    output.push("\x1b\x40");
    const fields = template?.fields || defaultReceiptOptions;
    if (isKotTemplate) {
        const kotLine = (text, shouldBold = false) => {
            wrapText(text, width).forEach((value) => {
                const left = Math.max(0, Math.floor((width - value.length) / 2));
                add(`${" ".repeat(left)}${shouldBold ? bold(value, Number(template?.titleSize) || fontSize) : value}`);
            });
        };
        const kotDivider = dividerStyle === "none" ? "" : dividerCharacter.repeat(width);
        const date = new Date(order.createdAt);
        const kotDate = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getFullYear()).slice(-2)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
        const kotType = order.orderType === "Table" ? "Dine In" : order.orderType === "Parcel" || order.orderType === "Takeaway" ? "Parcel/Take Away" : order.orderType || "Walk-in";
        const itemWidth = Math.max(8, Math.floor(width * (Number(template?.itemNameWidth) || 54) / 100));
        output.push("\x1b\x61\x01");
        for (const field of template.fieldOrder || ["dateTime", "billNumber", "billType", "customerName", "tableNumber", "businessName", "items", "note"]) {
            if (field.startsWith("divider:")) {
                if (kotDivider) add(kotDivider);
                continue;
            }
            if (!fields[field]) continue;
            if (field === "dateTime") kotLine(kotDate);
            else if (field === "billNumber") kotLine(`${labels.billNumber} ${order.orderNumber || "-"}`, true);
            else if (field === "billType") kotLine(kotType, true);
            else if (field === "customerName" && (order.orderDetails?.customerName || order.customerName)) add(leftRight(`${labels.customerName} :`, order.orderDetails?.customerName || order.customerName));
            else if (field === "tableNumber" && (order.orderDetails?.tableNumber || order.tableNumber)) add(leftRight(`${labels.tableNumber} :`, order.orderDetails?.tableNumber || order.tableNumber));
            else if (field === "businessName") add(leftRight(`${labels.businessName}:`, template.businessName || "Lassi Shop"));
            else if (field === "items") {
                add(leftRight(labels.item, labels.quantity));
                order.cart.forEach((item) => {
                    const nameLines = wrapText(item.name || "", itemWidth);
                    nameLines.forEach((name, index) => add(leftRight(name, index === 0 ? String(item.quantity ?? 1) : "", {
                        boldLeft: true,
                        size: Number(template?.fontSize) || fontSize,
                    })));
                    if (item.note && fields.note) {
                        wrapText(`${labels.note}: ${item.note}`, Math.max(1, width - padding - 2))
                            .forEach((line) => add(`${" ".repeat(padding + 2)}${line}`));
                    }
                });
            } else if (field === "note" && order.orderNote) kotLine(`${labels.note}: ${order.orderNote}`, true);
        }
        const bottomFeedLines = Math.min(20, Math.max(0, Number(template?.kotBottomFeedLines ?? 0)));
        if (bottomFeedLines > 0) output.push(`\x1b\x64${String.fromCharCode(bottomFeedLines)}`);
        output.push("\x1d\x56\x00");
        return Buffer.from(output.join("\n"), "utf8");
    }

    output.push(alignment === "left" ? "\x1b\x61\x00" : alignment === "right" ? "\x1b\x61\x02" : "\x1b\x61\x01");
    if (fields.businessName !== false) addWrappedText(template?.businessName || "Lassi Shop", Number(template?.businessNameSize) || fontSize);
    addWrappedText(title, Number(template?.titleSize) || fontSize);
    output.push("\x1b\x61\x00");
    if (fields.billNumber) add(leftRight(labels.billNumber, order.orderNumber || "-"));
    if (fields.billType) add(leftRight(labels.billType, order.orderType || "Walk-in"));
    if (fields.dateTime) add(leftRight(labels.dateTime, new Date(order.createdAt).toLocaleString()));
    if (fields.customerName && (order.orderDetails?.customerName || order.customerName)) add(leftRight(labels.customerName, order.orderDetails?.customerName || order.customerName || "-"));
    if (fields.tableNumber && (order.orderDetails?.tableNumber || order.tableNumber)) add(leftRight(labels.tableNumber, order.orderDetails?.tableNumber || order.tableNumber));
    if (fields.phone && (order.orderDetails?.phone || order.phone)) add(leftRight(labels.phone, order.orderDetails?.phone || order.phone));
    if (fields.items !== false) {
        if (dashLine) add(dashLine);
        const hasAmounts = destination !== "kitchen" && fields.itemPrice !== false;
        add(leftRight(labels.item, hasAmounts ? labels.itemPrice : labels.quantity));
        const quantityWidth = Math.max(4, Math.floor(width * (Number(template?.quantityWidth) || 16) / 100));
        const itemWidth = Math.max(8, width - quantityWidth - padding - 1);
        const rowSpacing = Math.min(3, Math.max(0, Math.round(Number(template?.rowSpacing ?? 4) / 3)));
        order.cart.forEach((item) => {
            const quantity = String(item.quantity ?? 1);
            const amount = hasAmounts ? `₹${Math.round(item.price * item.quantity)}` : "";
            wrapText(item.name || "", itemWidth).forEach((name, index) => {
                add(leftRight(name, index === 0 ? (amount ? `${quantity} ${amount}` : quantity) : ""));
            });
            if (item.note && fields.note) {
                wrapText(`${labels.note}: ${item.note}`, Math.max(1, width - padding - 2))
                    .forEach((line) => add(`${" ".repeat(padding + 2)}${line}`));
            }
            for (let index = 0; index < rowSpacing; index += 1) add("");
        });
        if (dashLine) add(dashLine);
    }
    if (dashLine && fields.items === false) add(dashLine);
    if (fields.subtotal) add(leftRight(labels.subtotal, `₹${Math.round(order.subtotal || order.total || 0)}`));
    if (fields.deliveryCharges && Number(order.charges?.Delivery || order.deliveryCharge || 0) > 0) add(leftRight(labels.deliveryCharges, `₹${Math.round(Number(order.charges?.Delivery || order.deliveryCharge || 0))}`));
    if (fields.parcelCharges && Number(order.charges?.Parcel || order.parcelCharge || 0) > 0) add(leftRight(labels.parcelCharges, `₹${Math.round(Number(order.charges?.Parcel || order.parcelCharge || 0))}`));
    if (fields.discount && Number(order.discount || 0) > 0) add(leftRight(labels.discount, `-₹${Math.round(Number(order.discount || 0))}`));
    if (fields.total) add(leftRight(escText(labels.total, Number(template?.totalSize) || fontSize, template?.boldTotal !== false), escText(`₹${Math.round(order.total)}`, Number(template?.totalSize) || fontSize, template?.boldTotal !== false)));
    if (fields.note && order.orderNote) {
        wrapText(`${labels.note}: ${order.orderNote}`, Math.max(1, width - padding * 2))
            .forEach((line) => add(line));
    }
    if (fields.footer && template?.footerText) addWrappedText(template.footerText);
    output.push("\n\n\n");
    output.push("\x1d\x56\x00");
    return Buffer.from(output.join("\n"), "utf8");
};

const sendToNetworkPrinter = (printer, order, destination, template) => new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: printer.host, port: printer.port || 9100, timeout: 5000 });
    socket.on("connect", () => socket.end(createEscPosReceipt(order, destination, template), () => resolve({ printer: `${printer.host}:${printer.port || 9100}` })));
    socket.on("timeout", () => socket.destroy(new Error("Printer connection timed out")));
    socket.on("error", (error) => reject(new Error(`Could not connect to printer ${printer.host}:${printer.port || 9100}: ${error.message}`)));
});

const isIpAddress = (value) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);

let syncWebSocketServer = null;
let syncClients = new Set();

const startSyncServer = () => {
    const settings = readSyncSettings();
    if (!settings.enabled || settings.mode !== "host") return;
    if (syncWebSocketServer) return;

    const server = new WebSocket.WebSocketServer({ host: "0.0.0.0", port: Number(settings.port || 4099) });
    server.on("connection", (socket) => {
        syncClients.add(socket);
        socket.on("message", (raw) => {
            try {
                const payload = JSON.parse(raw.toString());
                if (payload?.type === "ping") {
                    socket.send(JSON.stringify({ type: "pong", from: "host", syncedAt: new Date().toISOString() }));
                    return;
                }

                if (payload?.type === "orders-sync" && Array.isArray(payload.orders)) {
                    const nextOrders = payload.orders;
                    saveOrdersToDb(app, nextOrders);
                    broadcastOrdersToClients(nextOrders);
                    return;
                }
            } catch (error) {
                console.error("Could not process synced orders:", error);
            }
        });
        socket.send(JSON.stringify({ type: "orders-sync", orders: getOrdersFromDb(app), syncedAt: new Date().toISOString() }));
        socket.on("close", () => syncClients.delete(socket));
    });
    server.on("error", (error) => {
        console.error("POS sync host failed:", error.message);
        if (syncWebSocketServer === server) {
            syncWebSocketServer = null;
            syncClients.clear();
        }
    });
    syncWebSocketServer = server;
};

const stopSyncServer = () => {
    if (!syncWebSocketServer) return;
    const server = syncWebSocketServer;
    syncWebSocketServer = null;
    for (const socket of [...syncClients]) socket.close();
    syncClients.clear();
    server.close();
};

const broadcastOrdersToClients = (orders) => {
    if (!syncWebSocketServer) return;
    const payload = JSON.stringify({ type: "orders-sync", orders, syncedAt: new Date().toISOString() });
    for (const socket of [...syncClients]) {
        if (socket.readyState === WebSocket.OPEN) socket.send(payload);
    }
};

const createWindow = () => {
    const window = new BrowserWindow({
        width: 1440,
        height: 960,
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

const createDbViewerWindow = () => {
    if (global.dbViewerWindow && !global.dbViewerWindow.isDestroyed()) {
        global.dbViewerWindow.show();
        global.dbViewerWindow.focus();
        return global.dbViewerWindow;
    }

    const dbViewerWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        backgroundColor: "#1f1f1f",
        title: "PFL SQLite Database Viewer",
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    global.dbViewerWindow = dbViewerWindow;
    dbViewerWindow.once("ready-to-show", () => dbViewerWindow.show());
    dbViewerWindow.on("closed", () => {
        global.dbViewerWindow = null;
    });
    dbViewerWindow.loadFile(path.join(__dirname, "../dist/index.html"), { hash: "/sqlite-db-viewer" });
    return dbViewerWindow;
};

const printOrder = async (event, { html, order, destination }) => {
    const printer = await resolvePrinterSetting(event, destination);
    const networkPrinter = typeof printer === "object" && printer && printer.host
        ? { host: printer.host, port: Number(printer.port) || 9100 }
        : null;

    if (networkPrinter) {
        if (!networkPrinter.host) throw new Error(`No ${destination} printer IP configured.`);
        const savedSettings = readPrinterSettings();
        const templateId = savedSettings.selectedBillTemplateIds?.[destination] || savedSettings.selectedBillTemplateId;
        return sendToNetworkPrinter(networkPrinter, order, destination, savedSettings.billTemplates.find((template) => template.id === templateId));
    }

    let deviceName = typeof printer === "string" ? printer.trim() : "";
    if (!deviceName && event?.sender?.getPrintersAsync) {
        try {
            const printers = await event.sender.getPrintersAsync();
            deviceName = printers?.[0]?.name || printers?.[0]?.displayName || "";
        } catch {
            deviceName = "";
        }
    }

    if (!deviceName) {
        throw new Error(`No ${destination} printer is available. Connect a printer or configure one in Printer Settings.`);
    }

    const printWindow = new BrowserWindow({ show: false });
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    return new Promise((resolve, reject) => {
        const printOptions = { silent: true, deviceName };
        printWindow.webContents.print(printOptions, (success, failureReason) => {
            printWindow.close();
            if (!success) {
                reject(new Error(failureReason || `Could not print to the default ${destination} printer.`));
                return;
            }
            resolve({ printer: deviceName });
        });
    });
};

app.whenReady().then(() => {
    ipcMain.handle("pfl:authenticate", (event, { username, password }) => {
        const account = readUsers().find((candidate) => candidate.username === username && candidate.password === password);
        if (!account) {
            authenticatedUsers.delete(event.sender.id);
            return null;
        }
        authenticatedUsers.set(event.sender.id, { username: account.username, role: account.role });
        event.sender.once("destroyed", () => authenticatedUsers.delete(event.sender.id));
        return { name: account.name, username: account.username, role: account.role };
    });
    ipcMain.handle("pfl:sign-out", (event) => authenticatedUsers.delete(event.sender.id));
    ipcMain.handle("pfl:get-users", (event) => {
        const currentUser = requireAuthenticatedUser(event, ["Admin", "Manager", "Assistant Manager"]);
        return readUsers().filter((user) => canManageUserTarget(currentUser, user)).map(publicUser);
    });
    ipcMain.handle("pfl:set-users", setManagedUsers);
    ipcMain.handle("pfl:print-order", printOrder);
    ipcMain.handle("pfl:get-printers", async (event) => {
        try {
            return await event.sender.getPrintersAsync();
        } catch {
            return [];
        }
    });
    ipcMain.handle("pfl:get-printer-settings", async (event) => {
        const saved = readPrinterSettings();
        const kitchen = saved.kitchen || await resolvePrinterSetting(event, "kitchen");
        const cashier = saved.cashier || await resolvePrinterSetting(event, "cashier");
        return { kitchen, cashier, receiptOptions: saved.receiptOptions, billTemplates: saved.billTemplates, selectedBillTemplateId: saved.selectedBillTemplateId, selectedBillTemplateIds: saved.selectedBillTemplateIds, printCashierToKitchen: saved.printCashierToKitchen };
    });
    ipcMain.handle("pfl:set-printer-settings", (event, settings) => writePrinterSettings({
        kitchen: settings?.kitchen || "",
        cashier: settings?.cashier || "",
        receiptOptions: settings?.receiptOptions || settings?.options || {},
        billTemplates: settings?.billTemplates,
        selectedBillTemplateId: settings?.selectedBillTemplateId,
        selectedBillTemplateIds: settings?.selectedBillTemplateIds,
        printCashierToKitchen: settings?.printCashierToKitchen,
    }));
    ipcMain.handle("pfl:export-sales-report", async (event, payload = {}) => {
        requireAuthenticatedUser(event, ["Admin"]);
        try {
            const rows = Array.isArray(payload.orders) ? payload.orders : [];
            const workbook = XLSX.utils.book_new();
            const overviewSheet = XLSX.utils.json_to_sheet([
                { Metric: "Total Revenue", Value: rows.reduce((sum, order) => sum + Number(order.total || 0), 0) },
                { Metric: "Total Orders", Value: rows.length },
                { Metric: "Average Order Value", Value: rows.length ? rows.reduce((sum, order) => sum + Number(order.total || 0), 0) / rows.length : 0 },
            ]);
            XLSX.utils.book_append_sheet(workbook, overviewSheet, "Overview");

            const salesSheet = XLSX.utils.json_to_sheet(rows.map((order) => ({
                OrderNumber: order.orderNumber || "",
                CreatedAt: order.createdAt || "",
                OrderType: order.orderType || "Walk-in",
                Table: order.orderDetails?.tableNumber || order.table || "",
                Status: order.status || "saved",
                Total: Number(order.total || 0),
            })));
            XLSX.utils.book_append_sheet(workbook, salesSheet, "Recent Orders");

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
    ipcMain.handle("pfl:get-catalog", () => getCatalogFromDb(app));
    ipcMain.handle("pfl:save-catalog", saveCatalogWithRole);
    ipcMain.handle("pfl:get-tables", () => getTableNamesFromDb(app));
    ipcMain.handle("pfl:save-tables", (event, tables) => {
        requireAuthenticatedUser(event, ["Admin"]);
        return saveTablesToDb(app, tables);
    });
    ipcMain.handle("pfl:get-orders", () => getOrdersFromDb(app));
    ipcMain.handle("pfl:save-orders", (event, orders) => saveOrdersToDb(app, orders));
    ipcMain.handle("pfl:get-customers", (event) => {
        const user = requireAuthenticatedUser(event, ["Admin", "Manager"]);
        return getCustomersFromDb(app, { includeFinancial: user.role === "Admin" });
    });
    ipcMain.handle("pfl:get-customer-by-phone", (event, phone) => {
        requireAuthenticatedUser(event, ["Admin", "Manager", "Assistant Manager", "Cashier"]);
        return getCustomerByPhoneFromDb(app, phone);
    });
    ipcMain.handle("pfl:save-customer-notes", (event, { customerId, notes } = {}) => {
        requireAuthenticatedUser(event, ["Admin", "Manager"]);
        if (typeof customerId !== "string" || !customerId.startsWith("phone:")) throw new Error("Invalid customer identifier.");
        if (typeof notes !== "string" || notes.length > 3000) throw new Error("Customer notes must be 3000 characters or fewer.");
        return updateCustomerNotesInDb(app, customerId, notes);
    });
    ipcMain.handle("pfl:prepare-clean-windows-data", () => prepareCleanWindowsData(app));
    ipcMain.handle("pfl:open-db-viewer-window", (event) => {
        requireAuthenticatedUser(event, ["Admin"]);
        return createDbViewerWindow();
    });
    ipcMain.handle("pfl:get-db-tables", (event) => {
        requireAuthenticatedUser(event, ["Admin"]);
        return listDbTables(app);
    });
    ipcMain.handle("pfl:get-db-table", (event, tableName) => {
        requireAuthenticatedUser(event, ["Admin"]);
        return getDbTableData(app, tableName);
    });
    ipcMain.handle("pfl:get-sync-settings", () => readSyncSettings());
    ipcMain.handle("pfl:set-sync-settings", (event, settings) => {
        requireAuthenticatedUser(event, ["Admin"]);
        const previous = readSyncSettings();
        const next = writeSyncSettings(settings || {});
        if (syncWebSocketServer && (!next.enabled || next.mode !== "host" || Number(previous.port) !== Number(next.port))) {
            stopSyncServer();
        }
        if (next.enabled && next.mode === "host") startSyncServer();
        return next;
    });
    ipcMain.handle("pfl:sync-orders", (event, orders) => {
        const nextOrders = Array.isArray(orders) ? orders : [];
        const settings = readSyncSettings();

        if (settings.mode === "host") {
            saveOrdersToDb(app, nextOrders);
            broadcastOrdersToClients(nextOrders);
            return nextOrders;
        }

        if (settings.mode === "client" && settings.enabled && settings.host) {
            return nextOrders;
        }

        return nextOrders;
    });
    ipcMain.handle("pfl:insert-db-row", (event, payload) => {
        requireAuthenticatedUser(event, ["Admin"]);
        try {
            return insertDbRow(app, payload || {});
        } catch (error) {
            return { ok: false, error: error.message };
        }
    });
    ipcMain.handle("pfl:update-db-row", (event, payload) => {
        requireAuthenticatedUser(event, ["Admin"]);
        try {
            return updateDbRow(app, payload || {});
        } catch (error) {
            return { ok: false, error: error.message };
        }
    });
    ipcMain.handle("pfl:delete-db-row", (event, payload) => {
        requireAuthenticatedUser(event, ["Admin"]);
        try {
            return deleteDbRow(app, payload || {});
        } catch (error) {
            return { ok: false, error: error.message };
        }
    });
    initializeDatabase(app);
    const savedSyncSettings = readSyncSettings();
    if (savedSyncSettings.enabled && savedSyncSettings.mode === "host") startSyncServer();
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});