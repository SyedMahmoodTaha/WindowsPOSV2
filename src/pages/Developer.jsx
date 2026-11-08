import { useEffect, useState } from "react";
import { FaArrowLeft, FaPenToSquare, FaTrashCan } from "react-icons/fa6";
import { Link, useLocation } from "react-router-dom";
import { getCurrentUser } from "../utils/auth";
import {
  readCatalog,
  readCatalogAsync,
  readTablesAsync,
  saveCatalog,
  saveTables,
} from "../utils/catalog";
import { resetBillSequence } from "../utils/orderStorage";

const isSpecialCategory = (category) => ["favourites", "favorites", "all", "frequently used"].includes(String(category).toLowerCase());

const Developer = () => {
  const location = useLocation();
  const backPath = location.state?.from === "/more-settings" ? "/more-settings" : "/";
  const user = getCurrentUser();
  const [catalog, setCatalog] = useState(readCatalog);
  const [tables, setTables] = useState([]);
  const [menuSearch, setMenuSearch] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newTable, setNewTable] = useState("");
  const [newItem, setNewItem] = useState({
    name: "",
    category: "",
    price: "",
    code: "",
    diet: "veg",
    favorite: false,
    variationNames: "",
    variationPrices: "",
  });
  const [message, setMessage] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const isAdmin = user?.role === "Admin";
  const canManageCatalog = isAdmin || user?.role === "Manager";
  const canUseDeveloperMode = isAdmin || canManageCatalog || user?.role === "Assistant Manager";

  useEffect(() => {
    readCatalogAsync().then(setCatalog);
    if (isAdmin) readTablesAsync().then(setTables);
  }, [isAdmin]);

  const menuSearchTerm = menuSearch.trim().toLowerCase();
  const filteredMenuItems = catalog.menuItems.filter((item) =>
    `${item.name} ${item.code || ""} ${item.category}`.toLowerCase().includes(menuSearchTerm),
  );

  if (!canUseDeveloperMode) {
    return (
      <main className="min-h-screen bg-[#1f1f1f] p-6 text-[#f5f5f5]">
        <p>These tools are not available to your account.</p>
      </main>
    );
  }

  const updateCatalog = async (nextCatalog) => {
    try {
      await saveCatalog(nextCatalog);
      setCatalog(nextCatalog);
      setMessage("Catalog saved");
      return true;
    } catch (error) {
      setMessage(`Could not save catalog: ${error.message}`);
      return false;
    }
  };

  const addItem = async (event) => {
    event.preventDefault();
    if (!newItem.name || !newItem.category || !newItem.price)
      return;
    const itemCode = newItem.code.trim();
    if (itemCode && catalog.menuItems.some((item) => String(item.code || "").trim() === itemCode))
      return setMessage("Item code must be unique");
    const names = newItem.variationNames
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    const prices = newItem.variationPrices
      .split(",")
      .map((price) => Number(price.trim()))
      .filter((price) => !Number.isNaN(price));
    const saved = await updateCatalog({
      ...catalog,
      menuItems: [
        ...catalog.menuItems,
        {
          ...newItem,
          code: itemCode,
          id: Date.now(),
          price: Number(newItem.price),
          variations: names.map((name, index) => ({
            name,
            price: prices[index] ?? Number(newItem.price),
          })),
          favorite: newItem.favorite,
        },
      ],
    });
    if (!saved) return;
    setNewItem({
      name: "",
      category: "",
      price: "",
      code: "",
      diet: "veg",
      favorite: false,
      variationNames: "",
      variationPrices: "",
    });
  };

  const updateItem = (id, changes) =>
    updateCatalog({
      ...catalog,
      menuItems: catalog.menuItems.map((item) =>
        item.id === id ? { ...item, ...changes } : item,
      ),
    });
  const openEditItem = (item) => {
    setEditingItem(item);
    setEditDraft({
      ...item,
      variations: (item.variations || []).map((variation) => ({
        ...variation,
      })),
    });
  };
  const updateEditDraft = (changes) =>
    setEditDraft((currentDraft) => ({ ...currentDraft, ...changes }));
  const updateEditVariation = (index, changes) =>
    setEditDraft((currentDraft) => ({
      ...currentDraft,
      variations: currentDraft.variations.map((variation, variationIndex) =>
        variationIndex === index ? { ...variation, ...changes } : variation,
      ),
    }));
  const addEditVariation = () =>
    setEditDraft((currentDraft) => ({
      ...currentDraft,
      variations: [
        ...currentDraft.variations,
        { name: "", price: currentDraft.price },
      ],
    }));
  const removeEditVariation = (index) =>
    setEditDraft((currentDraft) => ({
      ...currentDraft,
      variations: currentDraft.variations.filter(
        (_, variationIndex) => variationIndex !== index,
      ),
    }));
  const saveEditedItem = async (event) => {
    event.preventDefault();
    if (
      !editDraft.name ||
      !editDraft.category ||
      editDraft.price === ""
    )
      return setMessage("Complete all item fields");
    const itemCode = String(editDraft.code || "").trim();
    if (itemCode &&
      catalog.menuItems.some(
        (item) => item.id !== editDraft.id && String(item.code || "").trim() === itemCode,
      )
    )
      return setMessage("Item code must be unique");
    const variations = editDraft.variations
      .map((variation) => ({
        name: variation.name.trim(),
        price: Number(variation.price) || 0,
      }))
      .filter((variation) => variation.name);
    const saved = await updateItem(editDraft.id, {
      ...editDraft,
      code: itemCode,
      price: Number(editDraft.price) || 0,
      variations,
    });
    if (!saved) return;
    setEditingItem(null);
    setEditDraft(null);
  };
  const deleteItem = async (id) =>
    updateCatalog({
      ...catalog,
      menuItems: catalog.menuItems.filter((item) => item.id !== id),
    });
  const addCategory = async (event) => {
    event.preventDefault();
    const category = newCategory.trim();
    if (!category) return;
    if (isSpecialCategory(category)) {
      setMessage("That category name is reserved by the POS.");
      return;
    }
    if (catalog.categories.some((candidate) => candidate.toLowerCase() === category.toLowerCase())) {
      setMessage("That category already exists.");
      return;
    }
    if (category) {
      const saved = await updateCatalog({
        ...catalog,
        categories: [...catalog.categories, category],
      });
      if (!saved) return;
    }
    setNewCategory("");
  };
  const deleteCategory = async (category) => {
    const categoryKey = category.toLowerCase();
    const fallbackCategory = catalog.categories.find((candidate) =>
      !isSpecialCategory(candidate)
      && candidate.toLowerCase() !== categoryKey,
    );
    const affectedItems = catalog.menuItems.filter((item) => String(item.category || "").toLowerCase() === categoryKey);
    if (affectedItems.length > 0 && !fallbackCategory && categoryKey === "uncategorized") {
      setMessage("Add another category before deleting Uncategorized items.");
      return;
    }

    const nextFallbackCategory = fallbackCategory || "Uncategorized";
    const confirmation = affectedItems.length
      ? `Delete "${category}"? ${affectedItems.length} menu item${affectedItems.length === 1 ? "" : "s"} will be moved to "${nextFallbackCategory}".`
      : `Delete "${category}"?`;
    if (!window.confirm(confirmation)) return;

    const nextCategories = catalog.categories.filter((candidate) => candidate.toLowerCase() !== categoryKey);
    if (affectedItems.length > 0 && !nextCategories.some((candidate) => candidate.toLowerCase() === nextFallbackCategory.toLowerCase())) {
      nextCategories.push(nextFallbackCategory);
    }
    await updateCatalog({
      ...catalog,
      categories: nextCategories,
      menuItems: catalog.menuItems.map((item) => (
        String(item.category || "").toLowerCase() === categoryKey
          ? { ...item, category: nextFallbackCategory }
          : item
      )),
    });
  };
  const addTable = async (event) => {
    event.preventDefault();
    const table = newTable.trim().toUpperCase();
    if (table && !tables.includes(table)) {
      const nextTables = [...tables, table];
      try {
        await saveTables(nextTables);
        setTables(nextTables);
        setMessage("Tables saved");
      } catch (error) {
        setMessage(`Could not save tables: ${error.message}`);
      }
    }
    setNewTable("");
  };
  const deleteTable = async (table) => {
    const nextTables = tables.filter((candidate) => candidate !== table);
    try {
      await saveTables(nextTables);
      setTables(nextTables);
      setMessage("Tables saved");
    } catch (error) {
      setMessage(`Could not save tables: ${error.message}`);
    }
  };
  const resetBill = () => {
    if (
      !window.confirm(
        "Reset bill numbering to 001? All sales data will be preserved.",
      )
    )
      return;
    resetBillSequence();
    setMessage("Bill numbering reset to 001");
  };
  return (
    <main className="min-h-screen bg-[#1f1f1f] px-4 py-6 text-[#f5f5f5] sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center gap-4">
          <Link
            to={backPath}
            className="rounded-full p-3 text-[#d3d3d3] hover:bg-[#d3d3d3] hover:text-[#1a1a1a]"
            aria-label={backPath === "/more-settings" ? "Back to More Settings" : "Back to home"}
          >
            <FaArrowLeft />
          </Link>
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-[#ababab]">
              {isAdmin ? "Admin tools" : user.role === "Manager" ? "Manager tools" : "Account"}
            </p>
            <h1 className="text-3xl font-semibold">{isAdmin ? "Developer Mode" : user.role === "Manager" ? "Menu Management" : "My Password"}</h1>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {canManageCatalog && <>
          <section className="rounded-[20px] bg-[#2a2a2a] p-5">
            <h2 className="mb-4 text-xl font-semibold">
              Menu items and pricing
            </h2>
            <form onSubmit={addItem} className="grid gap-2 sm:grid-cols-2">
              <input
                required
                placeholder="Item name"
                value={newItem.name}
                onChange={(e) =>
                  setNewItem({ ...newItem, name: e.target.value })
                }
                className="field"
              />
              <input
                placeholder="Code (optional)"
                value={newItem.code}
                onChange={(e) =>
                  setNewItem({ ...newItem, code: e.target.value })
                }
                className="field"
              />
              <div className="relative h-10 self-start">
                <select
                  required
                  aria-label="Category"
                  value={newItem.category}
                  onChange={(e) =>
                    setNewItem({ ...newItem, category: e.target.value })
                  }
                  className="field w-full"
                >
                  <option value="">Category</option>
                  {catalog.categories
                    .filter((category) => !isSpecialCategory(category))
                    .map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                </select>
              </div>
              <select
                aria-label="Diet"
                value={newItem.diet}
                onChange={(e) =>
                  setNewItem({ ...newItem, diet: e.target.value })
                }
                className="field w-full"
              >
                <option value="veg">Vegetarian</option>
                <option value="non-veg">Non-vegetarian</option>
              </select>
              <input
                required
                type="text"
                inputMode="decimal"
                placeholder="Base price"
                value={newItem.price}
                onChange={(e) =>
                  setNewItem({ ...newItem, price: e.target.value })
                }
                className="field"
              />
              <label className="flex items-center gap-2 text-sm text-[#ababab]">
                <input
                  type="checkbox"
                  checked={newItem.favorite}
                  onChange={(e) =>
                    setNewItem({ ...newItem, favorite: e.target.checked })
                  }
                />
                Favourite
              </label>
              <input
                placeholder="Variations: Small, Regular, Large, etc."
                value={newItem.variationNames}
                onChange={(e) =>
                  setNewItem({ ...newItem, variationNames: e.target.value })
                }
                className="field"
              />
              <input
                placeholder="Variation prices: 100, 150, 200"
                value={newItem.variationPrices}
                onChange={(e) =>
                  setNewItem({ ...newItem, variationPrices: e.target.value })
                }
                className="field"
              />
              <button className="rounded-[10px] bg-[#d3d3d3] px-3 py-2 text-sm font-semibold text-[#1a1a1a] sm:col-span-2">
                Add item
              </button>
            </form>
            <label className="mt-4 grid gap-2 text-sm text-[#ababab]">
              Search menu items
              <input
                type="search"
                value={menuSearch}
                onChange={(event) => setMenuSearch(event.target.value)}
                placeholder="Search name, code, or category"
                className="field"
              />
            </label>
            <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto overscroll-contain pr-2">
              {filteredMenuItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-[10px] bg-[#333333] px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="truncate text-xs text-[#ababab]">
                      {item.code ? `Code ${item.code} · ` : ""}{item.category} · Base {item.price}
                      {item.variations?.length
                        ? ` · ${item.variations.length} variation${item.variations.length === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditItem(item)}
                      className="flex size-8 items-center justify-center rounded-[8px] text-[#d3d3d3] hover:bg-[#d3d3d3] hover:text-[#1a1a1a]"
                      aria-label={`Edit ${item.name}`}
                      title="Edit item"
                    >
                      <FaPenToSquare />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteItem(item.id)}
                      className="flex size-8 items-center justify-center rounded-[8px] text-[#f08080] hover:bg-[#f08080] hover:text-[#1a1a1a]"
                      aria-label={`Delete ${item.name}`}
                      title="Delete item"
                    >
                      <FaTrashCan />
                    </button>
                  </div>
                </div>
              ))}
              {filteredMenuItems.length === 0 && (
                <p className="rounded-[10px] bg-[#333333] px-3 py-4 text-sm text-[#ababab]">
                  No menu items match this search.
                </p>
              )}
            </div>
          </section>
          <section className="rounded-[20px] bg-[#2a2a2a] p-5">
            <h2 className="mb-4 text-xl font-semibold">Categories</h2>
            <form onSubmit={addCategory} className="flex gap-2">
              <input
                required
                placeholder="New category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="field min-w-0 flex-1"
              />
              <button className="rounded-[10px] bg-[#d3d3d3] px-3 py-2 text-sm font-semibold text-[#1a1a1a]">
                Add
              </button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {catalog.categories
                .filter((category) => !isSpecialCategory(category))
                .map((category) => (
                  <span
                    key={category}
                    className="flex items-center gap-2 rounded-full bg-[#3a3a3a] px-3 py-2 text-sm"
                  >
                    {category}
                    <button
                      type="button"
                      onClick={() => deleteCategory(category)}
                      aria-label={`Delete category ${category}`}
                      title="Delete category"
                      className="flex size-5 items-center justify-center rounded-full text-[#f08080] hover:bg-[#f08080] hover:text-[#1a1a1a]"
                    >
                      <FaTrashCan className="size-3" />
                    </button>
                  </span>
                ))}
            </div>
          </section>
          </>}
          {isAdmin && <section className="rounded-[20px] bg-[#2a2a2a] p-5">
            <h2 className="mb-4 text-xl font-semibold">Tables</h2>
            <form onSubmit={addTable} className="flex gap-2">
              <input
                required
                placeholder="Table name"
                value={newTable}
                onChange={(e) => setNewTable(e.target.value)}
                className="field min-w-0 flex-1"
              />
              <button className="rounded-[10px] bg-[#d3d3d3] px-3 py-2 text-sm font-semibold text-[#1a1a1a]">
                Add
              </button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {tables.map((table) => (
                <span
                  key={table}
                  className="flex items-center gap-2 rounded-full bg-[#3a3a3a] px-3 py-2 text-sm"
                >
                  {table}
                  <button
                    type="button"
                    onClick={() => deleteTable(table)}
                    aria-label={`Delete table ${table}`}
                    className="text-[#f08080]"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          </section>}
        </div>
        {isAdmin && (
          <section className="mt-4 rounded-[20px] border border-[#553838] bg-[#2a2a2a] p-5">
            <h2 className="text-lg font-semibold">Bill numbering</h2>
            <p className="mt-1 text-sm text-[#ababab]">
              Reset the bill counter back to 001. All sales data and reports are
              preserved.
            </p>
            <button
              type="button"
              onClick={resetBill}
              className="mt-4 rounded-[10px] bg-[#f08080] px-4 py-2 text-sm font-semibold text-[#1a1a1a] hover:bg-[#ff9b9b]"
            >
              Reset bill numbering
            </button>
          </section>
        )}
        {editingItem && editDraft && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-item-title"
          >
            <form
              onSubmit={saveEditedItem}
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[20px] bg-[#2a2a2a] p-5 shadow-2xl"
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.16em] text-[#ababab]">
                    Menu item
                  </p>
                  <h2 id="edit-item-title" className="text-xl font-semibold">
                    Edit {editingItem.name}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingItem(null);
                    setEditDraft(null);
                  }}
                  className="rounded-full p-2 text-xl text-[#ababab] hover:bg-[#3a3a3a]"
                  aria-label="Close edit item"
                >
                  &times;
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm text-[#ababab]">
                  Name
                  <input
                    required
                    value={editDraft.name}
                    onChange={(event) =>
                      updateEditDraft({ name: event.target.value })
                    }
                    className="field"
                  />
                </label>
                <label className="grid gap-1 text-sm text-[#ababab]">
                  Code
                  <input
                    value={editDraft.code}
                    onChange={(event) =>
                      updateEditDraft({ code: event.target.value })
                    }
                    className="field"
                  />
                </label>
                <label className="grid gap-1 text-sm text-[#ababab]">
                  Category
                  <div className="relative">
                    <select
                      required
                      value={editDraft.category}
                      onChange={(event) =>
                        updateEditDraft({ category: event.target.value })
                      }
                      className="field w-full"
                    >
                      <option value="">Category</option>
                      {catalog.categories
                        .filter((category) => !isSpecialCategory(category))
                        .map((category) => (
                          <option key={category}>{category}</option>
                        ))}
                    </select>
                  </div>
                </label>
                <label className="grid gap-1 text-sm text-[#ababab]">
                  Base price
                  <input
                    required
                    type="text"
                    inputMode="decimal"
                    value={editDraft.price}
                    onChange={(event) =>
                      updateEditDraft({ price: event.target.value })
                    }
                    className="field"
                  />
                </label>
                <label className="grid gap-1 text-sm text-[#ababab]">
                  Diet
                  <div className="relative">
                    <select
                      value={editDraft.diet || "veg"}
                      onChange={(event) =>
                        updateEditDraft({ diet: event.target.value })
                      }
                      className="field w-full"
                    >
                      <option value="veg">Vegetarian</option>
                      <option value="non-veg">Non-vegetarian</option>
                    </select>
                  </div>
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-[#ababab]">
                  <input
                    type="checkbox"
                    checked={Boolean(editDraft.favorite)}
                    onChange={(event) =>
                      updateEditDraft({ favorite: event.target.checked })
                    }
                  />{" "}
                  Favourite
                </label>
              </div>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold">Variations</h3>
                  <button
                    type="button"
                    onClick={addEditVariation}
                    className="rounded-[10px] border border-[#555555] px-3 py-2 text-sm text-[#d3d3d3]"
                  >
                    Add variation
                  </button>
                </div>
                <div className="space-y-2">
                  {editDraft.variations.map((variation, index) => (
                    <div
                      key={`${editingItem.id}-variation-${index}`}
                      className="flex items-end gap-2"
                    >
                      <label className="grid min-w-0 flex-1 gap-1 text-sm text-[#ababab]">
                        Name
                        <input
                          value={variation.name}
                          onChange={(event) =>
                            updateEditVariation(index, {
                              name: event.target.value,
                            })
                          }
                          className="field"
                        />
                      </label>
                      <label className="grid w-28 gap-1 text-sm text-[#ababab]">
                        Price
                        <input
                          type="text"
                          inputMode="decimal"
                          value={variation.price}
                          onChange={(event) =>
                            updateEditVariation(index, {
                              price: event.target.value,
                            })
                          }
                          className="field"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeEditVariation(index)}
                        className="flex size-[38px] shrink-0 items-center justify-center self-end rounded-[10px] text-[#f08080] hover:bg-[#f08080] hover:text-[#1a1a1a]"
                        aria-label={`Remove ${variation.name || "variation"}`}
                      >
                        <FaTrashCan />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingItem(null);
                    setEditDraft(null);
                  }}
                  className="rounded-[10px] px-4 py-2 text-sm text-[#ababab] hover:bg-[#3a3a3a]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-[10px] bg-[#d3d3d3] px-4 py-2 text-sm font-semibold text-[#1a1a1a]"
                >
                  Save changes
                </button>
              </div>
            </form>
          </div>
        )}
        {message && <p className="mt-4 text-sm text-[#a7d7a7]">{message}</p>}
      </div>
    </main>
  );
};

export default Developer;
