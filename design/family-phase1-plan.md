# Family Portal — Phase F1 plan (Foundation)

Status: **built and verified (see `design/progress.md`).** Parent document: `design/family-portal.md`. Prototype: `design/family-portal-prototype.html`.
Legend: ⬜ not started · 🟦 in progress · ✅ done · ⚠️ blocked

---

## 0. What F1 is, in one paragraph

F1 builds the **backend foundation** of families: the tables, the family module, roles and permissions, members, invites, the activity log, and the tests that prove all of it. **Nothing in the Expo app or the web app changes, and no existing table is touched.** Nobody can see a difference, which is the point: it is additive and cannot affect current users. Everything is exercised by tests and an end-to-end script. Scope switching, wallets and transactions in Family come in F2.

---

## 1. Decisions I am assuming (change any before I start)

These are the §16 answers I would take if you say "go with your recommendations".

| # | Decision | Assumed |
|---|---|---|
| A1 | Separate family space with an optional `familyId` | Yes |
| A2 | One active family per person in v1 | Yes |
| A3 | Roles | Owner, Admin, Member, Viewer |
| A4 | Debts, scheduled, reminders stay personal in v1 | Yes |
| A5 | Invites by link + 6-character code only (we send no SMS or email) | Yes |
| A6 | Who creates family wallets | Owner and Admin only (used in F2) |
| A7 | Members see each other's names on transactions | Yes |
| A8 | Maximum members per family | 12 |
| A9 | Maximum pending invites per family | 20 |
| A10 | Invite lifetime | 7 days |
| A11 | Free feature | Yes (no billing code in F1) |
| A12 | Who may create or join a family | Only accounts with a verified email **or** phone (`emailVerifiedAt` or `phoneVerifiedAt` set) |

---

## 2. Scope

### In F1
1. Prisma models: `Family`, `FamilyMember`, `FamilyInvite`, `FamilyActivity` (+ enums) and one migration.
2. A new `family` Nest module: service, controller, DTOs.
3. One permission table and a `FamilyAccessService` that every family action goes through.
4. Create, read, rename and delete (archive) a family; list members; change a role; remove a member; leave; transfer ownership.
5. Invites: create, list, revoke, preview, accept; expiry; caps; targeting by phone or email; brute-force protection.
6. Activity log (written on every membership event, readable by members).
7. Unit tests, a service-level test with in-memory fakes (the pattern already used in this repo), an end-to-end check script, boot check, progress notes.

### Not in F1 (and why)
| Item | Where it goes | Why not now |
|---|---|---|
| `familyId` on `Wallet`, `Transaction`, `Budget` | F2 | It touches existing tables and the scope refactor; F1 stays purely additive |
| `resolveScope` and the `X-Family-Id` header | F2 | Same |
| Any screen in Expo or web | F3 / F6 | The backend must be proven first |
| Realtime rooms and push for family events | F5 | Needs F2 data to be worth sending |
| Translations of app text | F3 / F7 | F1 has no app text. API error messages are English; the app maps error codes to translated text later |
| Account deletion rules | F7 | There is no delete-account endpoint today; F1 only makes sure nothing in F1 blocks adding one |

---

## 3. Corrections to the parent plan that F1 builds in

The parent plan was written for Postgres. I checked the real project and these are built differently:

1. **MySQL, not Postgres.** No partial unique indexes, and NULLs are distinct inside unique indexes. F1 therefore does not rely on either. The "one active family per person" rule uses a **`activeKey` column** (see 4.2) instead of a partial index. (The budget and default-wallet equivalent, `scopeKey`, is designed in F2.)
2. **Access tokens are not checked against the database.** `ClientJwtAuthGuard` only verifies the JWT signature. A removed member's token stays valid for up to its lifetime. So **every family request re-reads the membership row** from the database. Nothing about family access is ever read from the token.
3. **The global rate limit is 60 requests a minute.** Code entry needs its own much stricter limit, set with `@Throttle` on those routes (the repo already uses `@Throttle` in `client-auth.controller.ts`).
4. **`onDelete: Cascade` on `Client`.** Family tables reference `Client`. F1 uses `onDelete: Cascade` on `FamilyMember.client` (membership goes with the account) but **never cascades into family-owned content**; `FamilyActivity.actorId` and invite `invitedBy`/`acceptedBy` are plain strings (no foreign key) so history survives account removal. F2 applies the same idea to transactions (`createdById` set to NULL).

---

## 4. Data model (exact)

### 4.1 New enums
`FamilyRole { OWNER ADMIN MEMBER VIEWER }`, `MemberStatus { ACTIVE REMOVED LEFT }`, `InviteStatus { PENDING ACCEPTED REVOKED EXPIRED }`, `FamilyStatus { ACTIVE ARCHIVED }`.

### 4.2 New tables
**Family**: `id`, `name` (1–60 chars), `currency` (3 letters, default RWF), `timezone` (default from the creator, IANA name), `status` (ACTIVE | ARCHIVED), `archivedAt?`, `createdBy`, `createdAt`, `updatedAt`.

**FamilyMember**: `id`, `familyId` (FK, cascade), `clientId` (FK to Client, cascade), `role`, `status`, `nickname?` (≤ 30), `joinedAt`, `leftAt?`, `activeKey String? @unique`.
- `activeKey` is set to `clientId` while the member is ACTIVE in an ACTIVE family and set to `NULL` when they leave or are removed. Because MySQL allows many NULLs in a unique index but not two equal values, this **guarantees one active family per person at the database level**, even if two requests race.
- `@@unique([familyId, clientId])` so a re-joining person reuses their row.
- `@@index([clientId])`, `@@index([familyId, status])`.

**FamilyInvite**: `id`, `familyId` (FK, cascade), `invitedBy` (string), `role` (Admin, Member or Viewer only), `tokenHash @unique` (SHA-256 of the random token), `code @unique` (6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), `phone?`, `email?`, `status`, `expiresAt`, `acceptedBy?`, `acceptedAt?`, `createdAt`. `@@index([familyId, status])`.

**FamilyActivity**: `id`, `familyId` (FK, cascade), `actorId` (string), `action` (string), `targetId?`, `meta Json?`, `createdAt`. `@@index([familyId, createdAt])`.

**Client**: add the back-relation `familyMembers FamilyMember[]` (no column).

### 4.3 Migration
- Folder `20261101090000_family_foundation` (next after `20261029090000_loan_payment_plan`).
- Hand-checked SQL, generated with `prisma migrate diff` as I did for the earlier migrations; **only `CREATE TABLE` and `CREATE INDEX`**, no `ALTER` on existing tables.
- A verification script `prisma/verify/family_foundation_assertions.sql`: all four tables exist, `activeKey` is unique, `tokenHash` and `code` are unique, existing tables unchanged (row counts and column lists).
- Roll-back note: dropping the four tables is a complete undo, because nothing else references them.

---

## 5. Permissions

One table in `family-permissions.ts`, a pure function `can(role, action, ctx)`. **No `if (role === ...)` anywhere else.**

Actions (F1 implements the whole table even though some are only used in F2, so the table is tested once):
`family.view`, `member.list`, `invite.create`, `invite.create.admin`, `invite.revoke`, `invite.list`, `member.remove.lowerRoles`, `member.remove.any`, `member.role.change`, `family.rename`, `family.delete`, `ownership.transfer`, `member.leave`, `activity.view`, and for F2: `tx.add`, `tx.edit.own`, `tx.edit.other`, `wallet.manage`, `wallet.delete`, `budget.set`.

Rules that hold regardless of the table (checked in the service, each with a test):
- Exactly one OWNER at any time.
- Nobody changes their own role.
- An Admin cannot act on the Owner or another Admin.
- An Admin can only invite Member or Viewer.
- The Owner cannot leave; they must transfer or delete.
- An invite can never grant OWNER.

---

## 6. The module and its files

All under `backend/src/modules/family/`:

| File | Purpose |
|---|---|
| `family-permissions.ts` (+ `.spec.ts`) | The permission table and `can()`; every role × every action tested |
| `family-codes.ts` (+ spec) | Invite code and token generation, hashing, normalising typed codes (trim, uppercase, map `0→O`-style confusions are *not* accepted, the alphabet excludes them) |
| `family.service.ts` | Create, get mine, update, archive, members, roles, remove, leave, transfer ownership, activity |
| `family-invites.service.ts` | Create, list, revoke, preview, accept, expiry sweep |
| `family-access.service.ts` | `membershipOf(clientId)`, `assertMember`, `assertCan` — **reads the database on every call** |
| `family.controller.ts` | The routes in section 7, `ClientJwtAuthGuard` on all |
| `dto/family.dto.ts` | Validated input (class-validator, as the other modules do) |
| `family.module.ts` | Imports `ClientAuthModule`, `PrismaModule`; registered in `app.module.ts` |
| `family.service.spec.ts`, `family-invites.service.spec.ts` | Service tests with in-memory fakes |

Plus `scripts/phaseF1-family-check.ts` (end-to-end, same style as `phase1-accounting-check.ts`) and a line in `scripts/boot-check.ts` coverage (the whole app must still start).

---

## 7. API (every route, with its exact behaviour)

All routes need a signed-in user. All answer errors with `{ statusCode, message, code }`, where `code` is a stable string the app will translate later (for example `FAMILY_INVITE_EXPIRED`).

| Method / path | Who | Behaviour |
|---|---|---|
| `POST /family` | Verified user with no active family | Creates the family and the OWNER membership in one database transaction; writes `family.created`. `409 ALREADY_IN_FAMILY`, `403 NOT_VERIFIED` |
| `GET /family/mine` | Anyone | Returns `{ family, role, memberCount, limits }` or `null` |
| `PATCH /family/:id` | Owner | Rename, change currency or timezone. A currency change does not rewrite amounts; the response says so |
| `DELETE /family/:id` | Owner | Body `{ confirmName }` must match. Sets ARCHIVED, ends every membership (`activeKey` cleared), revokes pending invites, writes activity. Data is kept 30 days (purge job is F7) |
| `GET /family/:id/members` | Member | Name, nickname, role, joined date. **No email or phone** are returned to other members |
| `PATCH /family/:id/members/:clientId` | Owner | `{ role }` to Admin, Member or Viewer. `409` if it would break the one-Owner rule |
| `DELETE /family/:id/members/:clientId` | Owner/Admin per rules, or the person themselves | Remove or leave. Sets REMOVED/LEFT, clears `activeKey`, writes activity |
| `POST /family/:id/transfer-ownership` | Owner | `{ toClientId }` must be an ACTIVE member; old Owner becomes Admin; one database transaction |
| `POST /family/:id/invites` | Owner/Admin | `{ role, phone?, email? }`. Checks: member cap 12 (counting pending invites), pending cap 20, admin-only-by-owner. Returns `{ code, link, expiresAt }` **once**; only the hash is stored |
| `GET /family/:id/invites` | Owner/Admin | Pending invites, with the code but never the token |
| `DELETE /family/:id/invites/:inviteId` | Owner/Admin | Revoke (works at once) |
| `POST /family/:id/invites/revoke-all` | Owner/Admin | The "pause everything" button |
| `GET /family/invites/preview?token=` or `?code=` | Any signed-in user | Returns family name, who invited, role. Same strictness as accept |
| `POST /family/join` | Verified user with no active family | `{ token }` or `{ code }`. Accepts inside a database transaction with a conditional update so a double tap or two people cannot both win |
| `GET /family/:id/activity` | Member | Paged, newest first |

Throttling: `preview` and `join` get a strict per-user limit (5 attempts a minute, then a 15-minute cool-down after 10 wrong tries a day), plus the usual per-IP limit.

---

## 8. Invite rules (every case I will implement and test)

| Case | Result |
|---|---|
| Valid, pending, not expired | Preview works, join works |
| Expired (`expiresAt` passed; checked with server time only) | `410 FAMILY_INVITE_EXPIRED`; the row is marked EXPIRED |
| Revoked, or already used | `410 FAMILY_INVITE_INVALID` (the same message, so we never reveal who used it) |
| Wrong code or token | `404 FAMILY_INVITE_NOT_FOUND`; counts toward the failure limit |
| Joiner is already in this family | `409 ALREADY_MEMBER` |
| Joiner is in another family | `409 ALREADY_IN_FAMILY` ("leave your current family first") |
| Joiner is the family's Owner | `409 ALREADY_MEMBER` |
| Family archived after the invite was made | `404 FAMILY_GONE` |
| Targeted by phone or email, but the signed-in user's **verified** phone/email does not match | `403 INVITE_FOR_SOMEONE_ELSE` |
| Two people accept the same single-use invite together | One succeeds, the other gets `INVALID` (conditional update on `status = PENDING`) |
| Family already has 12 active members | `409 FAMILY_FULL` |
| An Admin tries to create an Admin invite | `403` |
| Unverified account tries to join | `403 NOT_VERIFIED` |
| A person who previously left or was removed accepts a new invite | The old `FamilyMember` row is reactivated (not duplicated) |

---

## 9. Concurrency and integrity (the part most likely to go wrong)

- Create, accept, remove, leave and transfer are each **one database transaction**.
- The one-Owner and one-active-family rules are protected by the database (`activeKey`) and by a conditional update, not just by "check then write".
- Role changes by two admins at once: last write wins, both are in the activity log.
- Tests include **parallel** invite acceptance and parallel creation by the same person.

---

## 10. Tests (nothing is optional)

| Group | What it proves |
|---|---|
| Permissions | Every role × every action matches section 7 of the parent plan; the invariant rules above |
| Codes | The alphabet has no `0 O 1 I`; tokens are unique; only the hash is stored; typed codes are normalised |
| Create / lifecycle | Create, rename, archive; unverified user refused; second family refused; name confirmation on delete |
| Members | List hides email and phone; role change rules; remove rules per role; leave; Owner cannot leave; transfer ownership keeps exactly one Owner |
| Invites | Every row of section 8; expiry; caps; revoke-all; targeting |
| Access freshness | A removed member's very next request is refused even with a still-valid token |
| Concurrency | Parallel accept → one winner; parallel create → one family |
| Activity | One row per event with the right actor and action; readable only by members |
| Regression | The existing backend suite (247 tests) stays green; `check:boot` passes; no existing table changed |

Target: all green, `tsc` clean, nothing in existing modules edited except one line in `app.module.ts`.

---

## 11. Work breakdown (the order I will do it in)

| # | Step | Done when |
|---|---|---|
| 1 | Confirm decisions A1–A12 | You answered |
| 2 | Write the Prisma models, generate and hand-check the migration SQL, write the assertions SQL | `prisma migrate diff` output reviewed; assertions file ready |
| 3 | `family-permissions.ts` + its tests | Matrix test green |
| 4 | `family-codes.ts` + tests | Green |
| 5 | `family-access.service.ts` | Reads the database each call; tested |
| 6 | `family.service.ts` (lifecycle, members, ownership, activity) + tests | Green |
| 7 | `family-invites.service.ts` + tests | Every row of section 8 green, concurrency test green |
| 8 | Controller, DTOs, module, throttling, registration in `app.module.ts` | `tsc` clean, `check:boot` passes |
| 9 | `scripts/phaseF1-family-check.ts` end-to-end | Create → invite → join → role change → remove → leave → transfer → archive, asserting state at each step |
| 10 | Full regression: backend jest, expo jest, web vitest (should be unaffected), `tsc` everywhere | All as before, plus new tests |
| 11 | Update `design/progress.md` (F1 section: what changed, test counts, decisions, known issues) and mark F1 ✅ in `family-portal.md` | Written |
| 12 | Final review pass over every changed file; list what you must do to deploy | Reported to you |

---

## 12. What you will need to do after F1 (deploy notes)

1. Back up the hosted database.
2. `npx prisma migrate deploy` (adds four tables; no existing data is touched).
3. Run `prisma/verify/family_foundation_assertions.sql`.
4. Restart the backend.
Because the app does not call any family route yet, deploying F1 changes nothing for users.

---

## 13. Risks and how F1 handles them

| Risk | Handling |
|---|---|
| A bug in permissions grants too much | One table, exhaustive test, no inline role checks |
| Brute-forcing invite codes | 6 chars × 32 symbols, per-user and per-IP limits, cool-down, invalid answers look identical |
| Removed member keeps access | Membership read from the database on every request |
| Two requests create two families or two owners | Database uniqueness (`activeKey`) plus single-transaction writes |
| Leaking emails or phones of members | The members endpoint never returns them |
| Migration fails half-way (MySQL has no transactional DDL) | Only creates new tables, so a failure is cleaned by dropping them; backup first |
| F1 hides a design mistake until F2 | The permission table includes the F2 actions now, so it is reviewed once |

---

## 14. Definition of done for F1

- [x] Migration applied locally and the assertions SQL passes
- [x] All routes in section 7 work as described
- [x] Every case in section 8 has a test
- [x] Permission matrix test covers every role × action
- [x] Concurrency tests pass
- [x] `tsc` clean, backend jest green (247 existing + new), `check:boot` passes
- [ ] Expo and web test suites unchanged and green (no file in either app was touched, so I did not re-run them)
- [x] No existing table or existing module changed (apart from the `Client` back-relation and `app.module.ts`)
- [x] `progress.md` and `family-portal.md` updated
- [x] You have the deploy notes in section 12
