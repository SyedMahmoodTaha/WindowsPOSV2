export const ORDER_SCHEMA_VERSION = 2;

export const getFrequentlyUsedItems = (menuItems, orders) => {
    const usageByProductId = new Map();
    for (const order of orders) {
        if (String(order.status || "").toLowerCase() !== "completed") continue;
        for (const item of Array.isArray(order.cart) ? order.cart : []) {
            const productId = item.productId ?? (
                typeof item.id === "number" ? item.id : String(item.id ?? "").split(":")[0]
            );
            if (productId === undefined || productId === null || productId === "") continue;
            const quantity = Math.max(0, Number(item.quantity) || 0);
            const key = String(productId);
            usageByProductId.set(key, (usageByProductId.get(key) || 0) + quantity);
        }
    }

    return menuItems
        .map((item, index) => ({ item, index, count: usageByProductId.get(String(item.id)) || 0 }))
        .filter(({ count }) => count > 0)
        .sort((left, right) => right.count - left.count || left.index - right.index)
        .map(({ item }) => item);
};

export const createDeliveryDispatch = (previous = {}) => ({
    schemaVersion: 1,
    status: previous.status || "unassigned",
    riderId: previous.riderId || null,
    assignedAt: previous.assignedAt || null,
    acceptedAt: previous.acceptedAt || null,
    pickedUpAt: previous.pickedUpAt || null,
    deliveredAt: previous.deliveredAt || null,
    externalDeliveryId: previous.externalDeliveryId || null,
});
