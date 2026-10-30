# Family Portal — Analysis & Plan

Status: **F1 (foundation) and F2 (scope) are built; F3 onwards is not.** Items marked **(proposed)** are my recommended defaults and wait for your confirmation (see §16).
Legend: ⬜ not started · 🟦 in progress · ✅ done · ⚠️ blocked

---

## 1. Context

Today every piece of data in the app belongs to exactly one person. `Wallet`, `Transaction`, `Budget`, `Debt`, `Reminder` and `ScheduledTransaction` all carry `clientId`, and every service filters with `where: { clientId }` (about 250 references in 15 services). Realtime works the same way: each phone joins one room, `client:<id>`.

The Family Portal adds a second place where money can live: a **family space** shared by people the user invites.

**What the user wants (confirmed):**
1. Switch between **Personal** and **Family**, in both directions, at any time.
2. In Family, see and manage **only** the family's transactions.
3. **Invite** family members so they can join.

**Everything else in this document is what those three sentences require once we look at the real project.**

---

## 2. Requirements

| # | Requirement |
|---|---|
| F1 | A user can create a family and becomes its owner. |
| F2 | A user can switch between Personal and Family; every screen shows only the active scope. |
| F3 | In Family scope the user sees and manages family wallets, transactions, budget and reports. |
| F4 | Personal data is never visible in Family scope, and family data never appears in Personal scope. |
| F5 | The owner (and admins) can invite members by link or code. |
| F6 | An invitee can join, even if they have no account yet. |
| F7 | Members have roles; a role decides what they may do. |
| F8 | Every family transaction shows who made it. |
| F9 | Members can leave; the owner/admins can remove members. |
| F10 | Family members are notified of relevant family activity, live and by push. |
| F11 | Family reports break spending down by member and category. |
| F12 | No data leaks between scopes or between families, ever. |
| F13 | Existing users and data keep working with no migration risk. |

---

## 3. Core concepts (how it works, in plain words)

- **Scope.** The place the user is "standing in": `personal`, or one `familyId`. Exactly one is active at a time.
- **Family.** A named group with one base currency. It owns its own wallets, transactions and budgets.
- **Member.** A person inside a family, with a role: Owner, Admin, Member or Viewer.
- **Author.** The person who created a row. A family transaction keeps `clientId` as the *author* and gets `familyId` as the *scope*.
- **Invite.** A single-use, expiring link/code that turns a person into a member.

**The one rule that makes it safe:** a row is in Personal scope when `familyId IS NULL` and in Family scope when `familyId = X`. Nothing is ever in both.

---

## 4. Decisions (confirmed 2026-10-29)

| ID | Decision | Why |
|---|---|---|
| D-1 | **Separate scope with an optional `familyId`** (not shared wallets, not a visibility flag on personal rows) | Matches "switch to Family and see only the family". Personal stays private by default. |
| D-2 | **One family per user in v1** | Switcher stays a simple Personal ⇄ Family toggle. Schema allows several later. |
| D-3 | **Four roles:** Owner, Admin, Member, Viewer | Parents/kids/grandparent cases (§7). |
| D-4 | **Invites by link + 6-character code**, optionally targeted at a phone/email | Works in WhatsApp/SMS without us paying for SMS. |
| D-5 | **v1 family scope covers wallets, transactions, budget, reports, notifications.** Debts, scheduled/recurring and reminders stay personal-only in v1 | Debts (roles, installments, borrowed pot) and reminders are the most complex parts; they ship later without blocking the portal. |
| D-6 | **No automatic transfers between Personal and Family wallets in v1** | Cross-scope accounting needs its own rules (§9.7). |
| D-7 | **Family has one base currency**; wallets keep their own currency; reports convert using the existing exchange-rate service | Reuses `wallet/exchange-rate.service.ts`. |
| D-8 | **Past transactions stay in the family when an author leaves** | Family history must not change because someone left. |

---

## 5. Data model

### 5.1 New tables
```prisma
enum FamilyRole    { OWNER ADMIN MEMBER VIEWER }
enum MemberStatus  { ACTIVE REMOVED LEFT }
enum InviteStatus  { PENDING ACCEPTED REVOKED EXPIRED }

model Family {
  id        String   @id @default(uuid())
  name      String
  currency  String   @default("RWF")
  createdBy String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  members   FamilyMember[]
  invites   FamilyInvite[]
  wallets   Wallet[]
  transactions Transaction[]
  budgets   Budget[]
  activity  FamilyActivity[]
}

model FamilyMember {
  id        String       @id @default(uuid())
  familyId  String
  family    Family       @relation(fields: [familyId], references: [id], onDelete: Cascade)
  clientId  String
  client    Client       @relation(fields: [clientId], references: [id], onDelete: Cascade)
  role      FamilyRole   @default(MEMBER)
  status    MemberStatus @default(ACTIVE)
  nickname  String?                      // "Dad", "Mama" — shown instead of full name (optional)
  joinedAt  DateTime     @default(now())
  leftAt    DateTime?

  @@unique([familyId, clientId])
  @@index([clientId])                    // "which family am I in?"
}

model FamilyInvite {
  id         String       @id @default(uuid())
  familyId   String
  family     Family       @relation(fields: [familyId], references: [id], onDelete: Cascade)
  invitedBy  String
  role       FamilyRole   @default(MEMBER)
  tokenHash  String       @unique         // store a hash, never the raw token
  code       String       @unique         // short code, 6 chars, uppercase, no 0/O/1/I
  phone      String?                      // optional targeting
  email      String?
  status     InviteStatus @default(PENDING)
  expiresAt  DateTime
  acceptedBy String?
  acceptedAt DateTime?
  createdAt  DateTime     @default(now())

  @@index([familyId, status])
}

model FamilyActivity {                    // who did what — an audit trail the family can read
  id        String   @id @default(uuid())
  familyId  String
  family    Family   @relation(fields: [familyId], references: [id], onDelete: Cascade)
  actorId   String
  action    String                        // 'member.joined', 'wallet.created', 'tx.deleted', ...
  targetId  String?
  meta      Json?
  createdAt DateTime @default(now())

  @@index([familyId, createdAt])
}
```

### 5.2 Changes to existing tables
| Table | Change | Notes |
|---|---|---|
| `Wallet` | `+ familyId String?` + index `(familyId)` | `clientId` = who created it |
| `Transaction` | `+ familyId String?` + index `(familyId, date)` | `clientId` = author |
| `Budget` | `+ familyId String?`; unique becomes `(clientId, familyId, month, year)` **and** one per family per month | Careful: Postgres treats NULLs as distinct in unique indexes, so the family budget needs its own partial unique index `(familyId, month, year) WHERE familyId IS NOT NULL` |
| `Client` | `+ familyMembers FamilyMember[]` | |
| `Debt`, `ScheduledTransaction`, `Reminder` | **unchanged in v1** (D-5) | Added later with the same `familyId` pattern |

**Migration safety (F13):** all new columns are nullable; existing rows keep `familyId = NULL`, which means Personal. No backfill.

### 5.3 Rules the database cannot express (enforced in code)
- A `Transaction.familyId` must equal its `Wallet.familyId`. A family transaction can only use a family wallet and vice-versa.
- A `TRANSFER` (`walletId` → `toWalletId`) needs both wallets in the same scope.
- A user has at most one ACTIVE `FamilyMember` row (D-2).

---

## 6. Scope resolution (the heart of the change)

### 6.1 How a request picks its scope
- The app sends `X-Family-Id: <id>` when Family is active. No header means Personal.
- One shared helper does the whole job:

```
resolveScope(clientId, familyIdHeader?)
  no header                → { kind:'personal', clientId, where:{ clientId, familyId:null } }
  header, active member    → { kind:'family',   clientId, familyId, role, where:{ familyId } }
  header, not a member     → 403 Forbidden
  header, family missing   → 404
```
- Every service takes a `scope` instead of a bare `clientId` and builds queries from `scope.where`. Writes set `familyId` (or null) from the scope and `clientId` from the caller.
- Role checks go through `FamilyAccessService.assertCan(scope, 'transaction.edit.other')` — one permission table, no ad-hoc `if (role === ...)` across services.

### 6.2 Why a header (not a URL prefix or a body field)
It is added once in `api.ts`, so all existing endpoints (`/wallets`, `/transactions`, `/reports/*`, `/home`, ...) work unchanged for both scopes, and a screen can never forget it. A missing header can only ever mean "Personal", which is the safe default.

### 6.3 What changes inside each service
| Service | Today | Family version |
|---|---|---|
| `wallet.service.ts` | `where: { clientId }`; one default wallet per client | `where: scope.where`; **one default per scope** |
| `transaction.service.ts` | `createInTx(prx, clientId, dto)` | also takes `scope`; checks wallet is in the same scope; stores `familyId` + author |
| `budget.service.ts` | one budget per client/month | one per scope/month; only Owner/Admin may set the family one |
| `reports.service.ts` | by client | by scope; adds `byMember` breakdown |
| `home.service.ts` | by client | by scope |
| `receipts.service.ts` | by client | by scope; receipt belongs to the transaction's scope |
| `notifications.service.ts` | per client | adds family fan-out (§10) |
| `realtime.gateway.ts` | room `client:<id>` | also joins `family:<id>` (§10) |
| `debts`, `scheduled`, `reminders` | by client | **no change in v1**; they ignore `familyId` and always run in Personal |

---

## 7. Roles & permissions

| Action | Owner | Admin | Member | Viewer |
|---|:-:|:-:|:-:|:-:|
| View family wallets, transactions, reports, members | ✅ | ✅ | ✅ | ✅ |
| Add a transaction | ✅ | ✅ | ✅ | ❌ |
| Edit / delete **own** transaction | ✅ | ✅ | ✅ | ❌ |
| Edit / delete **others'** transactions | ✅ | ✅ | ❌ | ❌ |
| Create / edit / archive family wallet | ✅ | ✅ | ❌ | ❌ |
| Delete a family wallet | ✅ | ❌ | ❌ | ❌ |
| Transfer between family wallets | ✅ | ✅ | ✅ | ❌ |
| Set family budget | ✅ | ✅ | ❌ | ❌ |
| Invite members | ✅ | ✅ (not Owner/Admin roles) | ❌ | ❌ |
| Remove members | ✅ | ✅ (Members/Viewers only) | ❌ | ❌ |
| Change a member's role | ✅ | ❌ | ❌ | ❌ |
| Rename family / change currency | ✅ | ❌ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ | ❌ |
| Delete family | ✅ | ❌ | ❌ | ❌ |
| Leave family | ❌ (must transfer or delete first) | ✅ | ✅ | ✅ |

**Rules that always hold:** there is exactly one Owner; an Admin cannot act on the Owner or other Admins; nobody can promote themselves.

---

## 8. Invitations

### 8.1 Flow
1. Owner/Admin taps **Invite** → picks role → app calls `POST /family/:id/invites`.
2. Server creates the invite: random token (stored **hashed**), 6-char code, expiry (default 7 days). Returns the link `https://<app domain>/join/<token>` and the code.
3. The app opens the system share sheet (WhatsApp, SMS, copy).
4. Invitee opens the link or types the code in **Join a family**.
5. Server validates it (pending, not expired, not revoked, family exists) and shows a **preview**: family name, who invited, role offered.
6. Invitee taps **Join** → `POST /family/join` → becomes an ACTIVE member; the invite is marked ACCEPTED.
7. Members are notified; the new member can now switch to Family.

### 8.2 Scenarios
| Scenario | Behaviour |
|---|---|
| Invitee already has an account and is logged in | Preview → Join. |
| Invitee has no account | Link opens the app/web → Register (or Google/Apple/Facebook/passkey) → the pending invite is kept → Join screen appears right after sign-up. |
| Invitee has an account but is logged out | Login → Join screen. |
| Link opened on a phone without the app | Web `frontend/` handles `/join/:token`; offers "Open in app" / store link. |
| Code typed by hand | Same validation; rate-limited (§13). |
| Invite expired | "This invite expired — ask for a new one." |
| Invite revoked | "This invite is no longer valid." |
| Invite already used | Same message as revoked (don't reveal who used it). |
| Invite targeted at phone/email but a different person opens it | Allowed only if the logged-in user's verified phone/email matches; otherwise "This invite was sent to someone else." |
| Invitee is already a member of this family | "You're already in this family." |
| Invitee is already in **another** family (D-2) | Blocked: "Leave your current family first." |
| Owner opens their own invite | "You're already the owner." |
| Family was deleted after the invite was sent | 404 → "This family no longer exists." |
| Two people use the same single-use link at once | Accept inside a transaction with a conditional update (`status = PENDING`); the second gets "already used". |
| Admin invites someone as Admin | Rejected: admins can only invite Member/Viewer. |
| Owner wants to pause all invites | **Revoke all** button. |
| Too many pending invites | Cap per family (proposed: 20). |

### 8.3 Leaving, removal and ownership
| Scenario | Behaviour |
|---|---|
| Member leaves | Status LEFT; loses access immediately (socket kicked); their past transactions stay (D-8) showing their name. |
| Owner removes a member | Status REMOVED; same effects; member sees "You were removed from X". |
| Removed/left member is re-invited | A new invite is required; the old membership row is reactivated rather than duplicated (`@@unique([familyId, clientId])`). |
| Owner wants to leave | Must **transfer ownership** to an Admin/Member first, or delete the family. |
| Owner account is deleted/deactivated | Ownership auto-transfers to the oldest Admin (then oldest member); if no one else exists, the family is archived. |
| Last member leaves/removed | Family is soft-archived and kept for 30 days (proposed) so a mistake is recoverable. |
| Family is deleted | Owner types the family name to confirm. See §9.9 for what happens to data. |

---

## 9. Scenarios by feature (based on how the project works today)

### 9.1 Switching scope
| Scenario | Behaviour |
|---|---|
| Switch Personal → Family | Context saved; all screens refetch with `X-Family-Id`; a coloured header/pill shows "Family: <name>". |
| Switch Family → Personal | Header removed; screens refetch personal data. |
| User has no family | Switcher shows **Create a family** / **Join with code**. |
| App restarts | Last scope restored from storage, but **re-validated**: if membership was lost meanwhile the server answers 403 and the app silently falls back to Personal with a notice. |
| User is removed while using Family | Next request 403 → app switches to Personal and explains. |
| Pull-to-refresh / cached lists | Cache is keyed by scope, so Family data can never flash inside Personal. |
| Deep link from a notification | Notification carries its `familyId`; the app switches scope first, then navigates. |
| Adding a transaction | Header of the Add screen shows "Adding to: Family"; only wallets of that scope are selectable. |
| Scope changes while a form is open | The form resets (don't submit a Personal draft into Family). |
| Logout / login as a different user | Scope reset to Personal. |

### 9.2 Wallets
| Scenario | Behaviour |
|---|---|
| Create family wallet | Owner/Admin only; `familyId` set; its own `isDefault`. |
| First family wallet | Automatically default (mirrors current behaviour for personal wallets). |
| Member without a family wallet to use | Add screen says "Ask an admin to create a family wallet". |
| Wallet currency ≠ family currency | Allowed; family totals are converted (D-7). |
| Archive a family wallet | Hidden from lists and pickers, history kept (same as today). |
| **Delete a family wallet** | Today wallets are hard-deleted and their transactions get `walletId = NULL` (`onDelete: SetNull`). In a shared space this silently changes everyone's history, so in Family: **Owner only, blocked if it has transactions** — archive instead. |
| Edit balance by hand | Owner/Admin only, recorded in activity log. |
| Two members add expenses on one wallet at the same instant | Safe: balance is changed with `increment`/`decrement` inside a database transaction, not read-then-write. Add a test for this. |
| Sensitive wallet fields (`accountNumber`, `accountHolder`, `last4`) | Visible to Owner/Admin only; Members see name, bank, colour, balance. |
| Wallet card colours / providers | Unchanged. |

### 9.3 Transactions
| Scenario | Behaviour |
|---|---|
| Member adds expense | `familyId` + `clientId=author`; family wallet balance updates; family notified. |
| Viewer tries to add | 403; the + button is hidden for Viewers. |
| Edit own transaction | Allowed (Member+). The existing balance reverse-and-reapply logic runs inside the same DB transaction. |
| Edit/delete someone else's | Admin/Owner only. |
| Delete | Reverses wallet balance (existing logic) and writes an activity entry: "Mama deleted 'Groceries' 12,000". |
| Move a transaction to another wallet | Target wallet must be in the same family. |
| Category list | Same 25 slugs. `loan` stays system-only (debts are personal in v1). |
| Sub-categories | Same. |
| Search / filters / history grouping | Same endpoints; plus **filter by member**. |
| TRANSFER between family wallets | Allowed; both must be in the same family; rate applied by existing quote logic. |
| TRANSFER Personal ⇄ Family | **Not allowed in v1** (D-6); error explains why. |
| Transaction authored by a member who left | Still shown, with their name (kept via `clientId`) and a "former member" tag. |
| Notes/description privacy | Visible to the whole family; the Add screen hints "Visible to your family". |

### 9.4 Receipts & scanning
| Scenario | Behaviour |
|---|---|
| Scan a receipt in Family scope | The prefilled form is a Family transaction. |
| Receipt image/PDF | Stored as today; viewable by all family members (it is a family record). |
| Upload files | Subject to the same size/type checks (`file-upload.utils.ts`). |
| Member leaves | Receipts stay with the transaction. |

### 9.5 Budget & alerts
| Scenario | Behaviour |
|---|---|
| Family monthly budget | One per family per month; Owner/Admin sets it. |
| Spending counted | Only family expenses (never personal). |
| Alerts (e.g. 80% / 100%) | Sent to Owner/Admins by default; Members can opt in. |
| Per-member limits ("allowance") | **Out of v1**; listed in §15. |
| Month rollover | Same as today. |
| Debt flows | Already excluded by `loan-filter.ts`; no debts in family v1. |

### 9.6 Reports & Home
| Scenario | Behaviour |
|---|---|
| Home in Family scope | Family balance (sum of wallets in family currency), budget bar, recent family transactions. |
| Reports | Same charts, on family data; **new: spending by member** and "top spender". |
| `includeLoans` switch | Hidden in Family (no debts). |
| Mixed-currency wallets | Converted to the family currency using the existing rate service; if rates are unavailable, show per-currency totals instead of a wrong sum. |
| Exports / PDF | Include "Family: <name>" in the header and the author column. |
| Time zones | Each member's own zone for display; reports use the **family's** zone (owner's zone at creation, editable) so month boundaries are the same for everyone. |
| Permissions | Viewers can read reports. |

### 9.7 Personal ⇄ Family money movement (deferred)
Moving money between a personal and a family wallet touches two scopes and two people's balances. Options for later:
1. **Contribution:** Personal EXPENSE "Family contribution" + Family INCOME "From <member>", linked by an id. Simple, auditable, no hidden transfer.
2. **Reimbursement:** the reverse.
Not in v1; users can record two normal transactions manually.

### 9.8 Debts, scheduled transactions, reminders (personal-only in v1)
| Feature | v1 behaviour | Later |
|---|---|---|
| Debts | Always personal. In Family scope the Debts tab shows a "Personal only" notice (or is hidden). | Family debts: who owes the household; needs role/ledger rules reviewed. |
| Scheduled / recurring | Personal only. A scheduled transaction cannot target a family wallet (`checkWallet` keeps `familyId: null`). | Recurring rent/school fees as family schedules; the poster must be a defined actor (the creator). |
| Reminders | Personal only. | "Remind the family", shared due dates. |
| Notifications from personal features | Stay private, never fan out. | |

### 9.9 Family lifecycle
| Scenario | Behaviour |
|---|---|
| Create | Name + currency; creator is Owner; first family wallet prompt. |
| Rename / change currency | Owner only. Changing currency does **not** rewrite stored amounts; it only changes the reporting currency (warn the user). |
| Delete family | Soft-archive for 30 days (recoverable); then purge. Members drop back to Personal. Family transactions are **not** copied to anyone's personal data. |
| Export before delete | Offer a CSV/PDF export to the Owner first. |
| Duplicate family names | Allowed (they are identified by id). |

### 9.10 Account & auth interactions
| Scenario | Behaviour |
|---|---|
| Register via Google/Apple/Facebook/email | Pending invite token is stored locally and applied after sign-in. |
| Passkey / biometric / face login | Unchanged; scope resets to Personal at login. |
| Password reset | Refresh tokens are deleted (existing behaviour); membership is unaffected. |
| Account deactivated (`isActive=false`) | Membership kept but treated as inactive; owner rules in §8.3 apply. |
| Account deletion | There is **no delete-account endpoint today**. Before adding one, define: personal data deleted, family transactions authored by the user are **kept and anonymised** ("Former member"), ownership transferred. |
| Phone/email change | Invites targeted by phone/email match on the verified value at accept time. |
| Verified-account requirement | Proposed: only users with a verified email **or** phone can create a family or accept an invite (prevents throwaway-account abuse). |

### 9.11 Devices, push & realtime
| Scenario | Behaviour |
|---|---|
| Family transaction added | Push + in-app notification to other active members (not the author): "Sam added −15,000 RWF · Groceries". |
| Per-member control | New preference: family activity on/off, "only large amounts ≥ X", quiet hours (reuse existing quiet-hours). |
| Language | Each recipient gets the message in their own language (existing i18n/`reminder-message` pattern). |
| Realtime | After connecting, a member joins `family:<id>` in addition to `client:<id>`. Emitting a nudge to the family room refreshes everyone's Family screens. |
| Member removed | Server calls `leave('family:<id>')` on their sockets and the next nudge never reaches them. |
| Web push | Same fan-out via `web-push.service.ts` (family subscriptions are the members' subscriptions). |
| Expo push token churn | Existing `forget(tokens)` handling stays. |
| Many members, many pushes | Fan-out is batched; failures never block the transaction (same "never throws" rule as `emitToClient`). |

### 9.12 Web portal (`frontend/`) and mobile (`expo_app/`)
Both apps share the same API and need the same screens. The web app additionally owns the `/join/:token` landing page and the well-known files for universal links (`well-known.controller.ts` already exists).

### 9.13 Languages & localisation
All new text goes through `i18n/strings.ts` in **en / fr / rw / sw**. Role names, invite messages and error messages need translation before release.

---

## 10. Notifications & realtime (design)

```
family transaction created
   ├─ DB commit (wallet balance + row)
   ├─ activity log row
   ├─ realtime: emit 'family:tx' to room family:<id>
   └─ push + inbox for each ACTIVE member except the author
        (respecting each member's preferences, language, quiet hours)
```
Nudges stay "something changed, refresh" — the data still comes from authenticated endpoints, exactly like today's gateway.

---

## 11. API surface

### 11.1 New
| Method | Path | Who | Description |
|---|---|---|---|
| POST | `/family` | any verified user without a family | Create family |
| GET | `/family/mine` | member | My family, my role, member count |
| PATCH | `/family/:id` | Owner | Rename / currency |
| DELETE | `/family/:id` | Owner | Archive family |
| GET | `/family/:id/members` | member | List members |
| PATCH | `/family/:id/members/:clientId` | Owner | Change role |
| DELETE | `/family/:id/members/:clientId` | Owner/Admin, or self | Remove / leave |
| POST | `/family/:id/transfer-ownership` | Owner | `{ toClientId }` |
| POST | `/family/:id/invites` | Owner/Admin | Create invite |
| GET | `/family/:id/invites` | Owner/Admin | List pending |
| DELETE | `/family/:id/invites/:inviteId` | Owner/Admin | Revoke |
| GET | `/family/invites/preview?token=` or `?code=` | any logged-in user | Preview before joining |
| POST | `/family/join` | logged-in user | `{ token | code }` |
| GET | `/family/:id/activity` | member | Audit trail (paged) |
| GET | `/reports/by-member` | member | Spending per member (Family scope) |

### 11.2 Existing endpoints that gain scope
`/wallets*`, `/transactions*`, `/budget*`, `/reports*`, `/home`, `/receipts*`, `/notifications*` read `X-Family-Id`. Endpoints for debts, scheduled and reminders ignore it (D-5).

---

## 12. App changes

### 12.1 State
- `context/scope-context.tsx`: `{ scope, family, role, switchTo(personal|family), refresh() }`, persisted and re-validated on launch.
- `api.ts`: adds `X-Family-Id` automatically from the scope.
- Data caches/keys include the scope.

### 12.2 Screens
| Screen | Notes |
|---|---|
| Scope switcher (Home header) | Pill with the current scope → bottom sheet: Personal · <Family> · Create / Join |
| Create family | Name, currency, first wallet |
| Join family | Code entry + invite preview + Accept |
| Family hub (Settings → Family) | Members, roles, invites, leave, delete, activity |
| Invite sheet | Role picker, link/code, share, expiry, revoke |
| Member detail | Role change, remove |
| Add / History / Wallets / Reports / Budget | Existing screens, scope-aware; author avatar on rows; "by member" filter and chart |
| Empty states | "Family has no wallet yet", "No transactions yet — be the first" |
| Visual cue | Different accent/header in Family so the user never confuses scopes |

### 12.3 Permission-driven UI
Hide actions the role can't do (e.g. + for Viewers; delete on others' rows for Members) **and** enforce on the server. UI hiding is a convenience only.

---

## 13. Security & privacy

| Risk | Control |
|---|---|
| Data leak through a forgotten `where` | Single `resolveScope` helper; services take `scope`, not `clientId`; **tests per endpoint**: non-member 403, other family's id 404, personal rows never returned in family and vice-versa. |
| ID guessing (IDOR) | Look up by `{ id, ...scope.where }` — never by `id` alone. |
| Invite token theft | Token stored hashed, single-use, 7-day expiry, revocable. |
| Code brute force | 6 chars from a 32-symbol alphabet (~1.07 billion combos) + throttling per user and per IP (extend the existing `ThrottlerModule`), lockout after repeated failures. |
| Invite spam | Per-family pending cap; per-user invite creation limit. |
| Throwaway accounts | Verified email/phone required to create or join. |
| Privilege escalation | Role changes Owner-only; "exactly one Owner" invariant enforced in a DB transaction. |
| Removed member keeps access | Membership checked **on every request** (not cached in the JWT); sockets are removed from the room immediately. |
| Sensitive wallet data | Account numbers visible to Owner/Admin only. |
| Audit | `FamilyActivity` records membership, role, wallet and delete/edit-of-others events. |
| Child/teen privacy | Viewer role + (later) per-member allowance. Personal data is never visible to the family. |
| Legal | Privacy text must explain that family members see family transactions; consent shown on Join. |

---

## 14. Edge cases checklist

- Two admins change the same member's role simultaneously → last write wins, both logged.
- Owner demotes themselves → blocked (transfer ownership instead).
- Family wallet archived while a member has an Add form open → server rejects; app shows "wallet no longer available".
- A member's phone is offline for days → on reconnect, refetch; realtime is only a nudge.
- Same person, two devices, different scopes → scope is per device (stored locally), membership is server-side.
- Clock skew / invite expiry → server time only.
- Timezone on month boundaries → family zone (§9.6).
- Currency rate missing → show per-currency totals.
- Large families (e.g. 20 members) → cap members per family (proposed 12) to keep notifications sane.
- Concurrent balance edits → atomic increments (§9.2).
- Soft-deleted family restored within 30 days → members rejoin automatically.
- App version mismatch (old app, new API) → old apps never send the header → Personal only; safe by design.
- Web and mobile apps drift → ship both or feature-flag.

---

## 15. Out of scope for v1 (future)

Family debts · scheduled/recurring family transactions · family reminders · Personal ⇄ Family contribution transfers · per-member allowances and spending limits · multiple families per user · shared shopping lists / goals · approval workflow for large spends · chat/comments on transactions · per-member category budgets.

---

## 16. Questions to confirm

1. D-1: separate family space (my recommendation) — OK?
2. D-2: one family per user in v1 — OK?
3. D-3: keep four roles, or only Owner + Member?
4. D-5: leave debts / scheduled / reminders personal-only in v1 — OK?
5. D-4: invite by link + code only (no SMS/email sending) — OK?
6. Who may create family wallets: Owner/Admin only (proposed) or any member?
7. Should Members see each other's names on every transaction (proposed yes)?
8. Max members per family (proposed 12)?
9. Is Family free, or a paid feature?
10. Ship on mobile and web together, or mobile first?

---

## 17. Phased plan

| Phase | Title | Status |
|---|---|---|
| F0 | Analysis & plan (this document) | 🟦 awaiting confirmation |
| F1 | Foundation: schema, migration, `family` module, roles/permissions, invites, tests | ✅ (backend only, see `design/progress.md`) |
| F2 | Scope resolution: `resolveScope`, scope-aware wallets & transactions, isolation tests | ✅ (backend only, see `design/progress.md`) |
| F3 | App: scope context, switcher, create/join/invite/members screens (mobile) | ⬜ |
| F4 | Family budget, reports by member, home in family scope | ✅ web + backend |
| F5 | Realtime rooms, push fan-out, preferences, activity log | ✅ web + backend (Expo not done) |
| F6 | Web portal parity + `/join/:token` + universal links | ⬜ |
| F7 | Hardening: i18n (en/fr/rw/sw), rate limits, privacy text, load/concurrency tests, account-deletion rules | ✅ except account deletion (no such feature yet) |
| F8+ | Deferred items from §15 | ⬜ |

### Checklists
**F1**
- [ ] Prisma models + migration (nullable columns, partial unique index for family budget)
- [ ] `FamilyAccessService` + permission table + unit tests for every role × action
- [ ] Create/rename/delete family, members, roles, ownership transfer
- [ ] Invites: create, preview, accept, revoke, expiry, targeting, rate limits
- [ ] Verified-account requirement
- [ ] Activity log

**F2**
- [ ] `resolveScope` + guard/decorator
- [ ] Wallet, transaction, receipts services on `scope`
- [ ] Same-scope rules (wallet ↔ transaction ↔ transfer)
- [ ] Family wallet delete rules
- [ ] Isolation test suite (403/404/leak tests) for **every** endpoint
- [ ] Concurrency test for balances

**F3**
- [ ] `scope-context`, `api.ts` header, scope-keyed caches
- [ ] Switcher, create, join, invite, members, leave screens
- [ ] Permission-driven UI and empty states
- [ ] Invite deep link handling after sign-up/login

**F4–F7**: as listed in the phase table; each ends with `tsc` clean, unit tests, an end-to-end script (like `scripts/phase1-accounting-check.ts`), and an on-device check.

---

## 18. How we'll know it works (test strategy)

1. **Unit:** permission matrix, invite validation, scope helper.
2. **Isolation (the most important):** user A (personal), B (family 1), C (family 2); prove each can only ever see their own rows through every endpoint.
3. **End-to-end script:** create family → invite → join → add/edit/delete as each role → leave/remove → delete family, asserting wallet balances at each step.
4. **Concurrency:** parallel expenses on one wallet; parallel invite acceptance.
5. **Regression:** existing suites for wallets, transactions, debts, scheduled stay green (nothing changes without a header).
6. **On-device:** switch back and forth, kill/restart app, remove a member while they're online.
