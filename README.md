# Lassi Shop POS V2 for Windows

This folder is structured as a standalone GitHub repository, following the deployable layout of `WindowsPOSV1/`:

- The POS application is at the repository root.
- `DB-Viewer/` contains the separate standalone database viewer.
- `.github/workflows/windows-build.yml` builds and uploads both applications.
- `doc/` contains architecture, design, and project notes.

This folder name identifies the source project; it does not change the in-app version number. The POS and DB Viewer use the current V3 Windows feature source.

## GitHub Actions build

Upload or push the **contents of this folder** to the root of a GitHub repository. Do not place `WindowsPOSV2/` as a nested folder in that repository; GitHub must discover `.github/workflows/windows-build.yml` at the repository root.

Add these six repository secrets under **Settings > Secrets and variables > Actions**:

| Secret | Purpose |
| --- | --- |
| `VITE_ADMIN_NAME` | Admin display name |
| `VITE_ADMIN_USERNAME` | Admin login |
| `VITE_ADMIN_PASSWORD` | Admin password |
| `VITE_CASHIER_NAME` | Cashier display name |
| `VITE_CASHIER_USERNAME` | Cashier login |
| `VITE_CASHIER_PASSWORD` | Cashier password |

Push to `main` or `master`, or start **Windows Build** manually from the Actions tab. The workflow creates temporary `.env` files from those secrets and uploads two artifacts:

- `lassi-shop-pos-windows` — POS NSIS installer and portable executable.
- `lassi-shop-db-viewer-windows` — standalone DB Viewer installer.

The DB Viewer accepts only the POS Admin account. Its Electron process enforces Admin sign-in for reports, exports, order edits, and deletes. The workflow packages its account settings from the same secrets as the POS build.

## Updating the POS already on your PC

Pushing the repository only creates new artifacts; it does not remotely install them on an existing POS.

1. Close the POS and DB Viewer.
2. Back up `%APPDATA%\Lassi Shop POS Windows\pfl.sqlite` before installing.
3. Download the POS artifact from the successful Actions run and install the new version. If using the portable executable, close the old app and launch the new executable.
4. Install the DB Viewer artifact separately if needed.
5. Launch the POS and verify the menu, orders, and settings. Then open the DB Viewer and sign in with the POS Admin account.
6. Keep your database backup and previous installer until you confirm the update is working.

The current POS source uses `%APPDATA%\Lassi Shop POS Windows\pfl.sqlite`, matching the WindowsPOSV1 database directory. Existing data in that directory should remain in place; do not delete the folder during an update.

## Local development

Use Node.js 20 on Windows. Copy `.env.example` to `.env` in the POS root and set local account credentials, then run:

```powershell
npm ci
npm run dev
```

In another terminal, `npm run desktop` builds and opens Electron. `npm run lint` checks the POS source; `npm run build` builds the renderer.

For the DB Viewer, copy `DB-Viewer/.env.example` to `DB-Viewer/.env`, using the same credentials as the POS, then run:

```powershell
cd DB-Viewer
npm ci
npm run desktop
```

Build the POS with `npm run dist` from the repository root. Build the viewer with `npm run dist` from `DB-Viewer/`. Outputs are written to each app's `release/` folder.

Never commit `.env` files, account passwords, generated installers, or POS SQLite database files.
