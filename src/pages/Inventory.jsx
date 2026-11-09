import { useEffect, useMemo, useState } from "react";
import { FaArrowLeft, FaBoxArchive, FaBoxOpen, FaCalendarDays, FaMagnifyingGlass, FaPlus, FaRotateLeft, FaToggleOff, FaToggleOn, FaTrashCan } from "react-icons/fa6";
import { Link, useLocation } from "react-router-dom";
import { readCatalogAsync, saveCatalog } from "../utils/catalog";
import { createInventoryId, getIngredientStock, getLocalDate, normalizeIngredient } from "../utils/inventory";

const formatQuantity = (quantity) => new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 3,
}).format(Number(quantity || 0));

const emptyStockForm = () => ({
    packagesReceived: "",
    unitsPerPackage: "1",
    stockInDate: getLocalDate(),
    expiryDate: "",
    supplier: "",
    notes: "",
});

const Inventory = () => {
    const location = useLocation();
    const backPath = location.state?.from === "/more-settings" ? "/more-settings" : "/";
    const [catalog, setCatalog] = useState({ menuItems: [], categories: [], ingredients: [] });
    const [selectedIngredientId, setSelectedIngredientId] = useState("");
    const [ingredientDraft, setIngredientDraft] = useState({ name: "", unit: "pcs", lowStockThreshold: "" });
    const [newIngredient, setNewIngredient] = useState({ name: "", unit: "pcs", lowStockThreshold: "" });
    const [showNewIngredient, setShowNewIngredient] = useState(false);
    const [stockForm, setStockForm] = useState(emptyStockForm);
    const [recipeDraft, setRecipeDraft] = useState({});
    const [ingredientSearch, setIngredientSearch] = useState("");
    const [ingredientView, setIngredientView] = useState("active");
    const [menuSearch, setMenuSearch] = useState("");
    const [message, setMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        readCatalogAsync()
            .then((nextCatalog) => {
                const ingredients = Array.isArray(nextCatalog?.ingredients)
                    ? nextCatalog.ingredients.map(normalizeIngredient)
                    : [];
                const safeCatalog = {
                    ...nextCatalog,
                    menuItems: Array.isArray(nextCatalog?.menuItems) ? nextCatalog.menuItems : [],
                    ingredients,
                };
                setCatalog(safeCatalog);
                if (ingredients.length) {
                    const first = ingredients[0];
                    setSelectedIngredientId(first.id);
                    setIngredientDraft({
                        name: first.name,
                        unit: first.unit,
                        lowStockThreshold: first.lowStockThreshold ? String(first.lowStockThreshold) : "",
                    });
                    setRecipeDraft(Object.fromEntries(first.recipes.map((recipe) => [recipe.menuItemId, String(recipe.quantity)])));
                }
            })
            .catch((error) => {
                console.error("Could not load inventory:", error);
                setMessage(`Could not load inventory: ${error.message}`);
            });
    }, []);

    const selectedIngredient = useMemo(
        () => catalog.ingredients.find((ingredient) => ingredient.id === selectedIngredientId) || null,
        [catalog.ingredients, selectedIngredientId],
    );

    const filteredIngredients = useMemo(() => {
        const search = ingredientSearch.trim().toLowerCase();
        return catalog.ingredients
            .filter((ingredient) => ingredientView === "all"
                || (ingredientView === "archived" ? ingredient.archived : !ingredient.archived))
            .filter((ingredient) => `${ingredient.name} ${ingredient.unit}`.toLowerCase().includes(search))
            .sort((left, right) => left.name.localeCompare(right.name));
    }, [catalog.ingredients, ingredientSearch, ingredientView]);

    const filteredMenuItems = useMemo(() => {
        const search = menuSearch.trim().toLowerCase();
        return catalog.menuItems.filter((item) => `${item.name} ${item.category || ""}`.toLowerCase().includes(search));
    }, [catalog.menuItems, menuSearch]);

    const summary = useMemo(() => {
        const enabledIngredients = catalog.ingredients.filter((ingredient) => ingredient.enabled);
        const lowStock = enabledIngredients.filter((ingredient) => (
            ingredient.lowStockThreshold > 0
            && getIngredientStock(ingredient, { includeExpired: false }) <= ingredient.lowStockThreshold
        ));
        const expiredBatches = enabledIngredients.reduce((count, ingredient) => (
            count + ingredient.batches.filter((batch) => (
                batch.expiryDate && batch.expiryDate < getLocalDate() && batch.remainingQty > 0
            )).length
        ), 0);
        return {
            tracked: enabledIngredients.length,
            lowStock: lowStock.length,
            expiredBatches,
        };
    }, [catalog.ingredients]);

    const selectIngredient = (ingredient) => {
        const normalized = normalizeIngredient(ingredient);
        setSelectedIngredientId(normalized.id);
        setIngredientDraft({
            name: normalized.name,
            unit: normalized.unit,
            lowStockThreshold: normalized.lowStockThreshold ? String(normalized.lowStockThreshold) : "",
        });
        setStockForm(emptyStockForm());
        setRecipeDraft(Object.fromEntries(normalized.recipes.map((recipe) => [recipe.menuItemId, String(recipe.quantity)])));
        setMessage("");
    };

    const saveIngredients = async (ingredients, successMessage) => {
        const nextCatalog = { ...catalog, ingredients: ingredients.map(normalizeIngredient) };
        await saveCatalog(nextCatalog);
        setCatalog(nextCatalog);
        setMessage(successMessage);
    };

    const addIngredient = async (event) => {
        event.preventDefault();
        const name = newIngredient.name.trim();
        const unit = newIngredient.unit.trim();
        if (!name || !unit) {
            setMessage("Enter an ingredient name and base unit.");
            return;
        }
        if (catalog.ingredients.some((ingredient) => ingredient.name.toLowerCase() === name.toLowerCase())) {
            setMessage("An ingredient with that name already exists. Reuse it in each menu item's recipe.");
            return;
        }
        const threshold = Number(newIngredient.lowStockThreshold || 0);
        const ingredient = normalizeIngredient({
            id: createInventoryId(),
            name,
            unit,
            lowStockThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : 0,
            enabled: true,
            batches: [],
            recipes: [],
        });
        setIsSaving(true);
        try {
            await saveIngredients([...catalog.ingredients, ingredient], `${name} added. You can now receive stock and add it to recipes.`);
            setNewIngredient({ name: "", unit: "pcs", lowStockThreshold: "" });
            setShowNewIngredient(false);
            setIngredientView("active");
            selectIngredient(ingredient);
        } catch (error) {
            console.error("Could not add inventory ingredient:", error);
            setMessage(`Could not add ingredient: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const updateSelectedIngredient = async (changes, successMessage) => {
        if (!selectedIngredient) return;
        const updated = normalizeIngredient({ ...selectedIngredient, ...changes });
        setIsSaving(true);
        try {
            await saveIngredients(
                catalog.ingredients.map((ingredient) => ingredient.id === selectedIngredient.id ? updated : ingredient),
                successMessage,
            );
            setIngredientDraft({
                name: updated.name,
                unit: updated.unit,
                lowStockThreshold: updated.lowStockThreshold ? String(updated.lowStockThreshold) : "",
            });
            return true;
        } catch (error) {
            console.error("Could not save inventory ingredient:", error);
            setMessage(`Could not save ingredient: ${error.message}`);
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const receiveStock = async (event) => {
        event.preventDefault();
        if (!selectedIngredient) return;
        const packagesReceived = Number(stockForm.packagesReceived);
        const unitsPerPackage = Number(stockForm.unitsPerPackage);
        if (!Number.isFinite(packagesReceived) || packagesReceived <= 0
            || !Number.isFinite(unitsPerPackage) || unitsPerPackage <= 0) {
            setMessage("Enter a positive package quantity and a positive number of base units per package.");
            return;
        }
        if (stockForm.expiryDate && stockForm.expiryDate < stockForm.stockInDate) {
            setMessage("Expiry date cannot be before the stock-in date.");
            return;
        }
        const receivedQty = packagesReceived * unitsPerPackage;
        const batch = {
            id: createInventoryId(),
            packagesReceived,
            unitsPerPackage,
            receivedQty,
            remainingQty: receivedQty,
            stockInDate: stockForm.stockInDate,
            expiryDate: stockForm.expiryDate,
            supplier: stockForm.supplier.trim(),
            notes: stockForm.notes.trim(),
        };
        setIsSaving(true);
        try {
            const saved = await updateSelectedIngredient({
                enabled: true,
                batches: [...selectedIngredient.batches, batch],
            }, `Received ${formatQuantity(receivedQty)} ${selectedIngredient.unit} of ${selectedIngredient.name}.`);
            if (saved) setStockForm(emptyStockForm());
        } finally {
            setIsSaving(false);
        }
    };

    const saveRecipes = async (event) => {
        event.preventDefault();
        if (!selectedIngredient) return;
        const recipes = Object.entries(recipeDraft)
            .map(([menuItemId, value]) => ({ menuItemId, quantity: Number(value) }))
            .filter((recipe) => catalog.menuItems.some((item) => String(item.id) === recipe.menuItemId)
                && valueIsPositive(recipe.quantity));
        if (Object.entries(recipeDraft).some(([, value]) => (
            value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0)
        ))) {
            setMessage("Recipe quantities must be non-negative numbers. Use zero or leave blank to remove the ingredient from the item.");
            return;
        }
        await updateSelectedIngredient({ recipes }, `Saved ${selectedIngredient.name} usage in ${recipes.length} menu item${recipes.length === 1 ? "" : "s"}.`);
    };

    const toggleIngredient = async () => {
        if (!selectedIngredient) return;
        await updateSelectedIngredient(
            { enabled: !selectedIngredient.enabled },
            `${selectedIngredient.name} stock tracking ${selectedIngredient.enabled ? "disabled" : "enabled"}.`,
        );
    };

    const toggleInventoryFeature = async () => {
        const enabled = catalog.inventoryEnabled === false;
        const nextCatalog = { ...catalog, inventoryEnabled: enabled };
        setIsSaving(true);
        try {
            await saveCatalog(nextCatalog);
            setCatalog(nextCatalog);
            setMessage(enabled
                ? "Inventory is enabled. Enabled ingredients will be checked and deducted when orders are completed."
                : "Inventory is disabled. Orders can be completed without inventory checks or stock deductions.");
        } catch (error) {
            console.error("Could not change inventory status:", error);
            setMessage(`Could not change inventory status: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const restoreSelectedIngredient = async () => {
        if (!selectedIngredient) return;
        const restored = await updateSelectedIngredient(
            { archived: false },
            `${selectedIngredient.name} restored. Enable stock tracking if it should be deducted from orders.`,
        );
        if (restored) setIngredientView("active");
    };

    const archiveSelectedIngredient = async () => {
        if (!selectedIngredient) return;
        const recipeCount = selectedIngredient.recipes.length;
        const stockQty = getIngredientStock(selectedIngredient);
        const detail = [
            `${selectedIngredient.name} will be hidden from the active inventory list.`,
            recipeCount ? `${recipeCount} menu recipe${recipeCount === 1 ? "" : "s"} will be retained but will no longer deduct stock.` : "",
            stockQty > 0 ? `${formatQuantity(stockQty)} ${selectedIngredient.unit} of stock and its batches will be retained in the archive.` : "",
        ].filter(Boolean).join("\n");
        if (!window.confirm(`${detail}\n\nYou can restore this ingredient later.`)) return;

        const nextIngredients = catalog.ingredients.map((ingredient) => (
            ingredient.id === selectedIngredient.id
                ? { ...ingredient, archived: true, enabled: false }
                : ingredient
        ));
        setIsSaving(true);
        try {
            await saveIngredients(nextIngredients, `${selectedIngredient.name} archived. You can restore it from the Archived filter.`);
            const nextActive = nextIngredients.find((ingredient) => !ingredient.archived);
            if (nextActive) selectIngredient(nextActive);
            else setSelectedIngredientId("");
        } catch (error) {
            console.error("Could not archive inventory ingredient:", error);
            setMessage(`Could not archive ingredient: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const deleteSelectedIngredient = async () => {
        if (!selectedIngredient) return;
        const hasHistory = selectedIngredient.batches.length > 0
            || selectedIngredient.deductions.length > 0
            || selectedIngredient.recipes.length > 0;
        if (hasHistory) {
            setMessage("This ingredient has stock, recipe, or deduction history. Archive it instead to preserve its records.");
            return;
        }
        if (!window.confirm(`Permanently delete "${selectedIngredient.name}"? This cannot be undone.`)) return;
        const nextIngredients = catalog.ingredients.filter((ingredient) => ingredient.id !== selectedIngredient.id);
        setIsSaving(true);
        try {
            await saveIngredients(nextIngredients, `${selectedIngredient.name} permanently deleted.`);
            const nextIngredient = nextIngredients.find((ingredient) => (
                ingredientView === "all"
                    || (ingredientView === "archived" ? ingredient.archived : !ingredient.archived)
            ));
            if (nextIngredient) selectIngredient(nextIngredient);
            else setSelectedIngredientId("");
        } catch (error) {
            console.error("Could not delete inventory ingredient:", error);
            setMessage(`Could not delete ingredient: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (catalog.inventoryEnabled === false) {
        return (
            <main className="relative flex min-h-screen items-center justify-center bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5]">
                <Link
                    to={backPath}
                    className="absolute left-4 top-4 rounded-full p-3 text-[#d3d3d3] transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a] sm:left-6 sm:top-6"
                    aria-label={backPath === "/more-settings" ? "Back to More Settings" : "Back to home"}
                >
                    <FaArrowLeft />
                </Link>
                <section className="w-full max-w-md rounded-[24px] bg-[#2a2a2a] p-8 text-center shadow-lg">
                    <FaBoxOpen className="mx-auto mb-4 size-10 text-[#d3d3d3]" />
                    <h1 className="text-2xl font-semibold">Inventory is disabled</h1>
                    <p className="mt-2 text-sm text-[#ababab]">Enable the inventory feature to use stock management.</p>
                    {message && <p role="alert" className="mt-4 text-sm text-[#ffb8a8]">{message}</p>}
                    <button
                        type="button"
                        onClick={() => void toggleInventoryFeature()}
                        disabled={isSaving}
                        className="mt-6 rounded-[12px] bg-[#d3d3d3] px-5 py-3 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isSaving ? "Enabling..." : "Enable Inventory"}
                    </button>
                </section>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
            <div className="mx-auto max-w-7xl">
                <div className="mb-8 flex items-center gap-4">
                    <Link to={backPath} className="rounded-full p-3 text-[#d3d3d3] transition-colors hover:bg-[#d3d3d3] hover:text-[#1a1a1a]" aria-label={backPath === "/more-settings" ? "Back to More Settings" : "Back to home"}>
                        <FaArrowLeft />
                    </Link>
                    <div className="flex-1">
                        <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">Stock management</p>
                        <h1 className="text-3xl font-semibold">Inventory</h1>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowNewIngredient((visible) => !visible)}
                        className="inline-flex items-center gap-2 rounded-[12px] bg-[#d3d3d3] px-4 py-3 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-white"
                    >
                        <FaPlus />
                        Add ingredient
                    </button>
                </div>

                <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-[#444444] bg-[#2a2a2a] p-4 shadow-lg">
                    <div>
                        <p className="font-semibold">Inventory feature</p>
                        <p className="mt-1 text-sm text-[#ababab]">
                            {catalog.inventoryEnabled === false
                                ? "Off — orders will not check or deduct ingredient stock."
                                : "On — enabled ingredient recipes are checked and deducted when orders are completed."}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void toggleInventoryFeature()}
                        disabled={isSaving}
                        aria-label={`Turn inventory ${catalog.inventoryEnabled === false ? "on" : "off"}`}
                        aria-pressed={catalog.inventoryEnabled !== false}
                        className={`inline-flex min-w-32 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${catalog.inventoryEnabled === false ? "border-[#555555] bg-[#1f1f1f] text-[#ababab]" : "border-[#2b5d3b] bg-[#2b5d3b] text-[#dff7e6]"}`}
                    >
                        {catalog.inventoryEnabled === false
                            ? <><FaToggleOff className="text-xl" /> Disabled</>
                            : <><FaToggleOn className="text-xl" /> Enabled</>}
                    </button>
                </section>

                <div className="mb-6 grid gap-4 md:grid-cols-3">
                    <div className="rounded-[20px] bg-[#2a2a2a] p-4 shadow-lg">
                        <p className="text-sm text-[#ababab]">Enabled ingredients</p>
                        <p className="mt-2 text-3xl font-semibold">{summary.tracked}</p>
                    </div>
                    <div className="rounded-[20px] bg-[#2a2a2a] p-4 shadow-lg">
                        <p className="text-sm text-[#ababab]">Low stock</p>
                        <p className="mt-2 text-3xl font-semibold text-[#f7c948]">{summary.lowStock}</p>
                    </div>
                    <div className="rounded-[20px] bg-[#2a2a2a] p-4 shadow-lg">
                        <p className="text-sm text-[#ababab]">Expired batches with stock</p>
                        <p className="mt-2 text-3xl font-semibold text-[#ff9a9a]">{summary.expiredBatches}</p>
                    </div>
                </div>

                {message && (
                    <p role="status" className="mb-6 rounded-[16px] border border-[#444444] bg-[#2a2a2a] px-4 py-3 text-sm text-[#f5f5f5]">
                        {message}
                    </p>
                )}

                {showNewIngredient && (
                    <form onSubmit={addIngredient} className="mb-6 grid gap-3 rounded-[20px] bg-[#2a2a2a] p-4 shadow-lg sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
                        <label className="grid gap-2 text-sm text-[#ababab]">
                            Ingredient name
                            <input required value={newIngredient.name} onChange={(event) => setNewIngredient((draft) => ({ ...draft, name: event.target.value }))} placeholder="e.g. Cheese slice" className="rounded-[10px] border border-[#444444] bg-[#1f1f1f] px-3 py-2 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" />
                        </label>
                        <label className="grid gap-2 text-sm text-[#ababab]">
                            Base unit
                            <input required value={newIngredient.unit} onChange={(event) => setNewIngredient((draft) => ({ ...draft, unit: event.target.value }))} placeholder="slices, buns, g, ml" className="rounded-[10px] border border-[#444444] bg-[#1f1f1f] px-3 py-2 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" />
                        </label>
                        <label className="grid gap-2 text-sm text-[#ababab]">
                            Low-stock alert at
                            <input type="number" min="0" step="any" value={newIngredient.lowStockThreshold} onChange={(event) => setNewIngredient((draft) => ({ ...draft, lowStockThreshold: event.target.value }))} placeholder="Optional" className="rounded-[10px] border border-[#444444] bg-[#1f1f1f] px-3 py-2 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" />
                        </label>
                        <button type="submit" disabled={isSaving} className="self-end rounded-[10px] bg-[#d3d3d3] px-4 py-2 font-semibold text-[#1a1a1a] disabled:opacity-50">{isSaving ? "Adding..." : "Create"}</button>
                    </form>
                )}

                <div className="grid items-start gap-6 lg:grid-cols-[0.85fr_2fr]">
                    <section className="rounded-[24px] bg-[#2a2a2a] p-4 shadow-lg">
                        <div className="mb-4 flex items-center gap-3">
                            <FaBoxOpen className="size-5 text-[#d3d3d3]" />
                            <h2 className="text-xl font-semibold">Ingredients</h2>
                            <span className="ml-auto text-sm text-[#ababab]">{filteredIngredients.length} / {catalog.ingredients.length}</span>
                        </div>
                        <label className="relative mb-4 block">
                            <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-[#ababab]" />
                            <input value={ingredientSearch} onChange={(event) => setIngredientSearch(event.target.value)} placeholder="Search ingredients" aria-label="Search ingredients" className="w-full rounded-[10px] border border-[#444444] bg-[#1f1f1f] py-2 pl-9 pr-3 text-sm text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" />
                        </label>
                        <div className="mb-3 grid grid-cols-3 rounded-[10px] bg-[#1f1f1f] p-1">
                            {[
                                ["active", "Active"],
                                ["archived", "Archived"],
                                ["all", "All"],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setIngredientView(value)}
                                    className={`rounded-[8px] px-2 py-2 text-xs font-semibold transition-colors ${ingredientView === value ? "bg-[#d3d3d3] text-[#1a1a1a]" : "text-[#ababab] hover:text-[#f5f5f5]"}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className="max-h-[70vh] space-y-1 overflow-y-auto">
                            {filteredIngredients.length === 0 ? (
                                <p className="rounded-[12px] bg-[#1f1f1f] p-4 text-sm text-[#ababab]">
                                    {catalog.ingredients.length
                                        ? ingredientView === "active" && !ingredientSearch
                                            ? "No active ingredients. Check Archived or add an ingredient."
                                            : "No ingredients match your search and filter."
                                        : "Create an ingredient to start tracking stock."}
                                </p>
                            ) : filteredIngredients.map((ingredient) => {
                                const isSelected = selectedIngredient?.id === ingredient.id;
                                const available = getIngredientStock(ingredient, { includeExpired: false });
                                return (
                                    <button
                                        key={ingredient.id}
                                        type="button"
                                        onClick={() => selectIngredient(ingredient)}
                                        className={`w-full rounded-[10px] border px-3 py-2 text-left transition-colors ${isSelected ? "border-[#d3d3d3] bg-[#3a3a3a]" : "border-[#444444] bg-[#1f1f1f] hover:bg-[#303030]"}`}
                                    >
                                        <span className="flex items-start justify-between gap-3">
                                            <span className="truncate font-semibold">{ingredient.name}</span>
                                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${ingredient.archived ? "bg-[#3a3a3a] text-[#ababab]" : ingredient.enabled ? "bg-[#2b5d3b] text-[#dff7e6]" : "bg-[#3a3a3a] text-[#ababab]"}`}>
                                                {ingredient.archived ? "Archived" : ingredient.enabled ? "On" : "Off"}
                                            </span>
                                        </span>
                                        <span className="mt-0.5 block text-xs text-[#ababab]">
                                            {formatQuantity(available)} {ingredient.unit} available
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {selectedIngredient ? (
                        <div className="space-y-6">
                            <section className="rounded-[24px] bg-[#2a2a2a] p-5 shadow-lg">
                                <div className="mb-5 flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-sm uppercase tracking-[0.16em] text-[#ababab]">Shared ingredient</p>
                                        <h2 className="text-2xl font-semibold">{selectedIngredient.name}</h2>
                                    </div>
                                    <div className="flex flex-wrap justify-end gap-2">
                                        {!selectedIngredient.archived && (
                                            <button type="button" onClick={() => void toggleIngredient()} disabled={isSaving} aria-pressed={selectedIngredient.enabled} className="inline-flex items-center gap-2 rounded-full border border-[#555555] px-3 py-2 text-sm font-semibold transition-colors hover:bg-[#3a3a3a] disabled:opacity-50">
                                                {selectedIngredient.enabled ? <FaToggleOn className="text-xl text-[#d3d3d3]" /> : <FaToggleOff className="text-xl text-[#ababab]" />}
                                                {selectedIngredient.enabled ? "Disable stock" : "Enable stock"}
                                            </button>
                                        )}
                                        {selectedIngredient.archived ? (
                                            <button
                                                type="button"
                                                onClick={() => void restoreSelectedIngredient()}
                                                disabled={isSaving}
                                                className="inline-flex items-center gap-2 rounded-full border border-[#555555] px-3 py-2 text-sm font-semibold hover:bg-[#3a3a3a] disabled:opacity-50"
                                            >
                                                <FaRotateLeft />
                                                Restore
                                            </button>
                                        ) : (
                                            <button type="button" onClick={() => void archiveSelectedIngredient()} disabled={isSaving} className="inline-flex items-center gap-2 rounded-full border border-[#555555] px-3 py-2 text-sm font-semibold hover:bg-[#3a3a3a] disabled:opacity-50">
                                                <FaBoxArchive />
                                                Archive
                                            </button>
                                        )}
                                        {!selectedIngredient.batches.length && !selectedIngredient.deductions.length && !selectedIngredient.recipes.length && (
                                            <button type="button" onClick={() => void deleteSelectedIngredient()} disabled={isSaving} className="inline-flex items-center gap-2 rounded-full border border-[#754b4b] px-3 py-2 text-sm font-semibold text-[#ffb8b8] hover:bg-[#3b2525] disabled:opacity-50">
                                                <FaTrashCan />
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {selectedIngredient.archived && <p className="mb-4 rounded-[10px] border border-[#555555] bg-[#1f1f1f] px-3 py-2 text-sm text-[#ababab]">Archived ingredients are hidden from Active and do not deduct stock. Their batches, recipes, and deduction history are preserved.</p>}

                                <form onSubmit={(event) => {
                                    event.preventDefault();
                                    const name = ingredientDraft.name.trim();
                                    const unit = ingredientDraft.unit.trim();
                                    const threshold = Number(ingredientDraft.lowStockThreshold || 0);
                                    if (!name || !unit) {
                                        setMessage("Ingredient name and base unit are required.");
                                        return;
                                    }
                                    if (catalog.ingredients.some((ingredient) => ingredient.id !== selectedIngredient.id && ingredient.name.toLowerCase() === name.toLowerCase())) {
                                        setMessage("An ingredient with that name already exists.");
                                        return;
                                    }
                                    void updateSelectedIngredient({
                                        name,
                                        unit,
                                        lowStockThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : 0,
                                    }, "Ingredient details saved.");
                                }} className="grid gap-3 sm:grid-cols-3">
                                    <label className="grid gap-2 text-sm text-[#ababab]">
                                        Name
                                        <input value={ingredientDraft.name} onChange={(event) => setIngredientDraft((draft) => ({ ...draft, name: event.target.value }))} className="rounded-[10px] border border-[#444444] bg-[#1f1f1f] px-3 py-2 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" />
                                    </label>
                                    <label className="grid gap-2 text-sm text-[#ababab]">
                                        Base unit
                                        <input value={ingredientDraft.unit} onChange={(event) => setIngredientDraft((draft) => ({ ...draft, unit: event.target.value }))} placeholder="slices, buns, g, ml" className="rounded-[10px] border border-[#444444] bg-[#1f1f1f] px-3 py-2 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" />
                                    </label>
                                    <label className="grid gap-2 text-sm text-[#ababab]">
                                        Low-stock alert at
                                        <input type="number" min="0" step="any" value={ingredientDraft.lowStockThreshold} onChange={(event) => setIngredientDraft((draft) => ({ ...draft, lowStockThreshold: event.target.value }))} className="rounded-[10px] border border-[#444444] bg-[#1f1f1f] px-3 py-2 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" />
                                    </label>
                                    <button type="submit" disabled={isSaving} className="rounded-[10px] bg-[#d3d3d3] px-4 py-2 text-sm font-semibold text-[#1a1a1a] disabled:opacity-50 sm:col-span-3">Save ingredient details</button>
                                </form>

                                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-[12px] bg-[#1f1f1f] p-3">
                                        <p className="text-xs text-[#ababab]">Total stock, including expired</p>
                                        <p className="mt-1 text-xl font-semibold">{formatQuantity(getIngredientStock(selectedIngredient))} {selectedIngredient.unit}</p>
                                    </div>
                                    <div className="rounded-[12px] bg-[#1f1f1f] p-3">
                                        <p className="text-xs text-[#ababab]">Usable stock (unexpired)</p>
                                        <p className="mt-1 text-xl font-semibold">{formatQuantity(getIngredientStock(selectedIngredient, { includeExpired: false }))} {selectedIngredient.unit}</p>
                                    </div>
                                </div>
                            </section>

                            <section className="rounded-[24px] bg-[#2a2a2a] p-5 shadow-lg">
                                <div className="mb-4">
                                    <p className="text-sm uppercase tracking-[0.16em] text-[#ababab]">Stock in</p>
                                    <h2 className="text-xl font-semibold">Receive a new batch</h2>
                                    <p className="mt-1 text-sm text-[#ababab]">Stock is converted to {selectedIngredient.unit} and older-expiring batches are used first.</p>
                                </div>
                                <form onSubmit={(event) => void receiveStock(event)} className="space-y-4">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <label className="grid gap-2 text-sm text-[#ababab]">
                                            Packages received
                                            <input required type="number" min="0.001" step="any" value={stockForm.packagesReceived} onChange={(event) => setStockForm((form) => ({ ...form, packagesReceived: event.target.value }))} placeholder="e.g. 5 packets" className="rounded-[10px] border border-[#444444] bg-[#1f1f1f] px-3 py-2 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" />
                                        </label>
                                        <label className="grid gap-2 text-sm text-[#ababab]">
                                            {selectedIngredient.unit} per package
                                            <input required type="number" min="0.001" step="any" value={stockForm.unitsPerPackage} onChange={(event) => setStockForm((form) => ({ ...form, unitsPerPackage: event.target.value }))} placeholder={`e.g. 4 ${selectedIngredient.unit} per packet`} className="rounded-[10px] border border-[#444444] bg-[#1f1f1f] px-3 py-2 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" />
                                        </label>
                                        <label className="grid gap-2 text-sm text-[#ababab]">
                                            Stock-in date
                                            <span className="relative">
                                                <FaCalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
                                                <input required type="date" value={stockForm.stockInDate} onChange={(event) => setStockForm((form) => ({ ...form, stockInDate: event.target.value }))} className="w-full rounded-[10px] border border-[#444444] bg-[#1f1f1f] py-2 pl-9 pr-3 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" />
                                            </span>
                                        </label>
                                        <label className="grid gap-2 text-sm text-[#ababab]">
                                            Expiry date
                                            <span className="relative">
                                                <FaCalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
                                                <input type="date" min={stockForm.stockInDate} value={stockForm.expiryDate} onChange={(event) => setStockForm((form) => ({ ...form, expiryDate: event.target.value }))} className="w-full rounded-[10px] border border-[#444444] bg-[#1f1f1f] py-2 pl-9 pr-3 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" />
                                            </span>
                                        </label>
                                        <label className="grid gap-2 text-sm text-[#ababab] sm:col-span-2">
                                            Supplier
                                            <input value={stockForm.supplier} onChange={(event) => setStockForm((form) => ({ ...form, supplier: event.target.value }))} placeholder="Supplier name (optional)" className="rounded-[10px] border border-[#444444] bg-[#1f1f1f] px-3 py-2 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" />
                                        </label>
                                        <label className="grid gap-2 text-sm text-[#ababab] sm:col-span-2">
                                            Notes
                                            <textarea rows="2" value={stockForm.notes} onChange={(event) => setStockForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Optional batch notes" className="rounded-[10px] border border-[#444444] bg-[#1f1f1f] px-3 py-2 text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" />
                                        </label>
                                    </div>
                                    <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-[10px] bg-[#d3d3d3] px-4 py-2 text-sm font-semibold text-[#1a1a1a] disabled:opacity-50">
                                        <FaPlus />
                                        {isSaving ? "Saving..." : "Add stock"}
                                    </button>
                                </form>
                            </section>

                            <section className="rounded-[24px] bg-[#2a2a2a] p-5 shadow-lg">
                                <div className="mb-4">
                                    <p className="text-sm uppercase tracking-[0.16em] text-[#ababab]">Recipes</p>
                                    <h2 className="text-xl font-semibold">Where is this ingredient used?</h2>
                                    <p className="mt-1 text-sm text-[#ababab]">Enter the amount of {selectedIngredient.unit} used for each menu item. Shared ingredients deduct from the same stock.</p>
                                </div>
                                <label className="relative mb-4 block">
                                    <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-[#ababab]" />
                                    <input value={menuSearch} onChange={(event) => setMenuSearch(event.target.value)} placeholder="Search the menu" aria-label="Search menu items for recipe mapping" className="w-full rounded-[10px] border border-[#444444] bg-[#1f1f1f] py-2 pl-9 pr-3 text-sm text-[#f5f5f5] outline-none focus:border-[#d3d3d3]" />
                                </label>
                                <form onSubmit={(event) => void saveRecipes(event)}>
                                    <div className="max-h-[420px] overflow-y-auto rounded-[12px] border border-[#444444]">
                                        {filteredMenuItems.map((item) => (
                                            <label key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-[#444444] p-3 last:border-b-0">
                                                <span>
                                                    <span className="block font-medium">{item.name}</span>
                                                    <span className="text-xs text-[#ababab]">{item.category}</span>
                                                </span>
                                                <span className="flex items-center gap-2 text-xs text-[#ababab]">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        value={recipeDraft[String(item.id)] ?? ""}
                                                        onChange={(event) => setRecipeDraft((draft) => ({ ...draft, [String(item.id)]: event.target.value }))}
                                                        placeholder="Not used"
                                                        aria-label={`${selectedIngredient.name} used per ${item.name}`}
                                                        className="w-28 rounded-[8px] border border-[#444444] bg-[#1f1f1f] px-2 py-2 text-right text-sm text-[#f5f5f5] outline-none focus:border-[#d3d3d3]"
                                                    />
                                                    {selectedIngredient.unit}
                                                </span>
                                            </label>
                                        ))}
                                        {filteredMenuItems.length === 0 && <p className="p-4 text-sm text-[#ababab]">No menu items match the search.</p>}
                                    </div>
                                    <button type="submit" disabled={isSaving} className="mt-4 rounded-[10px] bg-[#d3d3d3] px-4 py-2 text-sm font-semibold text-[#1a1a1a] disabled:opacity-50">
                                        {isSaving ? "Saving..." : "Save recipe usage"}
                                    </button>
                                </form>
                            </section>

                            <section className="rounded-[24px] bg-[#2a2a2a] p-5 shadow-lg">
                                <h2 className="mb-4 text-xl font-semibold">Stock batches</h2>
                                {selectedIngredient.batches.length === 0 ? (
                                    <p className="rounded-[12px] bg-[#1f1f1f] p-4 text-sm text-[#ababab]">No stock received yet.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {[...selectedIngredient.batches].reverse().map((batch) => {
                                            const expired = batch.expiryDate && batch.expiryDate < getLocalDate() && batch.remainingQty > 0;
                                            return (
                                                <article key={batch.id} className="rounded-[14px] border border-[#444444] bg-[#1f1f1f] p-4">
                                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                                        <p className="font-semibold">{formatQuantity(batch.packagesReceived)} package{batch.packagesReceived === 1 ? "" : "s"} × {formatQuantity(batch.unitsPerPackage)} = {formatQuantity(batch.receivedQty)} {selectedIngredient.unit}</p>
                                                        <span className={`rounded-full px-2 py-1 text-xs ${expired ? "bg-[#542d2d] text-[#ffc3c3]" : "bg-[#303030] text-[#ababab]"}`}>
                                                            {expired ? "Expired" : `${formatQuantity(batch.remainingQty)} ${selectedIngredient.unit} remaining`}
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 text-sm text-[#ababab]">Received {batch.stockInDate || "date not recorded"}{batch.expiryDate ? ` · Expires ${batch.expiryDate}` : " · No expiry date"}</p>
                                                    {batch.supplier && <p className="mt-1 text-sm text-[#ababab]">Supplier: {batch.supplier}</p>}
                                                    {batch.notes && <p className="mt-1 text-sm text-[#ababab]">{batch.notes}</p>}
                                                </article>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        </div>
                    ) : (
                        <section className="flex min-h-[360px] items-center justify-center rounded-[24px] bg-[#2a2a2a] p-8 text-center text-[#ababab] shadow-lg">
                            Add an ingredient, then create stock batches and map it to menu items.
                        </section>
                    )}
                </div>
            </div>
        </main>
    );
};

const valueIsPositive = (value) => Number.isFinite(value) && value > 0;

export default Inventory;
