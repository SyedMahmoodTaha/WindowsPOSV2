# DB Viewer for Windows

For local development, copy `.env.example` to `.env` and match the POS Admin/Cashier credentials. The GitHub Actions workflow creates this file from the same Admin/Cashier secrets as the POS build. Only Admin accounts can sign in or use reports, export, order editing, or deletion. Run `npm ci`, then `npm run desktop` to launch the viewer from source. Run `npm run dist` on Windows to create the x64 NSIS installer. Artifacts are written under `../release/windows/`.

The viewer accesses `%APPDATA%\Lassi Shop POS Windows\pfl.sqlite`, shared with the Windows V3 POS.
