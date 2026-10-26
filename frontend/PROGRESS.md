# Rabbit Tracker — web app progress

A hand-ported copy of `expo_app`: same screens, same design, same logic. React + Vite + TypeScript.
No automatic converter (no react-native-web, no Expo web export). A small conversion script of my own
(`scripts/port.mjs`) rewrote the imports; everything phone-only was written or fixed by hand.

Run: `npm run dev` · `npm run build` · `npm test` · `npm run typecheck`

## How it works
- `src/rn/` — my own View, Text, TouchableOpacity, ScrollView, FlatList, TextInput, Switch, Modal, Alert, Image,
  SafeAreaView, `Animated`/`Easing`, LinearGradient, SVG, and `style.ts`, which turns React Native styles into CSS.
  A screen is ported by changing its imports to `@/rn`; its StyleSheet values stay as they were.
- `src/router/` — the router is react-router-dom's standard `<BrowserRouter>` + `useRoutes` (App.tsx, routes.tsx); the app creates no router of
  its own. `router.push('/(dashboard)/wallets')` in the screens calls that router's own `navigate` (through `NavigationBridge`); addresses are
  translated (`/app/wallets`). `npm run check:nav` clicks through the app in the development server and checks the address AND the screen change
  (it exists because navigation once broke only in development, where React runs everything twice).
- `src/lib/shims/` — browser versions of the phone's image picker, document picker, camera, storage.
- Icons: the Material Icons font, so every icon name from the phone app works unchanged. Fonts: Poppins.
- The app is a phone-width column (max 430px), centred on wider screens.
- One address for web app and API: the Vite dev server forwards API paths to the backend; in production the backend serves the web app
  itself. (Passkeys need that. `RP_ID` and `ORIGIN` live only in `backend/.env`, never in the frontend.)
- **Putting the web app in the backend:** run `npm run build:web` in `backend`. It builds the web app and copies it into `backend/web`
  (ignored by git); the backend serves that folder. Lookup order: `FRONTEND_DIST` if set, then `backend/web`, then `../frontend/dist`.
  **Chosen setup for Render: Root Directory stays `backend`, and the built `backend/web` folder is COMMITTED** (Render cannot see files outside
  its root directory: https://render.com/docs/monorepo-support). Render's build command stays the normal `npm install && npm run build`; its
  start command stays `npm run start:prod`. After ANY change to the web app, do this before pushing:
  `cd backend && npm run build:web`, then commit `backend/web` together with the change. (Forgetting it means the hosted site shows the old app.)

## Screens: all 37 ported
| Area | Screens |
|---|---|
| Auth | Welcome (3 slides), Login, Register, Forgot password |
| Tabs | Home, Wallets, Debts, Settings (Profile) |
| Money | Add, Scan receipt, History, Expense, Wallet detail, Transfer / Exchange, Transaction detail |
| Debts & time | Debt ledger, Scheduled, Reminder pop-up, Date & time sheet, Repeat sheet |
| Analysis | Reports, Budget |
| Settings | About, Appearance & language, Currency, Date & time, Devices, Edit profile, Help & FAQ, Notifications (+ settings), Passkeys, Privacy, Meetings & schedule, Security, Verification |

Also ported: all 60 components/services/utils, the 4-language translations (3,334 lines), contexts (theme, language,
currency, preferences, notifications), the passkey flow (browser WebAuthn), live updates (socket).

## How it was checked
- Type check clean; production build OK; **225 tests pass** (15 files): the style translator, router paths,
  Animated/Easing, WebAuthn encoding, translations (every language has every key, every used key exists), plus the
  phone app's own logic tests (recurrence, debts, dates, reminders, home, schedule form, API error handling) run
  against the web copies.
- Every screen was opened in a real headless browser with sample data and looked at (`scripts/shots.mjs`,
  `scripts/contact-sheet.mjs`). Sample data: `?mock=1` in development, or a build made with `VITE_MOCK=1`
  (never in a normal build; checked that `dist/` contains none of it).
- Interactions checked: date/time sheet, repeat sheet, new-debt form, reminder pop-up, debt details sheet.

## Notifications and the installable app (PWA), modelled on Optical Gem
- **Install:** `manifest.webmanifest` (name, standalone, 192/512 and maskable icons, shortcuts), `sw.js`, iPhone icon, theme colour. A one-time
  install sheet (`beforeinstallprompt`), an Install panel in Notification settings, iPhone instructions. Icons are made from the phone app's
  logo with `node scripts/make-icons.mjs`.
- **Service worker (`public/sw.js`):** shows a push even with the app closed; reminders and security alerts stay until tapped; the same tag
  replaces instead of stacking; a click focuses the open tab or opens one at the right page (`?fromPush=<id>` marks that inbox row read); open
  tabs are told so their unread count refreshes. It never caches files.
- **Subscription (`lib/push.ts`, `context/push-context.tsx`):** states loading / error / unsupported (+iPhone hint) / insecure / server-off /
  default / denied / allowed-not-subscribed / subscribed-elsewhere / subscribed. Device list with Send test, Rename, Remove, Turn off. A soft
  prompt on Home ("Not now" hides it for 14 days).
- **In-app:** live toast for new notifications; the chosen sound plays in ONE open tab (tab leader), not every tab; quiet hours respected
  (urgent bypasses); reminders ring on a loop with vibration while their pop-up is open.
- **Server (`backend/src/modules/web-push`):** `WebPushSubscription` table; `/push-notifications` endpoints (public key, subscribe, list, rename,
  remove, test with a 10 s cooldown, seen); a browser subscribing again moves to the account that is signed in; dead subscriptions removed
  (404/410, or 10 failures); every notification and every reminder that goes to phones also goes to the account's browsers.
- **Checks:** `node scripts/pwa-check.mjs` (real browser: the worker registers, the manifest is valid, the app is installable, the browser
  subscribes through Microsoft's push service, a push delivered to the worker shows a notification) — all pass; service worker unit tests;
  server tests; `backend/scripts/web-app-check.ts` (headers, icons).

### To switch it on for real
1. Apply the database migrations (the newest is `20261027090000_web_push`): `npx prisma migrate deploy` in `backend`. Back up the hosted database first.
2. Restart the backend. `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are already in `backend/.env`; **put the same two values in Render's
   environment**. Do not change them later, or every subscription stops working.
3. Push and install need HTTPS (localhost is fine while developing). On Render the build must also build the frontend.

## Not done / not verified
- **Not run against the real backend and database** (no MySQL here). Login, saving and the live socket were not
  exercised end to end. First thing to do on your side: `npm run dev` with the backend running.
- Google / Facebook / Apple sign-in on the web (buttons are drawn and show a message).
- Offline use: the app needs the network (the service worker only handles notifications, as in Optical Gem).
- Push has been proven in a real browser against a stand-in server; it has not yet been sent from your real backend to a real phone or PC.
- Country flags show as letters on Windows (no flag emoji there).
- Pull-to-refresh (`RefreshControl` is a placeholder); screen-level (component) tests from the phone app are not ported.
- Camera/photo flows use the browser's pickers; receipts, scan and profile photo were not tried with real files.
- Known phone-app issues carried over: amounts in some lists have no thousands separators; display currency is the
  Settings currency, not the wallet's (see the currency analysis).
- Deleted by hand? `src/assets/*` (old Vite starter images) is unused and can be removed.
