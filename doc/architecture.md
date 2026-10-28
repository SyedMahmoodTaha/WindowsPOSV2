# Lassi Shop POS Architecture

## Overview

Lassi Shop POS is a React point-of-sale application packaged as an Electron desktop app. Vite builds the renderer into `dist/`; Electron opens that build from disk. The renderer also supports browser development, where desktop-only services fall back to browser storage and the browser print dialog.

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

The renderer uses `HashRouter`, which supports file-based Electron loading and direct navigation to the database viewer window. The main window starts at `dist/index.html`; the separate database viewer opens that same document with the `#/sqlite-db-viewer` route.

## Runtime Layers

### Renderer

- `src/App.jsx` initializes the saved theme and hydrates desktop orders, then registers the application routes and role checks.
- `src/pages/` contains sign-in, home, order entry, tables, active orders, the completed-order archive, printer preferences, admin reporting, developer utilities, and the SQLite viewer.
- `src/components/shared/` contains shared navigation and theme behavior.
- `src/utils/` owns browser/desktop storage adapters, authentication, catalog access, order handling, printing markup, and client-side network sync.
- `src/constants/` contains shared application constants; `src/assets/` contains bundled visual assets.

Unauthenticated users are redirected to `/Auth`. The Admin role is required for `/admin-settings`, `/developer`, and `/sqlite-db-viewer`.

### Electron Main Process

`electron/main.cjs` creates the windows and registers `pfl:*` IPC handlers. `electron/preload.cjs` exposes a specific `window.pflDesktop` API through `contextBridge`; renderer Node integration is disabled and context isolation is enabled. Keep privileged file, database, printer, and network operations in the main process rather than importing Node APIs into React.

The bridge covers authentication and users, printer settings and printing, report export, catalog and table data, order persistence, database inspection/mutation, and sync configuration/order transfer.

### Persistence

| Data | Desktop source of truth | Browser development fallback |
| --- | --- | --- |
| Orders | SQLite `orders.payload` JSON | `localStorage` key `pfl-orders-v2` |
| Catalog/categories | SQLite `items` and `categories` | Catalog utility localStorage keys |
| Dining tables | SQLite `tables` | Catalog utility localStorage keys |
| Users | `users.json` in Electron userData, combined with configured accounts | Auth utility localStorage |
| Printer settings | `printer-settings.json` in Electron userData | `pfl-printer-settings-v1` |
| Network sync settings | `sync-settings.json` in Electron userData | `pfl-sync-settings-v1` |
| Theme | `localStorage` key `pfl-theme` | Same |

The WindowsPOSV1 build stores Electron data below `<appData>/Lassi Shop POS Windows` and does not import the previous `Lassi Shop POS` database. Existing data in the old folder remains untouched. The SQLite database uses WAL journaling. Its application tables are `categories`, `items`, `tables`, `users`, `orders`, and `settings`; orders are stored as serialized payloads.

`db-core.cjs` initializes the schema and seeds the menu and default tables when the `items` table is empty. `menu-seed.cjs` is the catalog seed source. A first-run Windows marker triggers a one-time order-data clear; it does not clear catalog data.

## Important Data Flows

### Orders

Order utilities update the renderer's localStorage snapshot, emit `pfl-orders-updated`, and persist the full order list to SQLite when the desktop bridge is available. At startup, `App.jsx` loads SQLite orders back into localStorage. Order screens listen for the custom update event and, where relevant, the browser `storage` event. Marking an order completed changes its status without deleting it; the active Orders screen hides it and the All Orders page linked from Admin Settings lists completed records for viewing and cashier receipt reprints.

### Printing

Order entry builds receipt HTML and calls `printOrder`. Electron resolves the configured kitchen or cashier printer, then either sends ESC/POS bytes to a network printer (default port `9100`) or silently prints an HTML receipt to an installed printer. Browser mode uses the normal browser print dialog. Printer preferences include per-destination bill template IDs and receipt fields.

### LAN Order Sync

An enabled desktop host starts a WebSocket server on the configured port (default `4099`) and listens on all interfaces. It restores the host automatically on app startup. Clients connect to `ws://<host>:<port>` and send/receive `orders-sync` messages containing the full order list. New clients receive the current host order list on connection; received orders are saved to each client database. Sync settings are saved to both desktop settings and renderer storage. This is a same-network order replication path, not a conflict-resolving database protocol; avoid editing the same order concurrently on multiple machines. Menu, table, user, and printer settings are not synchronized.

### Reports and Database Tools

The Admin settings page aggregates the locally available orders and can request an Excel workbook export from Electron. The SQLite viewer uses dedicated IPC methods to list tables, read rows, and insert, update, or delete rows. It is an administrative tool that can directly change persisted data.

## Build and Run

From the `PFL/` directory:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the Vite browser development server |
| `npm run build` | Build the renderer into `dist/` |
| `npm run desktop` | Build and launch the Electron app |
| `npm run db` | Build and launch the database viewer app flow |
| `npm run lint` | Run Oxlint |
| `npm run dist` | Build a Windows portable/installer distribution |
| `npm run build:mac` | Build the macOS arm64 directory target |

Desktop printer names can be provided through `PFL_KITCHEN_PRINTER` and `PFL_CASHIER_PRINTER`. Account defaults are configured with the `VITE_CASHIER_*` and `VITE_ADMIN_*` variables shown in `.env.example`. Use local, private values; do not add real credentials to source control or documentation.
