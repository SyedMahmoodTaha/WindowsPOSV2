export const BILL_TEMPLATES_STORAGE_KEY = "pfl-bill-templates-v1";

export const BILL_FIELD_DEFINITIONS = [
    { key: "logo", label: "Logo" },
    { key: "businessName", label: "Business name" },
    { key: "items", label: "Items table" },
    { key: "itemPrice", label: "Item prices" },
    { key: "dateTime", label: "Date and time" },
    { key: "billNumber", label: "Bill number" },
    { key: "billType", label: "Bill type" },
    { key: "cashierName", label: "Captain" },
    { key: "customerName", label: "Customer name" },
    { key: "phone", label: "Phone number" },
    { key: "address", label: "Address" },
    { key: "tableNumber", label: "Table number" },
    { key: "deliveryCharges", label: "Delivery charge" },
    { key: "parcelCharges", label: "Parcel charge" },
    { key: "subtotal", label: "Subtotal" },
    { key: "total", label: "Total" },
    { key: "discount", label: "Discount" },
    { key: "note", label: "Order note" },
    { key: "footer", label: "Footer" },
];

export const DEFAULT_FIELD_LABELS = {
    billNumber: "Bill no",
    billType: "Type",
    businessName: "Business name",
    dateTime: "Date",
    cashierName: "Captain",
    customerName: "Customer",
    phone: "Phone",
    address: "Address",
    tableNumber: "Table",
    subtotal: "Subtotal",
    deliveryCharges: "Delivery",
    parcelCharges: "Parcel",
    discount: "Discount",
    total: "Total",
    note: "Note",
    item: "Item",
    quantity: "Qty",
    itemPrice: "Amount",
};

const allFields = BILL_FIELD_DEFINITIONS.reduce((fields, field) => ({ ...fields, [field.key]: true }), {});
const defaultFieldOrder = BILL_FIELD_DEFINITIONS.map((field) => field.key);
const customElementTypes = new Set(["field", "text", "divider", "logo"]);

const normalizeCustomElements = (elements = []) => (Array.isArray(elements) ? elements : [])
    .slice(0, 100)
    .filter((element) => element && typeof element === "object" && customElementTypes.has(element.type))
    .map((element, index) => ({
        id: typeof element.id === "string" && element.id ? element.id : `custom-element-${index}`,
        type: element.type,
        ...(element.type === "field"
            ? { field: BILL_FIELD_DEFINITIONS.some(({ key }) => key === element.field) ? element.field : "items" }
            : {}),
        ...(element.type === "text" || element.type === "divider"
            ? { text: typeof element.text === "string" ? element.text.slice(0, 500) : "" }
            : {}),
        alignment: ["left", "center", "right"].includes(element.alignment) ? element.alignment : "left",
        fontSize: Math.min(32, Math.max(9, Number(element.fontSize) || 14)),
        width: Math.min(100, Math.max(25, Number(element.width) || 100)),
        bold: element.bold !== false,
    }));

export const createBillTemplate = (overrides = {}) => ({
    id: overrides.id || `template-${Date.now()}`,
    name: overrides.name || "New bill layout",
    layout: overrides.layout || "classic",
    kotTemplateVersion: Number(overrides.kotTemplateVersion) || (overrides.layout === "kot" ? 3 : undefined),
    paperWidthVersion: Number(overrides.paperWidthVersion) || 1,
    paperWidth: Number(overrides.paperWidth) || 80,
    alignment: overrides.alignment || "center",
    fontFamily: overrides.fontFamily || "verdana",
    fontSize: Math.min(24, Math.max(10, Number(overrides.fontSize) || 14)),
    horizontalPaddingMm: Math.min(8, Math.max(0, Number(overrides.horizontalPaddingMm ?? 3))),
    kotBottomFeedLines: Math.min(20, Math.max(0, Number(overrides.kotBottomFeedLines ?? 0))),
    contentPadding: Math.min(16, Math.max(0, Number(overrides.contentPadding ?? 8))),
    lineHeight: Math.min(2, Math.max(1, Number(overrides.lineHeight) || 1.35)),
    rowSpacing: Math.min(12, Math.max(0, Number(overrides.rowSpacing ?? 4))),
    cellPadding: Math.min(8, Math.max(0, Number(overrides.cellPadding ?? 4))),
    itemNameWidth: Math.min(70, Math.max(30, Number(overrides.itemNameWidth ?? 54))),
    quantityWidth: Math.min(30, Math.max(10, Number(overrides.quantityWidth ?? 16))),
    dividerStyle: ["dotted", "dashed", "solid", "double", "none"].includes(overrides.dividerStyle) ? overrides.dividerStyle : "dashed",
    titleText: overrides.titleText || "",
    titleSize: Math.min(28, Math.max(10, Number(overrides.titleSize) || 16)),
    thermalRightMargin: Math.min(5, Math.max(0, Number(overrides.thermalRightMargin ?? 2))),
    businessName: overrides.businessName ?? "Lassi Shop",
    businessNameSize: Math.min(32, Math.max(12, Number(overrides.businessNameSize) || 19)),
    headerPhoneNumber: overrides.headerPhoneNumber ?? "9611648843",
    fssaiText: overrides.fssaiText ?? "FASSAI",
    footerPhone: overrides.footerPhone ?? "",
    gstNumber: overrides.gstNumber ?? "",
    totalSize: Math.min(28, Math.max(12, Number(overrides.totalSize) || 17)),
    boldTotal: overrides.boldTotal !== false,
    logoDataUrl: typeof overrides.logoDataUrl === "string" ? overrides.logoDataUrl : "",
    footerText: overrides.footerText ?? (overrides.id === "classic" ? "Thank You & Visit Again" : "Thank you for visiting us"),
    headerText: overrides.headerText ?? "",
    fields: { ...allFields, ...(overrides.fields || {}) },
    fieldLabels: { ...DEFAULT_FIELD_LABELS, ...(overrides.fieldLabels || {}) },
    fieldOrder: Array.isArray(overrides.fieldOrder) ? overrides.fieldOrder : defaultFieldOrder,
    dividers: Array.isArray(overrides.dividers) ? overrides.dividers : [],
    customElements: normalizeCustomElements(overrides.customElements),
});

export const defaultBillTemplates = [
    createBillTemplate({ id: "classic", name: "Photo-style cashier bill", layout: "lassi-shop" }),
    createBillTemplate({
        id: "kitchen-compact",
        kotTemplateVersion: 3,
        paperWidthVersion: 1,
        name: "Kitchen KOT 80mm",
        layout: "kot",
        paperWidth: 80,
        alignment: "center",
        dividerStyle: "dotted",
        fontFamily: "verdana",
        fontSize: 14,
        titleSize: 16,
        businessNameSize: 14,
        horizontalPaddingMm: 8,
        kotBottomFeedLines: 2,
        contentPadding: 12,
        rowSpacing: 4,
        cellPadding: 4,
        itemNameWidth: 54,
        quantityWidth: 16,
        thermalRightMargin: 3,
        totalSize: 17,
        headerText: "",
        footerText: "",
        fields: {
            logo: false,
            businessName: true,
            items: true,
            itemPrice: false,
            dateTime: true,
            billNumber: true,
            billType: true,
            cashierName: false,
            customerName: true,
            phone: false,
            address: false,
            tableNumber: true,
            deliveryCharges: false,
            parcelCharges: false,
            subtotal: false,
            total: false,
            discount: false,
            note: true,
            footer: false,
        },
        fieldOrder: ["dateTime", "billNumber", "billType", "divider:kot-customer", "customerName", "tableNumber", "businessName", "divider:kot-items", "items", "divider:kot-notes", "note"],
        dividers: [{ id: "kot-customer", label: "" }, { id: "kot-items", label: "" }, { id: "kot-notes", label: "" }],
        fieldLabels: { dateTime: "", billNumber: "KOT -", billType: "", customerName: "Name", businessName: "Biller", tableNumber: "Table No", item: "Item", quantity: "Qty.", note: "Customer Notes" },
    }),
    createBillTemplate({
        id: "minimal",
        name: "Minimal receipt",
        layout: "minimal",
        fields: { logo: false, address: false, note: false, footer: false },
    }),
    createBillTemplate({
        id: "customer",
        name: "Customer details",
        layout: "customer",
        headerText: "Freshly prepared for you",
        fields: { logo: true, customerName: true, phone: true, address: true, note: true },
    }),
];

export const normalizeBillTemplate = (template, fallback = defaultBillTemplates[0]) => {
    const normalized = createBillTemplate({ ...fallback, ...(template || {}) });
    if (template?.id === "classic" && template.layout === "classic") {
        normalized.layout = "lassi-shop";
        if (!template.footerText || template.footerText === "Thank you for visiting us") {
            normalized.footerText = "Thank You & Visit Again";
        }
    }
    const savedOrder = Array.isArray(template?.fieldOrder) ? template.fieldOrder : [];
    const fieldOrder = savedOrder.includes("items")
        ? savedOrder
        : [...savedOrder.slice(0, 2), "items", ...savedOrder.slice(2)];
    return {
        ...normalized,
        fields: { ...fallback.fields, ...(template?.fields || {}) },
        fieldOrder: [...new Set([...fieldOrder, ...defaultFieldOrder])],
        dividers: Array.isArray(template?.dividers) ? template.dividers : [],
    };
};

const migrateKotDefaults = (template) => {
    const defaults = defaultBillTemplates.find((entry) => entry.id === "kitchen-compact");
    const previousDefaultOrder = ["dateTime", "billNumber", "billType", "customerName", "tableNumber", "divider:kot-biller", "businessName", "divider:kot-items", "items", "divider:kot-notes", "note"];
    const usesPreviousDefaultOrder = !Array.isArray(template.fieldOrder)
        || JSON.stringify(template.fieldOrder) === JSON.stringify(previousDefaultOrder);
    const migrated = {
        ...defaults,
        ...template,
        paperWidth: 80,
        paperWidthVersion: 1,
        name: template.name === "Kitchen KOT 58mm" ? defaults.name : (template.name || defaults.name),
        alignment: defaults.alignment,
        dividerStyle: defaults.dividerStyle,
        businessName: template.businessName || defaults.businessName,
        fields: { ...defaults.fields, ...template.fields },
        fieldLabels: { ...defaults.fieldLabels, ...template.fieldLabels },
        fieldOrder: usesPreviousDefaultOrder ? defaults.fieldOrder : (template.fieldOrder || defaults.fieldOrder),
        dividers: usesPreviousDefaultOrder ? defaults.dividers : (template.dividers || defaults.dividers),
        kotTemplateVersion: 3,
    };
    const defaultMigrations = {
        fontSize: [14, 14],
        titleSize: [16, 16],
        lineHeight: [1.35, 1.35],
        contentPadding: [8, 12],
        rowSpacing: [4, 4],
        cellPadding: [4, 4],
        itemNameWidth: [54, 54],
        quantityWidth: [16, 16],
        thermalRightMargin: [2, 3],
        horizontalPaddingMm: [3, 8],
        kotBottomFeedLines: [0, 2],
        businessNameSize: [14, 14],
        totalSize: [17, 17],
    };
    for (const [key, [oldValue, newValue]] of Object.entries(defaultMigrations)) {
        if (template[key] === undefined || Number(template[key]) === oldValue) migrated[key] = newValue;
    }
    return migrated;
};

export const normalizeBillTemplates = (templates) => {
    if (!Array.isArray(templates) || templates.length === 0) return defaultBillTemplates;
    return templates.map((template) => {
        const isLegacyKot = template?.id === "kitchen-compact" && Number(template.kotTemplateVersion) < 3;
        const hasSavedWidth = Number(template?.paperWidthVersion) >= 1;
        const migrated = isLegacyKot
            ? migrateKotDefaults(template)
            : { ...template, paperWidth: hasSavedWidth ? template.paperWidth : 80, paperWidthVersion: 1 };
        return normalizeBillTemplate(migrated);
    });
};

export const readLocalBillTemplates = () => {
    try {
        return normalizeBillTemplates(JSON.parse(localStorage.getItem(BILL_TEMPLATES_STORAGE_KEY)));
    } catch {
        return defaultBillTemplates;
    }
};

export const saveLocalBillTemplates = (templates) => {
    const normalized = normalizeBillTemplates(templates);
    localStorage.setItem(BILL_TEMPLATES_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
};
