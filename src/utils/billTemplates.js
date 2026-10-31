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

export const createBillTemplate = (overrides = {}) => ({
    id: overrides.id || `template-${Date.now()}`,
    name: overrides.name || "New bill layout",
    layout: overrides.layout || "classic",
    kotTemplateVersion: Number(overrides.kotTemplateVersion) || (overrides.layout === "kot" ? 2 : undefined),
    paperWidth: Number(overrides.paperWidth) || 80,
    alignment: overrides.alignment || "center",
    fontFamily: overrides.fontFamily || "verdana",
    fontSize: Math.min(24, Math.max(10, Number(overrides.fontSize) || 14)),
    horizontalPaddingMm: Math.min(8, Math.max(0, Number(overrides.horizontalPaddingMm ?? 3))),
    kotBottomFeedLines: Math.min(20, Math.max(0, Number(overrides.kotBottomFeedLines ?? 0))),
    contentPadding: Math.min(16, Math.max(0, Number(overrides.contentPadding ?? 8))),
    lineHeight: Math.min(2, Math.max(1, Number(overrides.lineHeight) || 1.35)),
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
});

export const defaultBillTemplates = [
    createBillTemplate({ id: "classic", name: "Photo-style cashier bill", layout: "lassi-shop" }),
    createBillTemplate({
        id: "kitchen-compact",
        kotTemplateVersion: 2,
        name: "Kitchen KOT 58mm",
        layout: "kot",
        paperWidth: 58,
        alignment: "center",
        dividerStyle: "dotted",
        fontFamily: "verdana",
        fontSize: 14,
        titleSize: 16,
        businessNameSize: 14,
        horizontalPaddingMm: 3,
        kotBottomFeedLines: 0,
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

export const normalizeBillTemplates = (templates) => {
    if (!Array.isArray(templates) || templates.length === 0) return defaultBillTemplates;
    return templates.map((template) => {
        if (template?.id !== "kitchen-compact" || Number(template.kotTemplateVersion) >= 2) {
            return normalizeBillTemplate(template);
        }
        const defaultKot = defaultBillTemplates.find((entry) => entry.id === "kitchen-compact");
        const previousDefaultOrder = ["dateTime", "billNumber", "billType", "customerName", "tableNumber", "divider:kot-biller", "businessName", "divider:kot-items", "items", "divider:kot-notes", "note"];
        const usesPreviousDefaultOrder = !Array.isArray(template.fieldOrder)
            || JSON.stringify(template.fieldOrder) === JSON.stringify(previousDefaultOrder);
        return normalizeBillTemplate({
            ...template,
            ...defaultKot,
            ...template,
            alignment: defaultKot.alignment,
            dividerStyle: defaultKot.dividerStyle,
            name: template.name || defaultKot.name,
            businessName: template.businessName || defaultKot.businessName,
            fields: { ...defaultKot.fields, ...template.fields },
            fieldLabels: { ...defaultKot.fieldLabels, ...template.fieldLabels },
            fieldOrder: usesPreviousDefaultOrder ? defaultKot.fieldOrder : template.fieldOrder,
            dividers: usesPreviousDefaultOrder ? defaultKot.dividers : template.dividers,
            kotTemplateVersion: 2,
        });
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
