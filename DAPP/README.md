# Tyep Delivery

The rider app is a mobile-first installable web app (PWA) for iOS and Android. The POS and rider app share Firebase Authentication and Cloud Firestore over the internet; rider phones do not need the shop Wi-Fi password. It uses the POS palette and allows riders to choose deliveries, with a five-active-order limit.

When Firebase is not configured, choose **Preview rider app** to open the interactive sample demo. The initial screen is the rider dashboard, with counts for orders with the rider, available orders, orders on the way, and completed orders. Use **Picked-up** and **Available orders** to switch between the corresponding sample orders. Claim sample orders, progress statuses, enter split collections, simulate a POS item update or incoming order, and reset the demo. These actions change sample data in the current page only; they never connect to Firebase or modify real POS orders.

## Firebase setup

1. Create a Firebase project and register a Web app. Enable **Authentication > Email/Password** and create one Firebase Authentication account for each rider plus one for the POS delivery manager. Use individual rider accounts; do not share passwords.
2. Create Firestore in production mode. Publish `DAPP/firestore.rules` as the project's Firestore rules before allowing riders to sign in.
3. For each Firebase Auth user, create a matching `deliveryRiders/{AUTH_UID}` document in Firestore. For the manager, set:

   ```json
   { "role": "manager", "name": "POS Manager", "email": "manager@example.com", "enabled": true }
   ```

   For each rider, set:

   ```json
   { "role": "rider", "name": "Rider name", "email": "rider@example.com", "phone": "", "area": "Preferred area", "enabled": true, "activeCount": 0, "lastLocation": null }
   ```

   Set each document ID to the Firebase Authentication user's UID. Only the manager can manage rider profiles. The POS page shows these profiles and the rider's last location only while they have active orders and are sharing it.
4. Copy `DAPP/.env.example` to both `DAPP/.env` and the POS root `.env`. Fill in the same Firebase web app values (`apiKey`, `authDomain`, `projectId`, `appId`) in both. These are Firebase client configuration values, not service-account credentials. Never put a Firebase service-account/private key in either app.
5. From `DAPP/`, run `npm install`, then `npm run dev` for local browser testing (Vite uses port `5173` by default). Deploy with the Firebase CLI (`firebase deploy --only hosting,firestore:rules --project your-project-id` from `DAPP/`), or host `npm run build` output (`DAPP/dist`) on another HTTPS static host and publish the rules separately. Install the deployed app from the browser's **Add to Home Screen** action on iOS/Android. Location permission and PWA install require HTTPS on the deployed site.
6. In the POS, run `npm install` if needed, build/start the POS, open **Delivery**, and sign in using the manager account. After sign-in, new and existing POS delivery orders are synced to Firestore.

The POS root package includes the Firebase SDK. For mobile development, `DAPP` is a separate Vite app with its own dependencies and build.

## Rider workflow

- The rider signs in, sees available orders and their assigned active orders, and may claim orders until their active count reaches five.
- Claiming uses a Firestore transaction. The database rules also bind the order transition and rider capacity-counter update atomically, so only one rider can win a simultaneous claim.
- Claiming marks the order **Picked up / With rider**. A rider cannot release it or move it backward. They can advance it to **On the way**, then **Delivered**; delivery frees one of the five slots.
- POS can record cash and online amounts paid before dispatch. Riders see the remaining balance prominently; fully prepaid orders show **PAID — collect nothing**.
- The rider enters cash and online amounts collected at the door. Their combined amount must equal the remaining balance (including any additions), and the delivery record keeps the prepaid and collected splits separate.
- If the POS edits items, total, address, or prepayment after pickup, the rider sees a visible amendment and the latest bill. Amendments are retained on the delivery record. Changes before pickup simply update the available order.
- Live GPS is not enabled by default. A rider with active deliveries must tap **Share live location** and grant the device permission. Sharing stops when toggled off, when the app is hidden/closed, or when the final delivery is completed. The POS clears location points older than two minutes while the manager dashboard is online; the app must remain open and online to update location and does not claim background tracking.

The POS continues to use its existing local SQLite order store. Cloud delivery orders are a separate delivery-only projection, including prepaid and rider-collected cash/online splits. The online portions are recorded as reported by POS staff or the rider; they are not independently verified by a payment provider.

## Before going live

Use Firebase test accounts and verify the published rules with the Firebase Emulator or Rules Playground. Test concurrent claims on one order, a rider already holding five orders, simultaneous claims for a rider's last slot, forward-only status transitions, and that rider accounts cannot read other riders' profiles or edit orders after pickup. Firebase free-plan quotas and product availability may change; verify current pricing and limits before relying on them.
