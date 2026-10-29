# Family Portal — Phase F3 plan (Expo app, then web app and the join page)

Status: **plan only, nothing built.** Parents: `design/family-portal.md`, prototype `design/family-portal-prototype.html`. Previous phases: F1 (families, members, invites) and F2 (scope on wallets, transactions, budget, reports, home) are done, backend only.
Legend: ⬜ not started · 🟦 in progress · ✅ done · ⚠️ blocked

This version includes a review of the first draft. Every claim in that review was checked against the code; where it was right, the plan changed (section 1 says which).

---

## 0. What F3 is, in one paragraph

F3 is the **first thing users can see**: a Personal ⇄ Family switcher, screens to create a family, join with a code, invite people and manage members, and every money screen following the active scope. The server already does the hard part (F1, F2). This phase sends the scope header, shows the right things for each role, and makes sure a screen **can never show Family data inside Personal or the other way round**. It is split in two so each can be built, tested and reviewed on its own:

| Part | Contents | Usable without the other? |
|---|---|---|
| **F3a — Expo app** | Everything for the phone app, two small backend guards, tests, i18n | **Yes**: families work fully by code |
| **F3b — Web app and the join page** | The web port of the same screens, the public `/join/<token>` page, the backend rule that serves it | Needs F3a |

No new native module, so no extra app build beyond your normal one.

---

## 1. What I verified in the code (and what changed in this plan)

| # | Finding | Consequence |
|---|---|---|
| 1 | One axios instance in the Expo app (`api.ts`); every service uses it. The web has one client too: **`frontend/src/api.ts` only re-exports `@/lib/api`**, so the web header goes into `lib/api.ts`. | One place per app. **`port.mjs --force` must never be run on `api.ts`** (it would replace the re-export with the Expo file); the plan lists the files to port by name |
| 2 | No shared data cache in either app: screens hold their own state and refetch on focus. | Rebuilding the screens when the scope changes is a complete cure for stale data. Nothing needs per-screen cache keys |
| 3 | **The Nest server serves the web app only for a whitelist**: `/`, `/login`, `/register`, `/forgot-password` and `/app/*` (`backend/src/common/web-app.ts`, `isWebAppPath`). `/join/<token>` is not on it, so it answers 404. *(The first draft said the server already served unknown paths: that was wrong.)* | **Backend change B1 (F3b):** add `/join` to `isWebAppPath`, with a test in `web-app.spec.ts` |
| 4 | **`/debts`, `/scheduled`, `/reminders` ignore `X-Family-Id`** and return personal data. If the app were in Family and called them with the header, it would show personal data under a family banner. | **Two defences.** (a) The app sends the header **only to the scoped routes** (an allow-list: wallets, transactions, budget, reports, home). (b) **Backend change B2 (F3a):** a small `PersonalOnlyGuard` answers `400 PERSONAL_ONLY` on the debts, scheduled and reminders routes when the header is present, so a future screen that sends it by mistake fails loudly |
| 5 | The dashboard layout (Expo and web) hosts push registration and, in Expo, a "handled once" ref for notification taps. | **The scope key goes on the `<Tabs>` (Expo) and the `<Outlet>` (web) only**, never on the layout that owns those effects; otherwise a scope switch re-registers the device and can replay the last notification tap |
| 6 | Expo `api.ts` deletes the refresh token when a refresh fails (lines ~71-75); the web has `setSessionLostHandler`. Neither would clear a saved scope. | The saved scope and the header are cleared on **logout, on a failed refresh, and in `setSessionLostHandler`**, not only in `logout()` |
| 7 | **The web test setup is `environment: 'node'` with no jsdom or testing library**; every existing web test is pure logic. The Expo side has jest-expo + Testing Library, so it can mount screens. | Expo gets mount tests. **Web gets pure-logic tests plus the browser checks (`nav-check`, screenshots)**; no new dependency (D12) |
| 8 | Deep links: only `expensetracker://` exists. With expo-router a group folder is invisible, so a screen at `app/(dashboard)/family-join.tsx` is `expensetracker://family-join?token=…`. A custom-scheme link from a browser does not open the app on every phone. | The plan names the route and the parameters (section 5.3), keeps a pending invite while signed out, and the code stays visible on the web page |
| 9 | A token in the page address ends up in server logs, history and `Referer`. | The join page moves the token out of the address at once and sends `Referrer-Policy: no-referrer` (section 5.2); R9 covers it |
| 10 | Transactions return the author's name only. | v1 shows **initials** (D10); no avatar change on the server |
| 11 | Everything Expo says and the 4-language rule (`i18n/strings.ts`) are as in the first draft: ~130 keys × 4 languages, native-speaker review needed. | Unchanged |

---

## 2. Decisions (all confirmed)

Confirmed on 2026-10-29: D1–D12 are accepted as recommended below, and F3a/F3b were built that way. One change by the owner: **D5 is superseded**: a family has its own bottom bar (Home, Wallets, Add, Settings) with no Loans tab, and Settings opens the family settings; Loans and Scheduled stay Personal-only.

| ID | Question | Recommendation |
|---|---|---|
| D1 | How do people receive an invite? | **Code and link together.** The message has the 6-character code and the link. The link opens the web join page (F3b). Until F3b is live, the message is code-only (the code never depends on the page) |
| D2 | What happens to the screen when the scope changes? | Return to **Home** in the new scope; the screens are rebuilt |
| D3 | Family look | Purple (`#5B3FD0`) header in light mode, a darker purple in dark mode |
| D4 | Where does Family live? | The pill on Home and Wallets plus Settings → Money → Family. No fifth tab |
| D5 | Loans and Scheduled while in Family | Keep the tabs; show "personal only, switch to Personal" (and B2 protects the server side) |
| D6 | Does a Viewer see the big + button? | No; Add explains if reached another way |
| D7 | Remember the last scope? | Yes, **re-checked with the server on launch**; falls back to Personal with a notice |
| D8 | Web at the same time? | **Yes, as F3b**: F3a first, F3b right after, both finished before F3 is called done |
| D9 | "Contribute" (Personal → Family) | Later |
| D10 | Author in lists | **Initials in a coloured circle plus the name** (as in the prototype). Photos can come later without a server change |
| D11 | Which currency is "Family balance"? | **The family's own currency** (`/wallets/overview?base=<family currency>`), with wallets in other currencies converted by the existing rate service; if a rate is missing the per-currency list is shown, as Wallets does today |
| D12 | Web tests | **Pure-logic tests + `nav-check` + screenshots**, no new dependency. Adding jsdom and a testing library is possible but is a new tooling decision; say so if you want it |

---

## 3. The backend touches (small, and the only ones in F3)

| ID | Change | Part | Test |
|---|---|---|---|
| B1 | `isWebAppPath` also accepts `/join` and `/join/<anything>`; the join response carries `Referrer-Policy: no-referrer` and `Cache-Control: no-store` | F3b | `web-app.spec.ts`: `/join/abc`, `/join`, `/join/` are web pages; `/jointhing` and `/family/join` are not; the headers are set |
| B2 | `PersonalOnlyGuard`: `400 PERSONAL_ONLY` when `X-Family-Id` is present, on the debts, scheduled and reminders controllers (and not on notifications or subcategories, which belong to the person, not the scope) | F3a | A spec per controller: with the header → 400; without → unchanged; a leak-guard-style test that lists the personal-only controllers so a new one is noticed |

Nothing else changes on the server.

---

## 4. F3a — the Expo app

### 4.1 Scope state: `context/scope-context.tsx`
- `ScopeProvider` (inside the dashboard, after login): `{ scope: 'personal' | { familyId }, family, role, status }`.
- **Launch:** reads the saved choice (AsyncStorage key `family:scope:<clientId>`), calls `GET /family/mine`, and only then publishes the scope. Until it answers, the dashboard shows the splash (no flash of the wrong scope).
- **`switchTo`:** sets the scope, saves it, updates the header value **synchronously**, bumps `scopeEpoch`. The `<Tabs>` is keyed by `${scopeKey}:${epoch}`, so every screen under it is rebuilt and refetches (D2). Push registration and notification handling live above it and are untouched (finding 5).
- **`refresh()`** re-reads `/family/mine` after create, join, leave, removal, role change.
- **`can(action)`** uses a copy of the server's permission table (test in section 4.6).
- **Cleared** on logout, on a failed refresh and when another account signs in (finding 6).

### 4.2 The header and the 403 fallback (`api.ts`)
- A module value `currentFamilyId`. The request interceptor adds `X-Family-Id` **only** when it is set **and** the request path starts with one of `/wallets`, `/transactions`, `/budget`, `/reports`, `/home` (finding 4a). Everything else (auth, family, debts, scheduled, reminders, notifications, receipts, subcategories) goes without it.
- `403 NOT_A_MEMBER` on any request → `scope.fallBackToPersonal('removed')`: switch to Personal, clear the saved scope, show one notice "You are no longer a member of <name>". In-flight requests are not retried in the other scope.
- `400 BAD_FAMILY_HEADER`, `WRONG_SCOPE` and `PERSONAL_ONLY` are treated as bugs (logged, generic message).

### 4.3 Services and helpers
- `services/family.service.ts`: typed wrappers for the 15 routes.
- `utils/family-errors.ts`: server `code` → translated message (~25 codes × 4 languages); the app never shows raw server English.
- `utils/family-permissions.ts`: the table and `can`, `canRemove`, `canInviteAs`.
- `utils/family-invite.ts`: builds the share text (code, and the link when F3b is live), parses a pasted code or link.

### 4.4 Screens
**New:** scope switcher (sheet from the Home and Wallets pill); Family hub (`family.tsx`: members, roles, pending invites with Revoke, activity, Leave or Transfer/Delete for the Owner, rename/currency for the Owner); Create family (`family-create.tsx`, handles `NOT_VERIFIED` by sending the person to the Verify screen); Join family (`family-join.tsx`: code entry, preview, privacy notice, Join; also reads `token` / `code` from the address); invite sheet; member sheet; "Adding to: <Family>" and "Personal only" banners.

**Made scope-aware:** Home (header colour, pill, family balance in the family currency, no loans/debts/scheduled, budget pencil only for Owner/Admin, author initials), Wallets and wallet detail (add only for Owner/Admin; server masks account details), Add (banner, family wallets only, no loan source, hidden for Viewers), History and Expenses (author initials and name, **member filter**, Loan/Debt/Scheduled chips hidden), Transaction detail ("Added by", edit/delete by role), Reports (include-loans switch hidden), Budget (set only Owner/Admin), Transfer (scope's wallets only), Loans and Scheduled (notice), Settings → Money (Family row), tab bar (+ hidden for Viewers).

### 4.5 Joining while signed out (pending invite)
The parent plan's §9.10 rule: if the Expo app opens `expensetracker://family-join?token=…` (or the person has a code from a message) while signed out, the token or code is kept in AsyncStorage (`family:pending-invite`), the person signs in or registers as usual, and the Join screen opens with the preview as soon as the dashboard loads. The pending value is cleared after use, after an error that makes it useless, or at logout. **The code is always shown and can be typed**, because a custom-scheme link from a browser does not open the app on every phone (finding 8).

### 4.6 Tests and checks (F3a)
| Group | What it proves |
|---|---|
| Permission table | The app's table equals the server's: the test holds the same hand-written matrix as the backend test |
| Header | Sent after switching, only on the five allowed prefixes; absent in Personal, for auth, family, debts, scheduled, reminders, notifications; cleared at logout, on a failed refresh and when another account signs in; one `403 NOT_A_MEMBER` triggers the fallback exactly once |
| Scope context | Valid saved scope → Family; saved but removed → Personal with a notice; no family → Personal; switching rebuilds; the push-registration effect does **not** re-run on a switch; another account does not inherit the scope |
| Flows | Create, join (every error), invite, revoke, role change, remove, leave, transfer, delete: each message in the right language and each button gated by role (Owner, Admin, Member, Viewer) |
| Pending invite | Kept while signed out, applied after sign-in, cleared after use and at logout |
| Screens | Add, Home, History, Wallets, Budget, Transfer per the table in 4.4 |
| **Leak check** | Mount Home, Wallets, History in Family, switch to Personal, assert no family row is on screen; and the reverse (mocked services) |
| i18n | Every new key in all four languages; every server code has a message |
| Backend | B2's specs; the existing 482 backend tests stay green |
| Regression | The existing Expo suite (505) stays green; `tsc` shows only the 3 earlier errors |
| Manual (you) | Two phones: create, invite, join, add as Member and Viewer, remove someone while inside, switch back and forth, kill and reopen |

### 4.7 Steps (F3a)
| # | Step | Done when |
|---|---|---|
| 0 | You answer D1–D12 | Answered (confirmed 2026-10-29) |
| 1 | B2 `PersonalOnlyGuard` + specs | Green |
| 2 | `family.service`, `family-errors`, `family-permissions`, `family-invite` + tests | Green |
| 3 | `api.ts` header (allow-list) + 403 fallback + session-loss clearing + tests | Green |
| 4 | `scope-context` + persistence + launch check + pending invite + tests | Green |
| 5 | `<Tabs>` keyed by scope; switcher pill and sheet | Scopes swap with no stale data |
| 6 | Create and Join screens | Every error path tested |
| 7 | Hub, invite sheet, member sheet | Roles gate every button |
| 8 | Home, Wallets, Add, History, Transaction detail, Reports, Budget, Transfer scope-aware | Per-screen tests |
| 9 | Loans/Scheduled notices, tab-bar Viewer rule, Settings row | Done |
| 10 | i18n in four languages + coverage test | Green |
| 11 | Regression, docs, device test list | Written; reported |

**Definition of done (F3a):** every flow works on Expo against the F2 backend · Personal and Family never mix (leak test) · each role sees only the buttons it may use · four languages · Expo suite green (505 + new), `tsc` unchanged · backend suite green · B2 deployed with the backend · you tested on two phones.

---

## 5. F3b — the web app and the join page

### 5.1 The port
- Port by name, never `api.ts`: `scripts/port.mjs <file> ...` for the new and changed screens, components, services, utils, the scope context and tests. (The web's own `lib/api.ts` gets the same header allow-list, 403 fallback and session-loss clearing as Expo's `api.ts`.)
- Scope key in `localStorage` (try/catch, as the web already does for other settings).
- The scope key goes on the `<Outlet>` in `DashboardLayout`, not on the layout that registers the device and runs the reminder host (finding 5). `setSessionLostHandler` also clears the scope.
- `/family` added to the Vite dev proxy `API_PATHS`; `mock-api.ts` gets sample family data (families, members, invites, family wallets and transactions) so screenshots and `nav-check` run without a backend. `/app/family` does not clash with `/family`: the dashboard routes live under `/app/`.

### 5.2 The join page `/join/<token>` (public)
- **B1** makes the server serve the SPA for `/join` and `/join/<token>`, with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
- On load the page **reads the token, immediately replaces the address with `/join` (`history.replaceState`), and keeps the token in memory (and `sessionStorage` so a sign-in redirect survives)**. It also accepts `?code=` and a typed code.
- Signed out → Login or Register (with the existing "continue after sign-in" mechanism) → back to `/join` → preview (family, who invited, role, the privacy notice) → Join.
- Signed in and already in a family → "Leave your current family first". Expired, revoked or used → the same messages as the app (from the same error map).
- The page shows the **code**, and on a phone a button "Open in the app" that goes to `expensetracker://family-join?token=…`; if nothing opens, the code and a short instruction remain on screen.
- After a successful join the pending token is removed from `sessionStorage`.

### 5.3 What the app does with that link
`app/(dashboard)/family-join.tsx` reads `token` and `code` from its parameters (4.4, 4.5). If the app is closed or signed out the pending-invite path applies. Universal links (the app opening straight from an `https://` link) need native changes and a rebuild and stay out of scope.

### 5.4 Tests and checks (F3b), no new dependency (D12)
| Group | What it proves |
|---|---|
| Pure logic (vitest) | Permission table, error map, share text, header allow-list function, scope persistence (with a fake storage), the join-token handling function (extract, strip from the address, keep, clear), pending-invite logic |
| Backend | B1 in `web-app.spec.ts` (paths and headers) |
| Build | `tsc` clean, `build:mock`, `pwa-check` |
| Browser (`nav-check`) | The family routes (`/app/family`, create, join) load; `/join/<token>` shows the join page; the address becomes `/join`; signed out → login → back; the dashboard remounts on a scope switch without re-registering the device |
| Screenshots | The new screens at **320, 360 and 390 px**, light and dark: switcher, hub, create, join page, invite sheet, family Home, family Wallets, Add in a family |
| Regression | Web suite (323) stays green; `backend/web` rebuilt with `build:web` |
| Manual (you) | Open an invite link on a phone browser and on a desktop; join; "Open in the app" |

### 5.5 Steps (F3b)
| # | Step | Done when |
|---|---|---|
| 1 | B1 + test | Green |
| 2 | Port the services, utils, scope context; `lib/api.ts` header, fallback, clearing | `tsc` clean |
| 3 | Port the screens and sheets; `DashboardLayout` scope key; Settings row; Family routes in the router | `tsc` clean |
| 4 | Join page + token handling | Logic tests green |
| 5 | Dev proxy, mock data | `nav-check` runs |
| 6 | Tests, `build:mock`, `pwa-check`, `nav-check`, screenshots at 320/360/390 | All pass; screenshots reviewed |
| 7 | `build:web` into `backend/web`; docs; browser test list | Written; reported |

**Definition of done (F3b):** every flow works in the browser · an invite link opens the join page and a person can join from the browser · the token never stays in the address bar · Personal and Family never mix on the web either · web suite green (323 + new), `tsc`, `pwa-check`, `nav-check` pass · `backend/web` rebuilt · B1 deployed with the backend.

---

## 6. Risks

| ID | Risk | Handling |
|---|---|---|
| R1 | A screen shows the other scope's data for a moment | Rebuild on scope change + header set synchronously + the leak test |
| R2 | The header is missing, or sent to a personal-only route | One interceptor per app with an allow-list; B2 refuses it on the server; a test scans the apps for `fetch(` against the API |
| R3 | Stale saved scope after a removal while offline | Validated on launch and on any `403 NOT_A_MEMBER` |
| R4 | The invite link does nothing on some phones | The code always works; the link opens a page that works in any browser; deep links are optional |
| R5 | Translation quality | Native-speaker review; every server code maps to a full sentence |
| R6 | App and server role tables drift | The server is the authority; a test compares the two tables |
| R7 | Small-phone layouts | Existing components and the responsive font scale; web screenshots at 320/360/390; Expo on device |
| R8 | The join page is shared before the backend serves it | B1 ships with the backend; F3b is not "done" until both are deployed |
| R9 | A token leaks through the address, logs or `Referer` | Replaced in the address on load, `no-referrer`, `no-store`, single-use, 7-day expiry, hashed at rest, revocable |
| R10 | A scope switch replays a notification tap or re-registers the device | The key sits below those effects (finding 5), with a test that the effects run once |
| R11 | Wrong porting overwrites web-specific files (`api.ts`) | Port by file name; `api.ts` is never ported; a checklist line in the steps |

---

## 7. Branch note
The review suggested working on branch `claude/busy-fermat-dhcfk0`. This repository is on `main` with the earlier phases uncommitted; I will not change branches or commit unless you ask.
