# Family Portal — Phase F2 plan (Scope: family wallets and transactions)

Status: **built and verified (see `design/progress.md`).** Changes from this plan: a stranger and a missing family both answer `403 NOT_A_MEMBER`; extra hardening found while building (request-body field whitelists, deadlock fix with retry). Parent: `design/family-portal.md`. Previous phase: F1 (done, backend only, `design/family-phase1-plan.md`).
Legend: ⬜ not started · 🟦 in progress · ✅ done · ⚠️ blocked

---

## 0. What F2 is, in one paragraph

F1 made families, members, roles and invites. F2 makes **money live inside a family**: wallets, transactions and the budget can belong to a family, and every request picks Personal or one family through an `X-Family-Id` header. This is the dangerous phase, because it changes tables and services that every current user depends on. The goal is that **a person with no family, and every old app version, sees exactly what they see today**, and that no family money can ever show up in Personal (or the other way round). Still no change to the Expo or web screens (that is F3).

---

## 1. What I found in the real code (this changes the plan)

I read the services before planning. Facts that matter:

| # | Finding | Consequence |
|---|---|---|
| 1 | The scope-sensitive code is smaller than the "250 references" in the parent plan, but it is spread out. `clientId` appears in: wallet.service 33, transaction.service 28, reports 12, home 6, budget 6, scheduled 44, debts 72, subcategories 4. Only the wallet, transaction, budget, reports and home services read or write **Wallet / Transaction / Budget** in a way F2 must change. Scheduled and debts must be **hardened** so they stay personal. | The change list in section 5 is complete, not a guess |
| 2 | **Existing security hole.** `transaction.create` and `update` take `walletId` from the request and move that wallet's balance **without checking the wallet belongs to the caller** (`createInTx` calls `prx.wallet.update({ where: { id: dto.walletId } })` directly; scheduled and debts do check, transactions do not). Today a person who knew another person's wallet id could add money to it or take it out. Ids are random UUIDs, so it is hard to exploit, but it is a real hole. | F2 needs a "wallet belongs to this scope" check anyway; I would **fix it for Personal too**, as part of F2, with a test. Needs your OK because it changes behaviour for existing users (only for the abusive case) |
| 3 | A family transaction keeps `clientId` as its **author**. So every existing Personal query written as `where: { clientId }` would also return the person's family transactions. | Every Personal query must gain `familyId: null`. This is the main leak risk, so F2 adds an automatic guard test (section 7) |
| 4 | `Budget` is unique on `(clientId, month, year)`. A person who is a member has a personal budget **and** would author the family budget, so the same key would clash. Adding a nullable `familyId` to the key does not help on MySQL (NULLs never clash). | Use a `scopeKey` column, unique with month and year (section 3) |
| 5 | `Wallet.isDefault` has no database rule; "first wallet is default" is `count === 0` per client. | Same rule per scope, in code |
| 6 | Wallet and Transaction both **cascade-delete with their `clientId` account**. There is no delete-account endpoint today. | Safe now. When account deletion is built (F7) family rows must be reassigned first. Decision D2 below |
| 7 | `notifyNewTransaction` checks the **personal** monthly budget and sums the user's expenses to alert at 80%/100%. A family expense would wrongly count toward it. | Family transactions skip the personal budget alert in F2; family alerts come in F4/F5 |
| 8 | Receipts (scan, PDF) never read `clientId`; they only produce data the transaction then stores. | Receipts need no scope change in F2 |
| 9 | Debts, scheduled and reminders look wallets up by `{ id, clientId }`. A person could today point a personal schedule at a family wallet once one exists. | Add `familyId: null` to those lookups |

---

## 2. Decisions needed from you

| ID | Question | My recommendation |
|---|---|---|
| D1 | Fix the missing wallet-ownership check for **everyone** (finding 2)? | Yes. It is a bug, and F2 needs the same check |
| D2 | When an account is deleted later, what happens to family rows it authored? | Keep them, show "Former member". Implement in F7 by re-pointing `clientId` to a placeholder account before deleting. F2 changes nothing here |
| D3 | Family budget alerts (80% / 100%) | Skip in F2; build in F4/F5 with the family budget |
| D4 | Hidden wallet details (account number, holder, last 4) | Only Owner and Admin see them; Members and Viewers see name, bank, colour, balance |
| D5 | Can a Member edit family wallets? | No (Owner/Admin only), as in the parent plan |
| D6 | Deleting a family wallet | Owner only, and **only if it has no transactions** (otherwise archive) |
| D7 | Personal ⇄ Family transfers | Not in v1 (error explains why). Still open: do you want a simple "Contribute" later |
| D8 | Database version | I need to know the hosted MySQL version. Adding a nullable column is instant on MySQL 8.0.12+; on older versions, the big `Transaction` table is rebuilt (slower, a short lock) |

---

## 3. Data model changes (all additive, nullable)

| Table | Change | Notes |
|---|---|---|
| `Wallet` | `+ familyId String?`, FK to `Family` (`onDelete: Cascade`), index `(familyId)` | `clientId` = who created it |
| `Transaction` | `+ familyId String?`, FK to `Family` (`onDelete: Cascade`), index `(familyId, date)` | `clientId` = author. Existing indexes stay |
| `Budget` | `+ familyId String?` (FK, cascade) and `+ scopeKey String` | `scopeKey` = `p:<clientId>` for personal, `f:<familyId>` for family. New unique `(scopeKey, month, year)`; the old `(clientId, month, year)` unique is dropped **after** the backfill |
| `Family` | back-relations `wallets`, `transactions`, `budgets` | No columns |

Why `Cascade` on the new `familyId` foreign keys: when a family is finally purged (F7, after the 30-day archive), its money should go with it. Archiving never deletes anything.

### Migration (the careful part)
Folder `20261102090000_family_scope`, hand-checked like the others, in this order so nothing is ever invalid:
1. `ALTER TABLE Wallet / Transaction ADD COLUMN familyId NULL` + indexes + FKs.
2. `ALTER TABLE Budget ADD COLUMN familyId NULL, ADD COLUMN scopeKey NULL`.
3. `UPDATE Budget SET scopeKey = CONCAT('p:', clientId)` (every existing budget is personal).
4. `ALTER TABLE Budget MODIFY scopeKey NOT NULL`, `ADD UNIQUE (scopeKey, month, year)`, then `DROP INDEX Budget_clientId_month_year_key`.
5. Verification SQL `prisma/verify/family_scope_assertions.sql`: no budget without a `scopeKey`; no duplicate `(scopeKey, month, year)`; every row with a `familyId` has a wallet and transaction in the **same** family; **counts of wallets, transactions and budgets are identical before and after**.
- Deploy order: back up the database, migrate, **then** deploy the new backend (the old backend keeps working with the new columns because they are nullable and the old unique is replaced only after backfill; but the old backend's budget upsert uses `clientId_month_year`, so migrate and deploy in one quick step, or deploy the code first behind the same migration — see risk R1).
- Roll-back: drop the two new columns on Wallet/Transaction and restore the old Budget unique; no data is lost because nothing family-owned exists yet at that moment.

---

## 4. Scope resolution (the core)

New small module `backend/src/modules/family/scope/` (inside the family module so it can use `FamilyAccessService`):

- **`Scope`** type: `{ kind: 'personal', clientId }` or `{ kind: 'family', clientId, familyId, role, currency, timezone }`.
- **`resolveScope(clientId, header)`**
  - no header → personal;
  - header present → read the membership **from the database** (F1's `membershipOf`); if the person is not an active member of that family → `403 NOT_A_MEMBER`; if the family is archived or missing → `404`; malformed header → `400`.
- **`@ReqScope()`** parameter decorator for controllers (reads `req.client.id` and the `X-Family-Id` header), so a controller cannot forget it.
- **Query helpers (the only place scope becomes a `where`):**
  - `scopeWhere(scope)` → personal: `{ clientId, familyId: null }`; family: `{ familyId }`.
  - `scopeData(scope)` → what to write: personal `{ clientId, familyId: null }`; family `{ clientId /* author */, familyId }`.
  - `scopeKeyOf(scope)` → `p:<clientId>` / `f:<familyId>` for budgets.
- **Permission helper** `assertScopeCan(scope, action)`: personal always allowed; family goes through the F1 permission table (`tx.add`, `tx.edit.own`, `tx.edit.other`, `wallet.manage`, `wallet.delete`, `budget.set`), already built and tested.
- The header is **never trusted**: it only chooses which family to *ask the database about*.

---

## 5. Service-by-service changes (complete list)

### Wallet service
| Method | Change |
|---|---|
| `findAll`, `summary`, `overview`, `dailyFlow`, `balanceHistory`, `activity`, `findOne` | take `scope`; query with `scopeWhere` (also for the transactions they read) |
| `create` | personal as today; family needs `wallet.manage`; the first wallet **of that scope** becomes default (count per scope) |
| `update` | scope + `wallet.manage` in family; account number, holder, last 4 only in the response for Owner/Admin (D4) |
| `remove` | personal as today; family: Owner only **and** no transactions (D6) |
| `transfer`, `quote` | both wallets must be in the **same scope**; family needs `tx.add`; error if mixed |
| `assertOwner` | renamed to `assertInScope(scope, id)`: `findFirst({ id, ...scopeWhere })` (never by id alone) |

### Transaction service
| Method | Change |
|---|---|
| `findAll`, `findRecent`, `history` | `scopeWhere`; in family scope each row also carries `author: { clientId, name }` (the F8 "who made it"), plus an optional `memberId` filter |
| `createInTx` / `create` | **check `dto.walletId` is in this scope (D1; fixes finding 2)**; family needs `tx.add`; writes `scopeData`; `fundedByDebtId` is refused in family scope; `rememberSubCategory` stays the author's private list |
| `update` | scope; family: `tx.edit.own` for own rows, `tx.edit.other` otherwise; a new `walletId` must be in the same scope |
| `remove` | same permission rule; reverses the wallet balance exactly as today |
| `notifyNewTransaction` | personal only (D3) |
| `assertOwner` | becomes `assertInScope` with the author rule |

### Budget service
`getCurrent`, `upsert` use `scopeKeyOf(scope)`; family needs `budget.set` to write, any member can read; spending is summed with `scopeWhere` so family spend never touches the personal budget and the reverse.

### Reports and Home
All aggregates (`monthly`, `byCategory`, `summary`, `topExpenses`, home `summary`, wallet totals) take `scope` and use `scopeWhere`. In family scope the debts, scheduled and reminder sections of Home return empty (they are personal-only, D5 of the parent plan). Spending-by-member is F4.

### Personal-only features, hardened (no behaviour change for anyone)
| Where | Change |
|---|---|
| `scheduled.service` `checkWallet` and the posting lookup (lines ~63, ~379) | add `familyId: null` so a schedule can never use a family wallet |
| `debts.service` wallet lookups (~110, ~361) and anything that creates transactions | add `familyId: null`; created rows keep `familyId` unset |
| `reminders`, `subcategories`, `notifications` | no change (they do not read Wallet/Transaction/Budget scope) |

### Controllers
`wallet`, `transaction`, `budget`, `reports`, `home` controllers add `@ReqScope() scope` and pass it down. Routes and response shapes do not change for Personal.

---

## 6. Rules the database cannot express (checked in code, each with a test)

1. A transaction's `familyId` equals its wallet's `familyId`; a Personal transaction can only use a Personal wallet.
2. A transfer needs both wallets in the same scope.
3. A family wallet is never reachable from a Personal request, even by id (it answers "not found").
4. Creating or moving money into someone else's wallet is refused in both scopes (finding 2).
5. In family scope, loans, "pay from borrowed money" and scheduled posting are refused.
6. Balances change with `increment` / `decrement` inside one database transaction, never read-then-write (already so; a test proves two members adding at once give the right sum).

---

## 7. Safety nets (the point of this phase)

1. **Leak-guard test (automatic).** A jest test reads the source of the services above and **fails if any query on `wallet`, `transaction` or `budget` has a `where` that mentions `clientId` without `familyId`/`scope`** (with a short, reviewed allow-list). A future developer who forgets the scope fails the build, not production.
2. **Isolation script on a real MySQL scratch database** (`scripts/phaseF2-scope-check.ts`, same pattern as F1). Three people: A (personal only), B (family 1), C (family 2), plus B's own personal money. For **every** wallet, transaction, budget, report and home endpoint it asserts:
   - A sees none of B's or C's data; B in Personal sees none of family 1; B in Family sees none of B's personal or C's;
   - a non-member sending another family's `X-Family-Id` gets 403 on each route; a made-up id gets 404;
   - another family's wallet or transaction **id** is "not found" in every route;
   - a removed member is refused on the next request;
   - balances after a mixed run equal the sum of their transactions in each scope.
3. **Unit tests** for `resolveScope`, `scopeWhere`, `scopeData`, `scopeKeyOf`.
4. **Concurrency test**: parallel expenses on one family wallet end with the right balance.
5. **Regression**: the 404 backend tests, `check:boot`, the existing phase scripts (phase1, phase3, phase4, phase6, phase7) run on a scratch database, and the Expo and web suites (to prove old clients are unaffected).

---

## 8. Work breakdown (order)

| # | Step | Done when |
|---|---|---|
| 0 | You answer D1–D8 | Answered |
| 1 | Schema + migration + assertions SQL; run on a scratch DB **with realistic data copied in** | Row counts identical before/after; assertions return no rows; `migrate diff` clean |
| 2 | `scope/` helpers and decorator + unit tests | Green |
| 3 | Wallet service + controller + tests | Green |
| 4 | Transaction service + controller + wallet-ownership fix + tests | Green |
| 5 | Budget service (scopeKey) + tests | Green |
| 6 | Reports + Home | Green |
| 7 | Harden scheduled and debts (`familyId: null`) + a test each | Green |
| 8 | Leak-guard test | Green, and I prove it **fails** when I deliberately remove a `familyId` |
| 9 | `phaseF2-scope-check.ts` isolation script on a scratch MySQL | All pass |
| 10 | Full regression (backend jest, phase scripts, `check:boot`, Expo, web) | As before, plus new tests |
| 11 | `progress.md`, parent plan status, deploy notes | Written |
| 12 | Final review of every changed file | Reported |

---

## 9. Risks

| ID | Risk | Handling |
|---|---|---|
| R1 | Old backend running against the migrated database (budget upsert uses the dropped unique) | Deploy migration and new code together; the migration keeps the old unique until the new code is live only if you ask for a two-step deploy (I can split step 4 into a follow-up migration) |
| R2 | A forgotten `familyId: null` leaks family money into Personal | Leak-guard test + isolation script |
| R3 | Slow `ALTER` on a large `Transaction` table | Nullable column: instant on MySQL 8.0.12+ (D8); otherwise schedule at a quiet time |
| R4 | Fixing the wallet-ownership hole changes behaviour for abusive calls only | Covered by tests; announced in the notes |
| R5 | Reports slower with the new filter | `(familyId, date)` index; Personal still uses the existing `clientId` indexes |
| R6 | Mixed currency in family totals | Reuse the existing exchange-rate conversion; if a rate is missing show per-currency totals (as Wallets overview already does) |

---

## 10. Definition of done

- [x] Migration applied on a scratch copy; counts before = after; assertions clean
- [x] Every route in section 5 is scope-aware; Personal answers unchanged
- [x] Wallet-ownership hole closed in both scopes, with tests
- [x] Leak-guard test passes, and was shown to fail on a deliberate mistake
- [x] Isolation script passes on a real MySQL
- [x] Concurrency test passes
- [x] 404 existing backend tests still pass (now 482); phase scripts and `check:boot` pass
- [ ] Expo and web suites (no file in either app was touched, so I did not re-run them)
- [x] `progress.md` and the parent plan updated; deploy notes written
