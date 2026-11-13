import { useState } from "react";
import { BILL_FIELD_DEFINITIONS } from "../utils/billTemplates";

const fieldLabel = (key) => BILL_FIELD_DEFINITIONS.find((field) => field.key === key)?.label || key;

const CustomBillLayoutEditor = ({ template, onChange }) => {
    const [selectedId, setSelectedId] = useState("");
    const [draggedElementId, setDraggedElementId] = useState("");
    const [elementSequence, setElementSequence] = useState(() => (template.customElements || []).reduce((max, element) => {
        const match = element.id.match(/-custom-(\d+)$/);
        return match ? Math.max(max, Number(match[1])) : max;
    }, 0));
    const elements = template.customElements || [];
    const selectedElement = elements.find((element) => element.id === selectedId);

    const updateElements = (nextElements) => onChange({ customElements: nextElements });
    const addElement = (element) => {
        let nextSequence = elementSequence + 1;
        let nextId = `${template.id}-custom-${nextSequence}`;
        while (elements.some((existing) => existing.id === nextId)) {
            nextSequence += 1;
            nextId = `${template.id}-custom-${nextSequence}`;
        }
        setElementSequence(nextSequence);
        const nextElement = {
            id: nextId,
            alignment: "left",
            fontSize: 14,
            width: 100,
            bold: true,
            ...element,
        };
        updateElements([...elements, nextElement]);
        setSelectedId(nextElement.id);
    };
    const addField = (field) => addElement(field === "logo" ? { type: "logo" } : { type: "field", field });
    const updateElement = (id, changes) => updateElements(elements.map((element) => (
        element.id === id ? { ...element, ...changes } : element
    )));
    const removeElement = (id) => {
        updateElements(elements.filter((element) => element.id !== id));
        if (selectedId === id) setSelectedId("");
    };
    const reorderElement = (targetId) => {
        if (!draggedElementId || draggedElementId === targetId) return;
        const nextElements = [...elements];
        const sourceIndex = nextElements.findIndex((element) => element.id === draggedElementId);
        const targetIndex = nextElements.findIndex((element) => element.id === targetId);
        if (sourceIndex < 0 || targetIndex < 0) return;
        const [element] = nextElements.splice(sourceIndex, 1);
        nextElements.splice(targetIndex, 0, element);
        updateElements(nextElements);
        setDraggedElementId("");
    };
    const acceptDrop = (event) => {
        event.preventDefault();
        const field = event.dataTransfer.getData("application/x-bill-field");
        const type = event.dataTransfer.getData("application/x-bill-element");
        if (field) addField(field);
        else if (type === "text") addElement({ type: "text", text: "Your text" });
        else if (type === "divider") addElement({ type: "divider", text: "" });
    };
    const elementTitle = (element) => element.type === "field"
        ? fieldLabel(element.field)
        : element.type === "logo"
            ? "Logo"
            : element.type === "divider"
                ? (element.text || "Divider")
                : element.text || "Custom text";

    return (
        <section className="grid gap-4 rounded-[16px] border border-[#444] bg-[#242424] p-4">
            <div>
                <h3 className="text-sm font-semibold">Build your bill</h3>
                <p className="mt-1 text-xs text-[#ababab]">Drag elements into the bill, then drag the bill rows to arrange them. The live preview uses the installed-printer HTML layout.</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(16rem,1.2fr)]">
                <div className="grid content-start gap-3">
                    <div className="grid gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#ababab]">Add elements</p>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" draggable onDragStart={(event) => event.dataTransfer.setData("application/x-bill-element", "text")} onClick={() => addElement({ type: "text", text: "Your text" })} className="rounded-[10px] bg-[#3a3a3a] px-3 py-2 text-left text-sm hover:bg-[#444]">+ Custom text</button>
                            <button type="button" draggable onDragStart={(event) => event.dataTransfer.setData("application/x-bill-element", "divider")} onClick={() => addElement({ type: "divider", text: "" })} className="rounded-[10px] bg-[#3a3a3a] px-3 py-2 text-left text-sm hover:bg-[#444]">+ Divider</button>
                            {BILL_FIELD_DEFINITIONS.filter(({ key }) => key !== "itemPrice").map(({ key, label }) => (
                                <button key={key} type="button" draggable onDragStart={(event) => event.dataTransfer.setData("application/x-bill-field", key)} onClick={() => addField(key)} className="rounded-[10px] bg-[#3a3a3a] px-3 py-2 text-left text-sm hover:bg-[#444]">+ {label}</button>
                            ))}
                        </div>
                    </div>

                    <div onDragOver={(event) => event.preventDefault()} onDrop={acceptDrop} className="grid min-h-32 content-start gap-2 rounded-[12px] border border-dashed border-[#777] bg-[#1f1f1f] p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#ababab]">Bill order · drag to rearrange</p>
                        {elements.length === 0 && <p className="py-4 text-center text-xs text-[#777]">Drop an element here or choose one above.</p>}
                        {elements.map((element) => (
                            <div key={element.id} draggable onDragStart={() => setDraggedElementId(element.id)} onDragEnd={() => setDraggedElementId("")} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer.getData("application/x-bill-field") || event.dataTransfer.getData("application/x-bill-element")) acceptDrop(event); else reorderElement(element.id); }} className={`flex cursor-grab items-center gap-2 rounded-[9px] border px-3 py-2 text-sm active:cursor-grabbing ${selectedId === element.id ? "border-[#d3d3d3] bg-[#444]" : "border-[#444] bg-[#2a2a2a]"} ${draggedElementId === element.id ? "opacity-50" : ""}`}>
                                <span className="text-[#888]">::</span>
                                <button type="button" onClick={() => setSelectedId(element.id)} className="min-w-0 flex-1 truncate text-left">{elementTitle(element)}</button>
                                <button type="button" onClick={() => removeElement(element.id)} aria-label={`Remove ${elementTitle(element)}`} className="rounded px-2 text-xs text-[#f08080] hover:bg-[#333]">Remove</button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid content-start gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#ababab]">Selected element</p>
                    {!selectedElement && <p className="rounded-[10px] bg-[#1f1f1f] p-4 text-sm text-[#888]">Select a row in Bill order to edit its appearance.</p>}
                    {selectedElement && <div className="grid gap-3 rounded-[12px] bg-[#1f1f1f] p-3">
                        {(selectedElement.type === "text" || selectedElement.type === "divider") && <label className="grid gap-1 text-xs text-[#ababab]">{selectedElement.type === "divider" ? "Divider label" : "Text"}<textarea value={selectedElement.text} onChange={(event) => updateElement(selectedElement.id, { text: event.target.value })} maxLength={500} rows={selectedElement.type === "divider" ? 2 : 3} className="field resize-y" /></label>}
                        <label className="grid gap-1 text-xs text-[#ababab]">Alignment<select value={selectedElement.alignment} onChange={(event) => updateElement(selectedElement.id, { alignment: event.target.value })} className="field"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                        <label className="grid gap-1 text-xs text-[#ababab]">Width ({selectedElement.width}%)<input type="range" min="25" max="100" value={selectedElement.width} onChange={(event) => updateElement(selectedElement.id, { width: Number(event.target.value) })} className="accent-[#d3d3d3]" /></label>
                        <label className="grid gap-1 text-xs text-[#ababab]">Text size ({selectedElement.fontSize}px)<input type="range" min="9" max="32" value={selectedElement.fontSize} onChange={(event) => updateElement(selectedElement.id, { fontSize: Number(event.target.value) })} className="accent-[#d3d3d3]" /></label>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedElement.bold} onChange={(event) => updateElement(selectedElement.id, { bold: event.target.checked })} className="size-4" />Bold</label>
                        {selectedElement.type === "field" && selectedElement.field === "items" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={template.fields?.itemPrice !== false} onChange={(event) => onChange({ fields: { ...template.fields, itemPrice: event.target.checked } })} className="size-4" />Show item prices</label>}
                    </div>}
                    {elements.some((element) => element.type === "logo" || (element.type === "field" && element.field === "logo")) && (
                        <p className="text-xs text-[#ababab]">To add or replace the logo image, use the Custom logo upload control above.</p>
                    )}
                </div>
            </div>
        </section>
    );
};

export default CustomBillLayoutEditor;
