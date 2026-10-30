# Family F8: the features that were outside version 1

Status: PLAN ONLY (2026-10-30). Nothing below is built yet. Legend: ⬜ not started · 🟦 in progress · ✅ done.

Source list: `design/family-portal.md` section 15. Every item keeps the family rules already in place: every query goes through `scopeWhere`, a role decides what a person may do (`family-permissions.ts`), personal data never shows in a family and the other way round, each change writes to the Activity timeline and notifies through the F5 fan-out.

## 1. The nine items, what each means, and my default

| # | Feature | What it means | Default decision (change any you disagree with) | Size |
|---|---|---|---|---|
| F8a | **Comments** | A short conversation under a family transaction | Plain text, up to 500 characters, any member who can see the row may comment, the author or an admin can delete; the other members are notified (respects the "Family activity" switch) | S |
| F8b | **Goals** | A shared savings target with a name, an amount, an optional date, and a wallet or free-standing progress | A goal has a target and "saved so far"; members add a contribution (it is a normal family INCOME-less entry recorded against the goal, not a wallet change) or link a family wallet whose balance counts toward it; Owner/Admin create, Members contribute | M |
| F8c | **Approvals** | A big spend waits for an admin before it counts | Owner sets a threshold per family (off by default); a Member's expense above it is saved as PENDING, does not touch the wallet, and an Admin/Owner approves or rejects; approved posts with the original date; rejected is kept in the Activity | L |
| F8d | **Allowances** | A spending limit per member per month | Owner/Admin set a monthly limit per member (off by default); the member sees "left this month" on Add; going over warns, it does not block (blocking is the Approvals feature) | M |
| F8e | **Schedules** | Recurring family transactions | Reuse the personal scheduled engine with a `familyId`: Owner/Admin create, the family wallet is required, "remind and confirm" goes to Owner/Admin, "post automatically" posts as the creator | L |
| F8f | **Debts** | Money the family owes or is owed | Reuse the debts model with a `familyId`; Owner/Admin manage, all members read; payments come from family wallets; shown only in the family Loans tab | L |
| F8g | **Reminders** | Reminders for family schedules and debts | Reminders go to every Owner/Admin (members only for their own allowance warnings); built on the existing reminder engine once F8e/F8f exist | M |
| F8h | **Contribution transfers** | Move money between a personal wallet and a family wallet | A person may send from their own personal wallet to a family wallet (a "contribution") and the family may pay a member back (a "reimbursement", Owner/Admin only); recorded as two linked rows (an expense in one space, an income in the other) with the same group id, both visible only in their own space | L |
| F8i | **Several families** | A person in more than one family | Lift the one-family rule: `activeKey` becomes per (client, family); the switcher lists every family; the header already names which family a request is for | L |

## 2. Order I recommend, and why

1. **F8a Comments** and **F8b Goals**: self-contained, no change to money rules, quick wins.
2. **F8d Allowances**, then **F8c Approvals**: both read the same "who spent what" data that F4 added; approvals change when money counts, so they come after allowances.
3. **F8i Several families**: a schema rule change; do it before schedules and debts so those are built once with the final membership model.
4. **F8h Contribution transfers**: needs the multi-space model settled.
5. **F8e Schedules**, **F8f Debts**, then **F8g Reminders**: the largest, and they depend on each other.

Each phase ends the same way as the earlier ones: backend specs, an end-to-end check on the scratch database, web screens with mock data and `nav-check` steps, four-language strings, docs (`web-only-changes.md`, `progress.md`), and the migration listed for deploy.

## 3. Risks to settle first

- **F8c Approvals** changes the meaning of "a transaction exists". Pending rows must be excluded from every total, balance, budget and report (one shared filter, tested), and from History unless asked for.
- **F8i Several families** touches the one-active-family unique index. The migration must keep existing members working, and the switcher and header logic must never mix two families' data.
- **F8h Contribution transfers** are the only feature that crosses spaces. The two rows must be created in one database transaction, and each side must stay invisible to the other space.
- **F8e/F8f** reuse engines built for one person; every query there currently uses a plain client id, so each must be moved to the scope helper and re-run through the leak-guard spec.

## 4. Questions for the owner (the defaults above apply until answered)

1. Approvals: one threshold for everyone, or one per member?
2. Allowances: warn only (default) or block when the limit is passed?
3. Goals: should a goal count a wallet's balance, or only contributions made to the goal?
4. Several families: is there a limit (default 3)?
5. Contributions: may a person send money into a family wallet without any admin approval (default yes)?

## 5. Tracking

| Phase | Status |
|---|---|
| F8a Comments | ✅ web + backend |
| F8b Goals | ✅ web + backend |
| F8d Allowances | ✅ web + backend |
| F8c Approvals | ✅ web + backend |
| F8i Several families | ✅ web + backend (limit 3) |
| F8h Contribution transfers | ✅ web + backend |
| F8e Schedules | ✅ web + backend |
| F8f Debts | ✅ web + backend (same money rules as personal) |
| F8g Reminders | ✅ web + backend |

## What was built for F8h–F8g (2026-10-30)

- **F8h Contribution transfers.** POST /family/:id/transfers/contribute (member and above: a personal wallet of theirs to a family wallet) and .../reimburse (owner/admin: a family wallet to the member's default personal wallet in that currency). Both need the same currency and enough money. Each move makes two rows in ONE database transaction sharing Transaction.transferGroupId: an expense in the sender's space and an income in the receiver's. GET .../transfers/options feeds the screen. New actions transfer.contribute (owner, admin, member) and transfer.reimburse (owner, admin).
- **F8e Schedules.** ScheduledTransaction.familyId. The /scheduled routes now use the scope (header) instead of "personal only": owners and admins (schedule.manage) create and change, everyone reads. A family schedule must name a family wallet; "post automatically" posts as the person who made it, only while they are still in the family and may add transactions, otherwise the date fails with the reason and the owners and admins are told. Home and the agenda show the family's dates.
- **F8f Debts.** Debt.familyId. The /debts routes use the scope; owners and admins (debt.manage) manage, everyone reads. The money rules are the same as personal ones: borrowing never touches a wallet, lending takes from (and repayments return to) the family wallet that was chosen. A family Loans tab sits in the family bar.
- **F8g Reminders.** A family pay date or schedule date now makes one reminder per owner and admin (unique per date AND person). Anyone who leaves or is demoted has theirs cancelled the next time it fires or the date changes, and it is left out of their pending list. A reminder opened from the popup or the inbox switches to the family it belongs to first; its quick "Mark paid" is only offered inside that family.
