# Family Portal — Phase F3 plan (the Expo app: switch, create, join, invite, use)

Status: **plan only, nothing built.** Parents: `design/family-portal.md`, prototype `design/family-portal-prototype.html`. Previous phases: F1 (families, members, invites) and F2 (scope on wallets, transactions, budget, reports, home) are done, backend only.
Legend: ⬜ not started · 🟦 in progress · ✅ done · ⚠️ blocked

---

## 0. What F3 is, in one paragraph

F3 is the **first thing users can see**. The Expo app gets a Personal ⇄ Family switcher, screens to create a family, join with a code, invite people, manage members, and every money screen (Home, Wallets, Add, History, Reports, Budget) follows the active scope. The server already does the hard part (F1, F2): this phase sends the scope header, shows the right things for each role, and makes sure the screen **can never show Family data inside Personal or the other way round**. No new native module, so **no new app build is needed** for F3 beyond your normal one. The web app (`frontend/`) is F6.

---

## 1. What I found in the Expo app (this shapes the plan)

| # | Finding | Consequence |
|---|---|---|
| 1 | One axios instance (`api.ts`) with a request interceptor that already adds the token. Every service uses it. | The scope header can be added **in one place**; no screen can forget it |
| 2 | There is **no shared data cache**. Screens keep their own state and refetch on focus (`useFocusEffect`). 13 screens and 12 components call the wallet, transaction, budget, home and reports services. | Nothing stale lives outside screens, so **remounting the screens when the scope changes** is a complete cure for "Family data flashing in Personal". No per-screen cache keys needed |
| 3 | Login state is in SecureStore tokens; settings in AsyncStorage contexts (theme, currency, language, preferences). `logout()` clears tokens only. | The saved scope must be cleared at logout and when another person logs in (new rule) |
| 4 | Dashboard is `Tabs` with four visible tabs (Home, Wallets, Loans, Settings) plus hidden screens; Loans (`debts`) and Scheduled are personal-only features. | In Family, Loans/Scheduled show a short "personal only" notice with a button to switch back; the tab itself stays |
| 5 | The Home header is a hero card with greeting, bell, search; Wallets has its own header; Profile (Settings) is a list of rows. | The switcher pill goes in the Home and Wallets headers; a **Family** row goes in Settings → Money |
| 6 | Deep links: only the custom scheme `expensetracker://` exists. `associatedDomains` has `webcredentials` only; no Android intent filters. | `https://…/join/<token>` links **cannot open the app** without native changes (a rebuild). They also have no web page until F6 (D1 below) |
| 7 | Realtime (`services/realtime.ts`) joins only the person's own room and only reports `new-notification`. | Live family updates are F5. In F3 a family screen updates on focus, pull-to-refresh and after the user's own actions |
| 8 | All user text goes through `i18n/strings.ts` in four languages (type-checked: a missing translation fails `tsc`). | About 130 new keys × 4 languages. French, Kinyarwanda and Swahili need a native-speaker review before release (as with earlier phases) |
| 9 | The Add screen already has an option sheet, a pay-from field, a category sheet and a receipt field (built earlier). | The family pieces reuse those components; no redesign |

---

## 2. Decisions needed from you

| ID | Question | My recommendation |
|---|---|---|
| D1 | How do people receive an invite? | **Code first.** The share message leads with the 6-character code and the words "open AbyExpense → Family → Join with a code". The link is added when F6 gives it a web page (and when you choose to rebuild with universal links). Today the server's link would open a "page not found" |
| D2 | When the scope changes, what happens to the screen the person was on? | Return to **Home** in the new scope (the screens are rebuilt fresh). It is the simplest and the safest |
| D3 | Family look | A different header colour so nobody confuses scopes. Purple (`#5B3FD0`, as in the prototype) in light mode; a darker purple in dark mode |
| D4 | Where does "Family" live? | The pill on Home and Wallets (switch), plus Settings → Money → **Family** (the hub: members, invites, activity, leave). No fifth tab |
| D5 | The Loans tab while in Family | Keep the tab; show "Loans and debts are personal. Switch to Personal" |
| D6 | Does a Viewer see the big + button? | No. It is hidden, and Add shows a short explanation if reached another way |
| D7 | Remember the last scope after closing the app? | Yes, but **re-checked with the server on launch**; if the membership is gone it silently falls back to Personal with a notice |
| D8 | Ship the web app at the same time? | No: F3 (Expo) then F6 (web, mostly mechanical because the web screens are ported from the Expo files). Tell me if you want them together; F3 would grow |
| D9 | "Contribute" (Personal → Family) | Not in F3. Still a later idea |

---

## 3. How it works (design)

### 3.1 Scope state: `context/scope-context.tsx`
- `ScopeProvider` (inside the dashboard, after login): holds `{ scope: 'personal' | { familyId }, family, role, status }`.
- On launch it reads the saved choice (AsyncStorage key `family:scope:<clientId>`), calls `GET /family/mine`, and only then publishes the scope. Until it answers, the dashboard shows the splash/skeleton (no flash of the wrong scope).
- `switchTo('personal' | 'family')`: sets the scope, saves it, **updates the header value synchronously**, then bumps a `scopeEpoch`. The dashboard `Tabs` subtree is keyed by `${scopeKey}:${epoch}`, so every screen under it is rebuilt and refetches (D2).
- `refresh()` re-reads `/family/mine` (after create, join, leave, removal, role change).
- `can(action)`: the same permission table as the server (copied, with a test that compares both tables, see section 7).
- On logout, or when another account signs in, the saved scope and the header are cleared.

### 3.2 The header: `api.ts`
- A module value `currentFamilyId` (set by the scope provider). The request interceptor adds `X-Family-Id` when it is set, except for `/client-auth/*` and `/family/*` (those do not use it).
- **Error handling:** a `403 NOT_A_MEMBER` from any request means the person lost access while using Family. A response interceptor calls `scope.fallBackToPersonal('removed')`, which switches to Personal and shows one notice ("You are no longer a member of <name>"). Requests in flight are not retried in the other scope.
- `400 BAD_FAMILY_HEADER` and `WRONG_SCOPE` are treated as bugs (logged, generic message).

### 3.3 Service layer
- `services/family.service.ts`: typed wrappers for the 15 routes (create, mine, update, archive, members, set role, remove/leave, transfer, create/list/revoke invites, preview, join, activity).
- `utils/family-errors.ts`: one map from server `code` to a translated message (about 25 codes, all four languages) so every screen shows the right sentence, never raw English from the server.
- `utils/family-permissions.ts`: the permission table and helpers (`can`, `canRemove`, `canInviteAs`), mirroring `backend/src/modules/family/family-permissions.ts`.

---

## 4. Screens (and what each one does)

### New
| Screen / component | Notes |
|---|---|
| **Scope switcher** (`components/family/scope-switcher.tsx`) | The pill (Home and Wallets headers) opens a bottom sheet: Personal · <Family name> · or Create / Join. Built on the existing `OptionSheet` |
| **Family hub** (`app/(dashboard)/family.tsx`, hidden tab) | Members with roles, Invite button (Owner/Admin), pending invites with Revoke, recent activity, Leave (or Transfer ownership / Delete for the Owner), family name and currency (Owner can edit) |
| **Create family** (`family-create.tsx`) | Name, currency, optional first family wallet. Handles `NOT_VERIFIED` by sending the person to the existing Verify screen |
| **Join family** (`family-join.tsx`) | Code entry → preview (family, who invited, role, the privacy notice) → Join. Every error from section 8 of the F1 plan has its own message |
| **Invite sheet** (`components/family/invite-sheet.tsx`) | Role choice (Admin only for the Owner), code, share (`Share.share`) with the D1 wording, copy |
| **Member sheet** (`components/family/member-sheet.tsx`) | Change role (Owner), remove (per rules), shows only what the role may do |
| **Family-only banners** | "Adding to: <Family>" on Add; "Visible to your family" hint; "Personal only" notice on Loans / Scheduled |

### Existing screens, made scope-aware
| Screen | Change in Family scope |
|---|---|
| Home | Header colour, pill, "Family balance"; no loans/debts/scheduled sections; budget bar is the family budget; edit-budget pencil only for Owner/Admin; recent list shows the author's avatar and name |
| Wallets / wallet detail | Family wallets only; the add-wallet button only for Owner/Admin; account details come back masked from the server (nothing to hide in the app); delete follows the server's rules and shows its message |
| Add | Banner; wallet picker lists family wallets only; **no "pay from a loan"**; hidden for Viewers; receipts and scan work as today |
| History / Expenses | Author avatar and name on each row; a **member filter** chip row (uses `memberId`); the chips for Loan/Debt/Scheduled are hidden |
| Transaction detail | "Added by <name>"; edit/delete shown only where the role allows (own vs other) |
| Reports | Same charts on family data (spending by member is F4); the "include loans" switch is hidden |
| Budget | Family budget; set/edit only for Owner/Admin; everyone can read it |
| Transfer / exchange | Wallets of the active scope only |
| Loans, Scheduled | The "personal only" notice |
| Settings → Money | New **Family** row (shows the family name, or "Create or join") |
| Tab bar | The centre + hidden for Viewers in Family |

### Not in F3
Spending by member (F4), live updates and push to other members (F5), the web app and the join link page (F6), per-member allowances, Personal ⇄ Family contribution.

---

## 5. Data flow examples

1. **Switch to Family:** tap the pill → sheet → "Mwiza Family" → header value set → epoch bump → Home rebuilt → `GET /home/summary` + `GET /transactions/recent` go out with `X-Family-Id`.
2. **Removed while using Family:** any request returns `403 NOT_A_MEMBER` → the interceptor switches to Personal, clears the saved scope, shows one notice, Home rebuilt as Personal.
3. **Join:** Settings → Family → Join → code `K7M2QX` → `GET /family/invites/preview` → preview card → Join → `POST /family/join` → `scope.refresh()` → switch to Family.
4. **Account change on one phone:** logout clears the scope; the next login starts as Personal and re-reads `/family/mine`.

---

## 6. i18n

About 130 keys, in `i18n/strings.ts` for English, French, Kinyarwanda and Swahili, added with the same node script pattern as before. Groups: `family.*` (hub, create, join, invite, members, activity), `role.*` (names and one-line descriptions), `fam.err.*` (the server error codes), `fam.banner.*`, `fam.personalOnly.*`. The translated error map is covered by a test that every server code has text in all four languages. **French, Kinyarwanda and Swahili need a native-speaker review before release.**

---

## 7. Tests and checks

| Group | What it proves |
|---|---|
| `family-permissions` (Expo) | The app's table equals the server's: the test holds the same hand-written matrix the backend test uses, so a drift in either side fails |
| `api` header | Set after switching; absent in Personal; absent for `/client-auth` and `/family`; cleared at logout; `403 NOT_A_MEMBER` triggers the fallback exactly once |
| `scope-context` | Launch with a saved scope that is still valid → Family; saved but removed → Personal with a notice; no family → Personal; switching bumps the epoch; logout clears; another account does not inherit the scope |
| Switcher, create, join, invite, member, hub | Each flow, every error code shown in the right language, role-gated buttons (Owner, Admin, Member, Viewer), Viewer sees no + |
| Scope-aware screens | Add (banner, family wallets only, no loan source, Viewer blocked), Home (no loan sections, author shown), History (member filter), Wallets (admin-only add), Budget (admin-only edit) |
| Leak check | A test mounts Home/Wallets/History in Family, switches to Personal, and asserts that **no family row is on screen** (and the reverse) using the mocked services |
| i18n | Every new key exists in all four languages; every server error code has a message |
| Regression | The existing Expo suite (505 tests) stays green; `tsc` shows only the 3 earlier errors; no backend change except what I flag below |
| Manual (you) | On a real phone: create, invite from a second phone, join, add as Member and as Viewer, remove the member while they are inside, switch back and forth, kill and reopen the app |

Backend touch (small, and I will tell you before doing it): a `GET /family/mine` response shape check, and possibly returning the family **timezone** and **member role** together, both already there. I expect **no backend change** in F3.

---

## 8. Work breakdown (order)

| # | Step | Done when |
|---|---|---|
| 0 | You answer D1–D9 | Answered |
| 1 | `family.service.ts`, `family-errors`, `family-permissions` + tests | Green |
| 2 | `api.ts` header + 403 fallback + tests | Green |
| 3 | `scope-context` + persistence + launch validation + logout clearing + tests | Green |
| 4 | Dashboard keyed by scope; switcher pill and sheet (Home, Wallets) | The two scopes swap with no stale data (leak test) |
| 5 | Create and Join screens | Every error path tested |
| 6 | Family hub, invite sheet, member sheet | Roles gate every button |
| 7 | Home, Wallets, Add, History, Transaction detail, Reports, Budget, Transfer made scope-aware | Per-screen tests |
| 8 | Loans / Scheduled notices; tab bar Viewer rule; Settings row | Done |
| 9 | i18n in four languages + coverage test | Green |
| 10 | Regression: Expo jest, `tsc`, existing tests | As before plus new |
| 11 | Docs (`progress.md`, plan status) and your device test list | Written |
| 12 | Final review of every changed file | Reported |

---

## 9. Risks

| ID | Risk | Handling |
|---|---|---|
| R1 | A screen shows the other scope's data for a moment | Rebuild on scope change + the leak test; the header is set synchronously before the rebuild |
| R2 | The header is missing on some request (for example one made with `fetch`) | All data calls go through `api.ts`; a test scans the app source for `fetch(` against the API |
| R3 | Old saved scope after a member is removed offline | Validated on launch and on any `403 NOT_A_MEMBER` |
| R4 | Invite link opens nothing | D1: code first |
| R5 | Translation quality | Native-speaker review; error codes always map to full sentences |
| R6 | Role mismatch between app and server | Server is the authority (it refuses); the app table is only for hiding buttons; a test compares both |
| R7 | Small-phone layouts | New screens reuse existing components and the responsive font scale; I will check at 320 px in the web port later (F6) and on device now |

---

## 10. Definition of done

- [ ] Every flow works on Expo against the F2 backend (create, join, invite, revoke, role, remove, leave, transfer, delete)
- [ ] Personal and Family never mix on any screen (leak test passes)
- [ ] Each role sees only the buttons it may use; the server still refuses anything else
- [ ] All new text in four languages, every server error mapped
- [ ] Expo suite green (505 + new), `tsc` unchanged (3 earlier errors only)
- [ ] You tested it on a phone with two accounts
- [ ] `progress.md` and the parent plan updated
