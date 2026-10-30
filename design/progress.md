# Progress — Debts / Credits, Reminders, Scheduling, Home

Master plan: `C:\Users\PC\.claude\plans\tranquil-sniffing-hearth.md` (Phase 0, approved).
Legend: ⬜ not started · 🟦 in progress · ✅ done · ⚠️ blocked

| Phase | Title | Status | Started | Done | Rebuild needed? |
|---|---|---|---|---|---|
| 0 | Analysis & master plan | ✅ | 2026-10-20 | 2026-10-20 | — |
| 1 | Accounting foundation | ✅ (hosted-DB deploy pending) | 2026-10-20 | 2026-10-20 | No |
| 2 | DateTimeSheet (Uber-style picker) | ✅ (on-device check pending) | 2026-10-20 | 2026-10-20 | No |
| 2b | Repeat editor + recurrence engine (new) | ✅ built (Add-screen row arrives with Phase 6 app) | 2026-10-20 | | No |
| 3 | Debt & Credit v2 (installments, ledger wallets, relationships) | 🟦 | | | No |
| 4 | Reminder engine (backend) | ✅ (migration + live push pending) | | | No |
| 5 | Reminder UX (app) | ✅ (on-device check pending) | | | Probably no |
| 6 | Scheduled & recurring transactions | ✅ (on-device check pending) | | | No |
| 7 | Home dashboard & filters | ✅ (on-device check pending) | | | No |
| 8 | Hardening, i18n review, exports | 🟦 | 2026-10-21 | | No |

Requirements covered: R1–R12 are defined in the master plan §1.

---

## Phase 1 — Accounting foundation ✅

**Goal:** make borrowing stop counting as income, link every debt transaction to its debt with a role, and give the backend ledger / related-transaction APIs, without changing wallet math.
**Covers:** R6, R7 (accounting part), R9 (API part), R12.

### Checklist
- [x] DB backup taken (`backend/backups/`, git-ignored)
- [x] Prisma schema: `DebtRole` enum, `Transaction.debtRole` + index, `Debt.principalTransactionId`, `Debt.writtenOffAmount`, `Debt.archivedAt`, `DebtStatus` + `WRITTEN_OFF` / `FORGIVEN`
- [x] Migration SQL with deterministic backfill, tested on a scratch DB with synthetic debts
- [x] `debts.service.ts`: tag `debtRole`, store principal id, re-sum paid on payment removal, atomic amount edit, write-off / reopen, archive / restore (backend only)
- [x] Ledger APIs: `GET /debts/ledger`, `GET /debts/ledger/transactions`, `GET /debts/:id/transactions`
- [x] Reports: BORROW_IN never counted as income; `includeLoans` switch (default on) on all 5 report endpoints
- [x] Budget bar and budget alerts exclude debt-tagged rows
- [x] Transaction API returns `debtId` + `debtRole`
- [x] Unit tests for pure accounting helpers (18)
- [x] End-to-end accounting script against a real scratch DB (35 checks)
- [x] App: type updates only (new statuses, new fields), Settled tab includes written-off / forgiven, flow-hint wording (en/fr/rw/sw)
- [x] `tsc` clean on backend; app shows only pre-existing unrelated errors

### Decisions applied (master plan §14)
D-1 loans included in totals, borrowing never income, "Include loans" switch (API ready, UI in Phase 7) · D-2 amount edit adjusts principal + wallet atomically (API; confirmation dialog comes with the Phase 3 UI) · D-7 archive exists in the API; the existing **Delete record button still hard-deletes** until Phase 3 changes the UI.

### What changed

**Database** (`backend/prisma/migrations/20261020180000_phase1_debt_roles/`)
- `Transaction.debtRole` (BORROW_IN / LEND_OUT / REPAY_OUT / REPAY_IN), index `(clientId, debtRole, date)`
- `Debt.principalTransactionId`, `Debt.writtenOffAmount`, `Debt.archivedAt`, `DebtStatus` gains WRITTEN_OFF and FORGIVEN
- Backfill: payments → REPAY_*, remaining debt-linked rows → BORROW_IN / LEND_OUT, principal id saved
- `backend/prisma/verify/phase1_assertions.sql` — 6 checks, all must return no rows

**Backend**
- `debts/debt-accounting.ts` (+ `.spec.ts`): pure rules — roles, directions, remaining, status, ledger totals
- `debts/debts.service.ts` + `debts.controller.ts`: tagging, principal link, sum-based recompute, atomic amount edit, `writeOff`, `reopen`, `archive`, `restore`, `ledger`, `ledgerTransactions`, `transactionsOf`; list hides archived and treats "SETTLED" as every closed status
- `common/utils/loan-filter.ts`: one shared rule used by reports, budget and alerts
- `reports/*`: `includeLoans` query flag; "Loans" label for the loan category
- `budget/budget.service.ts`, `transaction/transaction.service.ts`: budget spent + alert totals exclude debt flows; `mapTx` returns `debtId`/`debtRole`
- `scripts/phase1-accounting-check.ts`: end-to-end check (refuses to run unless the database name contains `p1test`, `scratch` or `_test`)

**App**
- `services/debt.service.ts`: new status type and fields · `services/transaction.service.ts`: `debtId`, `debtRole`, `DebtRole`
- `app/(dashboard)/debts.tsx`: Settled tab, card and sheet treat every non-OPEN status as closed
- `i18n/strings.ts`: `debts.flowHint` rewritten in 4 languages (it said borrowing counts as income)

### Behaviour changes you will notice
- Borrowing no longer appears in **Income** (reports, home "Income" figure). Wallet balance still goes up — the cash is real.
- Debt payments / lending still count as **Expense**, repayments received as **Income**.
- Lending, repaying and receiving repayment no longer eat into the **monthly budget** bar or trigger budget alerts.
- Editing a debt's amount now also corrects the original wallet movement.

### Test results
- Jest: 18 / 18 pass (`npx jest src/modules/debts`)
- End-to-end (scratch DB `p1test`, since dropped): **35 / 35 pass** — borrow, repay, remove payment, amount edit (+ reject below paid), settle, over-pay blocked, lend, receive, write-off, reopen, ledgers, related transactions, archive / restore, delete reversal, reports with and without loans, budget
- Migration verified on a scratch copy with synthetic debts (borrowed with wallet + 2 payments, lent with wallet + payment, borrowed without wallet), assertions all clean
- Applied to your local DB; assertions clean (local DB had 0 debts, so nothing to backfill)

### Known issues / things to do
1. ⚠️ **Hosted (Aiven) database not migrated yet.** Before deploying: take a `mysqldump`, run `npx prisma migrate deploy`, then run `backend/prisma/verify/phase1_assertions.sql` — every query must return no rows.
2. ⚠️ **`prisma migrate dev` is blocked on this machine**: Prisma reports 10 older migration files as "modified after applied" (a pull rewrote them; line endings / edits) and asks for a database reset. I did **not** reset. Use `npx prisma migrate deploy` for new migrations instead (it applies fine). Proper fix, if you want it: reconcile the stored checksums, or force LF line endings for `*.sql` in `.gitattributes`. Tell me and I will do it.
3. The app does not show write-off / archive / ledger yet (UI arrives in Phase 3). Existing screens keep working.
4. Ledger transaction list includes cash movements of archived debts; ledger totals exclude archived debts. Revisit in Phase 3.
5. Prisma `generate` could not replace the engine DLL while your dev server runs (file lock). The types and runtime client did regenerate; the engine itself is unchanged. Restart the dev server once to be safe.

### Next
Phase 2 starts with an **HTML prototype of the DateTimeSheet** for your approval, before any Expo code.

---

## Phase 2 — DateTimeSheet ✅ (on-device check pending)

**Goal:** our own date / time / date-time picker, reusable for due dates, pay dates, snooze and recurring schedules. **Covers:** R3.

### Checklist
- [x] HTML prototype: `datetime-sheet-prototype.html` (repo root) — rendered and checked in headless Chrome (light, dark, calendar, date-only, time-only, 24 h, "already passed" error)
- [x] Prototype approved (both defaults below accepted)
- [x] `components/datetime-sheet.tsx` + `components/wheel-picker.tsx` (pure JS, no native module, **no rebuild**) + pure date helpers `utils/datetime.ts`
- [x] `DatePickerModal` keeps its props and is now a thin wrapper → all 4 call sites (`add.tsx`, `debts.tsx`, `history.tsx`, `reports.tsx`) get the new sheet; history and reports open on the full calendar (they pick past dates)
- [x] i18n: 39 new keys in en / fr / rw / sw (parity test passes), screen-reader labels / roles / states, adjustable-wheel actions
- [x] Unit tests: 28 date-logic tests + 10 render tests (mount the real component, tap quick picks, days, calendar, confirm, cancel, range rules, 24 h)
- [ ] **On-device check** (Android, light + dark) — see "Please test" below

### What changed
- `utils/datetime.ts` — pure logic: stepping, month clamping, 6×7 calendar, day strip, range rules, wheel index maths (12 h and 24 h), relative time, quick picks
- `components/wheel-picker.tsx` — snapping wheel (centre row = selection), tap-to-select, haptic tick (never throws), fades, accessibility "adjustable"
- `components/datetime-sheet.tsx` — bottom sheet in the app's style (radius 26, grabber, theme tokens): summary card + relative time, quick picks, day strip ⇄ month calendar ⇄ month/year jump, time wheels, `min` / `max` with one-tap "Use earliest", time-zone label
- `components/date-picker-modal.tsx` — wrapper with the old props (`showTime`, `value`, `onConfirm`, `onClose`) plus optional `calendar`, `minDate`, `maxDate`
- `i18n/strings.ts` — `date.*` keys

### Behaviour notes
- **Date-only** keeps the time of day of the value you pass in (noon when none), so a "due date" keeps the same calendar day in every time zone.
- Opening with a time that is not on the minute step (e.g. an old transaction at 3:58) rounds to the nearest step (4:00).
- The picker follows the language's 12 / 24-hour convention (override with `hour12`).
- Not applied yet (no screen asks for it): `minDate` on due dates / pay dates — arrives with Phase 3 forms.

### Speed fix (reported after first use: the sheet was slow to appear)
**Cause:** the sheet built everything (30 day tiles, three wheels, dates in the app language) in one go before the phone could show it, and rebuilt locale formatters on every redraw — even while closed, each time the parent screen re-rendered.
**Fix (all in `components/datetime-sheet.tsx` and `wheel-picker.tsx`):**
- The sheet is a cheap shell; the body only exists while open, so a closed picker costs nothing.
- It opens at once with the header, summary and a **spinner**, then fills in on the next frame.
- Locale formatters and name tables are created once per language and reused.
- Day tiles, calendar cells and wheel rows are memoised, so picking a day redraws only the tiles that changed.
- Tests: opens with spinner then fills in · renders nothing while closed (12 render tests, all pass).
- If it still feels slow on your phone, tell me which screen and device; the next step would be pre-warming the sheet when its screen opens.

### Please test (needs a device; I could only test in Jest and headless Chrome)
1. Add transaction → tap the date row → wheels snap and tick; quick picks; "Calendar" toggle.
2. Debts → New debt → Due date (date-only sheet).
3. History / Reports → Custom range (opens on the calendar).
4. Dark theme; a 24-hour language (French); screen-reader reads the wheels as adjustable.
5. Rotate / small phone: the sheet scrolls inside 92 % of the screen.

### Decisions applied
1. Day strip and time wheels together on one screen. 2. Time-only fields show no relative badge.

### Prototype highlights (open the file in any browser; options panel on the left)
- Three modes: `date`, `time`, `datetime`; four sample fields (due date, first payment, remind-me-at, snooze-until)
- Live summary card with relative time ("in 1 h 4 min") · context quick-chips (In 10 min, Tonight 8 PM, Next Monday …)
- Horizontal day strip → expandable month calendar → month/year jump
- Snapping hour / minute / AM-PM wheels (minute step 1 / 5 / 10 / 15, 12 h or 24 h, tick feedback)
- Per-field "future only" rule with an inline message and a one-tap "Use earliest"; confirm disabled while invalid
- Time zone label, light and dark themes using the app's real colour tokens
- Review shortcuts: `#open=pay`, `#open=remind&h24=1`, `#open=pay&cal=1&dark=1`, `#open=pay&past=1`

### Decisions needed from you
1. Datetime shows **day strip and time wheels together** on one screen (as in the prototype). Alternative: two steps (day, then time). Default: together.
2. Time-only fields (e.g. "remind me at 9:00") show **no relative badge**, since a time of day is not an event in the past.

---

## Phase 2b — Repeat editor + recurrence engine 🟦 (design gate: prototype awaiting your approval)

**Added after Phase 2 review.** You asked how a transaction is marked as recurring: once only, or repeating forever / for a range; weekly on chosen days (Tuesday and Friday), monthly on one or more days, yearly in a chosen month.
**Covers:** R8 (recurring part). Transactions only; debts and credits do not repeat. Runs right before Phase 6, not before Phase 3.

### How it will work
- **On the normal Add transaction form** (same screen, no separate scheduling screen): a **Repeat** row directly under **Date**. Default "Does not repeat", so normal transactions are unchanged.
- It becomes a *scheduled* transaction automatically when the Date is in the future **or** a Repeat rule is set. Then "When it is due" (*Remind me to confirm* / *Post automatically*) appears, the Save button reads **Schedule**, and a note says the balance won't change until it is due. (Replaces the earlier "Schedule for later" switch idea: fewer taps, one mental model.)
- The prototype now mirrors the real Add screen: normal, recurring, and future-dated states.
- **Repeat** opens the editor: **Never · Daily · Weekly · Monthly · Yearly**, "Every N …", and the details for each:
  - Weekly → tick any weekdays (Tue + Fri).
  - Monthly → tick any days (1st and 15th, or "Last day"), **or** "the 2nd Friday" / "last Friday".
  - Yearly → tick one or more months and the day (March 5th, or quarterly).
- **Ends:** Never (forever) · On a date · After N times.
- Live plain-words summary and the **next 5 dates**, so you see exactly what will happen before saving.
- Recurring items show a ↻ badge.
### Checklist
- [x] HTML prototype `repeat-sheet-prototype.html` (8 one-click examples, light + dark) — rendered in headless Chrome
- [x] Engine verified: 30 checks pass (leap years, 31st in short months, "last Friday", every-2-weeks anchoring, quarterly, end rules, DST-stable time of day)
- [ ] **Your approval of the prototype**
- [ ] `utils/recurrence.ts` (TypeScript port, same rules) + unit tests
- [ ] `components/repeat-sheet.tsx` (pure JS, no rebuild) using DateTimeSheet for the end date
- [ ] i18n (en / fr / rw / sw) + accessibility
- [ ] Server copy of the engine arrives in Phase 6 (per-user time zone via luxon)

### Rules worth knowing (decisions D-6 and new)
- The 31st clamps to the last day of shorter months; Feb 29 → Feb 28 in non-leap years. Two chosen days that clamp to the same day (30 and 31 in February) count once.
- "Every 2 weeks on Monday" starting on a Tuesday = the next Monday, then every 2 weeks.
- A transaction dated in the future on the normal Add screen will offer **"Schedule it instead?"** so it does not change today's balance.

---

## Phase 3 — Debt & Credit v2 🟦 (design gate: prototype awaiting your approval)

**Goal:** individual pay dates with full history, virtual Debt / Credit wallets, write-off / archive in the UI, links between transactions and debts. **Covers:** R4, R5, R6, R7, R9.

### Checklist
- [x] HTML prototype: `debt-v2-prototype.html` (repo root, 7 screens, interactive, light + dark), rendered and checked in headless Chrome
- [x] Prototype approved (you opened it and said continue; tell me if you want changes)
- [x] Backend: `DebtInstallment` (append-only) + migration `20261021090000_phase3_debt_installments` (backfills open debts that had a due date), pay-date status rule `debts/debt-installments.ts` (16 tests), endpoints `POST /debts/:id/installments`, `.../:installmentId/move`, `.../:installmentId/skip`; debts now return `installments[]` (view PAID/PARTIAL/OVERDUE/UPCOMING/MOVED/SKIPPED), `nextDueAt`, derived `overdue`; write-off skips unmet dates; archived / closed debts lock pay dates; `scripts/phase3-installments-check.ts` (36 checks on scratch DB, all pass)
- [x] App (written, **not yet tried on a device**):
  - Wallets tab: two locked Debt / Credit cards at the bottom (`components/debt/ledger-cards.tsx`)
  - New hidden screen `app/(dashboard)/debt-ledger.tsx` (totals, All / Taken / Paid filter, every related transaction, load more; a row opens the debt)
  - Debts screen: pay-date timeline with Add / Move / Skip and history (`components/debt/pay-dates.tsx`), next pay date on cards, Forgive / Write off / Reopen / Archive / Restore under ⋯, **Delete is now Archive** (permanent delete only from the archive), "View archived" on the Closed tab, `/debts?openId=` deep link
  - New debt form: first pay date + time **required for debts**, optional for credits (`DateTimeSheet`)
  - Transaction detail: "Linked to debt or credit → Open" row; borrowed money note
  - Server summary overdue count now uses pay dates
- [x] i18n: 80 new `debt2.*` keys in en / fr / rw / sw (parity test passes). **fr / rw / sw are my translations: please have a native speaker skim them.**
- [x] Tests: app 71 pass (new: `debt.test.ts` 9, `pay-dates.test.tsx` 14); backend 34 unit + 37 e2e + 35 Phase 1 e2e
- [ ] On-device check (see "Please test" below), then make the server require a first pay date for new debts
- [ ] Not in this phase: reminders on these pay dates (Phases 4–5), "Nudge on WhatsApp" for credits, Home summary cards (Phase 7)

### Please test (Phase 3, needs a device and the migration applied)
1. Run `npx prisma migrate deploy` in `backend`, restart the server.
2. Wallets tab → scroll down: Debt and Credit cards show totals; tap each → ledger.
3. Debts → New → Debt: Save without touching the date works (defaults to tomorrow 6 PM); Credit: date is optional.
4. Open a debt → Add pay date, Move, Skip, Show history; record a payment and watch the oldest date turn Paid.
5. ⋯ → Forgive / Write off the rest; Archive; Closed tab → View archived → Restore.
6. History → tap a debt transaction → "Linked to debt or credit" opens the debt.

### Backend notes
- Migration is applied to a local scratch DB only (`expense_p3_test`). **Your dev DB and the hosted Aiven DB still need `prisma migrate deploy`** (mysqldump first for Aiven). Restart the dev server after, because Prisma could not replace its engine DLL while it runs.
- A pay date with no amount means "the rest": it takes whatever the dated amounts leave over, so dates never add up to more than owed.
- The server does not force a pay date on new debts yet (older app builds would break); the new form will require it.

### What the prototype shows
1. Wallets tab: two locked "System" cards (what I owe / owed to me): taken, paid, fully paid.
2. and 3. Ledger screens: totals plus every related transaction, each tagged Borrowed / Debt payment / Lent / Received.
4. List: Debt / Credit / Closed tabs, overdue bar, "Nudge on WhatsApp" on credits.
5. Detail: left to pay, pay-date timeline (Paid / Partly paid / Upcoming / Overdue); Move and Skip keep the old date as history; payments with Undo; forgive and archive under the ⋯ menu.
6. New debt: pay date **required** for debts with reminders on; optional for credits with reminders off.
7. Transaction detail: "Linked to debt" row that opens the debt.

### Rules shown (please confirm)
- Payments fill pay dates **oldest first**; no extra bookkeeping, so undoing a payment simply recalculates.
- Moving a pay date never edits the old row; it is marked Moved and a new one is added.
- "Delete record" becomes **Archive**; permanent delete only from the archive.

---

## Phase 4 — Reminder engine (backend) ✅ (migration + real push test pending)

**Goal:** a server that reminds you about debt pay dates by push, email and inbox, keeps nagging until you act, and lets you snooze. **Covers:** R1, R2 (backend half).

### How it works
- **One reminder per pay date.** It follows the debt's *next unpaid* pay date and walks a fixed timeline: **1 day before → 1 hour before → at due time → +30 min → +2 h → then once a day for 7 days** (same local clock time, DST safe). Steps already in the past when a reminder is created are skipped silently; a date that is already overdue fires once straight away.
- **Kept in step automatically** after every change to a debt (create, add / move / skip a pay date, payment, undo payment, forgive, reopen, archive, restore, reminders switched off): paid → reminder completed; moved / skipped / forgiven / archived → cancelled; payment undone → starts again; **dismissed stays dismissed**.
- **Delivery per fire:** inbox (one row per reminder, refreshed and set unread each time, not a new row), push, and email only on the first lead, at due time and once a day when late.
- **Protections:** quiet hours (server side, the whole fire waits until quiet time ends), daily push cap (default 8 per 24 h, inbox still updates), 3 or more at once → one digest push, a push/email switch each, dead device tokens removed after delivery receipts (~15 min later).
- **Reliability:** every reminder is claimed with a 2-minute lease before sending (two workers can never send the same one; a crash re-fires instead of losing it). After downtime each reminder fires once, never a burst.
- **Runs inside the server** every minute (+ a catch-up 5 s after start) and via a secret URL for UptimeRobot: `GET /reminders/tick?key=<REMINDER_TICK_KEY>` (404 if the key is unset or wrong).

### API
`GET /reminders/pending` · `POST /reminders/:id/snooze` `{minutes: 10|30|60|1440|10080}` or `{until: ISO}` · `POST /reminders/:id/done` · `/dismiss` · `/opened` · `PATCH /notifications/preferences` now also takes `timezone`, `quietEnabled`, `quietStart`, `quietEnd`, `remindersPush`, `remindersEmail`, `dailyPushCap` (all validated). Debts: `remind` on create and `remindersOn` on update (default **on for a debt, off for a credit**).

### Changes
- Migration `20261022090000_phase4_reminders` (new `Reminder`, `ReminderFire`; `NotificationType.reminder`; preference columns; `Debt.remindersOn`). Prisma's drift check against the migrated scratch DB is empty.
- `src/modules/reminders/`: `reminder-policy.ts` (timeline, time zones, quiet hours, snooze, caps), `reminder-message.ts`, `push.service.ts` (expo-server-sdk, receipts), `reminders.service.ts`, `reminders.controller.ts`, `reminders.scheduler.ts`; `src/Templates/reminder.hbs`.
- New packages: `@nestjs/schedule`, `expo-server-sdk`. `tsconfig.build.json` now excludes `scripts/` (they had pushed the build output to `dist/src/main.js`, which would have broken `npm run start:prod`).

### Test results
- Jest: 72 pass (33 policy, 5 message, 34 debt rules incl. earlier).
- `scripts/phase4-reminders-check.ts`: about 60 end-to-end checks with a simulated clock, fake push and email (timeline, no double send, two workers at once, snooze, paying / undoing, moving, dismiss, forgive, overdue-at-creation, quiet hours, cap, digest, push off, receipts, security, tick URL, preference validation): all pass. The Phase 1 and Phase 3 end-to-end checks still pass too.
- The built app starts, maps every route, `/reminders/pending` needs login, `/reminders/tick` needs the key.

### Decisions
| ID | Decision |
|---|---|
| D-12 | Quiet hours move the whole fire (inbox too) to the end of quiet time, instead of inbox-now / push-later. Simpler and nothing is lost. |
| D-13 | ~~Reminder text English only~~ Resolved in Phase 5: the app sends its language, reminder text is written in en / fr / rw / sw (emails keep English body text for now). |
| D-14 | Existing debts keep reminders **off** after the migration (nothing starts pushing by surprise). The switch arrives with the Phase 5 screens; until then only debts created from now on have it on. |

### Add to `backend/.env` (I did not touch your file)
- `REMINDER_TICK_KEY=<long random string>` (then point UptimeRobot at `https://<host>/reminders/tick?key=…`; verify the free plan keeps the query string)
- optional `EXPO_ACCESS_TOKEN` (higher push limits), optional `REMINDERS_DISABLED=true` on a second copy of the server
- Make sure the hosted server runs **Node 20+** and that `src/Templates/reminder.hbs` ships with it.

### Known limits
1. Not tried with a real phone: the push path is tested with a fake sender. Real delivery needs the migration applied, a dev build with a push token, and a debt due soon.
2. ~~The app does not handle reminders yet~~ Done in Phase 5.
3. ~~Time zone defaults to UTC~~ The app now sends the phone's zone and language at login (Phase 5); a reminder created before that keeps the zone it was created with until it is rescheduled.
4. Only debt pay dates are reminded. Scheduled transactions come in Phase 6.

---

## Phase 5 — Reminder experience (app) ✅ (built and tested in Jest; on-device check pending)

**Goal:** make Phase 4 reminders visible and controllable in the app. **Covers:** R1, R2 (app half).

### Checklist
- [x] HTML prototype: `reminder-ux-prototype.html` (repo root, 5 screens + 3 sheets, interactive, light + dark)
- [x] Prototype approved (you said continue; tell me if you want changes)
- [x] `components/reminders/reminder-host.tsx` `ReminderModalHost`, mounted in `app/(dashboard)/_layout.tsx`: popup queue, reloads on launch, when the app comes forward, on a reminder push tap, and every 60 s. × is not an answer (hidden until it fires again or the app is reopened)
- [x] Snooze sheet (10 min / 30 min / 1 h / 1 day / 1 week / custom through `DateTimeSheet`) and Mark paid sheet (records a real payment, wallet optional, refuses more than what is left)
- [x] Push: `reminder` category with Snooze 10 min / Snooze 1 h / Open buttons (JS only, `services/reminder-push.ts`), plain tap shows the popup, Open goes to the debt; non-reminder pushes still open the inbox
- [x] Inbox: reminder rows (alarm icon, Reminder chip, tap opens the debt)
- [x] Debt detail: `ReminderRow` ("Remind me" switch, next reminder time, "Snoozed until…", **Wake now**); New debt form: switch (on for a debt, off for a credit)
- [x] Settings: Payment reminders (push / email switches, daily limit, detected time zone); quiet hours now saved on the server
- [x] Time zone, app language and a one-time copy of the old phone-only quiet hours are sent to the server at login (`hooks/use-reminder-prefs-sync.ts`)
- [x] Server follow-ups: `language` preference (migration `20261023090000_phase5_reminder_language`), reminder text in en / fr / rw / sw, `POST /reminders/:id/wake`, debts return `remindersOn`, `reminderId`, `reminderStatus`, `nextReminderAt`
- [x] i18n: 60 new `rem.*` keys in 4 languages (**fr / rw / sw are my translations: please have a native speaker skim them**, including the server-side reminder text in `reminder-message.ts`)
- [x] Tests: app 127 pass (new: popup 22, row 7, push 10, utils 17); backend 72 unit + all end-to-end checks
- [ ] **On-device check** (see below). Push action buttons are reported unreliable on some phones, so they must be tried on yours

### Please test (needs the migrations applied and a dev build)
1. `npx prisma migrate deploy` in `backend` (now 4 migrations), restart the server. Until then the server logs one "Reminder tables are missing" line and reminders stay idle.
2. Create a debt due in ~5 minutes with the "Remind me" switch on. Wait: a push arrives, the inbox gets one Reminder row, and opening the app shows the popup.
3. In the popup: Snooze → 10 min, then the debt screen shows "Snoozed until…" and **Wake now** works; Mark paid with a part amount; Dismiss.
4. Close the popup with × and reopen the app: it comes back. Close it and wait for the next fire: it comes back.
5. Lock the phone and tap **Snooze 10 min** on the push (and Open).
6. Settings → Notifications: switch quiet hours on around the current time and check a due reminder waits until quiet time ends.
7. Switch the app language to French and check the next reminder text is in French.
8. Open an **older** debt: the Remind me switch is off; switch it on.

### What the prototype shows
1. **Popup** over any screen: queue ("1 of 3"), person, amount left, due time, "reminded N times". Buttons: **Mark paid**, **Snooze**, **Open debt**, **Dismiss this reminder**. The × only closes it and does **not** count as an answer, so the reminder returns on schedule.
2. **Lock-screen push** with Snooze 10 min / Snooze 1 h / Open, and a digest push for a pile-up.
3. **Inbox**: one refreshed row per reminder with a Reminder chip.
4. **Debt detail**: "Remind me" switch, next reminder time, snooze status with "Wake now".
5. **Settings**: Push / Email / Inbox switches, quiet hours (server side), daily limit, auto-detected time zone.

### Decisions to confirm
- **Mark paid** records a payment (amount defaults to what is left, optional wallet), it is not a bare tick.
- **Quiet hours** become one server setting; the old phone-only setting is copied once, then ignored.
- **Existing debts** get a one-tap way to switch reminders on (the switch on the debt screen), since they were left off by the migration.

---

## Phase 2b + 6 — Repeat editor and scheduled transactions ✅ (built and tested in Jest; on-device check pending)

**Goal:** a transaction can be scheduled for later and can repeat (weekdays, days of the month, "2nd Friday", yearly months, forever or until a date / N times). **Covers:** R8. Transactions only: debts and credits do not repeat.

### Done
- **Recurrence engine** `utils/recurrence.ts` (app) and the identical file `backend/src/modules/scheduled/recurrence.ts`: works on wall-clock time, so 9:00 stays 9:00 across daylight saving; validates every rule the server receives. Ported from the approved prototype, same results. 51 tests in each place.
- **Wording** `utils/recurrence-text.ts`: "Every Tuesday and Friday at 9:00 AM, until 31 Dec 2027" in en / fr / rw / sw (70 new `rep.*` keys; **fr / rw / sw are my translations, please have a native speaker skim them**).
- **Repeat sheet** `components/repeat-sheet.tsx`: Never / Daily / Weekly / Monthly / Yearly, interval stepper, weekday circles, days of the month (+ last day), "weekday of the month", months, end rule (never / on a date / after N), live "next 5 dates". 17 render tests.
- **Backend** (`backend/src/modules/scheduled/`): migration `20261024090000_phase6_scheduled_transactions` (`ScheduledTransaction`, `ScheduledOccurrence`, `Transaction.scheduledOccurrenceId` unique, `Reminder.occurrenceId`); endpoints `GET/POST /scheduled`, `GET/PATCH/DELETE /scheduled/:id`, `POST /scheduled/:id/pause|resume`, `GET /scheduled/waiting`, `POST /scheduled/occurrences/:id/confirm|skip`.
- Reminders now also cover scheduled items (same timeline, push, email, inbox, snooze); `GET /reminders/pending` returns `source: 'DEBT' | 'SCHEDULED'`.

### How it behaves
- A scheduled item always has exactly **one future date lined up** (plus any past dates not yet answered). **Remind & confirm** (default) sends reminders and nothing moves until you tap Pay / Mark received (amount or wallet can differ for that one date). **Post automatically** creates the transaction at the due time.
- **Never posts twice**: the occurrence flips to POSTED and the transaction is created in one database transaction, and the transaction carries the occurrence id under a unique index. Two confirms at the same moment: one wins, one is refused.
- **Failures are never silent**: wallet archived or gone → the date is marked FAILED with the reason, you get a notification, and you can retry after fixing it. A failed date is not retried by itself.
- **After downtime**: missed dates are caught up with their original dates, capped at 31 (oldest first); the rest are dropped and the schedule continues from now.
- **Pause** deletes waiting dates and never backfills on resume. **Edit** of amount / title keeps the waiting date; a timing change replaces waiting dates and keeps history. **End** keeps everything already posted. "After N times" ends by itself.
- Needs a **first date in the future** (5 min grace). Time zone defaults to the person's setting and is stored with the schedule.

### Test results
- Jest: backend 129 (incl. 51 engine), app engine 51 + wording 23 + sheet 17.
- `scripts/phase6-scheduled-check.ts`: 96 end-to-end checks (validation, one-time, recurring, no double post incl. simultaneous confirms, overrides, skip, auto-post, catch-up and cap, pause / resume, edits, end, "after N", failure and retry, security, reminders wording / pending list / completion, French text, snooze, time zones and a daylight-saving change): all pass. Phases 1, 3, 4 checks still pass. The built app starts and every route is mapped and protected.

### App (done, tested in Jest; not yet tried on a device)
- [x] **Add screen**: Repeat row under Date (shows the rule in words), "Remind me to confirm / Post automatically" once it is scheduled, header and button change to "New scheduled transaction" / "Schedule · repeating", first date must not be in the past, and a **receipt warning** (a schedule cannot carry one, so it asks before dropping it). A future date alone also makes it scheduled. Ordinary transactions are unchanged.
- [x] **Scheduled screen** (Profile → Money → Scheduled): "Waiting for you" (Pay now / Mark received, Skip this date) and every schedule with its rule in words, Paused / Auto chips and next date; detail sheet with next 5 dates, history (failed dates show why and have **Try again**), Edit (title, amount, repeat, mode: only changed fields are sent), Pause / Resume, End.
- [x] **Popup, push and inbox** handle scheduled items (Pay now / Mark received, Skip this date, Open schedule); the push Open button and inbox rows open the schedule.
- [x] i18n: 56 `sched.*` keys in 4 languages (**fr / rw / sw are my translations, please have a native speaker skim them**).
- [x] Tests: app **284** pass (new: Add screen scheduling 12, Scheduled screen + detail 24, popup scheduled 11, form logic 22, push 3); backend 129 + all end-to-end checks.
- [ ] On-device check (see below), then apply the 5 new migrations to your dev and hosted databases.

### Fix after your question: payments and lending now start on a wallet
A debt payment, a loan you give, a loan you receive and a repayment you receive each create their transaction (expense / income, tagged as a loan so reports can separate it) **only when a wallet is chosen**, because without a wallet no money moved from or to any of your accounts. The New debt form, the debt screen and the reminder popup all started on **"No wallet"**, so many payments recorded nothing in Expenses. They now start on the debt's own wallet, else your default wallet in that currency. "No wallet" is still one tap away and still records nothing. If you would rather record these even without a wallet (as an expense that does not touch any balance), tell me and I will change the rule.

### Please test (Phase 6)
1. Add → choose Weekly (Tue + Fri) → Schedule: nothing changes in the wallet; Profile → Scheduled shows it with the right words.
2. Add a transaction dated tomorrow: it becomes "Schedule"; with a receipt attached it warns first.
3. Make one due in ~5 minutes with "Remind me": a push arrives, the popup shows **Pay now**; confirm it and check the expense appears in History and the wallet drops.
4. Same with "Post automatically": it appears by itself at the due time.
5. Pause, resume, edit the amount, End; check what was posted stays.
6. Record a debt payment with a wallet and check it appears as an expense (category Loan); lend money and check the expense, then record the repayment and check the income.

### Known limits
1. The server runs scheduled posting on the reminder tick, so `REMINDERS_DISABLED=true` also stops it.
2. A wall-clock time that does not exist on a daylight-saving "spring forward" day lands an hour later that day only.
3. Catch-up after a very long outage drops the newest dates beyond the cap, not the oldest.

---

## Phase 7 — Home dashboard ✅ (built and tested in Jest and end-to-end; on-device check pending)

**Goal:** Home shows the whole picture: everyday money, loans, what needs attention, and a feed you can filter. **Covers:** R10.

### Checklist
- [x] HTML prototype `home-dashboard-prototype.html` approved (you said continue)
- [x] Backend `GET /home/summary?month&year&includeLoans`: month income / expense / net (loans switch), a loans line (out, in, borrowed: always reported), debts you owe and credits owed to you per currency (amount, open, overdue, soonest pay date), scheduled (waiting count + next), **needs attention** (overdue and within-3-days pay dates, plus scheduled dates waiting; overdue first, capped at 10 with a total), **net worth per currency** (wallets + owed to you − you owe; archived wallets ignored)
- [x] Backend feed filter `?view=all|income|expense|debt|credit|scheduled&includeLoans=false` on `/transactions`, `/transactions/recent` and `/transactions/history`, combined with the other filters and the search (an unknown view means all)
- [x] App Home: **Include loans** switch (remembered) with the loans line, debts / credits / scheduled cards, Needs attention (3 rows, "See all (n)"), Net worth rows, filter chips (remembered), a Loan tag on debt rows, borrowed money not coloured as income, "Loans never count against your budget" note, **"See all" opens History with the same chip and loans choice**
- [x] History: the same six chips at the top, reading the filter Home passes
- [x] i18n: 34 `home.*` keys in 4 languages (**fr / rw / sw are my translations, please have a native speaker skim them**)
- [x] Bug fixed in History while testing: a timer started when the screen opens could fire 300 ms later with the old filters and undo a chip or category you tapped in the meantime
- [x] Tests: app **337** pass (new: Home screen 15, Home blocks 23, History filter 6, helpers 9); backend **136** unit + **40** new end-to-end checks (a realistic month, loans on / off, per-currency cards, net worth, attention order, feed filters, other people see nothing); Phases 1, 3, 4, 6 checks still pass
- [ ] On-device check, then apply the 5 pending migrations to your dev and hosted databases

### Differences from the prototype
- The **Scheduled** chip lists what schedules have posted (the "upcoming dates" rows from the prototype are on the Scheduled screen and the card instead).
- **Net worth** only appears once you have a debt or credit (otherwise it would just repeat your balance).
- Debts & credits, Needs attention and Net worth are hidden entirely for someone with none.
- The header's month figures now come from the new summary, so they follow the loans switch.

### Please test
1. Open Home with a few debts: cards, Needs attention and Net worth appear; tap each.
2. Flip **Include loans** off: income, spent and net change, the line under them changes, the feed refreshes; flip it back.
3. Tap Debt, Credit, Income, Expense, Scheduled chips; close and reopen the app: the chip is remembered.
4. With a debt chip on, tap **See all**: History opens on the same chip.
5. In History tap a category quickly right after opening: it stays filtered.

### Closed since
The "no wallet" question was answered: every debt and credit event is now always recorded (see **Change: Debt & Credit wallets** below).

---

## Change: Debt & Credit wallets (your request, after Phase 7) ✅

**New rules**
- **A debt (money I borrowed) never uses one of my wallets.** No "money goes into / comes from" choice when creating it or paying it. Borrowing is recorded as money in (never counted as income in totals) and paying as money out, kept under the **Debt wallet**. An older app that still sends a wallet for a debt is ignored.
- **A credit (money I lent) keeps the wallet choice**: lending takes money from the wallet you choose, and a repayment goes into the wallet you choose (it starts on the credit's own wallet, else your default; "None" is still one tap away).
- **Everything is always recorded.** Before, a payment or loan with no wallet recorded nothing, which is why they were missing from Expenses / Income. Now a transaction is always created (a credit with "None" records it without touching any balance).
- The Debt wallet and Credit wallet stay **summary cards** (you chose this over making them real wallets with their own balance).

**New screens**
- **Debt wallet / Credit wallet** now list **only the debts (or credits) that were created**, one card each: who, note or phone, total, a **horizontal bar of paid versus left** (Received for credits), overdue / settled / forgiven tags, next pay date and a reminder bell. No payment rows are mixed in. Open ones first (overdue on top), closed after; All / Open / Closed filter.
- Tapping a card opens that debt's details, which now start with a **DETAILS** block: total, paid / received, forgiven, left, started, next pay date, final pay date, **next reminder** (or "Off"), phone and note, followed by the reminder switch, record payment, pay dates and payments.
- The "+" button on Debts got a screen-reader label.

**Tests**: app **383** pass (new: debt cards and details 25, Debt / Credit wallet screens 11, Debts wallet rule 8; popup tests rewritten for the new rule); backend 136 + the Phase 1, 3, 4, 6, 7 end-to-end checks, updated for the new rules (Phase 1 now also checks: no wallet moves for a debt, a credit without a wallet is still recorded, an old app's wallet is ignored).

**Things to know**
1. **Borrowed money no longer shows up in any of your wallets.** If you receive the cash into MoMo, add that to MoMo yourself with a normal transaction (that one is counted as income).
2. **Net worth** is wallets + owed to you − you owe, so a debt now lowers it by the full amount even if you spent nothing: the borrowed cash is not in a wallet.
3. **Currencies**: transactions carry no currency, so the month totals and the loans line add raw amounts. A USD debt of 50 now adds 50 there (it used to record nothing). Per-currency totals are only exact on the debt and credit cards and net worth.
4. Debts created before this change that used a wallet keep their old wallet movements; only new events follow the new rule.

---

## Phase 8 — Hardening 🟦 (partly done; on-device check pending)

**Done**
- Startup opens Home: the old settings hub no longer shares the `/(dashboard)` address (renamed `hub`, shows nothing, sends to Profile).
- Borrowed-money pot: pay an expense from a debt's unspent money (Add screen "Or pay from borrowed money"); `Debt.spent`, `Transaction.fundedByDebtId`; migration `20261025090000_borrowed_pot` (**not yet applied**: run `npx prisma migrate deploy`, mysqldump first for hosted). Unit tests: `borrowed-pot.spec.ts`.
- Debt/credit statement PDF: `GET /debts/:id/statement`, "Share statement (PDF)" button on the debt details. Tests: `debt-statement-pdf.spec.ts`, button test.
- Fixed receipt share/save (`expo-file-system` v57 no longer has `cacheDirectory`; now `expo-file-system/legacy`). Removed 3 old type errors.
- i18n guard: test that every literal `t('key')` used in code exists.
- Indexes reviewed: reminder, scheduled and debt queries already indexed; nothing added.

**Not done**
- Undo after recording/deleting a payment (the API does not return the new payment's id; needs a small change + design).
- Native-speaker review of fr/rw/sw strings.
- Regression checklist run on a real device.
- Known: `budget.tsx` (2) and `history.tsx` (1) type errors from before.

**Tests:** backend 142, app 385, all pass.


## Decision log
| ID | Date | Decision | By |
|---|---|---|---|
| — | 2026-10-20 | Ledger-style Debt wallet; second Credit ledger; migrate old data; UptimeRobot keeps Render awake | you |
| D-1…D-11 | 2026-10-20 | Defaults in master plan §14 approved with the plan | you |
| D-15 | 2026-10-21 | Debts never use my wallets; credits keep the wallet choice; every debt / credit event is always recorded; Debt and Credit wallets stay summaries and list one card per debt / credit | you |

## Regression checklist (run after every phase)
- [ ] Date pickers: Add transaction, New debt due date, History / Reports custom range
- [ ] Add expense / income; wallet balance changes correctly
- [ ] Scan receipt → fills Add form → saves
- [ ] History: filters + search
- [ ] Wallets: create / edit / transfer / exchange
- [ ] Reports + budget bar
- [ ] Debts: create, record payment, delete payment, delete debt, Settled tab
- [ ] Login, passkey screen, notifications inbox

## Categories v2 (category + subcategory sheet)
Prototype: `design/category-sheet-prototype.html` (approved). Built in the Expo app, the backend and the web app (`frontend/`, same files ported with scripts/port.mjs; `npm run build:web` rebuilds `backend/web`).
- **Ten categories** people see (spending): Food, Transport, Bills, Shopping, Personal, Entertainment, Giving, Business, Finance, Other. Income: Salary, Business, Freelance, Investments, Gifts, Refunds, Savings, Other. The stored names are unchanged where they can be: `health` = Personal, `gifts` = Giving, `insurance` = Finance.
- **Retired:** groceries, fuel, travel, rent, utilities, subscriptions, personal_care, education, family. The migration `20261028090000_categories_v2` moves every transaction and scheduled transaction to the new category (setting the subcategory Groceries / Fuel / Rent / Family support where the old name says it). The server also maps them for older app versions (`backend/src/common/utils/categories.ts`).
- **Subcategories:** about 340 items in `expo_app/constants/category-catalog.ts` (category > group tab > item). Only the item is stored (`subCategory`). Items are English on purpose; category and group names are translated.
- **Private list:** table `UserSubCategory` (per account, kept apart for spending and income). Saved when a transaction or schedule is saved with a subcategory; `GET /subcategories`, `DELETE /subcategories/:id`.
- **Screen:** `expo_app/components/category-sheet.tsx` (two steps, group tabs, search that also knows brand names), used by the Add screen.
- **Before deploying:** back up the database, `npx prisma migrate deploy`, then run `backend/prisma/verify/categories_v2_assertions.sql` (every query must return no rows).
- **Not done:** on-device check, native-speaker review of the French/Kinyarwanda/Swahili names.


## Loans & debts naming, and the estimated loan payment
- **Names (screens, all four languages, both apps, and the server's own messages and PDF):** money I borrowed is a **Loan** (it was Debt); money other people owe me is a **Debt** (it was Credit). Stored values stay BORROWED / LENT. French uses Emprunt / Créance ("dette" there means what you owe). The tab is now "Loans", the wallets "Loan wallet" and "Debt wallet".
- **Estimated payment (loans only):** a loan can say how much you expect to pay each time and how often (the same repeat picker as scheduled transactions). The server keeps pay dates ready until the loan is paid off (`backend/src/modules/debts/debt-plan.ts`, `debt-plan.service.ts`; new columns `Debt.planAmount/planRepeat/planStartAt/planTimezone` and `DebtInstallment.fromPlan`, migration `20261029090000_loan_payment_plan`).
  - A date that is still ahead and made by the plan is re-worked after every change, so extra payments shorten it and the last date asks only for what is left.
  - Past dates, dates added by hand, and moved or skipped ones are never rewritten. A missed payment stays owed on its own date. A skipped date pushes the end back by one.
  - Reminders say how much to pay on that date and how much is left in total. Stopping the plan removes only the dates it made.
  - An hourly job keeps long plans topped up (36 dates ahead at a time).


## Family portal — Phase F1 (foundation, backend only)
Plans: `design/family-portal.md` (whole feature), `design/family-phase1-plan.md` (this phase), prototype `design/family-portal-prototype.html`. **Status: F1 done (backend only). No app or web change; no existing table touched.**
- **What exists now:** tables `Family`, `FamilyMember`, `FamilyInvite`, `FamilyActivity` (migration `20261101090000_family_foundation`, only new tables); module `backend/src/modules/family/` (service, invites service, access service, controller, one permission table); registered in `app.module.ts`. Nothing in the apps calls it yet, so deploying changes nothing for users.
- **API (all need sign-in):** `POST /family`, `GET /family/mine`, `PATCH|DELETE /family/:id`, `GET /family/:id/members`, `PATCH|DELETE /family/:id/members/:clientId`, `POST /family/:id/transfer-ownership`, `POST|GET /family/:id/invites`, `DELETE /family/:id/invites/:inviteId`, `POST /family/:id/invites/revoke-all`, `GET /family/invites/preview`, `POST /family/join`, `GET /family/:id/activity`. Errors carry a stable `code` (for example `INVITE_EXPIRED`) for the apps to translate later.
- **Decisions used (assumed from the plan, not yet confirmed by the owner):** four roles (Owner, Admin, Member, Viewer); one active family per person; at most 12 members and 20 pending invites; invites last 7 days and are shared by link plus a 6-character code (32-symbol alphabet, no 0/O/1/I); only accounts with a verified email or phone can create or join; debts, schedules and reminders stay personal.
- **Built for MySQL (the parent plan assumed Postgres):** "one active family per person" is a unique `activeKey` column (the client id while active, NULL otherwise), not a partial index. The same idea (`scopeKey`) will be needed for budgets and default wallets in F2.
- **Access is read from the database on every call**, never from the login token (the token is only signature-checked), so a removed member is refused on the very next request. A stranger asking about a family id gets "not found", never "forbidden".
- **Invites:** only a hash of the token is stored; the token is shown once; revoked and used invites give the same answer; wrong codes count towards a lock (10 a day, then 15 minutes, in memory) on top of the route throttle (5 a minute).
- **History survives accounts going away:** activity and invite rows keep plain ids (no foreign key to Client).
- **Tests:** backend 247 → 404 (permission matrix for every role and action, codes, 30 service tests, 31 invite tests incl. races). `scripts/phaseF1-family-check.ts` ran against a scratch MySQL: all passed, including the database refusing a second active family and one winner when two people use one invite. `npm run check:boot` passes. `prisma migrate diff` shows no drift. Expo and web were not touched.
- **Before deploying:** back up the database, `npx prisma migrate deploy`, run `backend/prisma/verify/family_foundation_assertions.sql` (every query must return no rows), restart the backend.
- **Known limits / next:** the wrong-code lock is per instance (fine for one Render instance); the 30-day purge of archived families is F7; account deletion rules are F7; realtime and push for family events are F5. **Next: F2 (scope resolution, family wallets and transactions, isolation tests).**


## Family portal — Phase F2 (scope: family wallets, transactions and budget)
Plan: `design/family-phase2-plan.md`. **Status: F2 done (backend only). No app or web change.** A person with no family, and every old app version (they never send the header), sees what they saw before.
- **Database (migration `20261102090000_family_scope`):** `familyId` (nullable, indexed) on `Wallet`, `Transaction` and `Budget`; `Budget.scopeKey` (`p:<client>` or `f:<family>`, backfilled for every existing budget) with a new unique `(scopeKey, month, year)` replacing `(clientId, month, year)`. `familyId` rows are deleted with their family when it is finally purged. Verification SQL: `prisma/verify/family_scope_assertions.sql`.
- **Scope:** every request is Personal (no header) or one family (`X-Family-Id`). `ScopeService.resolve` reads the person's membership from the database each time; a stranger, a made-up id and an archived family all answer the same `403 NOT_A_MEMBER`. Controllers use `@UseGuards(ClientJwtAuthGuard, ScopeGuard)` and `@ReqScope()`; forgetting the guard fails loudly (500), it never falls back to Personal. All filters come from `scopeWhere`, new rows from `scopeData`, budgets from `scopeKeyOf` (`backend/src/modules/family/scope/`).
- **Wallets:** per scope; the first wallet of a scope is its default; Owner/Admin create and change family wallets; only the Owner deletes one, and only if it has no transactions; account number, holder and last 4 are hidden from Members and Viewers; transfers need both wallets in the same scope (`WRONG_SCOPE` otherwise).
- **Transactions:** Members and above add to a family; Members edit and delete their own, Admin/Owner anyone's; a Viewer only reads; each family row says who added it (`author`); filter by `memberId`; loans and "pay from borrowed money" are personal only; no personal push or budget alert for a family transaction (family notifications are F5).
- **Budgets:** one personal and one family budget per month, never mixed; Owner/Admin set the family one.
- **Reports and Home:** all totals follow the scope; Home in a family has no loans, debts or schedules. Spending by member is F4.
- **Hardening of existing code (found while reading, fixed here for everyone):** (1) `transaction.create`/`update` took `walletId` from the request and changed that wallet's balance without checking it belonged to the caller; (2) `wallet.update` and `transaction.update` spread the raw request body into the database, so a body naming `clientId`/`familyId` could move a row to another account or family (now whitelisted); (3) **two people adding to one wallet at once could deadlock in MySQL** (the row was inserted before the wallet was updated): the wallet is now changed first, transfers lock in a fixed order, and a deadlock is retried.
- **Personal-only features** (`scheduled`, `debts`) now look wallets up with `familyId: null`, so they can never use a family wallet.
- **Leak guard (`scope/leak-guard.spec.ts`):** an automatic test fails the build when a query on wallets, transactions or budgets does not use the scope. Proven by breaking one query on purpose. Anything unscoped is on a reviewed allow-list with a reason.
- **Tests:** backend 404 → 482. New: scope helpers (28), wallet (17), transaction (20), budget (6), leak guard (7). `scripts/phaseF2-scope-check.ts` (88 checks, three runs) on a scratch database: nobody sees, changes or reaches another scope's money; every balance equals its start plus its transactions; 12 parallel expenses on one family wallet leave the exact balance. Existing phase scripts 1, 3, 4, 6, 7 and `check:boot` pass; `prisma migrate diff` shows no drift; row counts before and after the migration were identical (4 clients, 8 wallets, 200 transactions, 8 budgets).
- **Two old check scripts were stale from earlier work and were corrected, not changed in behaviour:** phase 3 expected "Restore this debt" (the wording is now "loan"); phase 6 expected category `rent` (retired in Categories v2, now `bills`).
- **Deploy order:** back up the database, `npx prisma migrate deploy`, run `backend/prisma/verify/family_scope_assertions.sql` (every query returns no rows) and compare the wallet, transaction and budget row counts with those noted before, then deploy the backend **immediately**: the old backend's budget save used the unique key that this migration replaces, so it would fail until the new code is running.
- **Not verified:** the migration and all tests ran on the local database (MariaDB 10.4). The hosted MySQL version is unknown; the SQL uses only standard statements. Expo and web were not touched and not re-run.
- **Known limits / next:** account deletion must hand family rows over first (F7); family budget alerts and push to other members are F5; spending by member and family home polish are F4; the app and web screens (switcher, create, join, invite, family wallets and history) are F3.

## Family portal — Phase F3 (screens: Expo app and web)
Plan: `design/family-phase3-plan.md`; live task list: `design/family-f3-tasks.md`. **Status: F3a (Expo) and F3b (web) built and tested in code; nothing yet run on a real phone or a deployed server.**
- **Switching space:** a pill on Home opens "Where are you?" (Personal, each family, create, join). Choosing a space rebuilds the tabs (Home first) so nothing from the other space stays on screen. The choice is remembered and checked against `GET /family/mine` on launch; losing access (403 `NOT_A_MEMBER`) falls back to Personal once. Family screens use a purple accent.
- **Screens:** Family hub (members, roles, invites, activity), create, join (code or link), invite sheet, member sheet, family balance card, member filter on History, who-added on each transaction, "Personal only" screen for Loans, schedules and reminders inside a family, a Viewer has no big + button.
- **Requests:** one HTTP client adds `X-Family-Id` only for wallets, transactions, budget, reports and home; a test fails if any screen talks to the server another way.
- **Invites:** 6-character code, or a link `/join/<token>`. On web the secret is removed from the address bar at once, kept in this tab only, and the server sends `no-store` and `no-referrer`. Signed-out people are asked to sign in first and the invite is kept (7 days).
- **Backend touches:** B1 serves `/join/*` to the web app; B2 headers for that page. Both ship with the backend deploy.
- **Web:** same screens ported; mock data (`?mock=1&role=OWNER|ADMIN|MEMBER|VIEWER`, `nofamily=1`, code `K7M2QX`); `nav-check` walks switcher, hub, invite, join page.
- **Tests:** Expo jest 505 → 800; web vitest 450; backend jest 499; Expo `tsc` shows only the 3 older errors (budget.tsx x2, history.tsx).
- **Before turning on invite links:** `INVITE_LINK_ENABLED` in `expo_app/utils/family-invite.ts` (and the web copy) is `false`. Set it to `true` only after the backend and the rebuilt `backend/web` are deployed.
- **Not verified:** real phone, real browsers, the deployed `/join` page; fr/rw/sw strings (about 190 new keys) need a native speaker; decisions D1–D12 in the plan are unconfirmed.
- **Device/browser test list:** switch Personal → Family → Personal on Home, Wallets, History (no data from the other space); create a family; invite by code and by link while signed in and signed out; join as Member, Viewer (no + button, no edit); remove a member while they are inside the family (they fall back to Personal); Loans inside a family shows "Personal only"; 320 px width on all family screens.


### F3b follow-up (web): own family bar, real-backend run
- **Family bottom bar (web):** inside a family the bar is Home, Wallets, Add, Settings (four equal tabs, no round button, no Loans). Settings opens the family settings (the hub); the hub has an "App settings" row to language, theme and sign out. A Viewer has no Add tab. The Expo app still has the old bar (to do).
- **Currency:** inside a family every amount (Home header, history, budget, add) uses the family's currency, not the person's display currency (it showed `$2,500` for a 2,500 RWF expense). Settings screens still use the person's own setting (`useCurrencySetting`).
- **Real backend run (scratch database `p1test_web`):** `backend/scripts/web-e2e-seed.ts` signs in two people and walks create family, wallet, invite, join, scoped transaction, isolation, personal-only loans and the `/join` page headers: all pass. The real web build was driven in a headless browser against that server (login, switch into the family, Home, Wallets, Settings hub) with correct family currency and bar.
- **Invite links:** web `INVITE_LINK_ENABLED` is now `true` (link base = `PUBLIC_APP_URL` on the server; set it on Render). The Expo flag is still `false`.
- **Checks:** vitest 451, tsc clean, nav-check passes (one old deep-link check is occasionally slow and fails once, then passes on rerun), pwa-check passes, `backend/web` rebuilt.

## Web follow-up: Home period, schedules, Scheduled page (2026-10-29)

- Home: period pill and sheet (month / year / all / custom range), default period setting, budget as a slim bar in the net card (this month only), "Schedules" card with days left plus a "Plan a schedule" starter card; net card label spelled out.
- Scheduled page: status cards and kind filters, loan and credit pay dates listed with scheduled items (`GET /home/agenda`).
- Backend: `common/utils/period.ts` (+ spec), `home/agenda.ts`, `agenda.service.ts` (+ spec); `/home/summary` and `/transactions/recent` take a period.
- Everything that exists on the web but not on Expo is tracked in `design/web-only-changes.md`.

## History redesign, phase H1 (web, 2026-10-29)

See `design/history-web-plan.md` section 8. Feed and summary endpoints, the new History page (summary card, chips, wallet strip, day groups, paging, search, states), and the tracking row W17 in `design/web-only-changes.md`.

## History redesign, phase H2 (web, 2026-10-29)

See `design/history-web-plan.md` (Phase H2) and row W18 / B8 in `design/web-only-changes.md`.

- 2026-10-29 — History H2 leftovers (web): saved views, schedule/phase/due/flag filters, group by category/wallet/member/title, whole-filter address, suggestions. See history-web-plan.md and web-only-changes.md (B9, W19). Needs migration 20261104090000_history_saved_views on deploy.

- 2026-10-29 — History H3 part 1 (web): select mode, bulk delete/category/wallet, Undo, Recently deleted. Needs migration 20261105090000_trashed_transactions on deploy. See history-web-plan.md (B10, W20).

- 2026-10-30 — History H4 (web): wallet statement card, running balance per row, wallet-page entry. No new migration. Mismatch detection needs reconcile (H6); the "Adds up" check is arithmetic only. See history-web-plan.md (B11, W21).

- 2026-10-30 — History H5 part 1 (web + backend): Activity timeline for transactions and wallets. Needs migration 20261106090000_activity_events on deploy. Not yet logged: budgets, debts, schedules, reminders, exports, account, family; no backfill (honest "kept from" date); no retention job; no "history of this item" in detail screens or insights strip. See history-web-plan.md (B12, W22).

- 2026-10-30 — History H5 finished (web + backend): loans, budget, schedules and family also logged, backfill in the migration, one-year retention, week summary, tabs, history of this item on transaction and wallet pages.

- 2026-10-30 — History H6 part 1 (web + backend): balance check against the real account with an optional visible adjustment. Needs migration 20261107090000_wallet_reconcile on deploy. Still open in H6: saved-views manager, calendar and chart modes, duplicates compare, export, advanced filter builder, tags and notes.

- 2026-10-30 — History H6 part 2: CSV export. Still open in H6 (need design first): saved-views manager, calendar and chart modes, duplicates compare, PDF/Excel export, advanced filter builder, tags and notes.

- 2026-10-30 — Family F4, F5, F7 (web + backend): spending by member, push/inbox fan-out and live refresh for family changes, family budget alerts to all members, per-person switch, 30-day purge of archived families. Already in place from F1-F3: rate limits, privacy text, concurrency tests. Not built: account deletion (there is no delete-account feature yet, so no hand-over rule to enforce) and the F8+ items in family-portal.md section 15 (family debts, schedules, reminders, contribution transfers, allowances, approvals, several families, goals, comments), which are new product features. Needs migration 20261108090000_notify_family on deploy.

- 2026-10-30 — Family F8a comments and F8b goals (web + backend). Needs migration 20261109090000_family_goals_comments. Next in design/family-f8-plan.md: F8d allowances, F8c approvals, F8i several families, F8h contribution transfers, F8e schedules, F8f debts, F8g reminders.

- 2026-10-30 — Family F8d allowances and F8c approvals (web + backend). Needs migrations 20261110090000_family_allowances and 20261111090000_family_approvals. Approvals keep a held expense in its own table so nothing that sums transactions can ever count it.

- 2026-10-30 — Family F8i several families (web + backend). Needs migration 20261112090000_several_families BEFORE the new backend runs (it rewrites activeKey). The old "ALREADY_IN_FAMILY" rule is gone; the code stays in the list for older apps. Left in design/family-f8-plan.md: F8h contribution transfers, F8e schedules, F8f debts, F8g reminders.

- 2026-10-30 — Family F8h contribution transfers, F8e schedules, F8f debts, F8g reminders (web + backend). Needs migrations 20261113090000_contribution_transfers, 20261114090000_family_schedules, 20261115090000_family_debts and 20261116090000_family_reminders (the last one replaces two unique indexes: take a backup first). This finishes the F8+ list in design/family-f8-plan.md. Not yet checked on a real phone or against a real MySQL.

- 2026-10-30 — History H6 leftovers (web + backend): saved-views manager, calendar and chart modes, duplicates compare, Excel and PDF export, advanced filter builder, tags and notes. Needs migration 20261117090000_history_tags_notes. Backend 696 tests, frontend 618 tests and the navigation check pass; not tried on a real phone or MySQL. fr / rw / sw text not reviewed by a native speaker.
