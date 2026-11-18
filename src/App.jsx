import { lazy, Suspense, useEffect, useState } from "react"
import { HashRouter as Router, Navigate, Route, Routes, useLocation } from "react-router-dom"
import Header from "./components/shared/header"
import { getCurrentUser } from "./utils/auth"
import { hydrateOrdersFromDb } from "./utils/orderStorage"
import { applySyncSnapshot, connectSyncClient, getSyncSettings } from "./utils/networkSync"
import { applyTheme, getStoredTheme } from "./components/shared/themeToggle"

const Home = lazy(() => import("./pages/Home.jsx"))
const Auth = lazy(() => import("./pages/Auth.jsx"))
const NewOrder = lazy(() => import("./pages/NewOrder.jsx"))
const Orders = lazy(() => import("./pages/Orders.jsx"))
const Settings = lazy(() => import("./pages/Settings.jsx"))
const NetworkSync = lazy(() => import("./pages/NetworkSync.jsx"))
const AllOrders = lazy(() => import("./pages/AllOrders.jsx"))
const BillPrintingPreferences = lazy(() => import("./pages/BillPrintingPreferences.jsx"))
const AdminSettings = lazy(() => import("./pages/AdminSettings.jsx"))
const Developer = lazy(() => import("./pages/Developer.jsx"))
const Staff = lazy(() => import("./pages/Staff.jsx"))
const MyAccount = lazy(() => import("./pages/MyAccount.jsx"))
const Customers = lazy(() => import("./pages/Customers.jsx"))
const Inventory = lazy(() => import("./pages/Inventory.jsx"))
const MoreSettings = lazy(() => import("./pages/MoreSettings.jsx"))
const QuickActionSettings = lazy(() => import("./pages/QuickActionSettings.jsx"))
const Tables = lazy(() => import("./pages/Tables.jsx"))
const Delivery = lazy(() => import("./pages/Delivery.jsx"))

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

  useEffect(() => {
    if (!window.pflDesktop?.onSyncState) return undefined;
    return window.pflDesktop.onSyncState((snapshot) => {
      void applySyncSnapshot(snapshot, false);
    });
  }, [])

  useEffect(() => {
    if (!import.meta.env.VITE_FIREBASE_API_KEY
      || !import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
      || !import.meta.env.VITE_FIREBASE_PROJECT_ID
      || !import.meta.env.VITE_FIREBASE_APP_ID) return undefined;
    let active = true;
    let stopOrderListener;
    void import("./utils/deliveryCloud").then(({ startDeliveryOrderSync }) => {
      if (active) {
        stopOrderListener = startDeliveryOrderSync();
      }
    }).catch((error) => console.error("Could not start delivery cloud sync:", error));
    return () => {
      active = false;
      stopOrderListener?.();
    };
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
  const [deliveryVisited, setDeliveryVisited] = useState(location.pathname === "/delivery")
  const canAccessDelivery = ["Admin", "Manager"].includes(currentUser?.role)
  const isDeliveryRoute = location.pathname === "/delivery"

  if (!isAuthenticated && location.pathname !== "/Auth") {
    return <Navigate to="/Auth" state={{ from: location.pathname }} replace />
  }

  return (
    <>
      {isAuthenticated && location.pathname === "/" && <Header />}
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#1f1f1f] text-[#ababab]">Loading...</div>}>
        {isAuthenticated && canAccessDelivery && (deliveryVisited || isDeliveryRoute) && (
          <div className={isDeliveryRoute ? "" : "hidden"}>
            <Delivery />
          </div>
        )}
        <Routes>
          <Route path="/" element={<Home onDeliveryOpen={() => setDeliveryVisited(true)} />} />
          <Route path="/new-order" element={<NewOrder />} />
          <Route path="/Auth" element={<Auth />} />
          <Route path="/Tables" element={<Tables />} />
          <Route path="/Orders" element={<Orders />} />
          <Route path="/delivery" element={canAccessDelivery ? null : <Navigate to="/" replace />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/network-sync" element={currentUser?.role === "Admin" ? <NetworkSync /> : <Navigate to="/" replace />} />
          <Route path="/customers" element={["Admin", "Manager", "Assistant Manager"].includes(currentUser?.role) ? <Customers /> : <Navigate to="/" replace />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/more-settings" element={<MoreSettings />} />
          <Route path="/quick-action-settings" element={<QuickActionSettings />} />
          <Route path="/all-orders" element={["Admin", "Manager", "Assistant Manager"].includes(currentUser?.role) ? <AllOrders /> : <Navigate to="/" replace />} />
          <Route path="/bill-printing-preferences" element={<BillPrintingPreferences />} />
          <Route path="/admin-settings" element={currentUser?.role === "Admin" ? <AdminSettings /> : <Navigate to="/" replace />} />
          <Route path="/developer" element={["Admin", "Manager", "Assistant Manager"].includes(currentUser?.role) ? <Developer /> : <Navigate to="/" replace />} />
          <Route path="/staff-users" element={["Admin", "Manager"].includes(currentUser?.role) ? <Staff /> : <Navigate to="/" replace />} />
          <Route path="/my-account" element={<MyAccount />} />
        </Routes>
      </Suspense>
    </>
  )
}

export default App
