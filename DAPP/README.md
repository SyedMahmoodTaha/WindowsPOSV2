# Tyep Delivery

The rider app is a mobile-first installable web app (PWA) for iOS and Android. The POS and rider app share Firebase Authentication and Cloud Firestore over the internet; rider phones do not need the shop Wi-Fi password. Riders choose deliveries, with a five-active-order limit.

When Firebase is not configured, choose **Preview rider app** to open the interactive sample demo. The initial screen is the rider dashboard, with counts for orders with the rider, available orders, orders on the way, and completed orders. Use **Picked-up** and **Available orders** to switch between the corresponding sample orders. Claim sample orders, progress statuses, enter split collections, simulate a POS item update or incoming order, and reset the demo. These actions change sample data in the current page only; they never connect to Firebase or modify real POS orders.

## Firebase setup

1. Create a Firebase project and register a Web app. Enable **Authentication > Email/Password** and create one Firebase Authentication account for the POS delivery manager. After setup, the manager can create rider accounts from the POS Delivery page. Use individual rider accounts; do not share passwords.
2. Create Firestore in production mode. Publish `DAPP/firestore.rules` as the project's Firestore rules before allowing riders to sign in.
3. Create a `deliveryRiders/{AUTH_UID}` document in Firestore for the manager. The POS creates rider profiles automatically when the manager adds a rider. For the manager, set:

   ```json
   { "role": "manager", "name": "POS Manager", "email": "manager@example.com", "enabled": true }
   ```

   Set the manager document ID to the Firebase Authentication user's UID. The POS page shows rider profiles and app-presence status; the rider app does not collect or share location.
4. Copy `DAPP/.env.example` to `DAPP/.env` and add the four Firebase client values (`apiKey`, `authDomain`, `projectId`, `appId`). Copy the same four values to the POS root `.env`. These are browser-app settings, not service-account credentials. Never put a Firebase service-account/private key in either app.
5. From `DAPP/`, run `npm install`, then `npm run build` after adding the Firebase settings. For local browser testing, use `npm run dev` (Vite uses port `5173` by default). Deploy with `npx firebase-tools deploy --only hosting,firestore:rules --project your-project-id`. Replace `your-project-id` with the Firebase Project ID. Install the deployed app from the browser's **Add to Home Screen** action on iOS/Android. Hosting and PWA installation require HTTPS on the deployed site; localhost is suitable only for local testing.
6. In the POS, run `npm install` if needed, build/start the POS, open **Delivery**, and sign in using the manager account. After sign-in, new and existing POS delivery orders are synced to Firestore.

The POS root package includes the Firebase SDK. For mobile development, `DAPP` is a separate Vite app with its own dependencies and build.

## Free in-app order alert

The rider app shows its custom new-order alert while a signed-in rider has the app open and connected. It uses the same Firestore live order subscription that loads available orders; it does not use a Cloud Function, browser notification permission, or background push. If the rider app is closed or suspended, no alert is sent. Firestore usage quotas still apply.

This project no longer deploys the background-push function. If you previously deployed `notifyRidersOfAvailableDelivery` manually, delete it from Firebase Console to ensure it is no longer running.

## Manage rider accounts from the POS

- Create the first POS manager account and profile in Firebase Console as described above. After signing in to **Delivery** in the POS, use **Add a rider** to create a rider's Firebase email/password login and delivery profile together. The email must not already belong to a Firebase Authentication account. The manager chooses an initial password and must share it privately; Firebase does not email it.
- **Remove access** disables the rider's delivery profile and prevents them from using the rider app. It is reversible with **Restore access**, preserves their Firebase sign-in record and delivery history, and is blocked while they have active deliveries.
- Permanent deletion of a Firebase Authentication account requires a trusted Admin SDK process. The POS does not contain a service-account key, so use Firebase Console if you need to permanently delete an account. Do not copy a service-account key into the POS.

## Rider workflow

- The rider signs in, sees available orders and their assigned active orders, and may claim orders until their active count reaches five.
- The rider dashboard has **Your deliveries** and **Available orders** tabs, with counts for current assignments, available orders, and orders on the way.
- Claiming uses a Firestore transaction. The database rules also bind the order transition and rider capacity-counter update atomically, so only one rider can win a simultaneous claim.
- Claiming marks the order **Picked up / With rider**. A rider cannot release it or move it backward. They can advance it to **On the way**, then **Delivered**; delivery frees one of the five slots.
- POS can record cash and online amounts paid before dispatch. Riders see the remaining balance prominently; fully prepaid orders show **PAID — collect nothing**.
- The rider enters cash and online amounts collected at the door. Their combined amount must equal the remaining balance (including any additions), and the delivery record keeps the prepaid and collected splits separate.
- If the POS edits items, total, address, or prepayment after pickup, the rider sees a visible amendment and the latest bill. Amendments are retained on the delivery record. Changes before pickup simply update the available order.
- New orders show a custom in-app alert to enabled riders while their app is open and connected. No alert is delivered when the app is closed or suspended.
- The POS shows riders as online when their open rider app has checked in within the last 90 seconds. This is an app-presence indicator, not proof that the rider is currently looking at the screen.
- The rider app does not request, collect, or share location. POS online status is based only on app presence.

The POS continues to use its existing local SQLite order store. Cloud delivery orders are a separate delivery-only projection, including prepaid and rider-collected cash/online splits. The online portions are recorded as reported by POS staff or the rider; they are not independently verified by a payment provider.

## Before going live

Use Firebase test accounts and verify the published rules with the Firebase Emulator or Rules Playground. Test concurrent claims on one order, a rider already holding five orders, simultaneous claims for a rider's last slot, forward-only status transitions, in-app alerts while the rider app is open, presence expiry, and that rider accounts cannot read other riders' profiles or edit orders after pickup. Firebase free-plan quotas and product availability may change; verify current limits before relying on them.
