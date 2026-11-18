const DELIVERY_ENABLED_STORAGE_KEY = "pfl-delivery-enabled-v1";

export const isDeliveryEnabled = () => (
    localStorage.getItem(DELIVERY_ENABLED_STORAGE_KEY) !== "false"
);

export const setDeliveryEnabled = (enabled) => {
    localStorage.setItem(DELIVERY_ENABLED_STORAGE_KEY, String(Boolean(enabled)));
    window.dispatchEvent(new Event("pfl-delivery-settings-updated"));
};

export const subscribeDeliveryEnabled = (callback) => {
    window.addEventListener("pfl-delivery-settings-updated", callback);
    window.addEventListener("storage", callback);
    return () => {
        window.removeEventListener("pfl-delivery-settings-updated", callback);
        window.removeEventListener("storage", callback);
    };
};
