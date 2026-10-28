import { getCurrentUser } from "./auth";
import { DEFAULT_FIELD_LABELS, defaultBillTemplates, readLocalBillTemplates } from "./billTemplates";
import { pushOrdersToHost } from "./networkSync";

export const ORDERS_STORAGE_KEY = "pfl-orders-v2";
const LEGACY_ORDERS_STORAGE_KEY = "pfl-orders";
const BILL_SEQUENCE_STORAGE_KEY = "pfl-bill-sequence-v2";

const WEB_PRINTER_SETTINGS_KEY = "pfl-printer-settings-v1";
const WEB_SYNC_SETTINGS_KEY = "pfl-sync-settings-v1";

const defaultReceiptOptions = {
    logo: true,
    businessName: true,
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

export const readWebPrinterSettings = () => {
    try {
        const raw = localStorage.getItem(WEB_PRINTER_SETTINGS_KEY);
        if (!raw) return { kitchen: "", cashier: "", receiptOptions: defaultReceiptOptions, billTemplates: defaultBillTemplates, selectedBillTemplateId: "classic", selectedBillTemplateIds: { kitchen: "kitchen-compact", cashier: "classic" }, printCashierToKitchen: false };
        const parsed = JSON.parse(raw);
        return {
            kitchen: parsed?.kitchen || "",
            cashier: parsed?.cashier || "",
            receiptOptions: { ...defaultReceiptOptions, ...(parsed?.receiptOptions || {}) },
            billTemplates: Array.isArray(parsed?.billTemplates) ? normalizeBillTemplates(parsed.billTemplates) : defaultBillTemplates,
            selectedBillTemplateId: parsed?.selectedBillTemplateId || "classic",
            selectedBillTemplateIds: parsed?.selectedBillTemplateIds || { kitchen: "kitchen-compact", cashier: "classic" },
            printCashierToKitchen: Boolean(parsed?.printCashierToKitchen),
        };
    } catch {
        return { kitchen: "", cashier: "", receiptOptions: defaultReceiptOptions, billTemplates: defaultBillTemplates, selectedBillTemplateId: "classic", selectedBillTemplateIds: { kitchen: "kitchen-compact", cashier: "classic" }, printCashierToKitchen: false };
    }
};

export const saveWebPrinterSettings = (settings = {}) => {
    const next = {
        kitchen: settings?.kitchen || "",
        cashier: settings?.cashier || "",
        receiptOptions: { ...defaultReceiptOptions, ...(settings?.receiptOptions || settings?.options || {}) },
        billTemplates: normalizeBillTemplates(settings?.billTemplates || defaultBillTemplates),
        selectedBillTemplateId: settings?.selectedBillTemplateId || "classic",
        selectedBillTemplateIds: settings?.selectedBillTemplateIds || { kitchen: "kitchen-compact", cashier: "classic" },
        printCashierToKitchen: Boolean(settings?.printCashierToKitchen),
    };
    localStorage.setItem(WEB_PRINTER_SETTINGS_KEY, JSON.stringify(next));
    return next;
};

export const readWebSyncSettings = () => {
    try {
        const raw = localStorage.getItem(WEB_SYNC_SETTINGS_KEY);
        if (!raw) return { enabled: false, mode: "host", host: "", port: 4099 };
        const parsed = JSON.parse(raw);
        return {
            enabled: Boolean(parsed?.enabled),
            mode: parsed?.mode === "client" ? "client" : "host",
            host: String(parsed?.host || "").trim(),
            port: Number(parsed?.port || 4099),
        };
    } catch {
        return { enabled: false, mode: "host", host: "", port: 4099 };
    }
};

export const saveWebSyncSettings = (settings = {}) => {
    const next = {
        enabled: Boolean(settings?.enabled),
        mode: settings?.mode === "client" ? "client" : "host",
        host: String(settings?.host || "").trim(),
        port: Number(settings?.port || 4099),
    };
    localStorage.setItem(WEB_SYNC_SETTINGS_KEY, JSON.stringify(next));
    return next;
};

const getBusinessDate = (date = new Date()) => {
    const businessDate = new Date(date);
    if (businessDate.getHours() < 3) businessDate.setDate(businessDate.getDate() - 1);
    return [businessDate.getFullYear(), businessDate.getMonth() + 1, businessDate.getDate()]
        .map((part) => String(part).padStart(2, "0"))
        .join("-");
};

export const getNextBillNumber = () => {
    const businessDate = getBusinessDate();
    let sequence = { date: businessDate, number: 0 };
    try {
        sequence = JSON.parse(localStorage.getItem(BILL_SEQUENCE_STORAGE_KEY)) || sequence;
    } catch {
    }
    const nextNumber = sequence.date === businessDate ? sequence.number + 1 : 1;
    localStorage.setItem(BILL_SEQUENCE_STORAGE_KEY, JSON.stringify({ date: businessDate, number: nextNumber }));
    return String(nextNumber).padStart(3, "0");
};

export const readOrders = () => {
    localStorage.removeItem(LEGACY_ORDERS_STORAGE_KEY);
    try {
        return JSON.parse(localStorage.getItem(ORDERS_STORAGE_KEY)) || [];
    } catch {
        return [];
    }
};

const persistOrdersToDb = async (orders) => {
    if (!window.pflDesktop || !window.pflDesktop.saveOrders) return;
    try {
        await window.pflDesktop.saveOrders(orders);
        window.dispatchEvent(new Event("pfl-customers-updated"));
    } catch (error) {
        console.error("Could not save orders to SQLite:", error);
    }
};

export const hydrateOrdersFromDb = async () => {
    if (!window.pflDesktop || !window.pflDesktop.getOrders) return readOrders();
    try {
        const dbOrders = await window.pflDesktop.getOrders();
        if (Array.isArray(dbOrders)) {
            localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(dbOrders));
            window.dispatchEvent(new Event("pfl-orders-updated"));
            return dbOrders;
        }
    } catch (error) {
        console.error("Could not load orders from SQLite:", error);
    }
    return readOrders();
};

export const appendOrder = (order) => {
    const orders = [order, ...readOrders()];
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
    if (window.pflDesktop && window.pflDesktop.saveOrders) {
        void persistOrdersToDb(orders);
    }
    void pushOrdersToHost(orders);
    window.dispatchEvent(new Event("pfl-orders-updated"));
    return order;
};

export const updateOrder = (orderId, changes) => {
    const orders = readOrders().map((order) => order.id === orderId ? { ...order, ...changes } : order);
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
    if (window.pflDesktop && window.pflDesktop.saveOrders) {
        void persistOrdersToDb(orders);
    }
    void pushOrdersToHost(orders);
    window.dispatchEvent(new Event("pfl-orders-updated"));
    return orders.find((order) => order.id === orderId);
};

export const removeOrder = (orderId) => {
    const orders = readOrders();
    const removedOrder = orders.find((order) => order.id === orderId);
    const remainingOrders = orders.filter((order) => order.id !== orderId);
    if (removedOrder?.orderType === "Table" && removedOrder.temporaryTable) {
        const tableName = removedOrder.orderDetails?.tableNumber;
        const isStillUsed = remainingOrders.some((order) => order.orderType === "Table" && order.orderDetails?.tableNumber === tableName);
        if (tableName && !isStillUsed) {
            const storedTables = localStorage.getItem("pfl-tables-v1");
            if (storedTables && localStorage.getItem("pfl-tables-initialized-v1")) {
                const permanentTables = JSON.parse(storedTables);
                localStorage.setItem("pfl-tables-v1", JSON.stringify(permanentTables.filter((table) => table !== tableName)));
                window.dispatchEvent(new Event("pfl-catalog-updated"));
            }
        }
    }
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(remainingOrders));
    if (window.pflDesktop && window.pflDesktop.saveOrders) {
        void persistOrdersToDb(remainingOrders);
    }
    void pushOrdersToHost(remainingOrders);
    window.dispatchEvent(new Event("pfl-orders-updated"));
};

export const resetOrderData = () => {
    localStorage.removeItem(ORDERS_STORAGE_KEY);
    localStorage.removeItem(BILL_SEQUENCE_STORAGE_KEY);
    if (window.pflDesktop && window.pflDesktop.saveOrders) {
        void persistOrdersToDb([]);
    }
    void pushOrdersToHost([]);
    window.dispatchEvent(new Event("pfl-orders-updated"));
};

export const resetBillSequence = () => {
    localStorage.removeItem(BILL_SEQUENCE_STORAGE_KEY);
    window.dispatchEvent(new Event("pfl-orders-updated"));
};

const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const renderReceiptHtml = (order, destination, configuredOptions = {}) => {
    const template = configuredOptions?.fields ? configuredOptions : defaultBillTemplates[0];
    const options = { ...defaultReceiptOptions, ...(template.fields || configuredOptions) };
    const labels = { ...DEFAULT_FIELD_LABELS, ...(template.fieldLabels || {}) };
    const isKitchenPrint = destination === "kitchen";
    const isKotLayout = template.layout === "kot";
    const title = isKotLayout ? "" : (template.titleText || (isKitchenPrint ? "Kitchen KOT" : ""));
    if (isKotLayout) {
        options.logo = false;
        options.businessName = false;
    }
    const currentUser = getCurrentUser();
    const cashierName = currentUser?.name || order.cashier || "Captain";
    const deliveryCharge = Number(order.charges?.Delivery || order.deliveryCharge || 0);
    const parcelCharge = Number(order.charges?.Parcel || order.parcelCharge || 0);
    const discount = Number(order.discount || 0);
    const customerName = order.orderDetails?.customerName || order.customerName || "";
    const phone = order.orderDetails?.phone || order.phone || "";
    const address = order.orderDetails?.address || order.address || "";
    const tableNumber = order.orderDetails?.tableNumber || order.tableNumber || "";
    const createdAt = new Date(order.createdAt);
    const receiptDate = isKotLayout
        ? `${String(createdAt.getDate()).padStart(2, "0")}/${String(createdAt.getMonth() + 1).padStart(2, "0")}/${String(createdAt.getFullYear()).slice(-2)} ${String(createdAt.getHours()).padStart(2, "0")}:${String(createdAt.getMinutes()).padStart(2, "0")}`
        : createdAt.toLocaleString();
    const items = order.cart.map((item) => `
        <tr><td class="${isKotLayout ? "kot-item-name" : ""}">${escapeHtml(item.name).replaceAll("\n", "<br>")}${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}</td><td>${item.quantity}</td>${options.itemPrice ? `<td>₹${Math.round(item.price * item.quantity)}</td>` : ""}</tr>
    `).join("");
    const logoSrc = new URL(`${import.meta.env.BASE_URL}Logo.png`, window.location.href).href;
    const fieldMarkup = {
        items: `<table><thead><tr><th>${escapeHtml(labels.item)}</th><th>${escapeHtml(labels.quantity)}</th>${options.itemPrice ? `<th>${escapeHtml(labels.itemPrice)}</th>` : ""}</tr></thead><tbody>${items}</tbody></table>`,
        businessName: isKotLayout ? `<div class="kot-meta-row"><span>${escapeHtml(labels.businessName)}:</span><strong>${escapeHtml(template.businessName || "Lassi Shop")}</strong></div>` : "",
        billNumber: isKotLayout
            ? `<div class="kot-centered kot-emphasis">${escapeHtml(labels.billNumber)} ${escapeHtml(order.orderNumber || "-")}</div>`
            : `<div class="meta-row"><span>${escapeHtml(labels.billNumber)}</span><strong>${escapeHtml(order.orderNumber || "-")}</strong></div>`,
        billType: isKotLayout
            ? `<div class="kot-centered kot-emphasis">${escapeHtml(order.orderType === "Table" ? "Dine In" : order.orderType === "Parcel" || order.orderType === "Takeaway" ? "Parcel/Take Away" : order.orderType || "Walk-in")}</div>`
            : `<div class="meta-row"><span>${escapeHtml(labels.billType)}</span><strong>${escapeHtml(order.orderType || "Walk-in")}</strong></div>`,
        tableNumber: tableNumber ? (isKotLayout
            ? `<div class="kot-meta-row"><span>${escapeHtml(labels.tableNumber)}:</span><strong>${escapeHtml(tableNumber)}</strong></div>`
            : `<div class="meta-row"><span>${escapeHtml(labels.tableNumber)}</span><strong>${escapeHtml(tableNumber)}</strong></div>`) : "",
        customerName: customerName ? (isKotLayout
            ? `<div class="kot-meta-row"><span>${escapeHtml(labels.customerName)} :</span><strong>${escapeHtml(customerName)}</strong></div>`
            : `<div class="meta-row"><span>${escapeHtml(labels.customerName)}</span><strong>${escapeHtml(customerName)}</strong></div>`) : "",
        phone: phone ? `<div class="meta-row"><span>${escapeHtml(labels.phone)}</span><strong>${escapeHtml(phone)}</strong></div>` : "",
        address: address ? `<div class="meta-row"><span>${escapeHtml(labels.address)}</span><strong>${escapeHtml(address)}</strong></div>` : "",
        cashierName: `<div class="meta-row"><span>${escapeHtml(labels.cashierName)}</span><strong>${escapeHtml(cashierName)}</strong></div>`,
        dateTime: isKotLayout
            ? `<div class="kot-centered">${receiptDate}</div>`
            : `<div class="meta-row"><span>${escapeHtml(labels.dateTime)}</span><strong>${receiptDate}</strong></div>`,
        subtotal: `<p class="row"><span>${escapeHtml(labels.subtotal)}</span><span>₹${Math.round(order.subtotal || order.total || 0)}</span></p>`,
        deliveryCharges: deliveryCharge > 0 ? `<p class="row"><span>${escapeHtml(labels.deliveryCharges)}</span><span>₹${Math.round(deliveryCharge)}</span></p>` : "",
        parcelCharges: parcelCharge > 0 ? `<p class="row"><span>${escapeHtml(labels.parcelCharges)}</span><span>₹${Math.round(parcelCharge)}</span></p>` : "",
        discount: discount > 0 ? `<p class="row"><span>${escapeHtml(labels.discount)}</span><span>-₹${Math.round(discount)}</span></p>` : "",
        note: order.orderNote ? `<p class="${isKotLayout ? "kot-notes" : "note"}">${escapeHtml(labels.note)}: ${escapeHtml(order.orderNote)}</p>` : "",
        total: `<p class="total">${escapeHtml(labels.total)}: ₹${Math.round(order.total)}</p>`,
        footer: `<p class="footer">${escapeHtml(template.footerText || "Thank you for visiting us")}</p>`,
    };
    (template.dividers || []).forEach((divider) => {
        fieldMarkup[`divider:${divider.id}`] = `<div class="divider">${escapeHtml(divider.label || "")}</div>`;
    });
    const fieldOrder = template.fieldOrder || Object.keys(fieldMarkup);
    const orderedFields = fieldOrder.filter((field) => (field.startsWith("divider:") || (field === "businessName" && isKotLayout) || options[field]) && fieldMarkup[field]);
    const bodyMarkup = orderedFields.map((field) => fieldMarkup[field]).join("");

    const paperWidth = template.paperWidth === 58 ? 58 : 80;
    const alignment = template.alignment || "center";
    const horizontalPaddingMm = Math.min(8, Math.max(0, Number(template.horizontalPaddingMm ?? 3)));
    const kotBottomFeedLines = isKotLayout ? Math.min(20, Math.max(0, Number(template.kotBottomFeedLines ?? 0))) : 0;
    const fontFamilies = {
        verdana: '"Verdana", Arial, sans-serif',
        monospace: "monospace",
        sans: "Arial, sans-serif",
        serif: "Georgia, serif",
    };
    const fontFamily = fontFamilies[template.fontFamily] || fontFamilies.verdana;
    const fontSize = Math.min(24, Math.max(10, Number(template.fontSize) || 14));
    const contentPadding = Math.min(16, Math.max(0, Number(template.contentPadding ?? 8)));
    const lineHeight = Math.min(2, Math.max(1, Number(template.lineHeight) || 1.35));
    const dividerStyle = ["dotted", "dashed", "solid", "double", "none"].includes(template.dividerStyle) ? template.dividerStyle : "dashed";
    const rowSpacing = Math.min(12, Math.max(0, Number(template.rowSpacing ?? 4)));
    const cellPadding = Math.min(8, Math.max(0, Number(template.cellPadding ?? 4)));
    const itemNameWidth = Math.min(70, Math.max(30, Number(template.itemNameWidth) || 54));
    const quantityWidth = Math.min(30, Math.max(10, Number(template.quantityWidth) || 16));
    const amountWidth = 100 - itemNameWidth - quantityWidth;
    const businessNameSize = Math.min(32, Math.max(12, Number(template.businessNameSize) || 19));
    const totalSize = Math.min(28, Math.max(12, Number(template.totalSize) || 17));
    const titleSize = Math.min(28, Math.max(10, Number(template.titleSize) || 16));
    return `<!doctype html><html><head><title>${title || "Receipt"}</title><style>
        @page { size: ${paperWidth}mm auto; margin: 0; }
        html { width: ${paperWidth}mm; max-width: ${paperWidth}mm; margin: 0; padding: 0; }
        body { width: 100%; max-width: ${paperWidth}mm; margin: 0; padding: 0; }
        body {
          font: 700 ${fontSize}px/${lineHeight} ${fontFamily};
          color: #000000;
          padding: ${contentPadding}px ${isKotLayout ? `${horizontalPaddingMm}mm` : `${contentPadding}px`} ${isKotLayout ? `calc(${contentPadding}px + ${kotBottomFeedLines * fontSize * lineHeight}px)` : `${contentPadding}px`};
          box-sizing: border-box;
          word-break: break-word;
          overflow-wrap: anywhere;
          min-width: 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .header { display: flex; align-items: center; justify-content: ${alignment === "left" ? "flex-start" : alignment === "right" ? "flex-end" : "center"}; gap: 8px; margin-bottom: 8px; }
        .logo-box { width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; }
        .logo-box img { width: 100%; height: 100%; object-fit: contain; }
        .brand { font-size: ${businessNameSize}px; font-weight: 700; text-align: ${alignment}; color: #000; }
        .kot-item-name { font-weight: 700; }
        .kot-centered { justify-content: center; text-align: center; }
        .kot-centered span, .kot-centered strong { flex: initial; }
        .kot-emphasis { font-weight: 700; }
        .kot-layout { font-family: ${fontFamily}; font-size: ${fontSize}px; }
        .kot-layout .meta-box { margin: 0; }
        .kot-layout .kot-centered { margin: 2px 0; text-align: center; font-weight: 700; }
        .kot-layout .kot-centered:first-child { font-weight: 400; }
        .kot-layout .kot-meta-row { display: flex; flex-wrap: wrap; gap: 0 5px; margin: 2px 0; font-weight: 400; }
        .kot-layout .kot-meta-row span { flex: 0 0 auto; }
        .kot-layout .kot-meta-row strong { min-width: 0; font-weight: 400; overflow-wrap: anywhere; }
        .kot-layout .divider { display: block; height: 0; margin: 4px 0; border-top: 1px dotted #000; font-size: 0; }
        .kot-layout table { margin: 0; font-size: ${fontSize}px; }
        .kot-layout th, .kot-layout td { padding: 1px 0; border: 0; }
        .kot-layout th:first-child, .kot-layout td:first-child { width: calc(100% - 4em); }
        .kot-layout th:last-child, .kot-layout td:last-child { width: 4em; text-align: right; white-space: nowrap; }
        .kot-layout th { font-weight: 400; }
        .kot-layout td.kot-item-name { font-weight: 700; white-space: pre-line; }
        .kot-layout .kot-notes { margin: 4px 0 0; font-weight: 700; overflow-wrap: anywhere; }
        .kot-notes { margin: 4px 0; font-weight: 700; }
        .header-line { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin: 6px 0; }
        h1 { text-align: ${alignment}; font-size: ${titleSize}px; margin: 0; color: #000; }
        p { margin: 4px 0; color: #000; }
        .row { display: flex; justify-content: space-between; gap: 8px; font-size: ${fontSize}px; color: #000; font-weight: 700; margin: ${rowSpacing}px 0; }
        .meta-box { margin: ${rowSpacing}px 0; }
        .meta-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin: ${rowSpacing}px 0; font-size: ${fontSize}px; color: #000; }
        .meta-row span { color: #000; min-width: 0; font-weight: 700; }
        .meta-row strong { text-align: right; flex: 1; font-weight: 700; word-break: break-word; color: #000; }
        table { border-collapse: collapse; width: 100%; margin-top: ${rowSpacing}px; table-layout: fixed; font-size: ${Math.max(fontSize - 1, 9)}px; color: #000; }
        th, td { padding: ${cellPadding}px 0; text-align: left; border-bottom: 1px ${dividerStyle} #000; vertical-align: top; color: #000; font-weight: 700; }
        th:nth-child(1), td:nth-child(1) { width: ${itemNameWidth}%; overflow-wrap: anywhere; }
        th:nth-child(2), td:nth-child(2) { width: ${quantityWidth}%; text-align: center; }
        th:nth-child(3), td:nth-child(3) { width: ${amountWidth}%; text-align: right; }
        small { display: block; margin-top: 2px; color: #000; font-size: 10.5px; line-height: 1.3; font-weight: 700; }
        .total { font-weight: ${template.boldTotal === false ? 400 : 700}; text-align: right; margin-top: 12px; font-size: ${totalSize}px; color: #000; }
        .note { margin-top: 12px; border-top: 1px dashed #000; padding-top: 8px; font-size: 11.5px; color: #000; font-weight: 700; }
        .divider { display: flex; align-items: center; gap: 6px; margin: 10px 0; color: #000; font-size: 10.5px; text-align: center; font-weight: 700; }
        .divider::before, .divider::after { content: ""; flex: 1; border-top: 1px ${dividerStyle} #000; }
        .footer { text-align: center; margin-top: 12px; font-size: 11px; color: #000; font-weight: 700; }
        @media print { body { margin: 0; } }
    </style></head><body class="${isKotLayout ? "kot-layout" : ""}">${!isKotLayout && (options.logo || options.businessName) ? `<div class="header">${options.logo ? `<div class="logo-box"><img src="${logoSrc}" alt="Logo" /></div>` : ""}${options.businessName ? `<div class="brand">${escapeHtml(template.businessName || "Lassi Shop")}</div>` : ""}</div>` : ""}${!isKotLayout && template.headerText ? `<p class="footer">${escapeHtml(template.headerText)}</p>` : ""}${title ? `<div class="header-line"><h1>${title}</h1></div>` : ""}<div class="meta-box">${bodyMarkup}</div></body></html>`;
};

const printSingleOrder = async (order, destination, selectedTemplate) => {
    const html = renderReceiptHtml(order, destination, selectedTemplate || defaultBillTemplates[0]);
    if (window.pflDesktop) {
        await window.pflDesktop.printOrder({ html, order, destination });
        return true;
    }

    const printWindow = window.open("", "_blank", "width=420,height=720");
    if (!printWindow) return false;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onafterprint = () => printWindow.close();
    printWindow.print();
    return true;
};

export const printOrder = async (order, destination) => {
    let settings = null;
    let templates = defaultBillTemplates;
    if (window.pflDesktop && window.pflDesktop.getPrinterSettings) {
        try {
            settings = await window.pflDesktop.getPrinterSettings();
            templates = settings?.billTemplates || defaultBillTemplates;
        } catch {
            settings = null;
        }
    } else {
        settings = readWebPrinterSettings();
        templates = settings?.billTemplates || readLocalBillTemplates();
    }

    const destinations = destination === "cashier" && settings?.printCashierToKitchen
        ? ["cashier", "kitchen"]
        : [destination];
    try {
        for (const printDestination of destinations) {
            const selectedId = settings?.selectedBillTemplateIds?.[printDestination]
                || settings?.selectedBillTemplateId;
            const selectedTemplate = templates.find((template) => template.id === selectedId) || templates[0];
            await printSingleOrder(order, printDestination, selectedTemplate);
        }
        return true;
    } catch (error) {
        window.alert(error.message);
        return false;
    }
};

export const isDesktop = () => Boolean(window.pflDesktop);