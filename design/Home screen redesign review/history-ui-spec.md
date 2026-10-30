# History page — UI specification (brief for design)

Purpose of this document: describe **everything the History page must show, do and survive**, so a designer can produce every screen, state and component. It says *what* and *when*, never *how it looks*. Colours, spacing, type, motion and layout are the designer's call, inside the constraints in section 1.

Phase tags: **H1** foundation · **H2** find things · **H3** manage · **H4** understand · **H5** trust · **H6** share. Design everything, even the later phases, so the page does not need redesigning when they ship.

---

## 1. Brief and constraints

**Product.** ABY Expense, a personal and family money tracker used mainly on phones (Expo app) and also as a web app drawn inside a phone-width frame. Users track wallets in different currencies, transactions, budgets, loans (money borrowed and lent), scheduled/recurring payments and, soon, a shared **Family** space.

**What History is for.** Answer, fast: *"what happened to my money, when, where, and why?"* People use it to (1) check a recent payment, (2) find an old one, (3) understand a month, (4) fix mistakes, (5) export or share.

**Fixed by the product (the designer works inside these)**
| Constraint | Detail |
|---|---|
| Widths | 320 to 430 px phones; the web app shows the same layout inside a phone frame. Tablet is optional |
| Themes | Light and dark, both required. A user can also force one of them |
| Brand | Existing teal brand colour (`#00627F`), Poppins font, Material icons |
| Family | When the user is in a Family, the whole app shifts to a distinct (purple, `#5B3FD0`) identity so the two spaces are never confused. History must show this clearly |
| Languages | English, French, Kinyarwanda, Swahili. French and Kinyarwanda text is often 20 to 40% longer than English; nothing may break |
| Text size | The app has a responsive font scale; layouts must survive large text |
| Currencies | Several per user (RWF, USD, EUR, KES, UGX, TZS and more). Amounts are never mixed silently |
| Existing pieces to reuse or extend | Home's kind chips (All / Income / Expense / Debt / Credit / Scheduled), the date-picker modal, option bottom sheets, category icons and colours, wallet card colours, the transaction-detail screen, the "include loans" switch |
| Touch | Minimum 44 px targets; one-handed use matters |

**Deliverables expected from design** (see section 22): the main screen, all sheets, every row variant, every state, light and dark, three widths, English plus one long language.

---

## 2. Screen and component inventory

| # | Item | Type | Phase |
|---|---|---|---|
| 1 | History (main) | Screen | H1 |
| 2 | Summary block | Component | H1 |
| 3 | Period navigator | Component | H2 |
| 4 | Quick filter chips (kind) | Component | H1 |
| 5 | Active-filters bar | Component | H2 |
| 6 | Filter sheet | Bottom sheet | H2 |
| 7 | Search mode (idle / typing / results) | Screen state | H2 |
| 8 | Sort and group sheet | Bottom sheet | H2 |
| 9 | Date range picker / jump to date | Modal | H2 |
| 10 | Upcoming section | Component | H3 |
| 11 | Day header (sticky) | Component | H1 |
| 12 | Transaction row (all variants) | Component | H1 |
| 13 | Swipe actions | Interaction | H3 |
| 14 | Select mode and bulk bar | Mode | H3 |
| 15 | Bulk action sheets (category, wallet, delete) | Sheets | H3 |
| 16 | Quick peek (row preview sheet) | Bottom sheet | H3 |
| 17 | Undo snackbar | Component | H3 |
| 18 | Recently deleted | Screen | H3 |
| 19 | View modes: list, compact, calendar, chart | Modes | H4 |
| 20 | Insights strip / panel | Component | H4 |
| 21 | Saved views (manage and apply) | Sheet | H4 |
| 22 | Export sheet | Bottom sheet | H6 |
| 23 | Running balance and reconcile mode | Mode | H5 |
| 24 | Edit history (inside detail) | Section | H5 |
| 25 | Duplicate and recurring suggestions | Banners | H5 |
| 26 | Empty, error, offline, loading states | States | H1 |
| 27 | Scope pill (Personal / Family) | Component | with Family F3 |
| 28 | Wallet strip (quick wallet switch) | Component | H2 |
| 29 | Wallet-focused mode (one wallet selected) | Mode | H2 |
| 30 | Wallet entry points (from Wallets, wallet detail, row tags, Home) | Navigation | H2 |
| 31 | Used-categories and sub-categories filter (with counts) | Filter section | H2 |
| 32 | Scheduled-items filters | Filter section | H2 |
| 33 | Advanced filter builder (AND / OR / NOT, saved) | Screen | H4 |
| 34 | Activity mode: the unified timeline of everything that happened | Mode | H4 |
| 35 | Event row types (what happened, who, before and after) | Component | H4 |
| 36 | "History of this item" (transaction, wallet, debt, schedule) | Section in each detail screen | H4 |
| 37 | Management actions menu and the action rules table | Sheets | H3-H5 |
| 38 | Rules and clean-up tools (merge sub-categories, auto-categorise, duplicates) | Screens | H5 |

---

## 3. Main screen anatomy (top to bottom)

1. **Header bar:** title "History"; scope pill (Personal or the family name); search button; filter button with a **badge showing how many filters are active**; overflow menu (Export, Saved views, Recently deleted, View mode, Hide amounts).
2. **Summary block** (see 4).
3. **Period navigator:** previous / current period / next, plus quick presets.
4. **Quick chips:** All, Income, Expense, Debt, Credit, Scheduled (same meaning as Home), plus a small "include loans" control.
5. **Active-filters bar:** only when filters beyond the period/chip are on.
6. **Upcoming section:** only when scheduled items are due soon.
7. **The list:** sticky day headers, rows, loading-more footer, end-of-list marker.
8. **Floating helpers:** scroll-to-top, jump-to-date, and the add (+) button when the app's tab bar shows it.
9. **Select-mode bar** replaces the header when multi-select is on.

The page must keep working with **10 rows or 10,000 rows**. Headers and the list must feel stable while data loads, and nothing may jump when totals arrive.

---

## 4. Summary block (H1, extended in H4)

Shows what the **current filters** add up to, not just what is loaded on screen.

| Part | Behaviour |
|---|---|
| Income, Spent, Net | Net is income minus spent; positive and negative are visibly different |
| Count | "128 transactions" |
| **Per-currency lines** | If the filtered rows span several currencies, show one line per currency, never a silent sum. Provide a **"Convert to <my currency>" toggle** that shows one converted figure (with a small note that rates apply) |
| Compare delta (H4) | Each figure may show change versus the previous equal period ("+23% vs September"); up/down must not rely on colour alone |
| Sparkline (H4) | Tiny daily spending trend for the period |
| Loading | Skeleton values; the block keeps its height |
| Error | "Couldn't load totals" with retry; the list can still work |
| Hide amounts | When the eye toggle is on, all money shows as masked |
| Very large numbers | 9-digit amounts and long currency symbols must fit (abbreviate or wrap, designer's choice, but consistently) |

---

## 5. Period navigator (H2)

- Shows the current period label in the user's language ("October 2026", "5 – 11 Oct", "Last 30 days", "All time").
- Previous / next arrows; **swipe horizontally** to change period.
- Next is disabled beyond the current period (future only matters for the Upcoming section).
- Tap the label to open the period picker: **Today, Yesterday, Last 7 days, Last 30 days, This week, Last week, This month, Last month, This quarter, This year, Last year, All time, Custom range**.
- Custom range uses the existing calendar picker (start, then end); show a clear "pick start / pick end" state.
- Week start follows the user's preference (not always Sunday).
- Edge cases: month with no data, first month with data (previous disabled or "no earlier data"), leap days, a range where end is before start (prevented, with message).

---

## 6. Quick chips and loans switch (H1)

- **All, Income, Expense, Debt, Credit, Scheduled** keep their current meaning. *Debt* = borrowed money and repayments the user made; *Credit* = money lent and repayments received; *Scheduled* = rows posted by a schedule.
- Add **Transfers** as a chip (H1), since transfers will now appear.
- Selected state, counts per chip (optional), horizontal scroll on narrow screens.
- **Include loans** switch: when off, loan rows disappear from All / Income / Expense. Make its state visible and explain it in one short line.

---

## 7. Filter sheet (H2)

One bottom sheet replaces the stack of chip rows. Sections:

| Section | Control |
|---|---|
| Period | The presets from section 5 |
| Type | Income, Expense, Transfer, Debt flows, Credit flows, Scheduled (multi-select) |
| Wallets | Multi-select with wallet colour, name, currency; archived wallets shown separately |
| Categories | **The categories this user has actually used first, with counts**, plus a switch to show all 25; see section 33 for the full behaviour |
| Sub-categories | **The sub-categories the user has used or typed**, shown under their category with counts and last-used date; see section 33 |
| Amount | Min and max; currency note when wallets differ |
| Receipt | Any / With receipt / Without receipt |
| Loans | Include loans switch; pick a specific debt or person |
| Family (when in Family) | Member multi-select with avatars |
| Recurring | Only recurring / exclude recurring |
| Flags (H5) | Possible duplicates, Uncategorised ("Other"), Not reconciled |

Behaviour:
- A live preview on the primary button: **"Show 124 results"** (updates as filters change; "No results" disables nothing but warns).
- **Reset** and **Save as view** actions.
- Sections collapse; sections with active choices show a summary on the collapsed line.
- Works with long wallet/category/member lists (scrolling, search inside sheet).
- Keyboard-safe for the amount fields.

---

## 8. Active-filters bar (H2)

- One removable chip per active filter ("Food ✕", "Wallet: MoMo ✕", "> 5,000 ✕", "Grace ✕"); **Clear all**.
- Overflowing chips scroll horizontally or collapse into "+3 more" (designer's choice).
- Tapping a chip reopens the filter sheet at that section.
- Hidden when nothing extra is active.

---

## 9. Search (H2)

States:
1. **Idle (just opened):** recent searches (clearable), saved views, and a few suggested searches ("This month's biggest", "No receipt", "Uncategorised"). Keyboard open.
2. **Typing:** live suggestions mixing categories, wallets, people, titles; **query tokens** are turned into chips as they are recognised (`wallet:`, `from:`, `>5000`, `category:`, date words). A small help hint explains the tokens.
3. **Results:** the normal list with **matched text highlighted** in title, sub-category or note; result count; the summary block reflects the search.
4. **No results:** "Nothing matches '<text>'", with suggestions (remove a filter, check spelling, widen dates) and one-tap **Clear search**.
5. **Searching indicator:** subtle, never blocks typing.
- Search covers: title, note, category name (in the user's language), sub-category, wallet name, amount, debt person.
- Closing search returns to the previous scroll position and filters.
- Very long queries, emoji, pasted text, special characters.

---

## 10. Sort and group (H2)

| Control | Options |
|---|---|
| Sort | Newest first (default), Oldest first, Largest amount, Smallest amount |
| Group by | Day (default), Week, Month, Category, Wallet, Member (Family), Title, None |

- Group headers adapt: **day** shows date and the day's net; **category** shows icon, total and share of the filter; **wallet** shows wallet name, currency and total.
- Sticky headers; tapping a header can collapse that group (H4).
- When sort is by amount, grouping is hidden or becomes "None" (state this in the UI).

---

## 11. Day header (H1)

- Localized date: "Today", "Yesterday", "Mon 5 Oct", with the **year when it is not the current year**.
- Day net on the right (positive/negative clear without colour alone).
- Sticky while scrolling its rows; must handle 1 row or 80 rows in a day.
- Time zone: dates follow the user's zone, not the server's.

---

## 12. The transaction row (H1)

### 12.1 Always shown
Category icon in its colour · **title** · amount with sign and currency · localized category (and sub-category) · wallet name or colour mark · time of day.

### 12.2 Variants the designer must draw
| Variant | What is different |
|---|---|
| Expense | Standard |
| Income | Standard, positive |
| **Transfer** | "Wallet A → Wallet B"; both amounts if currencies differ; the exchange rate; not counted as income or spending |
| **Borrowed** (money in from a loan) | Badge; clear that it is not income; person name |
| **Lent** | Badge; person name |
| **Repayment paid / received** | Badge; which debt; maybe progress ("3 of 5") |
| **Paid from borrowed money** | Badge showing it was funded by a loan |
| **Scheduled / recurring** | Repeat mark; taps through to the schedule |
| **Has receipt** | Thumbnail or paperclip; a receipt report (PDF) indicator |
| **Family** | Author avatar and name; "You" for own rows |
| Multi-currency wallet | Amount in the wallet's own currency; optional converted amount |
| Future-dated | "Scheduled for 12 Nov" style marker |
| Failed scheduled post | Warning state with reason and retry |
| Skipped scheduled | Muted "skipped" |
| Possible duplicate (H5) | Small flag; tap to compare |
| Uncategorised (Other) | Prompt-style hint to categorise (H5) |
| Reconciled (H5) | Check mark |
| Selected (select mode) | Checkbox and highlight |
| Search match | Highlighted text |
| Amount hidden | Masked amount |
| Compact mode (H4) | One line, denser |
| Pending delete (undo window) | Faded, collapsing |

### 12.3 Content edge cases
Very long title (wraps or truncates, consistently) · no title · emoji in title · very large amount · tiny amount (0.01) · negative net displays · retired/old category (shows the category it became) · wallet deleted or archived (row still shows a neutral wallet placeholder) · title in another script · 4 languages with long category names · note present or not (one-line preview).

### 12.4 Running balance (H5)
Optional second line or right-side figure: wallet balance *after* this transaction. Toggle in the overflow menu; off by default.

---

## 13. Interactions

| Gesture | Result | Phase |
|---|---|---|
| **Tap** a row | Opens the transaction detail (or quick peek, see 14) | H1 |
| **Long-press** | Enters select mode with that row selected | H3 |
| **Swipe left** | Delete (with undo) | H3 |
| **Swipe right** | Edit / Duplicate / Make recurring (a short menu or a second swipe) | H3 |
| **Pull down** | Refresh; shows a refreshing state, never an empty flash | H1 |
| **Scroll to bottom** | Loads the next page; shows a footer spinner; failure shows "Retry" in the footer | H1 |
| **Swipe header area** | Previous / next period | H2 |
| **Tap header (day)** | Collapse or expand (optional) | H4 |
| **Scroll-to-top** button | Appears after scrolling down; also tapping the title bar | H1 |
| **Jump to date** | Calendar picker; list scrolls to that day, or loads that period | H2 |
| **Haptics** | Light on select, success on delete, warning on error | H3 |

Every swipe action must have a non-gesture alternative (the quick peek menu) for accessibility.

---

## 14. Quick peek sheet (H3)

A half-height sheet opened from a row (tap-and-hold alternative or a dedicated "..." button) showing: amount, title, category, wallet, date and time, note, receipt thumbnail, badges, and actions: **Open full detail, Edit, Duplicate, Make recurring, Change category, Move to wallet, Add receipt, Delete**. For loan rows: **Open the debt**. For scheduled rows: **Open the schedule**. For Family rows: author and "Added by …".

Permission-aware (Family): actions the role may not use are hidden or disabled with a reason ("Only admins can edit others' transactions").

---

## 15. Select mode and bulk actions (H3)

- Entering select mode swaps the header for a bar: **count selected, Select all (in this filter), Cancel**.
- Bottom action bar: **Delete, Change category, Move wallet, Tag, Export, More**.
- "Select all" must say what it covers ("All 128 matching" vs "Only loaded 40").
- Bulk delete confirms with a summary ("Delete 12 transactions, balances will be adjusted: MoMo +45,000").
- Partial failure result sheet ("10 done, 2 failed" with reasons).
- Rows that cannot be changed (loan-linked, family permissions, transfers) are shown disabled with a reason.
- Leaving the screen exits select mode safely.

---

## 16. Delete, undo and Recently deleted (H3)

- **Single delete:** row animates out, a **snackbar with Undo** (about 5 s) appears; the totals update at once and revert if undone.
- **Confirmation:** a short, translated confirm for destructive actions that affect wallet balance, stating the effect.
- **Recently deleted screen:** list of deleted transactions with days left (30), **Restore** and **Delete forever**, empty state, and a note explaining that balances are restored with the transaction.
- **Edge cases:** deleting a row that other rows depend on (loan principal), deleting while offline (queued, shown as pending), undo after the user already left the screen.

---

## 17. Upcoming section (H3)

- Appears above today's rows when scheduled payments are due within about 24 hours or a few days.
- Each item: title, amount, due time, wallet, repeat note; **Confirm** and **Skip** actions inline.
- Collapsible; shows "N upcoming" when collapsed.
- Items overdue or failed are highlighted.
- Loan installments due soon may appear here too (H3/H4).
- Hidden entirely in the Family space until family schedules exist.

---

## 18. View modes (H4)

| Mode | What it shows |
|---|---|
| **List** (default) | Grouped rows as above |
| **Compact** | Denser one-line rows |
| **Calendar** | Month grid; each day shows its net (and a dot for scheduled); tap a day to see its rows below; month navigation; heat intensity by spending |
| **Chart** | Spending over time (daily/weekly), with a category breakdown; tapping a bar or slice filters the list |

The chosen mode is remembered. All modes obey the same filters and summary.

---

## 19. Insights (H4)

A swipeable strip or collapsible panel under the summary, showing only what is meaningful for the current filters:
- Top categories (with share), biggest expense, daily average, busiest day.
- "Spending is up 23% vs last month" style messages.
- Budget markers: if viewing the current month, a budget progress line; rows that crossed the limit are marked.
- Suggestions: "This looks like a monthly payment, make it recurring?" and "3 uncategorised transactions".
- Must never lecture; every insight is dismissible and explains its basis in one line.
- Empty when there is too little data.

---

## 20. Saved views (H4)

- Apply from the filter sheet, the search idle screen or a horizontal strip.
- Save the current filters with a name; rename, reorder, delete.
- A saved view stores filters, sort, group and view mode, and belongs to Personal or to the Family space.
- States: none saved yet (with an example), name already used, too many saved.

---

## 21. Export and share (H6)

- Export sheet: format (PDF, CSV, Excel), scope of data (current filters / selected rows), columns options, language, include receipts (PDF), page header text showing the filters and the date range.
- Progress and success states with Share and Save; failure with retry; huge exports show an estimate.
- Wallet statement shortcut: pick wallet and range.
- In Family: "includes the Added-by column".

---

## 22. Reconciliation, edit history, duplicates (H5)

- **Reconcile mode:** tick rows as cleared; running total of cleared vs a typed bank balance; difference shown; finish and lock.
- **Balance mismatch banner:** "MoMo's balance differs from its history by 3,000", with a path to review.
- **Edit history** (inside detail): who changed what and when ("Amount 5,000 → 6,000 by Mama, 12 Oct 14:20"), with Family attribution.
- **Duplicate compare:** two rows side by side, actions Keep both, Delete one, Merge.

---

## 23. Family variations

| Aspect | Behaviour |
|---|---|
| Identity | The page uses the Family look and shows the family name in the scope pill |
| Switch | Changing scope rebuilds the page and returns to the top; it must never show a flash of the other scope's data |
| Rows | Author avatar and name |
| Filters | Member filter; "Only mine" shortcut |
| Group by | Member |
| Insights | Spending by member |
| Roles | Viewer sees everything but no edit actions; Member can edit own; Admin/Owner can edit all. Disabled actions explain why |
| Removed from family | A clear message and a return to Personal |
| Loans | Not available in Family; loan chips are hidden or show "personal only" |
| Live updates (later) | A "3 new" pill appears when another member adds something; tap to refresh |

---

## 24. State matrix (every state needs a design)

| State | What the user sees |
|---|---|
| First load | Skeleton: summary, chips, a few row skeletons |
| Refreshing | Existing content stays; a refresh indicator |
| Loading more | Footer spinner |
| Loading more failed | Footer "Couldn't load more. Retry" |
| Empty, user has no transactions at all | Friendly illustration area plus "Add your first transaction" and "Scan a receipt" actions |
| Empty, filters give no results | "No transactions match" + active filters + **Clear filters** |
| Empty, a period with no data | "Nothing in October" + jump to the nearest period with data |
| Error | What failed, in plain words, with Retry; never shown as "empty" |
| Offline | Banner "You're offline, showing saved data from <time>"; actions that need the network are disabled with a reason |
| Slow network | Skeleton persists; no layout jumps |
| Session expired | Handled by the app's sign-in flow; the page keeps filters afterwards |
| Not allowed (Family removed, role changed) | Explanatory message and a safe exit |
| Stale | A subtle "Updated just now / 5 min ago" in refresh |
| Large result | List stays smooth; "End of results" marker |
| Select mode | Described in 15 |
| Success feedback | Snackbar or toast for delete, edit, export |
| Partial failure | Result sheet listing what failed |

---

## 25. Text, numbers and dates (every language)

- All strings are translatable; leave room for 40% longer text; no text baked into icons.
- Dates localized (weekday and month names in the four languages), time in the user's 12/24-hour preference.
- Numbers use the user's grouping; currency symbols and codes shown unambiguously when more than one currency is present.
- Plurals ("1 transaction / 2 transactions") handled per language.
- Sample English copy for the designer to start from: "History", "No transactions found", "No results for these filters", "Clear filters", "Show 128 results", "Upcoming", "Undo", "Recently deleted", "Hide amounts", "You're offline", "Couldn't load. Try again", "Added by Grace", "Repayment received", "Borrowed", "Lent".

---

## 26. Accessibility

- Every tappable item at least 44 px; swipe actions always have a button alternative.
- Screen reader order: header, summary, filters, then rows; each row reads as one sentence ("Expense, Groceries, 12,400 Rwandan francs, MoMo wallet, yesterday 14:20, has receipt").
- Meaning never relies on colour alone (income/expense, up/down, status).
- Contrast meets accessibility minimums in light, dark and Family looks.
- Large font sizes: rows grow, nothing clips; summary block reflows.
- Reduced motion: no required animations; state changes still understandable.
- Focus management when sheets open and close; keyboard handling in search and amount fields.

---

## 27. Responsive and platform notes

- 320 px is the narrowest case: summary, chips and rows must still fit; sheets must be scrollable.
- Large phones (430 px) should not just stretch; use the space sensibly.
- Web: same layout inside the phone frame; hover states and keyboard shortcuts (search with `/`, Esc closes sheets) are a bonus.
- Landscape and tablet: optional two-pane (filters or calendar beside the list).
- Safe areas (notch, home indicator), keyboard avoidance, pull-to-refresh on both platforms.

---

## 28. Motion and feedback (guidance, not a style)

Motion should explain change: a row leaving, a filter being applied, a period changing, a sheet arriving. Keep it short, interruptible and optional (respect reduce-motion). Haptics and sounds only for confirmations and errors.

---

## 29. Realistic data the designer should test with

| Case | Why |
|---|---|
| 3 rows only | Sparse layout |
| 40 rows in one day | Sticky headers, long groups |
| 10,000 rows over 3 years | Paging, "All time" |
| Income and expense in 3 currencies | Per-currency summary |
| A month with net negative, and one with net zero | Net styling |
| Title with 80 characters and emoji | Truncation |
| Amount 1,250,000,000 and amount 0.50 | Width |
| Transfer between wallets of different currencies | Transfer row |
| Loan with 5 repayments | Debt badges and linking |
| Scheduled post that failed | Failed state |
| Family with 6 members, one removed | Author and member filter |
| Deleted wallet, retired category | Fallbacks |
| Rwanda/French long labels | Text expansion |

---

## 30. What design should deliver

1. Main screen: light, dark, Family look; 320, 375, 430 widths; English and one long language.
2. Every row variant from 12.2, light and dark.
3. All sheets (filter, sort/group, period picker, quick peek, bulk actions, export, saved views) with their internal states.
4. Search: idle, typing with tokens, results, no results.
5. Select mode with the bulk bar and disabled-row reasons.
6. Undo snackbar and Recently deleted screen.
7. Upcoming section: collapsed, expanded, failed item.
8. All state frames from section 24.
9. Calendar and chart modes.
10. Insights strip and panel.
11. Reconcile mode and edit history.
12. A small component sheet: chip, badge set, amount style, day header, snackbar, skeletons, empty-state block.
13. Advanced filtering (section 33), the Activity timeline with every event type (section 34), and the management actions (section 35).
14. Wallet interaction (section 32): wallet strip, wallet-focused header and summary, the entry points, a transfer row seen from each wallet, empty/archived wallet states.
15. Notes on motion and a list of the icons used.

---

## 31. Open questions for the product owner

1. Should "Convert to my currency" be on by default, or per-currency lines first?
2. Does a tap open quick peek or the full detail screen? (Recommendation: tap opens detail; peek via a visible "..." button.)
3. Should running balance and reconcile ship in the first release or stay hidden?
4. Is hiding amounts (eye toggle) wanted?
5. Calendar and chart modes: part of History, or a link to Reports?
6. Should History and the separate Expenses list screen be merged into one?
7. Should the wallet detail screen embed the shared History list (recommended, one list everywhere) or keep its own small activity list?
8. How long should the activity log be kept (forever, or e.g. 2 years)? Should account and security events (sign-ins, new devices, passkeys) appear in the same timeline or in a separate Security log?
9. Should "restore a deleted item" and "revert an edit" be allowed for everyone, or only the author and Family admins?

---

## 32. Wallet interaction (two-way: wallet to history, history to wallet)

Today the wallet detail screen has its own short activity list, a balance chart and a flow chart, and History only knows wallets as a filter. The goal: **every wallet is one tap away from its full history, and every history row is one tap away from its wallet**, using **one shared list** so the two screens never disagree.

### 32.1 Ways in (entry points)
| From | Gesture | Result |
|---|---|---|
| Wallets list, a wallet card | Tap "History" button or long-press menu "View history" | History opens with **that wallet selected** (wallet-focused mode) |
| Wallet detail, "Activity" block | "See all" | Same, with the wallet selected and the current chart range carried over as the period |
| Wallet detail, a chart bar or day | Tap | History opens on that wallet and that day or week |
| A History row | Tap the **wallet tag** on the row | Filters History to that wallet (a second tap, or a "Open wallet" link, goes to the wallet detail) |
| A History row's quick peek | "Open wallet" action | Opens the wallet detail |
| Home | Tap a wallet chip or the balance | History for that wallet |
| Transfer row | Tap either wallet name in "A -> B" | That wallet's history |
| Wallet detail | Back from History | Returns to the same wallet with its scroll position |

The wallet remains **removable**: the selected wallet shows as a chip the user can clear to return to all wallets.

### 32.2 Wallet strip (H2)
- A horizontal strip under the period navigator: **All wallets** first, then each wallet as a compact card chip (colour, name, currency, current balance).
- Single tap selects one wallet; the filter sheet still allows selecting several.
- With **several wallets selected**, the strip shows a small count ("3 wallets") and the summary shows per-currency lines.
- Hidden-amount mode masks the balances in the strip.
- Long lists scroll; archived wallets sit at the end with a muted look; Family wallets only appear in the Family space.

### 32.3 Wallet-focused mode (exactly one wallet selected) (H2, extended in H5)
The page changes from "my transactions" to "this wallet's statement":
| Part | Behaviour |
|---|---|
| Header | Shows the wallet in its own colour and name, currency, **current balance**, and an "Open wallet" button. Wallet type (checking, savings, credit, cash) is shown. Account number and holder are shown only to people allowed to see them (Family: owner and admins) |
| Summary | **Opening balance, money in, money out, closing balance** for the period, and a visible check that opening + in - out = closing. Net is shown too. All in the wallet's own currency (no mixing) |
| Transfers | Appear as **in or out from this wallet's point of view**: money received from another wallet is "+ from MoMo", money sent is "- to Cash", with the other wallet's name and the exchange rate if currencies differ |
| Running balance | **On by default** in this mode: the balance after each row |
| Charts | The wallet's balance chart and daily flow chart, collapsible above the list; tapping a point filters the list to that day; period and chart range stay in sync |
| Loan rows | Show borrowed, lent and repayment badges; money paid from a "borrowed pot" is marked |
| Quick actions | **Add transaction to this wallet** (wallet preselected), **Transfer from this wallet**, **Edit wallet**, **Archive wallet**, **Export statement** |
| Reconcile | Available here (see section 22), because a bank balance belongs to one wallet |
| Mismatch banner | If the stored balance differs from the sum of its history, a banner explains it and offers review |

### 32.4 Wallet-aware rows (all modes)
- The wallet tag on a row is **tappable** and has a clear tappable look (but a row tap must still open the transaction).
- When more than one wallet is in view, every row shows its wallet; when exactly one wallet is selected, the tag is hidden to reduce noise (the header already says it).
- Transfers always show both wallets.
- A deleted or archived wallet shows a neutral tag with its last known name ("Old Cash (archived)").

### 32.5 Comparing wallets (H4)
- **Group by wallet** shows each wallet as a collapsible section with its own money in, money out and net.
- A small **wallet breakdown** in the insights panel ("MoMo 62%, Cash 25%, Bank 13% of spending").
- Wallets in different currencies are never added together unless the user turns on conversion.

### 32.6 One list, two homes
- The wallet detail screen should **embed the same History list component** with the wallet locked, instead of its own separate short list. This guarantees the same rows, badges, swipe actions, filters and states in both places.
- Differences when embedded: the wallet is locked (cannot be cleared there), the header is the wallet's own, and a "Open full History" link leaves for the full page.

### 32.7 Wallet states
| State | What the user sees |
|---|---|
| New wallet, no transactions | "No activity yet" with **Add transaction** and **Transfer in** actions |
| Archived wallet | Read-only banner, history still browsable, actions that change it are disabled with a reason |
| Wallet in another currency | Everything in its own currency; optional converted line |
| Balance mismatch | Banner with a path to review (section 22) |
| Wallet with thousands of rows | Same paging and sticky headers as the main page |
| Family wallet, viewer role | Read-only; no add or transfer actions |
| Wallet deleted while open | Message and a safe return to Wallets |
| Offline | Saved history shown with an offline banner |

### 32.8 What the data layer must provide (for the engineers)
- The history query accepts one or several wallet ids and, for a wallet, includes transfers **in both directions**.
- A per-wallet summary: opening balance, money in, money out, closing balance, per period.
- A running balance per row for a wallet.
- Wallet currency on every row, and wallet name/colour so rows do not need extra lookups.
- Everything respects the Personal or Family scope.

---

## 33. Advanced filtering (extends sections 7 to 9)

The filter sheet must understand **this user's own data**, not just the app's fixed lists.

### 33.1 Categories and sub-categories the user has used (H2)
The app already remembers every sub-category a person picked or typed (with how many times and when last used). The filter uses that.

| Behaviour | Detail |
|---|---|
| Used first | The category list shows **only categories that have transactions in the user's data**, ordered by usage or by recency (toggle). Each shows a **count** and, optionally, a **total amount** |
| Show all | A switch reveals all 25 categories, with unused ones muted, so nothing is hidden for good |
| Sub-categories under their category | Expanding "Food" lists the sub-categories the user used (Pizza, Lunch, Coffee ...), with counts and last-used date, including ones they typed themselves |
| Hierarchical selection | A category checkbox has three states: none, some, all of its sub-categories. Selecting "Food" means all of Food; selecting "Food > Pizza" means only that |
| Mix freely | Several categories and sub-categories at once ("Food > Pizza" + "Transport > Bus" + all of "Bills") |
| Include and exclude | Each choice can be **included or excluded** ("everything except Rent"); excluded choices show a different chip style |
| No sub-category | A choice "Food, no sub-category" for rows that were never refined |
| Other / uncategorised | A clear shortcut to find rows still in "Other" |
| Income and expense kept apart | The same sub-category name can exist under both an expense and an income category; the list says which |
| Case and spelling | "pizza" and "Pizza" appear once (the first spelling wins) |
| Retired categories | Older rows that used a retired category appear under the category they became, with no duplicates |
| Faceted counts | Counts reflect the **other filters currently active** (wallet, period, amount ...), so the user sees what will actually be found; choices with zero results are muted but still selectable |
| Search inside | Type to find a category or sub-category quickly; matches are highlighted and shown in the user's language |
| Recently used | A "Recent" row on top with the last few choices |
| Large lists | Dozens of custom sub-categories must scroll and search smoothly; show the top ones and "Show N more" |
| Family | In Family, the list is the family's; with a **member filter** the counts show who used what |
| Empty | A new user with no history sees the full list and a hint that used categories will appear here |

### 33.2 Scheduled and recurring filters (H2)
Schedules, their occurrences and the transactions they posted are all filterable.

| Filter | Options |
|---|---|
| Source | All / **Posted by a schedule** / **Entered by hand** / Scanned receipt / Debt payment / Transfer |
| Specific schedule | Pick one or several schedules by title ("Rent", "Netflix", "Salary"); shows each schedule's status |
| Schedule status | Active, Paused, Ended |
| Mode | **Auto-posted** (created automatically) / **Reminder and confirm** (the user confirmed it) |
| How it was handled | Posted automatically / Confirmed by me / Edited before posting / Skipped / Failed / Still waiting |
| Occurrence status | Waiting, Posted, Skipped, Failed (with the failure reason searchable: "wallet missing", "not enough balance" ...) |
| Repeat pattern | Daily, weekly, monthly, yearly, custom |
| Due window | Overdue, Due today, Next 7 days, Next 30 days, a custom range of due dates |
| Direction | Scheduled income / scheduled expense |
| Reminder state | Reminder sent, Snoozed, Dismissed, Not yet sent |
| Linked loan | Installments and plan payments of a debt (a specific person's loan) |

Two lists, one filter: the result can show **what already happened** (posted rows), **what is coming** (waiting occurrences, shown as Upcoming), or **both**, with a clear switch "Past / Upcoming / Both".

### 33.3 Every other dimension
| Group | Filters |
|---|---|
| Time | Transaction date; **date entered** (created today, backdated entries, edited recently); time of day; weekday; month across years ("every December") |
| Money | Amount range, exact amount, round amounts, currency, large/small relative to the user's usual |
| Wallet | One or several wallets; for transfers, **from** and **to** separately |
| Text | Title (contains / exact), has a note, note contains, receipt text when scanned |
| Evidence | Has receipt, has report PDF, no receipt |
| Loans | Person, kind (borrowed / lent), status (open, settled, written off, forgiven), role (money in, money out, repayment), paid from a borrowed pot |
| People | Added by (Family member), edited by |
| Quality flags | Uncategorised, possible duplicate, balance mismatch, not reconciled, flagged for review |
| State | Active, **deleted** (Recently deleted), edited, restored |
| Marks | Starred or flagged items, tags (later) |

### 33.4 Combining filters
- Across different filters the rule is **AND** (Food AND MoMo wallet AND over 5,000). Inside one filter the rule is **OR** (Pizza OR Lunch). Any choice can be **excluded (NOT)**.
- The active-filters bar shows included chips and excluded chips differently, and tapping a chip toggles include/exclude.
- **Advanced filter builder** (H4): rows of "field, operator, value" with add/remove, grouping, and a plain-language summary at the top ("Expenses in Food or Transport, over 5,000, not in Cash, paid by schedules"). Easy mode (sheet) and advanced mode (builder) edit the same filter.
- The search box understands the same filters as tokens (`cat:food sub:pizza sched:rent status:failed -wallet:cash`).
- Every filter set can be **saved as a view**, named, pinned, and (Family) shared with the family.
- **Result count** is always shown before applying.

---

## 34. Activity mode: everything that ever happened (H4, H5)

A switch at the top of History: **Money** (the transactions list described so far) | **Activity** (a timeline of every event). Activity answers "what happened, to what, when and by whom, and what did it look like before?"

### 34.1 What gets recorded
| Area | Events | Recorded today? |
|---|---|---|
| Transactions | Created, edited (before and after), deleted, restored, receipt added or replaced, scanned, category changed, moved wallet | Created: yes (the row). **Edits, deletes: no** |
| Transfers | Created, deleted, rate used | Created: yes. Deletes: no |
| Wallets | Created, renamed, colour or currency or default changed, balance adjusted by hand, archived, restored, deleted | **No** |
| Budget | Set or changed for a month, alert at 80% and 100% reached | Alerts are in the inbox; changes **no** |
| Loans (debts) | Created, edited, payment added or removed, installment moved or skipped, plan set, written off, forgiven, reopened, archived, restored, settled, statement exported | Payments and installments: yes. Others: partly |
| Scheduled | Schedule created, edited, paused, resumed, ended, deleted; each occurrence due, posted, confirmed, skipped, failed (with reason) | Occurrences: yes (status and handled time). Schedule edits: **no** |
| Reminders | Fired (which step, which channels), snoozed, marked done, dismissed, push delivered or failed | Yes |
| Notifications | Every alert sent (transaction, reminder, system, security) | Yes (inbox) |
| Exports | Statement or report generated, who exported | **No** |
| Account and security | Sign-in, new device, passkey added or removed, password changed, verification done, profile edited, device registered or removed | Partly (devices, passkeys exist; sign-in history **no**) |
| Family | Member joined, left, removed, role changed, invite created or revoked, family renamed, ownership transferred, archived | Yes (family activity log) |

**Important for design and product:** what is marked "No" is not stored today, so the Activity timeline can only show those events **from the moment the new event log is introduced**. Older creations can be rebuilt from existing rows (created and updated times, payments, occurrences, reminder fires), but past edits and deletions cannot be recovered. The UI must say so honestly ("Detailed history starts from 12 Nov 2026") instead of implying a complete past.

### 34.2 The Activity screen
- Same chrome as the main page: period navigator, filters, search, summary, but the summary counts **events** (and highlights money-affecting ones).
- **Day headers** as before; each event is a **card**: icon for the area, a sentence ("Grace edited 'Groceries'"), the time, who did it, and the key change.
- **Event card types** the designer must cover:
  | Type | Shows |
  |---|---|
  | Created | The new item in brief |
  | Edited | **Before to after** for each changed field (amount 5,000 to 6,000; category Food to Bills); long lists collapse |
  | Deleted | The item as it was, with a **Restore** action while allowed |
  | Restored | Who restored and when |
  | Status change | Schedule paused, loan settled, wallet archived |
  | Money event | Posted, skipped, failed (with reason), payment received |
  | Reminder | Sent / snoozed / dismissed, with the channel |
  | Alert | Budget at 80%, balance low |
  | System | Export created, sign-in, new device |
  | Family | Joined, role changed, removed |
  | Grouped | Many similar events collapsed ("12 transactions posted by schedules"), expandable |
- Tapping a card opens the thing it is about (transaction, wallet, loan, schedule, family hub) **or** its detail if it was deleted.
- **Money impact** shown where relevant ("Wallet MoMo balance +45,000").
- Events are **read-only and permanent**: nobody can delete the log; deleting an item adds an event, it does not remove the past.

### 34.3 Filtering Activity
Event type (multi-select), area (transactions, wallets, budget, loans, schedules, reminders, account, family), **actor** (Family member, system, me), entity (one wallet, one loan, one schedule), period, amount touched, "changes only" (edits), "money-moving only", "needs attention" (failed, overdue, mismatch), and text search over the sentence and the changed values.

### 34.4 "History of this item" (H4)
Every detail screen (transaction, wallet, loan, schedule, budget month) gets a **History** section or tab with the same event cards **for that item only**, newest first. For a transaction this includes edits and the original values; for a schedule, every occurrence and what happened to it; for a loan, every payment, installment change and reminder; for a wallet, balance events.

### 34.5 Unified "everything" feed (optional view)
A combined feed for people who want one stream: money rows and non-money events interleaved by time, with a type filter to switch parts off. Default is the Money list; Activity is one tap away.

### 34.6 Rules
- Respect scope: in Family, events show the family's, with the actor; personal events never appear.
- Respect roles: sensitive items (account details, security events of others) are limited to owner and admins; a Viewer reads only what they may.
- Retention and size: pages and infinite scroll; very old events load on demand.
- Privacy: a user can see their own security events; others never see them.
- Export: the filtered timeline can be exported as an audit report (PDF/CSV).

---

## 35. Management actions (everything the user can do from History)

Grouped by what they act on. Every action needs: where it lives (swipe, peek, bulk, detail), a confirmation rule, an undo rule and, in Family, a permission rule.

### 35.1 On a transaction
| Action | Notes |
|---|---|
| Open, edit (amount, title, date and time, category, sub-category, wallet, note) | Edits are logged with before and after |
| Duplicate | New row prefilled; choose date |
| Make recurring | Opens the schedule form prefilled |
| Split | Divide one amount across several categories (or members) |
| Change category / sub-category | Offer "apply to all similar" |
| Move to another wallet | Balances of both wallets adjust; explained before confirming |
| Add, replace or remove receipt; view receipt report | |
| Add a note or comment | In Family, comments are visible to members |
| Star or flag for review | Shows in the Flags filter |
| Mark reconciled / not reconciled | |
| Mark "not a duplicate" or merge duplicates | |
| Delete and restore | With undo and Recently deleted |
| Share a single transaction (as image or PDF receipt) | |

### 35.2 On many rows at once
Select all in this filter, change category, move wallet, shift date (fix a wrong day), add note, star, export, delete. Shows a **preview of the effect on wallet balances** before confirming and a result sheet afterwards.

### 35.3 On scheduled items, from History
Confirm, **Pay now** (post early), Skip, Edit this occurrence, Edit the whole schedule, Pause, Resume, End, **Skip all overdue**, Retry a failed post, Open the schedule. Reminders: snooze, mark done, dismiss.

### 35.4 On loans, from History
Open the loan, record a payment, move or skip an installment, see the statement, export it; money paid from a borrowed pot opens its source loan.

### 35.5 On wallets, from History
Open the wallet, add a transaction to it, transfer, **adjust the balance** (creates a visible adjustment entry), archive, restore, export a statement.

### 35.6 Clean-up and rules (H5)
| Tool | What it does |
|---|---|
| Merge or rename sub-categories | "Pizza" and "pizzas" become one; all rows updated; logged |
| Re-categorise by pattern | "Everything titled Netflix becomes Subscriptions" |
| **Auto-categorise rules** | Create a rule from a row; show which past rows it would change before applying |
| Find duplicates | List of likely pairs with compare view |
| Fix uncategorised | A guided pass through "Other" rows with suggestions |
| Fix date/time-zone mistakes | Shift a batch by hours or days |
| Balance mismatch review | Lists the rows to investigate and offers an adjustment |

### 35.7 Data in and out
Export (CSV, PDF, Excel, audit log), share a view, print, and (later) import from CSV or bank statements with a review step.

### 35.8 Safety rules (for every action)
| Question | Rule |
|---|---|
| Reversible? | Delete, edit, bulk change and merge are reversible through **Undo** and the **Recently deleted / Activity** screens; permanent steps (Delete forever, end a schedule) say so |
| Confirmation | Anything touching wallet balances or many rows shows the effect first |
| Logged? | Every action creates an event (section 34) with who, when, before and after |
| Family permissions | Viewer: none. Member: own items. Admin and Owner: all items. Disabled actions explain why |
| Locked items | Reconciled rows, loan-linked rows and ended schedules show what can and cannot change and why |
| Failures | Clear message and a way to retry, never a silent no-op |
| Offline | Actions are queued or disabled with a reason; the user always knows which |

### 35.9 Where actions live
Swipe (fast: delete, edit, duplicate), quick peek (everything for one row), select mode (bulk), overflow menu (view-wide: export, saved views, rules, clean-up, recently deleted), and detail screens (full control and the item's History).
