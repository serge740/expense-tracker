# History page, web app: analysis and plan

Sources read in full: `history-ui-spec.md` (35 sections), the five design pages (Redesign, States, Sheets, Manage, Rows and Components, which are one design with different sections shown), `HistPhone.dc.html` (every screen), `HistRows.dc.html` (every row and event variant), the five images, and the current code (`history.tsx`, `transaction.service.ts` backend and web, `wallet-detail.tsx`, `expense.tsx`). `support.js` is the design tool's runtime, not design content.

## 1. What the design is

One page, **History**, with two modes (**Money** | **Activity**), built from a few reusable parts. Four colour sets (light, dark, Family light, Family dark), three widths (320, 375, 430), four languages (French, Kinyarwanda, Swahili shown to prove 40% longer text).

### 1.1 Main screen, top to bottom
| Part | What the design draws |
|---|---|
| Header | Scope pill (Personal / family name, with icon), title, then three 44 px buttons: search, filter (with a count badge), overflow (⋮) |
| Mode switch | Segmented **Money** / **Activity** |
| Summary card (one card) | Period navigator inside it (‹ October 2026 ▾ ›, next disabled at the current period); **currency tabs** (RWF, USD, EUR, ≈RWF = converted); Net with an arrow icon plus the sign; "Net · 128 transactions"; delta line "Spending +23% vs Sep"; an 84×40 sparkline; two tiles Income and Spent. The card keeps its height while loading (238 px skeleton) |
| Kind chips | All, Income, Expense, **Transfers**, Debt, Credit, Scheduled (repeat icon), and a last chip "Loans on" (the include-loans switch as a chip) |
| Active-filters bar | Removable chips: included (tinted), **excluded (dashed red, block icon)**, "Clear all" |
| Wallet strip | Cards: All wallets (4 wallets), MoMo 245,300 RWF, Cash, Bank 1,204.50 USD, archived last. One tap selects |
| Insight strip | One dismissible line ("Food is up 41% vs September"), only when meaningful (the design code leaves it off in the main frames) |
| Upcoming | Collapsed row "Upcoming · 3" with a red "1 failed" badge; expanded rows with **Retry / Skip**, **Confirm / Skip**, **Pay now / Skip** and "Skip all overdue" |
| List | Day headers with the day's net ("▲ +837,600 RWF", multi-currency "▼ −27,000 RWF · −$12.99"); rows grouped into one soft card per day (first and last rows rounded) |
| Floating | Add (+) button, "Jump to date" pill, scroll-to-top |

### 1.2 The row (the heart of the page)
Category icon (40 px circle, category colour at 15%), title (14/500), meta line "Food › Groceries", **tappable wallet tag** (colour square + name), badges (icon + word), right side: signed amount 15/600 in tabular numbers, sub-line "RWF · 14:20", paperclip when there is a receipt. Optional: progress bar "3 of 5" (repayments), italic note preview, warning block (failed post, duplicate, uncategorised), action buttons (44 px: Retry, Restore…), running balance with a dashed divider, author avatar (Family), checkbox (select mode).
**Variants drawn (35):** expense, income, transfer same currency, transfer two currencies ("−130,000 → +$100", rate), borrowed (not income), lent, repayment paid, repayment received (with progress), paid from borrowed money, scheduled/recurring, future-dated, failed scheduled post (+Retry), skipped scheduled (muted, struck), receipt + PDF report, family row by a member / by you, multi-currency converted, possible duplicate, uncategorised, reconciled, search match (highlight), amount hidden (•••••), selected, disabled in select mode (with reason), pending delete (faded), swipe left (Edit, Delete), swipe right (Duplicate, Repeat), compact, compact with long title, edge cases (80-char title with emoji and retired category, archived wallet, no title, Arabic title, 1.25B abbreviated, 0.01, running balance).

### 1.3 Sheets
| Sheet | Contents |
|---|---|
| **Filter** (84%) | Type chips; wallets as checkbox rows (colour, currency, archived muted); collapsible rows with a summary of what is set (Period, Categories, Amount, Receipt, More); footer **Save view** + **Show N results** (live count); Reset |
| **Categories** (inside the filter) | Used 14 / All 25 switch; search; sort by use; "Recent" chips; hint "tap once to include, again to exclude"; tree with **three-state checkboxes**, counts and totals ("48 · 312,400"), sub-categories with "last used 10 Oct", "Food, no sub-category", "Show 4 more", excluded rows, income categories labelled, unused ones muted |
| **Filter more** | Amount min/max (currency note), Receipt Any/With/Without, Scheduled & recurring Past/Upcoming/Both, Source chips, specific schedules (checklist with Active/Paused/Ended), Due and outcome chips, Include loans switch, Flags chips |
| **Sort and group** | Sort radios (newest, oldest, largest, smallest); Group chips (Day, Week, Month, Category, Wallet, Member, Title, None); note "sorting by amount turns grouping off" |
| **Period** | 13 presets (Today … All time, Custom range); custom range with Start / End fields and a Monday-first range calendar; CTA "Select end date" |
| **Quick peek** (66%) | Amount, category, wallet tag (opens the wallet), Receipt, Added by; note; 8 actions (Open full detail, Edit, Duplicate, Make recurring, Change category, Move to wallet, Add receipt, Delete); disabled action with a lock line explaining why |

### 1.4 Other screens and states
Search (idle: recent searches, saved views, "Try" chips; typing: token chips in the field, grouped suggestions, shortcut help; results: result bar, highlights, notes; no results: spelling, remove filter, widen dates, Clear search). Select mode (teal bar, "Select all covers all 128 matching, not only the 40 loaded", bottom bar Delete / Category / Wallet / Tag / Export / More, confirm dialog listing balance effects per wallet). Recently deleted (30 days, Restore, Delete forever). Wallet-focused statement (wallet's own colour card, balance, Add here / Transfer / Statement, opening + in − out = closing with a "balanced" check, running balance, balance chart row, "Wallet:" chip). Activity (Events / Move money / Need attention tiles; chips All, Money, Edits, Loans, Schedules, Account, Family, Needs attention; event cards with before → after, money impact pill, warnings, Restore / Retry / "Show all 12"; honest "starts from" note). States: loading, error (not shown as empty), offline banner, load-more failed, empty (none / filters / period), undo snackbar with a 5 s countdown bar. Component sheet: chips, badges, amount style, day header, snackbar, skeletons, empty block, scope pills.

### 1.5 What the design deliberately does not draw
Calendar and chart modes, reconcile mode, edit history inside detail, duplicate compare, saved-views manager, export sheet, the advanced AND/OR builder. The design asks us to say which to draw next.

### 1.6 The design's own recommendations
Move hide-amounts, view mode, running-balance toggle, saved views, export, rules into the overflow menu. **Merge History and the Expenses list into one screen.** Wallet detail should embed this list with the wallet locked. Insight, Upcoming and the active-filters bar appear only when there is data. Per-chip counts dropped on mobile. Delta and sparkline only for the selected currency tab. Motion: row leaves 180 ms, period slide 200 ms, sheets 250 ms, snackbar 5 s, all instant under reduced motion. Security events in a separate log, not shown to other family members.

## 2. Where the web app is today

`history.tsx` (449 lines) is a different page:
- Teal header with three stat boxes **summed in the browser from the rows loaded**, mixing currencies silently (the spec forbids this).
- **No paging:** the server returns every matching row, grouped into English labels ("TODAY", "MONDAY, OCTOBER 5") in the **server's** time zone.
- Filters: date chips, category chips (8 names), the Home kind chips, Family member filter. Search covers title and description only.
- **Transfers never appear** (the query excludes TRANSFER and DEBT types).
- Rows show icon, title, category/description, amount. No wallet, time, badges, receipts, schedule or loan links.
- Delete is a **hard delete** by long-press (confirm dialog). No undo, no trash, no bulk.
- Wallet detail has its own separate short activity list; `expense.tsx` is a second near-copy list screen.

What can be reused as is: `OptionSheet/OptionRow/Tile`, `DateTimeSheet`, `FeedChips`, `ScopePill`, `MemberAvatar`/member filter, `useWhen`/schedule helpers, the Home `Period` model (`utils/period.ts`) and `PeriodSheet`, category icons/colours/catalog, `hideBalances` preference, the receipt field, `ConfirmSheet` for scheduled items, Family permission helpers.

## 3. Gap analysis

### 3.1 Backend (the bigger half)
| # | Need (design) | Today | Work |
|---|---|---|---|
| G1 | Paged list with a cursor; 10,000 rows | Returns everything | New `GET /transactions/feed` (cursor on date+id, page 50), flat rows; the client groups by **local day** |
| G2 | Totals for the whole filter, **per currency**, count, delta vs previous equal period, daily sparkline | Client sums loaded rows | New `GET /transactions/summary` with the same filters: `{ byCurrency: [{currency, income, expense, net, count, previous, daily[]}], converted? }`. Converted tab reuses the exchange-rate service |
| G3 | Transfers as rows (both wallets, rate, in/out from a wallet's view) | Excluded | Include TRANSFER in the feed with `toWalletId`, `toAmount`, `exchangeRate`; count them as neither income nor spending |
| G4 | Row facts: wallet name/colour/currency, time, schedule (title, repeat, status), funded-by-debt, debt person and progress ("3 of 5"), receipt report | `mapTx` has none of these | Extend the feed row (joins done once per page, not per row) |
| G5 | Filters: several wallets; several types; **categories and sub-categories include/exclude, three-state**; amount min/max; receipt; source (schedule, hand, scanned, debt, transfer); specific schedules; outcome; members; flags | One category, no wallet/amount/receipt | One `FeedFilter` object parsed and validated in one place, shared by feed, summary, facets and bulk actions |
| G6 | **Faceted counts** for the filter sheet (used categories and sub-categories with count, total, last used; counts follow the other filters) | `UserSubCategory` has usage, not per-filter counts | New `GET /transactions/facets` (group-by on category/sub-category/wallet/source under the current filters) |
| G7 | Search across title, note, category (in the user's language), sub-category, wallet, amount, debt person; tokens `wallet: cat: sub: from: >5000 -wallet:` | Title + description | Server parses tokens; category names matched through a map the client sends or the server holds for four languages |
| G8 | **Recently deleted (30 days), undo, restore** | `delete` is permanent | New column `Transaction.deletedAt` (+ `deletedBy`); restore re-applies the wallet effect; a purge job after 30 days. **Every query on Transaction (≈31 places in budget, debts, home, reports, transaction, wallet services) must exclude deleted rows**: central `scopeWhere` plus an audit of the ones that do not use it |
| G9 | Bulk actions with a **preview of balance effects**, partial-failure result | None | `POST /transactions/bulk/preview` and `/bulk` (delete, change category, move wallet, shift date), per-row result with reasons; rows linked to loans, transfers and role limits are refused with a reason |
| G10 | Wallet statement: opening, in, out, closing, balanced check, running balance per row, transfers in both directions, mismatch banner | Only a 30-day balance chart | `GET /wallets/:id/statement` + running balance in the feed when one wallet is selected |
| G11 | Saved views (personal or family) | None | New table `SavedView` (name, filters JSON, sort, group, scope) |
| G12 | Upcoming section (due soon, failed, overdue, with confirm/skip) | `scheduled.waiting()` exists | Add failed items and loan instalments (the Home agenda already merges both: reuse `AgendaService`) |
| G13 | **Activity timeline** (edits before → after, deletes, wallets, budgets, schedules, exports, account, family) | Only the family log and reminders exist | New append-only `ActivityEvent` table and writes in every service; honest "starts from <date>" |
| G14 | Flags (star, reconciled, duplicate, uncategorised), notes/comments, tags | None (`description` is the note) | New columns or small tables; later phases |
| G15 | Export (PDF/CSV/Excel) | PDF code exists for debt statements | Later phase |

### 3.2 Web app
| # | Need | Notes |
|---|---|---|
| F1 | A **filter model** (one object: period, types, wallets, categories with include/exclude, amount, receipt, source, schedules, search tokens, sort, group) with pure functions to count chips, build the query, describe it in words, and sync to the address bar (so Back, links and Home's "See all" work) | Pure logic, fully unit-tested, like `period.ts` |
| F2 | Local-day grouping and day nets in several currencies; dates in the user's language and 12/24 h preference | Pure, tested |
| F3 | Row component with every variant; one badge/amount/tag system | Biggest visual piece |
| F4 | Windowed list for thousands of rows with sticky day headers | The RN-web shim has no list virtualisation. Cursor paging plus "load more on scroll" and CSS sticky is enough for 10,000 rows if pages are small and rows are cheap; a windowing library is the fallback |
| F5 | Gestures: swipe left/right with button twins, long-press select, hover and keyboard on the web (`/` to search, Esc closes sheets) | Pointer-event based; every action also lives in the peek sheet |
| F6 | Sheets: filter (with the category tree), sort/group, period (13 presets + range calendar), peek, bulk confirm, saved views | Built on `OptionSheet`; the Home period sheet becomes the same component with more presets |
| F7 | Search mode with token chips, suggestions, highlight | |
| F8 | States: skeleton, error, offline (with saved data), load-more failure, three empties, undo snackbar | |
| F9 | Wallet-focused mode and the embedded list in wallet detail | One list component, two homes |
| F10 | Activity mode, insights | Later phases |
| F11 | Theme tokens: the design's `--pos/--neg/--wr` tints, sf2, ln; the app's theme lacks positive/negative tints | Add semantic tokens once, used by Home too |
| F12 | ~250–300 new strings × 4 languages (French/Kinyarwanda/Swahili need a native reviewer) | Same process as before |

## 4. Where the design and the spec disagree (decisions I need from you)

1. **Row tap and the peek.** Spec recommends tap = detail and peek from a visible "…" button; the design draws no "…" on rows. *Proposal:* tap opens detail; **a "⋯" button on each row (always on touch, on hover on desktop)** opens the peek; long-press selects.
2. **Merge Expenses into History.** Design says yes. *Proposal:* yes: History replaces the Expenses list; its route redirects; wallet detail embeds the History list later.
3. **Soft delete.** Needed for undo and Recently deleted, but it touches every transaction query. *Proposal:* yes, done carefully in its own step with tests that prove deleted rows never reach reports, budgets, Home, wallets or debts.
4. **Currency summary default.** Design shows currency tabs with the first one selected plus a "≈ RWF" converted tab. *Proposal:* per-currency first (what the design draws), converted on request.
5. **Include loans.** Design makes it a chip at the end of the chip row and a switch in the filter sheet. *Proposal:* same, and Home's existing `includeLoans` preference stays in sync.
6. **Activity.** Needs a new event log and writes everywhere. *Proposal:* design it in, build it **after** the Money page is complete, and be honest in the UI about the start date. It is the largest single piece of backend work.
7. **Not drawn:** calendar, chart, reconcile, duplicate compare, saved-views manager, export, advanced builder. *Proposal:* leave out of the first release; saved views are in the filter sheet and search idle screen, so a minimal create/apply/delete is included; the rest wait for design.
8. **Hide amounts, running balance, view mode** go to the overflow menu (design). Hide amounts uses the existing Home preference.
9. **Retention and permissions** (spec Q8, Q9): events kept forever? Restore and revert allowed for the author and family admins only? *Proposal:* keep, author + Owner/Admin.
10. **Insight strip:** shown in the design notes, off in the frames. *Proposal:* ship with Phase 4, one dismissible insight, only when data supports it.

## 5. Plan (phases, each ends in a working, tested page)

Each phase: backend first (with tests), then web, then browser checks and screenshots (320 / 375 / 430, light / dark / Family, English plus one long language), then a tracking row in `web-only-changes.md`.

### Phase H1: foundation (rows, summary, paging)
Backend G1, G2, G3, G4 (feed, summary, transfers, row facts). Web: theme tokens (F11), filter model and day grouping (F1, F2), new header (scope pill, search, filter badge, overflow), Money | Activity switch (Activity shows "coming soon" until H5), summary card with currency tabs, delta and sparkline, kind chips with Transfers and the loans chip, the row component with all variants (F3), cursor paging, skeleton / error / offline / empty states (F8), hide amounts. The old page is replaced; `expense.tsx` redirects.
Done when: a user with 3 currencies sees correct per-currency totals; 10,000 seeded rows scroll smoothly; every row variant renders from the demo seed.

### Phase H2: find things
Backend G5, G6, G7, G12 (filters, facets, search, upcoming). Web: period navigator and the 13-preset period sheet with range calendar (extend `utils/period.ts`), filter sheet with the category tree (include/exclude, counts, recents, "show all 25") and the "more" section, active-filters bar, search mode (idle, tokens, suggestions, highlight, no results), sort/group sheet with all groupings, wallet strip, Upcoming section with Confirm / Skip / Retry / Pay now, jump to date, URL sync so Home's "See all", wallet cards and row wallet tags land correctly.
Done when: the spec's 12 example searches and the filter combinations in section 33 give correct counts on the demo data.

### Phase H3: manage
Backend G8, G9 (soft delete, restore, bulk with preview). Web: quick peek with all actions and permission reasons, swipe and long-press select, select mode and bulk bar, bulk confirm with balance effects, result sheet for partial failure, undo snackbar, Recently deleted screen, duplicate and make-recurring (reuse the Add form with the params I already added), change category with "apply to similar", move wallet.
Done when: delete → undo → restore keeps every wallet balance, budget and report exactly right (verified by checks that compare totals before and after).

### Phase H4: wallet statement and embedded list

**Status: done on the web (2026-10-30).** Delivered: `GET /transactions/statement`, `balanceAfter` per row, statement card, wallet-page entry (a "Statement and history" button; the wallet page keeps its own recent-activity list). Not done: balance-mismatch review (needs reconcile, H6), chart row on the card, embedding the shared list in the wallet page, Home chip entry points (the row wallet tag already opens the statement).

Backend G10 (statement, running balance, mismatch). Web: wallet-focused mode (wallet card, opening/in/out/closing with the balanced check, running balance, chart row), entry points from Wallets, wallet detail, Home chips and row tags, and replace the wallet detail's own list with the shared list.

### Phase H5: Activity

**Status: done on the web (2026-10-30).** Logged: transactions, wallets, budgets, loans, schedules, family. Backfill of "added" lines is in the migration; retention is one year (dropped on read); "history of this item" on the transaction and wallet pages; week summary. **By design not logged:** account / sign-in / security events (privacy), exports and reminders (nothing of value to undo). **Later:** grouped events ("12 changes"), history of this item on loan and schedule pages (the API already takes `entityId`), an Activity entry in the Expo app.

Backend G13 (event log, writes in transaction/wallet/budget/debt/schedule/reminder/export/account/family services, backfill from existing rows, retention, security-event privacy). Web: Activity mode, event cards (created, edited with before → after, deleted with Restore, status change, money event, reminder, alert, system, family, grouped), its filters and "history of this item" in detail screens, insights strip.

### Phase H6: later, after design
Saved views manager, calendar and chart modes, reconcile and balance mismatch review, duplicates compare, edit history in detail, export sheet (PDF/CSV/Excel), advanced builder, rules and clean-up tools, flags, tags, notes.

## 6. Quality gates (every phase)
- Pure-logic unit tests (filter model, grouping, totals, period presets, token parser) and backend specs for every new query; a script that runs the feed, summary and facets on the demo seed and checks they agree with each other.
- The existing `nav-check` extended with History steps; screenshots at three widths and four themes saved for review.
- Accessibility: 44 px targets, a button twin for every gesture, one-sentence row labels, no meaning by colour alone, reduced-motion.
- No regression in Home, Reports, Budget, Wallets, Debts totals (before/after numbers on the demo data).
- Translations for the four languages added together; French/Kinyarwanda/Swahili marked for native review.

## 7. Risks
1. **Soft delete touches ≈31 queries** in six services: the highest risk to money correctness. Mitigated by one central filter, an audit list, and before/after totals checks.
2. **Size.** This is larger than the Family portal. The phases above are cut so each is useful alone; H1–H3 already give a complete History.
3. **Performance** with 10,000 rows on the RN-web shim (no virtualisation): small pages, light rows, measured on the seed with 10,000 rows before moving on.
4. **Time zones:** server grouping by its own zone is a real bug today; moving grouping to the client fixes it but changes day nets, so totals per day must be computed on the client from rows of the same local day (and the summary on the server must use the user's zone for the period edges).
5. **Activity history cannot be recovered** for past edits and deletes; the UI must say so.
6. **Design gaps** (section 4) block a few details; none block H1.

## 8. Progress

### Phase H1: foundation ✅ (web, 2026-10-29)
- Backend: `feed.ts` (filter parsing, cursor paging, previous period, per-currency totals, trend) with 24 specs; `transaction-feed.service.ts` (feed, summary, converted figure); `GET /transactions/feed` and `/summary`; leak-guard compliant (scope visible in every query). `scripts/history-feed-check.ts` compares the service with independent counts on the demo data: 31 checks pass.
- Web: theme tokens; pure logic `utils/history.ts` (29 tests) and period navigation (`shiftPeriod`, `canGoNext`); service; row (all variants), summary card, chips, wallet strip, day header, states; new `history.tsx`; Expenses list now redirects to History; mock API for every state (`?many=1`, `?histerr=1`, `?sumerr=1`); 14 new browser checks in `nav-check`.
- Not yet (next phases): filter sheet, active-filters bar, richer search tokens, sort/group, 13-preset period sheet, jump to date, Upcoming (H2); peek, swipe, select, bulk, undo, Recently deleted (H3); wallet statement (H4); Activity (H5).
- Known limits in H1: the filter button and the Money | Activity switch are left out until they do something; Upcoming and the FAB are not drawn (the tab bar already has +); the period sheet is Home's (this month, last month, a month, this year, all time, custom range).

### Phase H2: find things ✅ (web, 2026-10-29)
- Backend: filter model extended (kinds, category picks with include / leave-out and retired-category folding, amount range, receipt, source, sort with position paging for amount sorts, wider search); `GET /transactions/facets`; 42 specs in `feed*.spec.ts`; the history check script now has 55 checks against the demo data, all passing; the family leak guard still passes.
- Web: filter sheet with live count and the category tree; active-filters bar; sort and group; 12 quick period choices (named on the pill); search words as filters + suggestions + recent searches; Upcoming; jump to date; `nav-check` has 20 more History steps. 89 logic tests cover the filter model, tokens, presets, grouping and the merged categories.
- H2 leftovers ✅ (2026-10-29): saved views (create, apply, rename, delete; per person or family, names unique, max 30; shown in the filter sheet and the idle search panel); Past / Upcoming / Both and specific-schedule filters (with Fixed / Repeating); due and outcome chips on the Upcoming section (failed dates show their reason and a Retry); flags (possible duplicates, uncategorised); group by category, wallet, member (family) or title with a header per group (count, per-currency net, share of spending); the whole filter lives in the address (links and reloads show the same list; other address parts such as mock switches are kept); titles and people in search suggestions. Backend: `SavedView` table + migration `20261104090000_history_saved_views`, `GET /transactions/groups`, `/suggest`, `/views` (CRUD). 594 frontend tests, 572 backend tests, nav-check all passing.
- Still not done: the "not reconciled" flag (needs the reconcile feature, H5); a "Skipped" outcome chip (skipped dates are not stored as rows).

### Phase H3: manage (web, 2026-10-29) — done on the web
- Done: **Recently deleted** (a `TrashedTransaction` copy is kept for 30 days when a transaction is deleted; Restore puts back the same id and corrects wallet, loan-pot balances; reports and budgets need no change because the row is simply back). `GET /transactions/trash`, `POST /transactions/trash/:id/restore`, `DELETE /transactions/trash/:id`; **bulk** `POST /transactions/bulk` (delete, change category, move wallet; each row stands alone, failures come back with a reason; max 200). Web: select mode (menu → Select; tap rows; Select all), bulk bar, delete confirm that states the effect on wallet balances, Undo snackbar, category and wallet pickers, per-row failure message, Recently deleted screen (`/app/trash`, linked from the History menu). 8 backend specs, 2 logic tests, 11 nav-check steps.
- Design choice: soft delete was replaced by a trash table, so none of the ~31 transaction queries had to change.
- Rest of H3 ✅: quick look (the ... button on a row, or swipe left) with Open, Duplicate, Repeat every month, Change category, Move wallet, Delete, and the reason when a row is locked (loan row, transfer); press-and-hold or swipe right starts select mode; "apply to similar" asks to change the other loaded rows with the same title; a bulk result sheet lists each row that could not change with its reason; deleting from the detail page brings an Undo back in History. Still open for later: a real peek preview card with full details, and the server-side count for "similar" (today it uses the rows already loaded).
