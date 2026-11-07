const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pflDesktop", {
    authenticate: (credentials) => ipcRenderer.invoke("pfl:authenticate", credentials),
    signOut: () => ipcRenderer.invoke("pfl:sign-out"),
    getUsers: () => ipcRenderer.invoke("pfl:get-users"),
    setUsers: (users) => ipcRenderer.invoke("pfl:set-users", users),
    printOrder: (payload) => ipcRenderer.invoke("pfl:print-order", payload),
    getPrinters: () => ipcRenderer.invoke("pfl:get-printers"),
    getPrinterSettings: () => ipcRenderer.invoke("pfl:get-printer-settings"),
    setPrinterSettings: (settings) => ipcRenderer.invoke("pfl:set-printer-settings", settings),
    exportSalesReport: (payload) => ipcRenderer.invoke("pfl:export-sales-report", payload),
    getCatalog: () => ipcRenderer.invoke("pfl:get-catalog"),
    saveCatalog: (catalog) => ipcRenderer.invoke("pfl:save-catalog", catalog),
    getTables: () => ipcRenderer.invoke("pfl:get-tables"),
    saveTables: (tables) => ipcRenderer.invoke("pfl:save-tables", tables),
    getOrders: () => ipcRenderer.invoke("pfl:get-orders"),
    saveOrders: (orders) => ipcRenderer.invoke("pfl:save-orders", orders),
    onOrdersSynced: (callback) => {
        const listener = (_event, orders) => callback(orders);
        ipcRenderer.on("pfl:orders-synced", listener);
        return () => ipcRenderer.removeListener("pfl:orders-synced", listener);
    },
    getCustomers: () => ipcRenderer.invoke("pfl:get-customers"),
    getCustomerByPhone: (phone) => ipcRenderer.invoke("pfl:get-customer-by-phone", phone),
    saveCustomerNotes: ({ customerId, notes }) => ipcRenderer.invoke("pfl:save-customer-notes", { customerId, notes }),
    prepareCleanWindowsData: () => ipcRenderer.invoke("pfl:prepare-clean-windows-data"),
    openDbViewerWindow: () => ipcRenderer.invoke("pfl:open-db-viewer-window"),
    getDbTables: () => ipcRenderer.invoke("pfl:get-db-tables"),
    getDbTable: (tableName) => ipcRenderer.invoke("pfl:get-db-table", tableName),
    insertDbRow: ({ tableName, row }) => ipcRenderer.invoke("pfl:insert-db-row", { tableName, row }),
    updateDbRow: ({ tableName, idColumn, idValue, row }) => ipcRenderer.invoke("pfl:update-db-row", { tableName, idColumn, idValue, row }),
    deleteDbRow: ({ tableName, idColumn, idValue }) => ipcRenderer.invoke("pfl:delete-db-row", { tableName, idColumn, idValue }),
    getSyncSettings: () => ipcRenderer.invoke("pfl:get-sync-settings"),
    getSyncStatus: () => ipcRenderer.invoke("pfl:get-sync-status"),
    disconnectSyncClient: (clientId) => ipcRenderer.invoke("pfl:disconnect-sync-client", clientId),
    approveSyncClient: (requestId) => ipcRenderer.invoke("pfl:approve-sync-client", requestId),
    rejectSyncClient: (requestId) => ipcRenderer.invoke("pfl:reject-sync-client", requestId),
    revokeSyncClient: (clientId) => ipcRenderer.invoke("pfl:revoke-sync-client", clientId),
    setSyncSettings: (settings) => ipcRenderer.invoke("pfl:set-sync-settings", settings),
    syncOrders: (orders) => ipcRenderer.invoke("pfl:sync-orders", orders),
    applySyncState: (snapshot) => ipcRenderer.invoke("pfl:apply-sync-state", snapshot),
    onSyncState: (callback) => {
        const listener = (_event, snapshot) => callback(snapshot);
        ipcRenderer.on("pfl:sync-state", listener);
        return () => ipcRenderer.removeListener("pfl:sync-state", listener);
    },
});