import { useEffect, useState } from "react";
import { FaArrowLeft } from "react-icons/fa6";
import { Link } from "react-router-dom";
import { readWebPrinterSettings, renderReceiptHtml, saveWebPrinterSettings } from "../utils/orderStorage";
import { BILL_FIELD_DEFINITIONS, createBillTemplate, defaultBillTemplates, normalizeBillTemplates } from "../utils/billTemplates";
import BillLayoutControls from "./BillLayoutControls";

const previewOrder = {
    orderNumber: "37",
    orderType: "Parcel",
    orderDetails: { customerName: "Arslan", phone: "9876543210", address: "12 Market Road", tableNumber: "R1" },
    cart: [
        { id: "preview-1", name: "Shawarma Roll", quantity: 2, price: 80 },
        { id: "preview-2", name: "Veg Burger 2+1", quantity: 1, price: 240 },
        { id: "preview-3", name: "French Fries (small)", quantity: 1, price: 70 },
        { id: "preview-4", name: "Chicken Loaded", quantity: 1, price: 150 },
    ],
    charges: { Delivery: 50 },
    subtotal: 620,
    total: 670,
    orderNote: "paid",
    createdAt: "2026-09-14T21:31:00",
};

const BillPrintingPreferences = () => {
    const [settings, setSettings] = useState({ billTemplates: defaultBillTemplates, selectedBillTemplateIds: { kitchen: "kitchen-compact", cashier: "classic" }, printCashierToKitchen: false });
    const [destination, setDestination] = useState("cashier");
    const [selectedTemplateId, setSelectedTemplateId] = useState("classic");
    const [draggedField, setDraggedField] = useState(null);
    const [message, setMessage] = useState("");

    useEffect(() => {
        const loadTemplates = async () => {
            if (window.pflDesktop) {
                try {
                    const savedSettings = await window.pflDesktop.getPrinterSettings();
                    const selectedBillTemplateIds = savedSettings?.selectedBillTemplateIds || { kitchen: savedSettings?.selectedBillTemplateId || "classic", cashier: savedSettings?.selectedBillTemplateId || "classic" };
                    setSettings({ billTemplates: normalizeBillTemplates(savedSettings?.billTemplates), selectedBillTemplateIds, printCashierToKitchen: savedSettings?.printCashierToKitchen === true });
                    setSelectedTemplateId(selectedBillTemplateIds.cashier || "classic");
                    return;
                } catch {
                    setMessage("Could not load bill layouts");
                    return;
                }
            }

            const savedSettings = readWebPrinterSettings();
            const selectedBillTemplateIds = savedSettings?.selectedBillTemplateIds || { kitchen: "kitchen-compact", cashier: "classic" };
            setSettings({ billTemplates: normalizeBillTemplates(savedSettings?.billTemplates), selectedBillTemplateIds, printCashierToKitchen: savedSettings?.printCashierToKitchen === true });
            setSelectedTemplateId(selectedBillTemplateIds.cashier || "classic");
        };

        void loadTemplates();
    }, []);

    const selectedTemplate = settings.billTemplates.find((template) => template.id === selectedTemplateId) || settings.billTemplates[0];
    const updateSelectedTemplate = (changes) => setSettings((current) => ({ ...current, billTemplates: current.billTemplates.map((template) => template.id === selectedTemplate.id ? { ...template, ...changes } : template) }));
    const updateTemplateField = (field, value) => updateSelectedTemplate({ [field]: value });
    const uploadLogo = (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type)) {
            setMessage("Choose a PNG, JPEG, or WebP logo");
            return;
        }
        if (file.size > 500 * 1024) {
            setMessage("Logo must be 500 KB or smaller");
            return;
        }
        const reader = new FileReader();
        reader.onload = () => updateTemplateField("logoDataUrl", String(reader.result || ""));
        reader.onerror = () => setMessage("Could not load logo image");
        reader.readAsDataURL(file);
    };
    const toggleReceiptOption = (option) => updateSelectedTemplate({ fields: { ...selectedTemplate.fields, [option]: !selectedTemplate.fields?.[option] } });
    const moveField = (targetField) => {
        if (selectedTemplate.layout === "lassi-shop" || !draggedField || draggedField === targetField) return;
        const nextOrder = [...selectedTemplate.fieldOrder];
        const sourceIndex = nextOrder.indexOf(draggedField);
        const targetIndex = nextOrder.indexOf(targetField);
        if (sourceIndex < 0 || targetIndex < 0) return;
        nextOrder.splice(sourceIndex, 1);
        nextOrder.splice(nextOrder.indexOf(targetField), 0, draggedField);
        updateSelectedTemplate({ fieldOrder: nextOrder });
        setDraggedField(null);
    };
    const addDivider = () => {
        const id = `divider-${Date.now()}`;
        const divider = { id, label: "Section divider" };
        setSettings((current) => ({ ...current, billTemplates: current.billTemplates.map((template) => template.id === selectedTemplate.id ? { ...template, dividers: [...template.dividers, divider], fieldOrder: [...template.fieldOrder, `divider:${id}`] } : template) }));
    };
    const updateDivider = (dividerId, label) => updateSelectedTemplate({ dividers: selectedTemplate.dividers.map((divider) => divider.id === dividerId ? { ...divider, label } : divider) });
    const removeDivider = (dividerId) => updateSelectedTemplate({ dividers: selectedTemplate.dividers.filter((divider) => divider.id !== dividerId), fieldOrder: selectedTemplate.fieldOrder.filter((field) => field !== `divider:${dividerId}`) });

    const addBlankTemplate = () => {
        const blankFields = BILL_FIELD_DEFINITIONS.reduce((fields, field) => ({ ...fields, [field.key]: false }), {});
        const template = createBillTemplate({ id: `template-${Date.now()}`, name: "Blank layout", fields: blankFields });
        setSettings((current) => ({ ...current, billTemplates: [...current.billTemplates, template] }));
        setSelectedTemplateId(template.id);
    };

    const duplicateTemplate = () => {
        if (!selectedTemplate) return;
        const template = createBillTemplate({ ...selectedTemplate, id: `template-${Date.now()}`, name: `${selectedTemplate.name} copy` });
        setSettings((current) => ({ ...current, billTemplates: [...current.billTemplates, template] }));
        setSelectedTemplateId(template.id);
    };

    const deleteTemplate = () => {
        if (!selectedTemplate || settings.billTemplates.length <= 1) return;
        const nextTemplates = settings.billTemplates.filter((template) => template.id !== selectedTemplate.id);
        setSettings((current) => ({ ...current, billTemplates: nextTemplates }));
        setSelectedTemplateId(nextTemplates[0].id);
    };

    const saveTemplates = async () => {
        const selectedBillTemplateIds = { ...settings.selectedBillTemplateIds, [destination]: selectedTemplateId };
        const payload = { billTemplates: settings.billTemplates, selectedBillTemplateIds, selectedBillTemplateId: selectedBillTemplateIds.cashier, printCashierToKitchen: settings.printCashierToKitchen };
        try {
            if (window.pflDesktop) {
                await window.pflDesktop.setPrinterSettings(payload);
            } else {
                saveWebPrinterSettings(payload);
            }
            setMessage("Bill layout preference saved");
        } catch (error) {
            console.error("Could not save bill layout preference", error);
            setMessage("Could not save bill layout preference");
        }
    };

    return (
        <main className="min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto max-w-6xl">
                <div className="mb-8 flex items-center gap-4">
                    <Link to="/settings" className="rounded-full p-3 text-[#d3d3d3] hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label="Back to printer settings"><FaArrowLeft /></Link>
                    <div><p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Receipt design</p><h1 className="text-3xl font-semibold">Bill printing preference</h1></div>
                </div>
                <section className="rounded-[24px] bg-[#2a2a2a] p-6 shadow-lg">
                    {selectedTemplate && <BillLayoutControls template={selectedTemplate} onChange={updateSelectedTemplate} onLogoUpload={uploadLogo} />}
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[#ababab]">Choose a separate layout for each printer.</p><button type="button" onClick={addBlankTemplate} className="rounded-[10px] bg-[#3a3a3a] px-3 py-2 text-sm font-semibold hover:bg-[#444]">New blank layout</button></div>
                    <div className="mb-5 grid grid-cols-2 gap-2 rounded-[12px] bg-[#1f1f1f] p-1"><button type="button" onClick={() => { setDestination("cashier"); setSelectedTemplateId(settings.selectedBillTemplateIds.cashier || "classic"); }} className={`rounded-[10px] px-3 py-2 text-sm font-semibold ${destination === "cashier" ? "bg-[#d3d3d3] text-[#1a1a1a]" : "text-[#ababab]"}`}>Cashier bill</button><button type="button" onClick={() => { setDestination("kitchen"); setSelectedTemplateId(settings.selectedBillTemplateIds.kitchen || "classic"); }} className={`rounded-[10px] px-3 py-2 text-sm font-semibold ${destination === "kitchen" ? "bg-[#d3d3d3] text-[#1a1a1a]" : "text-[#ababab]"}`}>KOT</button></div>
                    <div className="grid gap-5 lg:grid-cols-[12rem_1fr]">
                        <div className="grid content-start gap-2">{settings.billTemplates.map((template) => <button key={template.id} type="button" onClick={() => { setSelectedTemplateId(template.id); setSettings((current) => ({ ...current, selectedBillTemplateIds: { ...current.selectedBillTemplateIds, [destination]: template.id } })); }} className={`rounded-[10px] px-3 py-3 text-left text-sm font-semibold ${template.id === selectedTemplate?.id ? "bg-[#d3d3d3] text-[#1a1a1a]" : "bg-[#1f1f1f] text-[#ababab] hover:bg-[#3a3a3a]"}`}>{template.name}</button>)}</div>
                        {selectedTemplate && <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
                            <div className="grid gap-3">
                                <div className="flex flex-wrap gap-2"><input value={selectedTemplate.name} onChange={(event) => updateTemplateField("name", event.target.value)} className="min-w-[12rem] flex-1 rounded-[10px] border border-[#444] bg-[#1f1f1f] px-3 py-2 text-sm text-[#f5f5f5]" placeholder="Layout name" /><button type="button" onClick={duplicateTemplate} className="rounded-[10px] bg-[#3a3a3a] px-3 py-2 text-xs font-semibold">Duplicate</button><button type="button" onClick={deleteTemplate} disabled={settings.billTemplates.length <= 1} className="rounded-[10px] bg-[#3a3a3a] px-3 py-2 text-xs font-semibold disabled:opacity-40">Delete</button></div>
                                <div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-xs text-[#ababab]">Layout<select value={selectedTemplate.layout} onChange={(event) => updateTemplateField("layout", event.target.value)} className="field"><option value="lassi-shop">Photo-style cashier</option><option value="classic">Classic</option><option value="kot">Kitchen KOT</option><option value="minimal">Minimal</option><option value="customer">Customer details</option></select></label><label className="grid gap-1 text-xs text-[#ababab]">Paper width<select value={selectedTemplate.paperWidth} onChange={(event) => updateTemplateField("paperWidth", Number(event.target.value))} className="field"><option value="58">58mm</option><option value="80">80mm</option></select></label><label className="grid gap-1 text-xs text-[#ababab]">Alignment<select value={selectedTemplate.alignment} onChange={(event) => updateTemplateField("alignment", event.target.value)} className="field"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div>
                                <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs text-[#ababab]">Business name<input value={selectedTemplate.businessName} onChange={(event) => updateTemplateField("businessName", event.target.value)} className="field" /></label><label className="grid gap-1 text-xs text-[#ababab]">Header text<input value={selectedTemplate.headerText} onChange={(event) => updateTemplateField("headerText", event.target.value)} className="field" placeholder="Optional" /></label><label className="grid gap-1 text-xs text-[#ababab] sm:col-span-2">Footer text<input value={selectedTemplate.footerText} onChange={(event) => updateTemplateField("footerText", event.target.value)} className="field" /></label></div>
                                <div><div className="mb-2 flex items-center justify-between gap-2"><div><p className="text-sm font-semibold">Show on bill</p><p className="mt-1 text-xs text-[#ababab]">{selectedTemplate.layout === "lassi-shop" ? "Photo-style cashier order is fixed; checkboxes control field visibility." : "Drag a row to change its position."}</p></div><button type="button" onClick={addDivider} className="rounded-[10px] bg-[#3a3a3a] px-3 py-2 text-xs font-semibold hover:bg-[#444]">Add divider</button></div><div className="mb-2 grid gap-2 sm:grid-cols-2">{BILL_FIELD_DEFINITIONS.filter(({ key }) => ["logo", "businessName"].includes(key)).map(({ key, label }) => <label key={key} className="flex items-center gap-3 rounded-[10px] border border-[#444] bg-[#1f1f1f] px-3 py-2 text-sm"><input type="checkbox" checked={Boolean(selectedTemplate.fields?.[key])} onChange={() => toggleReceiptOption(key)} className="size-4" /><span>{label}</span></label>)}</div><div className="grid gap-2">{selectedTemplate.fieldOrder.filter((key) => !["logo", "businessName"].includes(key)).map((key) => { const field = BILL_FIELD_DEFINITIONS.find((definition) => definition.key === key); const dividerId = key.startsWith("divider:") ? key.slice(8) : null; const divider = dividerId ? selectedTemplate.dividers.find((item) => item.id === dividerId) : null; if (!field && !divider) return null; const canReorder = selectedTemplate.layout !== "lassi-shop"; return <label key={key} draggable={canReorder} onDragStart={() => canReorder && setDraggedField(key)} onDragOver={(event) => canReorder && event.preventDefault()} onDrop={() => moveField(key)} className={`flex ${canReorder ? "cursor-grab active:cursor-grabbing" : "cursor-default"} items-center gap-3 rounded-[10px] border border-[#444] bg-[#1f1f1f] px-3 py-2 text-sm ${draggedField === key ? "opacity-50" : ""}`}><span className="select-none text-[#777]">{canReorder ? "::" : ""}</span>{divider ? <><span className="flex-1 text-[#ababab]">Divider</span><input value={divider.label} onChange={(event) => updateDivider(divider.id, event.target.value)} className="field min-w-0 flex-1" placeholder="Optional divider label" /><button type="button" onClick={() => removeDivider(divider.id)} className="rounded-[8px] px-2 py-1 text-xs text-[#f08080] hover:bg-[#3a3a3a]">Remove</button></> : <><input type="checkbox" checked={Boolean(selectedTemplate.fields?.[key])} onChange={() => toggleReceiptOption(key)} className="size-4" /><span>{field.label}</span></>}</label>; })}</div></div>
                            </div>
                            <div className="min-w-0"><p className="mb-2 text-sm font-semibold">Preview · {selectedTemplate.paperWidth}mm roll</p><div className="overflow-x-auto rounded-[10px] border border-[#444] bg-[#e8e8e8] p-3"><iframe title="Bill preview" srcDoc={renderReceiptHtml(previewOrder, destination, selectedTemplate)} className="h-[38rem] min-w-[18rem] w-full rounded-[4px] border-0 bg-white shadow-md" /></div><p className="mt-2 text-xs text-[#ababab]">Roll height is content-sized. Confirm margins and cut position with a test print on your printer.</p></div>
                        </div>}
                    </div>
                    <label className="mt-6 flex items-start gap-3 rounded-[12px] border border-[#444] bg-[#1f1f1f] p-3 text-sm"><input type="checkbox" checked={settings.printCashierToKitchen} onChange={(event) => setSettings((current) => ({ ...current, printCashierToKitchen: event.target.checked }))} className="mt-0.5 size-4" /><span><span className="block font-semibold">Cashier print also prints KOT</span><span className="mt-1 block text-xs text-[#ababab]">Disabled by default. Enable this when one cashier print should send a bill to both printers.</span></span></label>
                    <div className="mt-4 flex items-center gap-3"><button type="button" onClick={saveTemplates} className="rounded-[12px] bg-[#d3d3d3] px-5 py-3 font-semibold text-[#1a1a1a] hover:bg-white">Save bill preference</button>{message && <p className="text-sm text-[#a7d7a7]">{message}</p>}</div>
                </section>
            </div>
        </main>
    );
};

export default BillPrintingPreferences;
