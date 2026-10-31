import { HashRouter as Router, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { useEffect } from "react"
import {Home, Auth, NewOrder, Orders, Settings, NetworkSync, AllOrders, BillPrintingPreferences, AdminSettings, Developer, SqliteDbViewer, Customers} from './pages'
import Header from "./components/shared/header"
import Tables from "./pages/Tables"
import { getCurrentUser } from "./utils/auth"
import { hydrateOrdersFromDb } from "./utils/orderStorage"
import { connectSyncClient, getSyncSettings } from "./utils/networkSync"
import { applyTheme, getStoredTheme } from "./components/shared/themeToggle"
function App() {
  useEffect(() => {
    applyTheme(getStoredTheme())

    let active = true;
    const initializeOrders = async () => {
      if (window.pflDesktop) {
        const wasCleaned = await window.pflDesktop.prepareCleanWindowsData?.();
        if (wasCleaned) {
          localStorage.removeItem("pfl-orders-v2");
          localStorage.removeItem("pfl-bill-sequence-v2");
        }
      }
      const settings = await getSyncSettings();
      if (!active) return;
      if (settings?.enabled && settings?.mode === "client" && settings?.host) {
        connectSyncClient(settings);
        return;
      }
      await hydrateOrdersFromDb();
    };
    void initializeOrders().catch((error) => console.error("Could not initialize POS orders:", error));
    return () => { active = false; };
  }, [])

  useEffect(() => {
    if (!window.pflDesktop?.onOrdersSynced) return undefined;
    return window.pflDesktop.onOrdersSynced((orders) => {
      if (!Array.isArray(orders)) return;
      localStorage.setItem("pfl-orders-v2", JSON.stringify(orders));
      window.dispatchEvent(new Event("pfl-orders-updated"));
    });
  }, [])

  return (
    <>
      <Router>
        <AppRoutes />
      </Router>
    </>
  )
}

function AppRoutes() {
  const location = useLocation()
  const isAuthenticated = Boolean(getCurrentUser())
  const currentUser = getCurrentUser()

  if (!isAuthenticated && location.pathname !== "/Auth") {
    return <Navigate to="/Auth" state={{ from: location.pathname }} replace />
  }

  return (
    <>
      {isAuthenticated && location.pathname === "/" && <Header />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new-order" element={<NewOrder />} />
        <Route path="/Auth" element={<Auth />} />
        <Route path="/Tables" element={<Tables />} />
        <Route path="/Orders" element={<Orders />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/network-sync" element={currentUser?.role === "Admin" ? <NetworkSync /> : <Navigate to="/" replace />} />
        <Route path="/customers" element={["Admin", "Manager"].includes(currentUser?.role) ? <Customers /> : <Navigate to="/" replace />} />
        <Route path="/all-orders" element={["Admin", "Manager"].includes(currentUser?.role) ? <AllOrders /> : <Navigate to="/" replace />} />
        <Route path="/bill-printing-preferences" element={<BillPrintingPreferences />} />
        <Route path="/admin-settings" element={currentUser?.role === "Admin" ? <AdminSettings /> : <Navigate to="/" replace />} />
        <Route path="/developer" element={["Admin", "Manager", "Assistant Manager"].includes(currentUser?.role) ? <Developer /> : <Navigate to="/" replace />} />
        <Route path="/sqlite-db-viewer" element={currentUser?.role === "Admin" ? <SqliteDbViewer /> : <Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
