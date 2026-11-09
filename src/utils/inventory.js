export const getLocalDate = (date = new Date()) => {
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 10);
};

export const createInventoryId = () => (
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

export const normalizeIngredient = (ingredient = {}) => ({
    ...ingredient,
    id: String(ingredient.id || createInventoryId()),
    name: String(ingredient.name || "").trim(),
    unit: String(ingredient.unit || "pcs").trim() || "pcs",
    enabled: ingredient.enabled !== false,
    archived: Boolean(ingredient.archived),
    lowStockThreshold: Math.max(0, Number(ingredient.lowStockThreshold || 0)),
    batches: (Array.isArray(ingredient.batches) ? ingredient.batches : []).map((batch) => ({
        ...batch,
        id: String(batch.id || createInventoryId()),
        packagesReceived: Math.max(0, Number(batch.packagesReceived || 0)),
        unitsPerPackage: Math.max(0, Number(batch.unitsPerPackage || 0)),
        receivedQty: Math.max(0, Number(batch.receivedQty || 0)),
        remainingQty: Math.max(0, Number(batch.remainingQty ?? batch.receivedQty ?? 0)),
        stockInDate: String(batch.stockInDate || ""),
        expiryDate: String(batch.expiryDate || ""),
        supplier: String(batch.supplier || ""),
        notes: String(batch.notes || ""),
    })),
    recipes: (Array.isArray(ingredient.recipes) ? ingredient.recipes : [])
        .map((recipe) => ({
            menuItemId: String(recipe.menuItemId || ""),
            quantity: Number(recipe.quantity || 0),
        }))
        .filter((recipe) => recipe.menuItemId && Number.isFinite(recipe.quantity) && recipe.quantity > 0),
    deductions: Array.isArray(ingredient.deductions) ? ingredient.deductions : [],
});

export const getIngredientStock = (ingredient, { includeExpired = true, date = getLocalDate() } = {}) => {
    const normalized = normalizeIngredient(ingredient);
    if (normalized.batches.length === 0) return Math.max(0, Number(ingredient.stockQty || 0));
    return normalized.batches.reduce((total, batch) => (
        includeExpired || !batch.expiryDate || batch.expiryDate >= date
            ? total + batch.remainingQty
            : total
    ), 0);
};

export const consumeIngredientsForOrder = (ingredients, order, date = getLocalDate()) => {
    const orderId = String(order?.id ?? "");
    if (!orderId) return { ok: false, reason: "This order has no ID; stock was not changed." };
    if (order.inventoryDeductedAt) return { ok: true, ingredients };

    const orderedQuantityByProduct = new Map();
    for (const item of Array.isArray(order.cart) ? order.cart : []) {
        const productId = String(item.productId ?? item.id ?? "").split(":")[0];
        if (!productId) continue;
        orderedQuantityByProduct.set(
            productId,
            (orderedQuantityByProduct.get(productId) || 0) + Math.max(0, Number(item.quantity || 0)),
        );
    }

    const usageByIngredient = new Map();
    for (const rawIngredient of ingredients) {
        const ingredient = normalizeIngredient(rawIngredient);
        if (!ingredient.enabled || ingredient.archived) continue;
        const alreadyDeducted = ingredient.deductions.some((deduction) => String(deduction.orderId) === orderId);
        if (alreadyDeducted) continue;
        const usage = ingredient.recipes.reduce((total, recipe) => (
            total + (orderedQuantityByProduct.get(recipe.menuItemId) || 0) * recipe.quantity
        ), 0);
        if (usage > 0) usageByIngredient.set(ingredient.id, usage);
    }

    for (const rawIngredient of ingredients) {
        const ingredient = normalizeIngredient(rawIngredient);
        const requiredQty = usageByIngredient.get(ingredient.id) || 0;
        if (!requiredQty) continue;
        const availableQty = getIngredientStock(ingredient, { includeExpired: false, date });
        if (availableQty < requiredQty) {
            return {
                ok: false,
                reason: `${ingredient.name} needs ${requiredQty} ${ingredient.unit}, but only ${availableQty} unexpired ${ingredient.unit} are available.`,
            };
        }
    }

    const nextIngredients = ingredients.map((rawIngredient) => {
        const ingredient = normalizeIngredient(rawIngredient);
        const requiredQty = usageByIngredient.get(ingredient.id) || 0;
        if (!requiredQty) return ingredient;

        let remainingToConsume = requiredQty;
        const batches = [...ingredient.batches].sort((left, right) => (
            (left.expiryDate || "9999-12-31").localeCompare(right.expiryDate || "9999-12-31")
            || left.stockInDate.localeCompare(right.stockInDate)
            || left.id.localeCompare(right.id)
        ));
        if (batches.length === 0) {
            ingredient.stockQty = Math.max(0, Number(ingredient.stockQty || 0) - requiredQty);
        } else {
            ingredient.batches = batches.map((batch) => {
                if (remainingToConsume <= 0 || (batch.expiryDate && batch.expiryDate < date)) return batch;
                const consumed = Math.min(batch.remainingQty, remainingToConsume);
                remainingToConsume -= consumed;
                return { ...batch, remainingQty: batch.remainingQty - consumed };
            });
        }
        ingredient.deductions = [
            ...ingredient.deductions,
            { orderId, quantity: requiredQty, consumedAt: new Date().toISOString() },
        ];
        return ingredient;
    });

    return { ok: true, ingredients: nextIngredients };
};
