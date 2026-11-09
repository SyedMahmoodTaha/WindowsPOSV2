# Project Memory

This file records verified implementation facts and constraints for future work. Update it when a lasting architecture or workflow decision changes; it is not a task backlog.

## Repository and Tooling

- The application lives in `PFL/` and is a Vite + React 19 + Electron project using JavaScript/JSX and CommonJS Electron entry files.
- React Router uses `HashRouter` to support the packaged `file://` app.
- Styling uses Tailwind CSS and custom global CSS. Icons come from `react-icons`.
- `npm run lint` runs Oxlint. `npm run build` validates and produces the renderer build. There is no test script in the current `package.json`.

## Ownership Map

- `src/App.jsx`: app initialization, route table, authentication redirects, and Admin route checks.
- `src/pages/`: user-facing POS, order, settings, and reporting pages.
- `src/utils/orderStorage.js`: order snapshot storage, receipt rendering, print routing, and local order events.
- `src/utils/catalog.js`: catalog and table storage adapters.
- `src/utils/networkSync.js`: host/client order sync behavior in the renderer.
- `electron/main.cjs`: Electron windows, IPC handlers, printer integration, report export, user/settings files, and host WebSocket service.
- `electron/preload.cjs`: explicit renderer-safe API exposed as `window.pflDesktop`.
- `electron/db-core.cjs`: SQLite schema, seeding, and database operations.
- `electron/menu-seed.cjs`: initial categories and menu items.

## Persistence Facts

- Desktop data directory is `<Electron appData>/Lassi Shop POS`; the database filename is `pfl.sqlite`.
- The app migrates an existing database from Electron's previous `userData` location only when the shared destination file does not exist.
- Orders have a JSON payload in SQLite and a renderer-side `pfl-orders-v2` localStorage snapshot. The desktop startup hydrates the snapshot from SQLite.
- Browser development uses localStorage adapters for data that is otherwise backed by Electron/SQLite. Do not assume browser storage is shared with the desktop database.
- Printer, sync, and user settings are separate JSON files under desktop `userData`. Theme preference is localStorage-backed.
- The app's account configuration is read from `.env`; editable user overrides are stored locally. Treat both as sensitive local data. Never record actual passwords in this file.

## Behavioral Constraints

- Order synchronization sends complete order-list snapshots over WebSocket, not individual transactional changes. The current flow does not implement conflict resolution or durable offline queueing.
- The host persists incoming order snapshots synchronously and broadcasts only after the save succeeds. It sends its current order list to new clients, and clients persist received snapshots locally. Host mode is restored on startup; mode changes update the client socket immediately.
- Network printer output uses raw ESC/POS over TCP (default port `9100`); installed printers use Electron's silent print API. Browser mode cannot use Electron's silent printer integration.
- Windows has a one-time marker-based startup path that clears sales orders; preserve catalog data and understand the behavior before changing its marker or initialization sequence.
- The root `PFL/tasks.md` is intentionally empty for this documentation task. Keep it empty unless the owner requests task tracking there.

## Safe Change Checklist

- Keep privileged operations behind `window.pflDesktop` and IPC; do not enable renderer Node integration.
- When changing order shape or persistence, review both `orderStorage.js` and `db-core.cjs`, then verify hydration, printing, reports, and sync assumptions.
- When changing a route, check `App.jsx` role guards and navigation paths from Home, Tables, and Orders.
- Do not commit `.env`, generated installers, `dist/`, or local user data as part of routine feature changes.
