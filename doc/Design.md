# Product and Interface Design

## Product Context

Lassi Shop POS is an operational point-of-sale tool for taking counter, takeaway, parcel, delivery, and table orders. Its primary environment is a desktop Electron window used during service, with responsive layouts for smaller screens and a browser mode for development.

The interface should favor quick scanning and low-friction repeated actions. Order type, table occupancy, order status, item quantities, and totals need to remain legible at a glance. Admin and setup workflows are secondary to order entry and should not compete with it visually.

## Navigation and Roles

- Sign-in is the unauthenticated entry point. The app redirects unauthenticated routes to `/Auth` and returns to the requested route after successful sign-in.
- Home provides quick actions for new orders, tables, orders, and printer setup.
- Admin users additionally see reporting, network sync, and developer/database tools.
- Admin-only routes are `/admin-settings`, `/developer`, and `/sqlite-db-viewer`; non-admin users are redirected home.
- Order entry can be opened with a preselected table, menu item, or existing order. Tables and Orders preserve a return path when opening an order.

## Key Workflows

### Create an Order

1. Choose a service type: Table, Parcel, Takeaway, or Delivery.
2. Browse menu categories or search the catalog; choose a variation when an item offers one.
3. Adjust quantities, add item notes, and enter customer/table details as required by the service type.
4. Review charges and totals, then save the order or print a kitchen KOT/cashier bill.
5. Held orders can be resumed from the order-entry flow.

### Manage Tables and Orders

Tables shows available and occupied table tiles. Occupied tables offer view, kitchen print, and bill settlement actions. Orders separates active Parcel/Takeaway, Delivery, and Table orders; orders can be reopened or marked completed. Completed orders remain available from All Orders linked in Admin Settings, where staff can view saved details or reprint the cashier receipt. KOT and saved states use different tile backgrounds.

### Configure and Administer

Printer Settings assigns installed or IP-based printers to kitchen and cashier destinations. Bill Printing Preferences controls templates and receipt fields. Admin Settings contains sales summaries and export. Network sync is configured as a host or client in Settings. Developer and SQLite tools are intended for authorized administration, not routine cashier work.

## Visual System (Current)

- Default appearance is dark: page background `#1f1f1f`, surface `#2a2a2a`, primary text `#f5f5f5`, secondary text `#ababab`, and a light-gray action/accent `#d3d3d3`.
- Occupied table tiles use a warm yellow; KOT orders use a pale yellow. These state colors distinguish operational status from normal controls.
- Light mode is toggled through the shared theme control, persisted under `pfl-theme`, and implemented with `body.theme-light` overrides. Its page and surface colors use warm off-white values.
- Pages primarily use Tailwind utility classes, responsive grid/flex layouts, and icons from `react-icons`.
- Common interactions use visible labels, focus rings, hover/active states, and accessible names for icon-only controls. Order entry and table grids adapt to narrow viewports.

## Design Maintenance Notes

- Keep the order-entry path optimized for fast item selection, quantity changes, and total review. Avoid adding admin configuration to the cashier's primary workflow.
- Preserve strong contrast for status and payment information in both themes; do not rely on color alone when communicating state.
- Keep action targets usable on touch-sized displays, and verify table grids, order cards, receipt settings, and modals at narrow widths.
- The global stylesheet imports Montserrat, but `body` currently requests `Betania Patmos` while that font import is commented out. Confirm the intended typeface and provide a reliable fallback before making typography-dependent refinements.
- `src/App.css` retains Vite starter component styles; most product styling is in page-level utilities and `src/index.css`. Avoid treating starter selectors as the product's design system.
