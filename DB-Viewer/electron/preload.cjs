const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dbViewerApi", {
    authenticate: (credentials) => ipcRenderer.invoke("pfl:authenticate", credentials),
    signOut: () => ipcRenderer.invoke("pfl:sign-out"),
    getSalesOverview: () => ipcRenderer.invoke("pfl:get-sales-overview"),
    getSalesReport: () => ipcRenderer.invoke("pfl:get-sales-report"),
    exportSalesReport: (payload) => ipcRenderer.invoke("pfl:export-sales-report", payload),
    updateOrderRecord: (payload) => ipcRenderer.invoke("pfl:update-order-record", payload),
    deleteOrderRecord: (payload) => ipcRenderer.invoke("pfl:delete-order-record", payload),
});
