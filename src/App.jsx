import { HashRouter as Router, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { useEffect } from "react"
import {Home, Auth, NewOrder, Orders, Settings, AllOrders, BillPrintingPreferences, AdminSettings, Developer, SqliteDbViewer, Customers} from './pages'
import Header from "./components/shared/header"
import Tables from "./pages/Tables"
import { getCurrentUser } from "./utils/auth"
import { hydrateOrdersFromDb } from "./utils/orderStorage"
import { connectSyncClient, getSyncSettings } from "./utils/networkSync"
import { applyTheme, getStoredTheme } from "./components/shared/themeToggle"
function App() {
  useEffect(() => {
    applyTheme(getStoredTheme())

    const hydrate = async () => {
      if (!window.pflDesktop || !window.pflDesktop.getOrders) return;
      const wasCleaned = await window.pflDesktop.prepareCleanWindowsData?.();
      if (wasCleaned) {
        localStorage.removeItem("pfl-orders-v2");
        localStorage.removeItem("pfl-bill-sequence-v2");
      }
      await hydrateOrdersFromDb();
    };
    void hydrate();
  }, [])

  useEffect(() => {
    const initSync = async () => {
      const settings = await getSyncSettings();
      if (settings?.mode === "client" && settings?.host) {
        connectSyncClient(settings);
      }
    };
    void initSync();
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
