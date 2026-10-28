export const ORDER_SCHEMA_VERSION = 2;

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
