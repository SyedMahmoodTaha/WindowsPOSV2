# Operational Tasks and Verification

This guide describes the main staff and administrator tasks supported by the current application, followed by a compact release smoke check. It is a practical workflow reference, not a prioritized backlog.

## Staff Tasks

### Sign In

1. Open Lassi Shop POS and enter the configured username and password.
2. Confirm the correct landing route opens. A user without an active session is redirected to sign-in.
3. Use the account role assigned by the administrator; admin-only pages are not available to cashier accounts.

### Take and Save an Order

1. From Home, open New Order.
2. Select Table, Parcel, Takeaway, or Delivery and provide the fields shown for that type.
3. Search or browse the menu, select any required item variation, and adjust the cart quantities.
4. Add item/order notes when needed and confirm charges and the final amount.
5. Save the order, or use the applicable kitchen/cashier print action. Verify the expected printer received the output.

### Work a Table

1. Open Tables and choose an available table to start an order.
2. For an occupied table, view or continue its order, print the kitchen KOT, or settle the bill.
3. During settlement, enter the amount paid and verify the displayed change before completing or saving and printing.

### Process Saved Orders

1. Open Orders and select Parcel/Takeaway, Deliveries, or Tables.
2. Reopen an editable order to update its cart or details.
3. Mark an order completed when service is finished; verify it leaves the active queue.
4. Open Admin Settings > All Orders to find completed orders, inspect their details, or reprint the cashier receipt.

## Administrator Tasks

### Configure Printers

1. Open Settings and choose an installed printer or enter a network printer IP and port for each destination.
2. Open Bill Printing Preferences and select or configure the kitchen/cashier templates and receipt fields.
3. Save the configuration and print a representative KOT and receipt to verify the selected output.

### Configure LAN Sync

1. On the primary machine, enable sync and choose Host mode.
2. On each secondary machine, enable sync and choose Client mode with the host's LAN address and matching port (default `4099`).
3. Confirm the machines can reach one another on the local network, then create a test order and confirm the order list updates on both sides.
4. Avoid editing the same order on multiple machines at once; snapshot sync has no conflict resolution.

### Review and Export Sales

1. Open Admin Settings and review the available sales summaries.
2. Export the report and confirm the generated workbook includes the Overview and Recent Orders sheets.

## Development and Release Checks

Run commands from the `PFL/` directory:

```sh
npm run lint
npm run build
```

For desktop-specific verification, run `npm run desktop` after the build. Check sign-in and role restrictions, new order creation, table occupancy/settlement, active order completion, theme persistence, printer settings, report export, and database-viewer access as applicable to the change.

For a Windows distribution, use `npm run dist`; for the macOS arm64 directory build, use `npm run build:mac`. Verify the generated artifact on the target OS because browser development does not exercise Electron printing, userData persistence, or packaged resource paths.

## Change Acceptance Checklist

- The affected workflow works for its intended role and does not expose admin-only routes to cashiers.
- Order totals, required order details, and status transitions remain consistent between the UI and persisted order data.
- Changes to desktop persistence are checked separately from browser localStorage fallback behavior.
- Printer, export, or sync changes are tested in Electron, not only in the browser.
- `npm run lint` and `npm run build` pass for application changes.
- No real credentials, local databases, or generated release artifacts are added to source control.
