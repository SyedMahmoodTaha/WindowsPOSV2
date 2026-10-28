import { DEFAULT_FIELD_LABELS } from "../utils/billTemplates";

const labelTitles = {
    billNumber: "Bill number",
    billType: "Bill type",
    dateTime: "Date and time",
    cashierName: "Cashier name",
    customerName: "Customer name",
    phone: "Phone",
    address: "Address",
    tableNumber: "Table",
    subtotal: "Subtotal",
    deliveryCharges: "Delivery charge",
    parcelCharges: "Parcel charge",
    discount: "Discount",
    total: "Total",
    note: "Order note",
    item: "Item column",
    quantity: "Quantity column",
    itemPrice: "Item price column",
};

const BillLayoutControls = ({ template, onChange, onLogoUpload }) => {
    const updateNumber = (key, value, min, max) => {
        const number = Number(value);
        if (Number.isFinite(number)) onChange({ [key]: Math.min(max, Math.max(min, number)) });
    };

    const updateLabel = (key, value) => onChange({
        fieldLabels: { ...DEFAULT_FIELD_LABELS, ...(template.fieldLabels || {}), [key]: value },
    });

    return (
        <div className="grid gap-4 border-t border-[#444] pt-4">
            <div>
                <h3 className="mb-3 text-sm font-semibold">Typography and spacing</h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <label className="grid gap-1 text-xs text-[#ababab] sm:col-span-2">
                        Receipt / KOT title
                        <input value={template.titleText || ""} onChange={(event) => onChange({ titleText: event.target.value })} placeholder="Leave blank for the default title" className="field" />
                    </label>
                    <label className="grid gap-1 text-xs text-[#ababab]">
                        Font family
                        <select value={template.fontFamily || "verdana"} onChange={(event) => onChange({ fontFamily: event.target.value })} className="field">
                            <option value="verdana">Verdana</option>
                            <option value="monospace">Monospace</option>
                            <option value="sans">Sans serif</option>
                            <option value="serif">Serif</option>
                        </select>
                    </label>
                    <label className="grid gap-1 text-xs text-[#ababab]">
                        Font size ({template.fontSize || 14}px)
                        <input type="range" min="10" max="24" value={template.fontSize || 14} onChange={(event) => updateNumber("fontSize", event.target.value, 10, 24)} className="accent-[#d3d3d3]" />
                    </label>
                    <label className="grid gap-1 text-xs text-[#ababab]">
                        Title size ({template.titleSize || 16}px)
                        <input type="range" min="10" max="28" value={template.titleSize || 16} onChange={(event) => updateNumber("titleSize", event.target.value, 10, 28)} className="accent-[#d3d3d3]" />
                    </label>
                    <label className="grid gap-1 text-xs text-[#ababab]">
                        Line height ({template.lineHeight || 1.35})
                        <input type="range" min="1" max="2" step="0.05" value={template.lineHeight || 1.35} onChange={(event) => updateNumber("lineHeight", event.target.value, 1, 2)} className="accent-[#d3d3d3]" />
                    </label>
                    <label className="grid gap-1 text-xs text-[#ababab]">
                        Page padding ({template.contentPadding ?? 8}px)
                        <input type="range" min="0" max="16" value={template.contentPadding ?? 8} onChange={(event) => updateNumber("contentPadding", event.target.value, 0, 16)} className="accent-[#d3d3d3]" />
                    </label>
                    <label className="grid gap-1 text-xs text-[#ababab]">
                        Row spacing ({template.rowSpacing ?? 4}px)
                        <input type="range" min="0" max="12" value={template.rowSpacing ?? 4} onChange={(event) => updateNumber("rowSpacing", event.target.value, 0, 12)} className="accent-[#d3d3d3]" />
                    </label>
                    <label className="grid gap-1 text-xs text-[#ababab]">
                        Item row padding ({template.cellPadding ?? 4}px)
                        <input type="range" min="0" max="8" value={template.cellPadding ?? 4} onChange={(event) => updateNumber("cellPadding", event.target.value, 0, 8)} className="accent-[#d3d3d3]" />
                    </label>
                    <label className="grid gap-1 text-xs text-[#ababab]">
                        Item column width ({template.itemNameWidth ?? 54}%)
                        <input type="range" min="30" max="70" value={template.itemNameWidth ?? 54} onChange={(event) => updateNumber("itemNameWidth", event.target.value, 30, 70)} className="accent-[#d3d3d3]" />
                    </label>
                    <label className="grid gap-1 text-xs text-[#ababab]">
                        Quantity column width ({template.quantityWidth ?? 16}%)
                        <input type="range" min="10" max="30" value={template.quantityWidth ?? 16} onChange={(event) => updateNumber("quantityWidth", event.target.value, 10, 30)} className="accent-[#d3d3d3]" />
                    </label>
                    <label className="grid gap-1 text-xs text-[#ababab]">
                        Divider style
                        <select value={template.dividerStyle || "dashed"} onChange={(event) => onChange({ dividerStyle: event.target.value })} className="field">
                            <option value="dotted">Dotted</option>
                            <option value="dashed">Dashed</option>
                            <option value="solid">Solid</option>
                            <option value="double">Double</option>
                            <option value="none">None</option>
                        </select>
                    </label>
                    <label className="grid gap-1 text-xs text-[#ababab]">
                        Thermal right margin ({template.thermalRightMargin ?? 2} characters)
                        <input type="range" min="0" max="5" value={template.thermalRightMargin ?? 2} onChange={(event) => updateNumber("thermalRightMargin", event.target.value, 0, 5)} className="accent-[#d3d3d3]" />
                    </label>
                    {template.layout === "kot" && <>
                        <label className="grid gap-1 text-xs text-[#ababab]">
                            Horizontal paper margin ({template.horizontalPaddingMm ?? 3}mm)
                            <input type="range" min="0" max="8" step="0.5" value={template.horizontalPaddingMm ?? 3} onChange={(event) => updateNumber("horizontalPaddingMm", event.target.value, 0, 8)} className="accent-[#d3d3d3]" />
                        </label>
                        <label className="grid gap-1 text-xs text-[#ababab]">
                            Extra bottom feed ({template.kotBottomFeedLines ?? 0} lines)
                            <input type="range" min="0" max="20" value={template.kotBottomFeedLines ?? 0} onChange={(event) => updateNumber("kotBottomFeedLines", event.target.value, 0, 20)} className="accent-[#d3d3d3]" />
                        </label>
                    </>}
                    <label className="grid gap-1 text-xs text-[#ababab]">
                        Business name size ({template.businessNameSize || 19}px)
                        <input type="range" min="12" max="32" value={template.businessNameSize || 19} onChange={(event) => updateNumber("businessNameSize", event.target.value, 12, 32)} className="accent-[#d3d3d3]" />
                    </label>
                    <label className="grid gap-1 text-xs text-[#ababab]">
                        Total size ({template.totalSize || 17}px)
                        <input type="range" min="12" max="28" value={template.totalSize || 17} onChange={(event) => updateNumber("totalSize", event.target.value, 12, 28)} className="accent-[#d3d3d3]" />
                    </label>
                    <label className="flex items-center gap-2 self-end rounded-[10px] border border-[#444] px-3 py-2 text-sm">
                        <input type="checkbox" checked={template.boldTotal !== false} onChange={(event) => onChange({ boldTotal: event.target.checked })} className="size-4" />
                        Bold total
                    </label>
                </div>
            </div>

            <label className="grid gap-2 text-xs text-[#ababab]">
                Custom logo (PNG, JPEG, or WebP; up to 500 KB)
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogoUpload} className="block w-full text-sm file:mr-3 file:rounded-[8px] file:border-0 file:bg-[#3a3a3a] file:px-3 file:py-2 file:text-[#f5f5f5]" />
                {template.logoDataUrl && <button type="button" onClick={() => onChange({ logoDataUrl: "" })} className="w-fit rounded-[8px] border border-[#555] px-3 py-2 text-xs text-[#f5f5f5] hover:bg-[#3a3a3a]">Remove custom logo</button>}
            </label>

            <details className="border-t border-[#444] pt-3">
                <summary className="cursor-pointer text-sm font-semibold">Customize printed labels</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Object.entries(DEFAULT_FIELD_LABELS).map(([key, defaultValue]) => (
                        <label key={key} className="grid gap-1 text-xs text-[#ababab]">
                            {labelTitles[key] || key}
                            <input value={template.fieldLabels?.[key] ?? defaultValue} onChange={(event) => updateLabel(key, event.target.value)} className="field" />
                        </label>
                    ))}
                </div>
            </details>
            <p className="text-xs text-[#ababab]">Verdana is used for HTML/system-printer output. Network thermal printers use their built-in font; long KOT item names and notes wrap to fit the selected roll width.</p>
        </div>
    );
};

export default BillLayoutControls;