# Tyep POS Architecture

## Overview

Tyep is a React point-of-sale application packaged as an Electron desktop app. Vite builds the renderer into `dist/`; Electron opens that build from disk. The renderer also supports browser development, where desktop-only services fall back to browser storage and the browser print dialog.

```text
React renderer
	pages, components, utils
			 | window.pflDesktop (preload API)
			 | IPC invoke/handle
Electron main process
	window lifecycle, printing, exports, sync server
			 | better-sqlite3
SQLite database in Electron userData
```

The renderer uses `HashRouter`, which supports file-based Electron loading. The main window starts at `dist/index.html`.

## Runtime Layers

### Renderer

- `src/App.jsx` initializes the saved theme and hydrates desktop orders, then registers the application routes and role checks.
- `src/pages/` contains sign-in, home, personal account settings, order entry, tables, active orders, the completed-order archive, staff profiles, printer preferences, admin reporting, and developer utilities.
- `src/components/shared/` contains shared navigation and theme behavior.
- `src/utils/` owns browser/desktop storage adapters, authentication, catalog access, order handling, printing markup, and client-side network sync.
- `src/constants/` contains shared application constants; `src/assets/` contains bundled visual assets.

Unauthenticated users are redirected to `/Auth`. Admin-only routes include `/admin-settings` and `/developer`. All signed-in users can update their own name, photo, contact details, and password. Admins can manage POS login accounts and separate shop-staff profiles; Managers can view the staff directory except Admin accounts.

### Electron Main Process

`electron/main.cjs` creates the windows and registers `pfl:*` IPC handlers. `electron/preload.cjs` exposes a specific `window.pflDesktop` API through `contextBridge`; renderer Node integration is disabled and context isolation is enabled. Keep privileged file, database, printer, and network operations in the main process rather than importing Node APIs into React.

The bridge covers authentication and users, printer settings and printing, report export, catalog and table data, order persistence, shop-staff data, and sync configuration/order transfer.

### Persistence

| Data | Desktop source of truth | Browser development fallback |
| --- | --- | --- |
| Orders | SQLite `orders.payload` JSON | `localStorage` key `pfl-orders-v2` |
| Catalog/categories | SQLite `items` and `categories` | Catalog utility localStorage keys |
| Inventory ingredients, stock batches, and recipes | SQLite `settings` key `inventory-ingredients` | Catalog utility localStorage key |
| Dining tables | SQLite `tables` | Catalog utility localStorage keys |
| POS login accounts | `users.json` in Electron userData, combined with configured accounts | Auth utility localStorage |
| Shop-staff profiles | `shop-staff.json` in Electron userData | `pfl-shop-staff-v1` |
| Printer settings | `printer-settings.json` in Electron userData | `pfl-printer-settings-v1` |
| Network sync settings | `sync-settings.json` in Electron userData | `pfl-sync-settings-v1` |
| Theme | `localStorage` key `pfl-theme` | Same |

Electron data is stored below `<appData>/Lassi Shop POS`. This existing data directory is retained across the user-facing rename to Tyep so existing installations keep their data. The application changes Electron's `userData` path to this shared directory and copies a legacy `pfl.sqlite` file there if the target database does not already exist. The SQLite database uses WAL journaling. Its application tables are `categories`, `items`, `tables`, `users`, `orders`, and `settings`; orders are stored as serialized payloads.

`db-core.cjs` initializes the schema and seeds the menu and default tables when the `items` table is empty. `menu-seed.cjs` is the catalog seed source. A first-run Windows marker triggers a one-time order-data clear; it does not clear catalog data.

## Important Data Flows

### Orders

Order utilities update the renderer's localStorage snapshot, emit `pfl-orders-updated`, and persist the full order list to SQLite when the desktop bridge is available. At startup, `App.jsx` loads SQLite orders back into localStorage. Order screens listen for the custom update event and, where relevant, the browser `storage` event. Marking an order completed consumes its configured recipe quantities from shared ingredient batches, using earliest-expiring unexpired stock first; a shortage prevents completion, and an order's inventory deduction is recorded to prevent duplicate consumption. Saving an order or sending KOT does not deduct stock. Completed orders remain available from All Orders for viewing and cashier receipt reprints.

### Inventory

Inventory records ingredients separately from menu items. Each ingredient has a base unit, stock-in batches, package-to-base-unit conversion, stock-in and expiry dates, supplier and notes, an enable/disable control, and recipe mappings to any number of menu items. Multiple recipes consume the same ingredient balance. A global inventory-enabled setting controls whether POS completion validates or deducts any inventory; it defaults to enabled and is persisted and synchronized with the catalog. Discontinued ingredients can be archived to remove them from the active list without losing stock, recipe, or deduction history; permanent deletion is limited to ingredients with no history or recipe links. Inventory search and active/archived filters keep large catalogs manageable. Ingredient data is included in catalog sync and persisted in SQLite on desktop; browser development stores it with the local catalog.

### Printing

Order entry builds receipt HTML and calls `printOrder`. Electron resolves the configured kitchen or cashier printer, then either sends ESC/POS bytes to a network printer (default port `9100`) or silently prints an HTML receipt to an installed printer. Browser mode uses the normal browser print dialog. Printer preferences include per-destination bill template IDs and receipt fields.

### LAN Data Sync

An enabled desktop host starts a WebSocket server on the configured port (default `4099`) and listens on all interfaces. It restores the host automatically on app startup. A connected client receives a full snapshot of catalog, dining tables, orders, POS accounts and their profile details, shop-staff profiles, and shared printer preferences. Client changes to shared data are sent as typed updates and applied by the host, then propagated in later snapshots. Local printer device selections remain on each device. This is a same-network replication path, not a conflict-resolving database protocol; avoid editing the same record concurrently on multiple machines.

### Reports

The Admin settings page aggregates the locally available orders and can request an Excel workbook export from Electron.

## Build and Run

From the `PFL/` directory:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the Vite browser development server |
| `npm run build` | Build the renderer into `dist/` |
| `npm run desktop` | Build and launch the Electron app |
| `npm run lint` | Run Oxlint |
| `npm run dist` | Build a Windows portable/installer distribution |
| `npm run build:mac` | Build the macOS arm64 directory target |

Desktop printer names can be provided through `PFL_KITCHEN_PRINTER` and `PFL_CASHIER_PRINTER`. Account defaults are configured with the `VITE_CASHIER_*` and `VITE_ADMIN_*` variables shown in `.env.example`. Use local, private values; do not add real credentials to source control or documentation.
