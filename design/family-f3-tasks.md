# F3 task list (live)

Legend: ⬜ not started · 🟦 in progress · ✅ done · ⚠️ blocked. Plan: `design/family-phase3-plan.md`. Decisions D1–D12 = my recommendations (not yet confirmed by the owner).

## F3a — Expo app
| # | Task | Status |
|---|---|---|
| A1 | B2 `PersonalOnlyGuard` on debts / scheduled / reminders + specs | ✅ |
| A2 | Expo: `family.service`, `family-errors`, `family-permissions`, `family-invite` + tests | ✅ |
| A3 | Expo `api.ts`: header allow-list, 403 fallback, session-loss clearing + tests | ✅ |
| A4 | Expo `scope-context`: persistence, launch check, pending invite + tests | ✅ |
| A5 | `<Tabs>` keyed by scope; switcher pill and sheet (Home, Wallets) | ✅ |
| A6 | Create and Join screens (+ `family-join` route, token/code params) | ✅ |
| A7 | Family hub, invite sheet, member sheet | ✅ |
| A8 | Scope-aware: Home, Wallets, Add, History/Expenses, Transaction detail, Reports, Budget, Transfer | ✅ |
| A9 | Loans/Scheduled notices, tab-bar Viewer rule, Settings → Family row | ✅ |
| A10 | i18n in en/fr/rw/sw + coverage test | ✅ |
| A11 | Expo regression (jest, tsc), backend regression, docs, device test list | ✅ `scope-leak.test.tsx` failed only because the test read `AsyncStorage.default` (the mock has no default); fixed. Expo jest 800 pass, backend jest 499 pass, tsc shows only the 3 old errors |

## F3b — web app and join page
| # | Task | Status |
|---|---|---|
| B1 | Backend `isWebAppPath` + `/join` + headers + spec | ✅ |
| B2 | Web: port services/utils/context; `lib/api.ts` header, fallback, clearing | ✅ |
| B3 | Web: port screens/sheets, `DashboardLayout` scope key, router, Settings row | ✅ |
| B4 | Web: `/join` page + token handling | ✅ |
| B5 | Web: dev proxy, mock data | ✅ |
| B6 | Web: tests, build:mock, pwa-check, nav-check, screenshots 320/360/390 | ✅ vitest 450, tsc clean, nav-check all pass; hub/create/join/landing checked at 320 with no overflow |
| B7 | `build:web`, docs, browser test list, final review | ✅ `backend/web` rebuilt; docs in `progress.md` |
