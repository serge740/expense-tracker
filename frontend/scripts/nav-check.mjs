// Clicks through the app in a real browser against the DEVELOPMENT server (React runs everything twice there, which
// is where navigation once broke) and checks that every move changes BOTH the address and the screen.
//   node scripts/nav-check.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const PORT = 5300 + Math.floor(Math.random() * 100);
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore', env: { ...process.env, BACKEND_URL: 'http://localhost:1' } });
const origin = `http://localhost:${PORT}`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(origin)).ok) break; } catch { /* starting */ } await sleep(250); }

const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const profile = mkdtempSync(join(tmpdir(), 'nav-'));
const dbg = 9900 + Math.floor(Math.random() * 90);
const browser = spawn(exe, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ } if (!wsUrl) await sleep(250); }
const ws = new WebSocket(wsUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const waiting = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expression => { const r = (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result; if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result.value; };

const path = () => ev('location.pathname + location.search');
const text = () => ev('document.body.innerText');
/** Waits (up to 6 s) for the screen to contain some text. */
async function seen(needle) { for (let i = 0; i < 40; i++) { if ((await text()).includes(needle)) return true; await sleep(150); } return false; }
// A button is found by its text or label, or by its icon ("icon:close" for the X, "icon:arrow-back" for the back arrow).
const click = label => ev(`(() => {
  const want = ${JSON.stringify(label)}.toLowerCase();
  const nodes = [...document.querySelectorAll('[role=button],[role=tab],button,a')].filter(n => n.getBoundingClientRect().width > 0);
  const icon = want.startsWith('icon:') ? want.slice(5).replace(/-/g, '_') : null;
  const hit = icon
    ? nodes.filter(n => n.querySelector('.material-icons') && n.querySelector('.material-icons').textContent.trim() === icon && n.textContent.trim() === icon).shift()
    : nodes.filter(n => (n.getAttribute('aria-label') || n.textContent || '').trim().toLowerCase() === want).pop();
  if (!hit) return false; hit.click(); return true;
})()`);
/** Clicks a button whose label contains some text (the scope pill's label includes the current space's name). */
const clickContaining = sub => ev(`(() => {
  const want = ${JSON.stringify(sub)}.toLowerCase();
  const hit = [...document.querySelectorAll('[role=button],button,a')].filter(n => n.getBoundingClientRect().width > 0)
    .find(n => (n.getAttribute('aria-label') || n.textContent || '').toLowerCase().includes(want));
  if (!hit) return false; hit.click(); return true;
})()`);
/** Clicks a tab-bar tab by its label. */
const clickTab = label => ev(`(() => {
  const hit = [...document.querySelectorAll('[role=tab]')].find(n => n.getAttribute('aria-label') === ${JSON.stringify(label)});
  if (!hit) return false; hit.click(); return true;
})()`);
const go = async (label, expectPath, expectText) => {
  const clicked = await click(label);
  const shown = clicked && await seen(expectText);
  const p = await path();
  check(`${label}: address ${expectPath} and the "${expectText}" screen`, clicked && shown && p.startsWith(expectPath), clicked ? `at ${p}` : 'button not found');
};

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${origin}/app?mock=1` });
  check('Home opens', (await seen('Include loans') || await seen('Include loans') || await seen('Include loans')), await path());

  // the four tabs, there and back
  await go('Wallets', '/app/wallets', 'My wallets');
  await go('Loans', '/app/debts', 'Loans & debts');
  await go('Settings', '/app/profile', 'Profile');
  await go('Home', '/app', 'Include loans');

  // the + button opens a screen, and its close button returns to the one before
  await go('Add', '/app/add', 'New transaction');
  check('close returns to Home', (await click('icon:close')) && await seen('Include loans'), await path());

  // the browser's own Back button, and Forward
  await go('Wallets', '/app/wallets', 'My wallets');
  await ev('history.back()');
  check('browser Back returns to Home (address and screen)', await seen('Include loans') && (await path()) === '/app', await path());
  await ev('history.forward()');
  check('browser Forward returns to Wallets (address and screen)', await seen('My wallets') && (await path()) === '/app/wallets', await path());

  // a settings page, reached from Profile, with its back button
  await go('Settings', '/app/profile', 'Profile');
  await ev(`(() => { const n = [...document.querySelectorAll('[role=button]')].find(b => b.textContent.includes('Channels, alerts and quiet hours')); n && n.click(); return !!n; })()`);
  check('a Profile row opens Notification settings', await seen('Push status') === false && await seen('This device') && (await path()) === '/app/notification-settings', await path());
  check('its back arrow returns to Profile', (await click('icon:arrow-back')) && await seen('Verify your phone') && (await path()) === '/app/profile', await path());

  // deep links: loading an address directly shows that screen
  for (const [url, needle] of [['/app/budget', 'Spending Limit'], ['/app/history', 'History'], ['/app/reports', 'Monthly Overview'], ['/app/debts?openId=d1', 'Borrowed from']]) {
    await send('Page.navigate', { url: `${origin}${url}` });
    check(`deep link ${url}`, await seen(needle), await path());
  }

  // ── Home: the period picker, the schedules and the plan card; the Scheduled page's status cards and filters ──
  const until = async expr => { for (let i = 0; i < 30; i++) { if (await ev(expr)) return true; await sleep(150); } return false; };
  const byId = id => ev(`(() => { const n = document.querySelector('[data-testid="${id}"]'); n && n.click(); return !!n; })()`);
  await send('Page.navigate', { url: `${origin}/app?mock=1` });
  await seen('Include loans');
  check('Home shows the budget inside the top card, and no "Set a monthly budget" row', await seen('Budget') && !(await text()).includes('Set a monthly budget'), await path());
  check('Home lists what is coming with days left, and the Plan a schedule card', await seen('Schedules') && await seen('Plan a schedule') && (await text()).includes('days overdue'), await path());
  check('the period pill opens the picker', (await byId('period-pill')) && await seen('Show figures for') && await seen('Pick a month'), await path());
  check('All time changes the label and hides the budget', (await byId('period-all')) && await seen('ALL TIME: INCOME MINUS SPENT') && !(await text()).includes('Budget · '), await path());
  check('a month from the grid changes the label', (await byId('period-pill')) && (await byId('period-month-3')) && await seen('MARCH: INCOME MINUS SPENT'), await path());
  check('this month brings the budget back', (await byId('period-pill')) && (await byId('period-this-month')) && await seen('Budget · '), await path());
  check('a starter opens Add already filled in and scheduled', (await byId('plan-rent')) && await seen('New scheduled transaction') && await seen('Every month on the 1st'), await path());
  await send('Page.navigate', { url: `${origin}/app/scheduled?mock=1` });
  check('Scheduled shows status cards, filters and loan dates next to schedules', await seen('Waiting for you') && await seen('Money out') && await seen('Pay John Mugisha') && await seen('Rent'), await path());
  check('the Overdue card keeps only overdue dates', (await byId('status-overdue')) && await seen('Pay Marie Claire') && !(await text()).includes('Pay John Mugisha'), await path());
  check('the Loans filter shows only loan dates', (await byId('status-overdue')) && (await byId('kind-loans')) && await seen('Pay John Mugisha') && !(await text()).includes('Eric Habimana owes you'), await path());
  await send('Page.navigate', { url: `${origin}/app?mock=1&nosched=1` });
  check('with nothing ahead, Home shows the last scheduled one', await seen('Last scheduled') && (await text()).includes('days ago'), await path());
  await send('Page.navigate', { url: `${origin}/app?mock=1&nosched=2` });
  check('with no schedules at all, Home invites you to make one', await seen('Nothing scheduled yet') && await seen('Plan a schedule'), await path());

  // ── History: summary, chips, wallet strip, rows by day, filters, search, states, paging ──
  const typeInto = (id, value) => ev(`(() => { const n = document.querySelector('[data-testid="${id}"]'); if (!n) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(n, ${JSON.stringify(value)}); n.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const rowsOf = id => ev("document.querySelectorAll('[data-testid=" + id + "]').length");
  const rowCount = () => ev("document.querySelectorAll('[data-testid=history-row]').length");
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  check('History shows the summary card, chips, wallet strip and rows grouped by day', await seen('Net ·') && await seen('Transfers') && await seen('All wallets') && (await ev("document.querySelectorAll('[data-testid=day-header]').length")) >= 2 && (await rowCount()) > 5, await path());
  check('amounts of currencies are kept apart (tabs for RWF and USD, one converted)', await seen('RWF') && (await ev("!!document.querySelector('[data-testid=tab-USD]') && !!document.querySelector('[data-testid=tab-converted]')")) && await seen('Net ·'), await path());
  check('every kind of row is there: transfer with both currencies, borrowed, scheduled, receipt', (await text()).includes('Exchange to dollars') && (await text()).includes('Borrowed from Mama') && (await text()).includes('Monthly') && (await text()).includes('Receipt'), await path());
  check('a long amount is abbreviated, a missing title is named', (await text()).includes('1.25B') && (await text()).includes('No title'), await path());
  check('the Transfers chip lists only transfers', (await byId('chip-transfer')) && await seen('Top up MoMo') && !(await text()).includes('Simba Supermarket'), await path());
  check('back to All, then loans off hides loan rows', (await byId('chip-all')) && await seen('Simba Supermarket') && (await byId('chip-loans')) && await seen('Loans off') && !(await text()).includes('Borrowed from Mama'), await path());
  check('loans back on', (await byId('chip-loans')) && await seen('Borrowed from Mama'), await path());
  check('a wallet card shows only that wallet (transfers included)', (await byId('wallet-w2')) && await seen('Top up MoMo') && await seen('Moto to town') && !(await text()).includes('Simba Supermarket'), await path());
  check('All wallets clears it', (await byId('wallet-all')) && await seen('Simba Supermarket'), await path());
  check('the period arrows go back a month and show Nothing in that month, with a way to all time', (await byId('period-prev')) && await seen('Nothing in') && (await clickContaining('show all time')) && await seen('Simba Supermarket'), await path());
  check('search finds a note and highlights it', (await byId('history-search-btn')) && (await typeInto('history-search', 'pizza')) && await seen('1 result') && (await text()).includes('Lunch at Repub Lounge') && !(await text()).includes('Simba Supermarket'), await path());
  check('a search with no match says so and offers Clear search', (await typeInto('history-search', 'zzzz')) && await seen('Nothing matches') && (await clickContaining('clear search')) && await seen('Try'), await path());
  check('leaving search shows the list again', (await ev("document.querySelector('[aria-label=Back]')?.click()") ?? true) && await seen('Simba Supermarket'), await path());
  check('tapping a row opens its detail', (await ev("(() => { const n = document.querySelector('[data-testid=history-row]'); n && n.click(); return !!n; })()")) && await seen('Transaction') && (await path()).includes('/transaction-detail'), await path());
  await send('Page.navigate', { url: `${origin}/app/history?mock=1&histerr=1&sumerr=1` });
  check('a failed load is an error with Try again, never an empty list', await seen('Couldn') && await seen('not an empty list') && await seen('Retry'), await path());
  await send('Page.navigate', { url: `${origin}/app/history?mock=1&many=1` });
  await seen('Sample purchase');
  const first = await rowCount();
  await ev("document.querySelector('[data-testid=day-header]').closest('div[style*=overflow]') && 0");
  await ev("(() => { const sc = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).overflowY === 'auto' && d.scrollHeight > d.clientHeight + 500); sc && sc.scrollTo(0, sc.scrollHeight); return !!sc; })()");
  await sleep(1200);
  await ev("(() => { const sc = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).overflowY === 'auto' && d.scrollHeight > d.clientHeight + 500); sc && sc.scrollTo(0, sc.scrollHeight); return !!sc; })()");
  await sleep(1200);
  check('scrolling to the bottom loads the next pages', (await rowCount()) > first, `${first} -> ${await rowCount()}`);

  // ── History, phase 2: filters, categories, sort, period quick choices, search words, Upcoming, jump ──
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  // ── Editing a transaction from its detail page ──
  check('the detail page has an Edit button once the transaction has loaded', await (async () => {
    await send('Page.navigate', { url: `${origin}/app/transaction-detail?mock=1&id=t2&type=EXPENSE&category=transport&title=Moto+to+town&amount=-2500&date=2026-10-30T06%3A15%3A00.000Z&walletId=w2` });
    return until("!!document.querySelector('[data-testid=detail-edit]')");
  })(), await path());
  check('Edit opens a bottom sheet filled with what the transaction is now', (await byId('detail-edit')) && (await until("!!document.querySelector('[data-testid=edit-sheet]') && document.querySelector('[data-testid=edit-amount]').value === '2500'"))
    && (await ev("document.querySelector('[data-testid=edit-title]').value")) === 'Moto to town' && (await ev("document.querySelector('[data-testid=edit-title]').tagName")) === 'TEXTAREA', await path());
  check('nothing changed yet, so Save says so and is off', await seen('No changes yet'), await path());
  check('a new amount shows what changes in the wallets before saving', (await ev("(() => { const n = document.querySelector('[data-testid=edit-amount]'); const set = Object.getOwnPropertyDescriptor(n.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set; set.call(n, '4000'); n.dispatchEvent(new Event('input', { bubbles: true })); return true; })()")) && (await until("document.querySelectorAll('[data-testid=edit-effect]').length === 1")), await path());
  check('changing the description and saving closes the sheet and the page shows the new values', (await ev("(() => { const n = document.querySelector('[data-testid=edit-title]'); const set = Object.getOwnPropertyDescriptor(n.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set; set.call(n, 'Moto and lunch'); n.dispatchEvent(new Event('input', { bubbles: true })); return true; })()")) && (await byId('edit-save')) && (await until("!document.querySelector('[data-testid=edit-sheet]')")) && (await seen('Moto and lunch')) && await seen('4,000.00'), await path());
  check('a loan entry cannot change its type', await (async () => {
    await send('Page.navigate', { url: `${origin}/app/transaction-detail?mock=1&id=t9&type=INCOME&category=loan&title=Borrowed&amount=200000&date=2026-10-30T06%3A15%3A00.000Z&walletId=w1` });
    if (!(await until("!!document.querySelector('[data-testid=detail-edit]')"))) return false;
    await byId('detail-edit');
    return (await until("!!document.querySelector('[data-testid=edit-loan-note]')")) && (await ev("document.querySelector('[data-testid=edit-kind-EXPENSE]').disabled === true || document.querySelector('[data-testid=edit-kind-EXPENSE]').getAttribute('aria-disabled') === 'true'"));
  })(), await path());
  check('the Add form has a text area for the description and makes the person choose the wallet', await (async () => {
    await send('Page.navigate', { url: `${origin}/app/add?mock=1` });
    if (!(await until("!!document.querySelector('[data-testid=add-description]')"))) return false;
    return (await ev("document.querySelector('[data-testid=add-description]').tagName")) === 'TEXTAREA' && await seen('Choose a wallet');
  })(), await path());
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  // ── H6: calendar, chart, export, saved views, tags and note, advanced filter, duplicates ──
  check('Calendar mode shows the month with a total on days that have activity', (await byId('view-calendar')) && (await until("!!document.querySelector('[data-testid=history-calendar]') && [...document.querySelectorAll('[data-testid^=cal-day-]')].some(n => n.innerText.includes(String.fromCharCode(10)))")), await path());
  check('tapping a day opens just that day in the list', (await ev("(() => { const n = [...document.querySelectorAll('[data-testid^=cal-day-]')].find(x => x.innerText.includes(String.fromCharCode(10))); n && n.click(); return !!n; })()")) && (await until("!document.querySelector('[data-testid=history-calendar]') && document.querySelectorAll('[data-testid=history-row]').length > 0")), await path());
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  check('Chart mode shows spending per day and per category', (await byId('view-chart')) && (await until("!!document.querySelector('[data-testid=chart-days]') && document.querySelectorAll('[data-testid=chart-cat]').length > 0")), await path());
  check('back to the list shows the rows again', (await byId('view-list')) && (await until("document.querySelectorAll('[data-testid=history-row]').length > 0")), await path());
  check('Export offers Excel, PDF and CSV and saves the chosen one', (await byId('history-more')) && (await byId('menu-export')) && (await until("!!document.querySelector('[data-testid=export-pdf]') && !!document.querySelector('[data-testid=export-xlsx]') && !!document.querySelector('[data-testid=export-csv]')")) && (await byId('export-xlsx')) && await seen('3 rows saved'), await path());
  check('the saved views manager says there are none yet', (await byId('history-more')) && (await byId('menu-views')) && (await until("!!document.querySelector('[data-testid=views-empty]')")), await path());
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  check('the quick look has Tags and note, and saving a tag shows it on the row', await (async () => {
    await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
    await seen('Net ·');
    await ev("document.querySelectorAll('[data-testid=row-peek]')[0].click(); true");
    if (!(await byId('peek-tags'))) return false;
    if (!(await until("!!document.querySelector('[data-testid=annotate-sheet]')"))) return false;
    await typeInto('tag-input', 'family,');
    await ev("(() => { const n = document.querySelector('[data-testid=note-input]'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(n, 'for the trip'); n.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
    await byId('annotate-save');
    return await until("document.body.innerText.includes('#family')");
  })(), await path());
  check('Filter by a tag from the filter sheet narrows the list', await (async () => {
    await send('Page.navigate', { url: `${origin}/app/history?mock=1&tg=trip` });
    for (let i = 0; i < 3 && !(await seen('Net · 1 transaction')); i++) { /* a cold page can take a while */ }
    return (await until("document.querySelectorAll('[data-testid=active-chip]').length >= 1")) && (await ev("document.querySelectorAll('[data-testid=history-row]').length")) >= 1;
  })(), await path());
  check('the advanced builder turns conditions into a filter', await (async () => {
    await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
    await seen('Net ·');
    if (!(await byId('history-more')) || !(await byId('menu-advanced'))) return false;
    if (!(await byId('adv-add'))) return false;
    await byId('adv-field-100-amountMin');
    await typeInto('adv-value-amountMin', '100000');
    await byId('adv-apply');
    return (await until("location.search.includes('min=100000')")) && (await ev("document.querySelectorAll('[data-testid=active-chip]').length")) >= 1;
  })(), await path());
  check('Review duplicates opens side by side and keeping both clears it', await (async () => {
    await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
    await seen('Net ·');
    if (!(await byId('history-more')) || !(await byId('menu-duplicates'))) return false;
    if (!(await until("document.querySelectorAll('[data-testid=dup-row]').length === 2"))) return false;
    if (!(await byId('dup-keep'))) return false;
    return await until("!!document.querySelector('[data-testid=dup-empty]')");
  })(), await path());
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  const openFilters = async () => { await byId('history-filter'); return seen('Show '); };
  check('the filter button opens the sheet with a live count', await openFilters() && await seen('Show 20 results'), await path());
  check('choosing a kind changes the count at once', (await byId('ftype-expense')) && await seen('Show 1') && !(await text()).includes('Show 20 results'), await path());
  check('applying shows a badge and one chip, and only that kind', (await byId('filter-apply')) && await seen('Simba Supermarket') && (await ev("document.querySelector('[data-testid=filter-badge]')?.innerText")) === '1' && (await ev("document.querySelectorAll('[data-testid=active-chip]').length")) === 1 && !(await text()).includes('October salary'), await path());
  check('removing the chip brings everything back', (await byId('active-chip-x')) && await seen('October salary') && !(await ev("!!document.querySelector('[data-testid=filter-badge]')")), await path());
  check('a whole category: Food keeps only food rows (retired Groceries counted in)', await openFilters() && (await byId('cat-box-food')) && (await byId('filter-apply')) && await seen('Lunch at Repub Lounge') && !(await text()).includes('Moto to town') && (await text()).includes('Simba Supermarket'), await path());
  check('tap again to leave it out: a dashed "Not Food" chip and no food rows', await openFilters() && (await byId('cat-box-food')) && (await byId('filter-apply')) && await seen('Not Food') && await seen('Moto to town') && !(await text()).includes('Lunch at Repub Lounge'), await path());
  check('clear all', (await byId('active-clear')) && await seen('Lunch at Repub Lounge') && !(await ev("!!document.querySelector('[data-testid=active-bar]')")), await path());
  check('an amount floor', await openFilters() && (await typeInto('famount-min', '100000')) && (await byId('filter-apply')) && await seen('October salary') && !(await text()).includes('Moto to town') && await seen('Over 100,000'), await path());
  check('reset empties it', (await byId('active-clear')) && await seen('Moto to town'), await path());
  check('receipt: only rows with one', await openFilters() && (await byId('freceipt-with')) && (await byId('filter-apply')) && await seen('Simba Supermarket') && !(await text()).includes('Moto to town') && await seen('With receipt'), await path());
  await byId('active-clear');
  check('sort: largest first puts the biggest amount on top, with no day headings', (await byId('history-more')) && (await byId('menu-sort')) && (await byId('sort-largest')) && (await byId('sort-apply')) && await seen('Land sale') && (await ev("document.querySelectorAll('[data-testid=day-header]').length")) === 0 && (await ev("document.querySelector('[data-testid=history-row]').innerText.includes('Land sale')")), await path());
  check('sort back and group by week', (await byId('history-more')) && (await byId('menu-sort')) && (await byId('sort-newest')) && (await byId('group-week')) && (await byId('sort-apply')) && (await until("/^[A-Z][a-z]{2} [0-9]+ /.test(document.querySelector('[data-testid=day-header]')?.innerText ?? '')")), await path());
  check('back to days', (await byId('history-more')) && (await byId('menu-sort')) && (await byId('group-day')) && (await byId('sort-apply')) && await seen('Today'), await path());
  check('the period picker has the quick choices; Last 7 days is named on the pill', (await byId('period-label')) && await seen('Last 30 days') && (await byId('preset-last7')) && await seen('Last 7 days') && !!(await ev("!!document.querySelector('[data-testid=period-label]')")), await path());
  check('a month in the picker still works', (await byId('period-label')) && (await byId('preset-thisMonth')) && await seen('October'), await path());
  check('search words become filters: wallet:momo', (await byId('history-search-btn')) && (await seen('Try')) && (await typeInto('history-search', 'wallet:momo ')) && (await ev("document.querySelectorAll('[data-testid=active-chip]').length")) === 1 && await seen('Moto to town') && !(await text()).includes('Simba Supermarket'), await path());
  check('typing a wallet name suggests it', (await typeInto('history-search', 'dol')) && await seen('Dollar savings'), await path());
  await ev("document.querySelector('[aria-label=Back]')?.click()");
  await byId('active-clear');
  check('Upcoming is folded away, with how many are late, and opens with Confirm and Skip', await seen('Upcoming ·') && await seen('overdue') && (await byId('upcoming-toggle')) && await seen('Confirm') && await seen('Skip'), await path());
  check('Jump to date opens the calendar', (await byId('jump-to-date')) && await seen('Jump to a day'), await path());

  // ── History, phase 2 leftovers: saved views, schedule filters, flags, headers, links, suggestions ──
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  check('saving a filter: kind + Save + a name shows it as a saved view', await openFilters() && (await byId('ftype-expense')) && (await byId('filter-save')) && (await typeInto('name-input', 'Spending only')) && (await byId('name-confirm')) && await seen('Spending only'), await path());
  await byId('filter-apply'); await byId('active-clear');
  check('a second view with the same name is refused in words', await openFilters() && (await byId('filter-save')) && (await typeInto('name-input', 'spending only')) && (await byId('name-confirm')) && await seen('already'), await path());
  await ev("document.querySelector('[aria-label=Close]')?.click()");
  check('search shows the saved view and applying it sets the filter', (await byId('history-search-btn')) && (await byId('saved-view-chip')) && (await until("document.querySelectorAll('[data-testid=active-chip]').length === 1")), await path());
  await byId('active-clear');
  check('Upcoming only hides the list and keeps the upcoming dates', await openFilters() && (await byId('fphase-upcoming')) && (await byId('filter-apply')) && await seen('Upcoming ·') && !(await text()).includes('Lunch at Repub Lounge'), await path());
  await byId('active-clear');
  check('a specific schedule keeps only its rows (Rent)', await openFilters() && (await byId('fsched-s1')) && (await byId('filter-apply')) && await seen('Rent') && !(await text()).includes('Lunch at Repub Lounge'), await path());
  await byId('active-clear');
  check('flag: possible duplicates narrows the list and the row explains why', await openFilters() && (await byId('fflag-duplicates')) && (await byId('filter-apply')) && (await until("!!document.querySelector('[data-testid=flag-duplicate]')")) && (await rowCount()) === 1, await path());
  await byId('active-clear');
  check('group by category shows headers with a share of spending', (await byId('history-more')) && (await byId('menu-sort')) && (await byId('group-category')) && (await byId('sort-apply')) && (await until("document.querySelectorAll('[data-testid=group-header]').length >= 2")) && await seen('% of spending'), await path());
  check('the address carries the filter', (await until("location.search.includes('grp=category')")), await ev('location.search'));
  check('group by wallet names the wallets', (await byId('history-more')) && (await byId('menu-sort')) && (await byId('group-wallet')) && (await byId('sort-apply')) && (await until("document.body.innerText.includes('Main wallet') || document.body.innerText.includes('Dollar savings')")), await path());
  await byId('history-more'); await byId('menu-sort'); await byId('group-day'); await byId('sort-apply');
  await send('Page.navigate', { url: `${origin}/app/history?mock=1&k=expense&grp=category` });
  check('opening a link with a filter applies it', (await until("document.querySelectorAll('[data-testid=group-header]').length >= 1")) && (await ev("document.querySelectorAll('[data-testid=active-chip]').length")) === 1, await path() + ' chips=' + await ev("document.querySelectorAll('[data-testid=active-chip]').length") + ' heads=' + await ev("document.querySelectorAll('[data-testid=group-header]').length"));
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  check('typing in search suggests earlier titles', (await byId('history-search-btn')) && (await ev("window.__sug = false; new MutationObserver(() => { if (document.querySelector('[data-testid=suggest-title]')) window.__sug = true; }).observe(document.body, { childList: true, subtree: true }); true")) && (await typeInto('history-search', 'Simba')) && (await until('window.__sug === true')), await path());
  await ev("document.querySelector('[aria-label=Back]')?.click()");

  // ── History, phase 3: select mode, bulk delete with Undo, Recently deleted ──
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  const before = await rowCount();
  const dialogBtn = label => ev(`(() => { const b = [...document.querySelectorAll('[role=alertdialog] [role=button], [role=alertdialog] button, [role=alertdialog] div')].find(n => n.innerText && n.innerText.trim() === ${JSON.stringify(label)} && n.children.length === 0 || n.innerText && n.innerText.trim() === ${JSON.stringify(label)}); b && b.click(); return !!b; })()`);
  check('Select in the menu shows the bar; tapping rows chooses them instead of opening', (await byId('history-more')) && (await byId('menu-select')) && (await until("!!document.querySelector('[data-testid=select-bar]')")) && (await ev("(() => { const r = document.querySelectorAll('[data-testid=history-row]'); r[0].click(); r[1].click(); return true; })()")) && (await until("document.querySelectorAll('[data-testid=row-checked]').length === 2")) && await seen('2 selected') && (await path()).startsWith('/app/history'), await path());
  check('Delete asks first and says what happens to the balances', (await byId('select-delete')) && await seen('Delete 2 transactions?') && await seen('Wallet balances'), await path());
  check('confirming removes the rows and offers Undo', (await dialogBtn('Delete')) && await seen('2 deleted') && (await until(`document.querySelectorAll('[data-testid=history-row]').length === ${before - 2}`)), `${before} -> ${await rowCount()}`);
  check('Undo brings both rows back', (await byId('snackbar-action')) && await seen('Restored') && (await until(`document.querySelectorAll('[data-testid=history-row]').length === ${before}`)), `${before} -> ${await rowCount()}`);
  check('select all then cancel leaves select mode', (await byId('history-more')) && (await byId('menu-select')) && (await byId('select-all')) && (await until("document.querySelectorAll('[data-testid=row-checked]').length > 3")) && (await byId('select-cancel')) && (await until("!document.querySelector('[data-testid=select-bar]')")), await path());
  check('a bulk category change reports how many changed', (await byId('history-more')) && (await byId('menu-select')) && (await ev("document.querySelectorAll('[data-testid=history-row]')[0].click(); true")) && (await byId('select-category')) && (await byId('pick-cat-shopping')) && await seen('1 changed'), await path());
  await byId('history-more'); await byId('menu-select');
  await ev("(() => { const r = document.querySelectorAll('[data-testid=history-row]'); r[0].click(); r[1].click(); return true; })()");
  await byId('select-delete'); await dialogBtn('Delete'); await seen('2 deleted');
  check('Recently deleted lists them with Restore', (await byId('history-more')) && (await byId('menu-trash')) && await seen('Recently deleted') && (await until("document.querySelectorAll('[data-testid=trash-row]').length === 2")), await path());
  check('Restore takes one out of the list', (await byId('trash-restore')) && (await until("document.querySelectorAll('[data-testid=trash-row]').length === 1")), await path());
  check('Delete forever asks, then empties the list', (await byId('trash-purge')) && await seen('cannot be undone') && (await dialogBtn('Delete forever')) && (await until("!!document.querySelector('[data-testid=trash-empty]')")), await path());

  // ── History, phase 3 (rest): quick look, long-press, swipe, similar rows, failures, Undo from the detail page ──
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  const rowCenter = async i => { await until(`document.querySelectorAll('[data-testid=history-row]').length > ${i}`); return rowCenterNow(i); };
  const rowCenterNow = i => ev(`(() => { const r = document.querySelectorAll('[data-testid=history-row]')[${i}].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  check('the ... button opens the quick look with every action', (await ev("document.querySelectorAll('[data-testid=row-peek]')[0].click(); true")) && await seen('Duplicate') && await seen('Change category') && await seen('Move to another wallet') && await seen('Repeat every month'), await path());
  check('Duplicate opens the Add form filled in', (await byId('peek-duplicate')) && (await until("location.pathname.endsWith('/add')")) && (await ev('location.search')).includes('amount='), await path() + ' ' + await ev('location.search'));
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  check('Repeat every month sends a monthly rule and a date next month', (await ev("document.querySelectorAll('[data-testid=row-peek]')[0].click(); true")) && (await byId('peek-recurring')) && (await until("location.search.includes('repeat=')")), await ev('location.search'));
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  check('a loan row can be changed and deleted like any other', (await ev("(() => { const rows = [...document.querySelectorAll('[data-testid=history-row]')]; const i = rows.findIndex(r => r.innerText.includes('John') || r.innerText.includes('Eric')); if (i < 0) return false; rows[i].querySelector('[data-testid=row-peek]').click(); return true; })()")) && await seen('Change category') && !(await seen('Recorded by Debts')), await path());
  await ev("document.querySelector('[aria-label=Close]')?.click()");
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  check('pressing and holding a row starts select mode with it chosen', await (async () => {
    const c = await rowCenter(0);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    await sleep(700);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    return until("!!document.querySelector('[data-testid=select-bar]') && document.querySelectorAll('[data-testid=row-checked]').length === 1");
  })(), await path());
  await byId('select-cancel');
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  await until("document.querySelectorAll('[data-testid=history-row]').length > 2 && !document.querySelector('[data-testid=select-bar]')");
  check('a swipe right chooses the row; a swipe left opens its quick look', await (async () => {
    // synthetic touch events on the row's wrapper (the real touch pipeline needs a touch-emulated page)
    const drag = (from, to) => ev(`(() => {
      const row = document.querySelectorAll('[data-testid=swipe-row]')[1];
      const r = row.getBoundingClientRect(); const y = r.y + r.height / 2;
      const mk = (type, x) => { const t = new Touch({ identifier: 1, target: row, clientX: x, clientY: y }); return new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }); };
      row.dispatchEvent(mk('touchstart', ${from})); row.dispatchEvent(mk('touchmove', ${(from + to) / 2})); row.dispatchEvent(mk('touchend', ${to}));
      return true; })()`);
    await drag(100, 300);
    const right = await until("!!document.querySelector('[data-testid=select-bar]')");
    await byId('select-cancel');
    await until("!document.querySelector('[data-testid=select-bar]')");
    await drag(300, 100);
    return right && await until("!!document.querySelector('[data-testid=peek-delete]')");
  })(), await path());
  await ev("document.querySelector('[aria-label=Close]')?.click()");
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  check('a transfer in a bulk category change is named in the result sheet, the rest still change', (await byId('history-more')) && (await byId('menu-select')) && (await ev("(() => { const rows = [...document.querySelectorAll('[data-testid=history-row]')]; const t = rows.find(r => r.innerText.includes('Top up MoMo')); const n = rows.find(r => !r.innerText.includes('MoMo') && !r.innerText.includes('dollars') && !r.innerText.includes('John') && !r.innerText.includes('Eric')); if (!t || !n) return false; t.click(); n.click(); return true; })()")) && (await byId('select-category')) && (await byId('pick-cat-shopping')) && (await until("!!document.querySelector('[data-testid=result-list]')")) && await seen('Transfers cannot be edited'), await path());
  await ev("document.querySelector('[aria-label=Close]')?.click()");
  check('deleting from the detail page brings an Undo back in History', await (async () => {
    await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
    await seen('Net ·');
    const before2 = await rowCount();
    await ev("(() => { const rows = [...document.querySelectorAll('[data-testid=history-row]')]; rows.find(r => r.innerText.includes('Moto to town')).click(); return true; })()");
    const st = [await seen('Delete Transaction')];
    st.push(await byId('detail-delete'));
    st.push(await dialogBtn('Delete'));
    st.push(await until("!!document.querySelector('[data-testid=snackbar-action]')"));
    st.push(await byId('snackbar-action'));
    st.push(await until(`document.querySelectorAll('[data-testid=history-row]').length === ${before2}`));
    return st.every(Boolean);
  })(), await path());

  // ── History, phase 4: one wallet's statement and running balance ──
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  check('choosing one wallet shows its statement card with opening, in, out, closing and "Adds up"', (await ev("(() => { const c = [...document.querySelectorAll('[role=button]')].find(n => n.innerText.includes('MoMo') && n.innerText.includes('FRw')); c && c.click(); return !!c; })()")) && (await until("!!document.querySelector('[data-testid=statement-card]')")) && await seen('Opening') && await seen('Money in') && await seen('Money out') && await seen('Closing') && await seen('Adds up'), await path());
  check('every row of that wallet shows its balance after', (await until("document.querySelectorAll('[data-testid=row-balance]').length > 0")) && (await ev("document.querySelectorAll('[data-testid=row-balance]').length")) === (await rowCount()), `${await ev("document.querySelectorAll('[data-testid=row-balance]').length")} of ${await rowCount()}`);
  check('the newest balance equals the wallet balance on the card', (await ev("(() => { const card = document.querySelector('[data-testid=stmt-balance]').innerText.replace(/[^0-9]/g, ''); const first = document.querySelector('[data-testid=row-balance]').innerText.replace(/[^0-9]/g, ''); return card.startsWith(first) || first.startsWith(card) || card === first; })()")), await path());
  check('a filter that hides rows takes the balance off (it would be wrong) but keeps the card', await (async () => {
    const steps = [];
    steps.push(await openFilters());
    steps.push(await byId('ftype-expense'));
    steps.push(await byId('filter-apply'));
    steps.push(await until("document.querySelectorAll('[data-testid=row-balance]').length === 0 && document.querySelectorAll('[data-testid=history-row]').length > 0 && !!document.querySelector('[data-testid=statement-card]')"));
    steps.push((await rowCount()) > 0);
    return steps.every(Boolean);
  })(), await path());
  await send('Page.navigate', { url: `${origin}/app/history?mock=1&walletId=w2` });
  check('Add here opens the Add form for that wallet', (await until("!!document.querySelector('[data-testid=statement-add]')")) && (await byId('statement-add')) && (await until("location.pathname.endsWith('/add')")) && (await ev('location.search')).includes('walletId=w2'), await path() + ' ' + await ev('location.search'));
  await send('Page.navigate', { url: `${origin}/app/history?mock=1&walletId=w2` });
  check('a link with a wallet opens its statement', (await until("!!document.querySelector('[data-testid=statement-card]')")) && await seen('MTN MoMo') || await seen('MoMo'), await path());
  check('All wallets leaves the statement', (await byId('statement-all')) && (await until("!document.querySelector('[data-testid=statement-card]')")), await path());
  await send('Page.navigate', { url: `${origin}/app/wallet-detail?mock=1&walletId=w2` });
  check('the wallet page has a Statement and history entry', (await until("!!document.querySelector('[data-testid=wallet-statement]')")) && (await byId('wallet-statement')) && (await until("location.pathname.endsWith('/history')")) && (await until("!!document.querySelector('[data-testid=statement-card]')")), await path());

  // ── History, phase 5: the Activity timeline ──
  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  check('the menu has Activity and it opens the timeline', (await byId('history-more')) && (await byId('menu-activity')) && (await until("location.pathname.endsWith('/activity')")) && (await until("document.querySelectorAll('[data-testid=act-row]').length > 0")), await path());
  check('an edit shows what it was and what it became', await seen('Amount: 2.5K → 3K') || await seen('Amount:'), await path());
  check('a deleted transaction offers Restore', await until("!!document.querySelector('[data-testid=act-restore]')"), await path());
  check('it says honestly where the record starts', await until("!!document.querySelector('[data-testid=act-since]')"), await path());
  check('Show earlier loads the next lines', (await byId('act-more')) && (await until("document.querySelectorAll('[data-testid=act-row]').length === 6")), await rowsOf('act-row'));
  check('the Wallets tab keeps only wallet lines', (await byId('act-tab-wallet')) && (await until("document.querySelectorAll('[data-testid=act-row]').length === 2")), await rowsOf('act-row'));
  check('Restore takes the transaction back and the line stays', (await byId('act-tab-transaction')) && (await until("!!document.querySelector('[data-testid=act-restore]')")) && (await byId('act-restore')) && (await until("document.querySelectorAll('[data-testid=act-row]').length > 0")), await path());
  await send('Page.navigate', { url: `${origin}/app/activity?mock=1` });
  check('a week summary sits above the tabs', await seen('This week: 1 added'), await path());
  check('the Loans tab shows loan lines only', (await byId('act-tab-debt')) && (await until("document.querySelectorAll('[data-testid=act-row]').length === 1")), await rowsOf('act-row'));
  await send('Page.navigate', { url: `${origin}/app/wallet-detail?mock=1&walletId=w2` });
  check('a wallet page opens only its own history', (await until("!!document.querySelector('[data-testid=wallet-activity]')")) && (await byId('wallet-activity')) && (await until("document.querySelectorAll('[data-testid=act-row]').length === 1 && !document.querySelector('[data-testid=act-tab-all]')")), await path());

  // ── History, phase 6: check a wallet against the real account ──
  await send('Page.navigate', { url: `${origin}/app/history?mock=1&walletId=w2` });
  check('the statement says the balance was never checked and offers Check balance', (await until("!!document.querySelector('[data-testid=statement-check]')")) && await seen('Not checked against your account yet'), await path());
  check('a matching balance is confirmed', (await byId('statement-check')) && (await typeInto('rec-input', '86300')) && (await byId('rec-check')) && (await until("!!document.querySelector('[data-testid=rec-match]')")), await path());
  await ev("document.querySelector('[aria-label=Close]')?.click()");
  check('a different balance shows the difference and offers an adjustment', (await byId('statement-check')) && (await typeInto('rec-input', '86000')) && (await byId('rec-check')) && (await until("!!document.querySelector('[data-testid=rec-differs]')")) && await seen('Difference') && (await byId('rec-fix')) && (await until("!!document.querySelector('[data-testid=rec-fixed]')")), await path());

  await send('Page.navigate', { url: `${origin}/app/history?mock=1` });
  await seen('Net ·');
  check('Export as CSV says how many rows were saved', (await byId('history-more')) && (await byId('menu-export')) && (await byId('export-csv')) && await seen('1 rows saved to a file'), await path());

  // ── Family: the switcher, the screens that follow the space, the hub, and the invite page ──
  const TOKEN = 'abcDEF123_-abcDEF123_-abcd';
  check('a viewer sees that money cannot be moved', await (async () => {
    await send('Page.navigate', { url: `${origin}/app/family-transfers?mock=1&role=VIEWER` });
    return until("!!document.querySelector('[data-testid=xfer-none]')");
  })(), await path());
  await send('Page.navigate', { url: `${origin}/app?mock=1&role=OWNER` });
  check('Home in Personal shows the scope pill and the loan switch', await seen('Include loans') && await seen('Personal'), await path());
  check('the pill opens the "Where are you?" sheet', (await clickContaining('where are you')) && await seen('Mwiza Family'), await path());
  check('choosing the family rebuilds Home as the family (balance card, no loan switch)', (await clickContaining('mwiza family')) && await seen('FAMILY BALANCE') && !(await text()).includes('Include loans'), await path());
  check('the family has its own bar: Home, Wallets, Add, Loans and Settings (no big button)', await ev(`(() => {
    const bar = document.querySelector('[data-testid="family-tab-bar"]') || document.querySelector('[role=tablist]');
    const labels = [...document.querySelectorAll('[role=tab]')].map(n => n.getAttribute('aria-label'));
    return !!bar && labels.join(',') === 'Home,Wallets,Add,Loans,Settings' && !!document.querySelector('[data-testid="tab-add"]');
  })()`), await path());
  // ── Several families ──
  await send('Page.navigate', { url: `${origin}/app?mock=1&role=OWNER&many=1` });
  await until("!!document.querySelector('[data-testid=scope-pill]')");
  check('with two families the switcher lists both and Personal', (await clickContaining('where are you')) && await seen('Mwiza Family') && await seen('Office Family') && await seen('Create or join another family'), await path());
  check('choosing the second family shows its name on the pill', (await clickContaining('office family')) && (await until("document.querySelector('[data-testid=scope-pill]') && document.querySelector('[data-testid=scope-pill]').innerText.includes('Office Family')")), await path());
  check('and the first one can be chosen again', (await clickContaining('where are you')) && (await clickContaining('mwiza family')) && (await until("document.querySelector('[data-testid=scope-pill]') && document.querySelector('[data-testid=scope-pill]').innerText.includes('Mwiza Family')")), await path());
  await ev("sessionStorage.removeItem('mock_many'); true");
  check('Reports in a family lists who spent what, with shares', (await ev("(() => { history.pushState({}, '', '/app/reports?mock=1&role=OWNER'); window.dispatchEvent(new PopStateEvent('popstate')); return true; })()")) && (await until("!!document.querySelector('[data-testid=by-member]')")) && (await until("document.querySelectorAll('[data-testid=member-row]').length === 2")) && await seen('Eric Mwiza') && await seen('65%'), await path());
  check('a family nudge refreshes the open screen', (await ev("(() => { window.__before = document.querySelectorAll('[data-testid=member-row]').length; window.dispatchEvent(new Event('family-changed')); return true; })()")) && (await until("document.querySelectorAll('[data-testid=member-row]').length === 2")), await path());
  check('the family goals screen shows a goal with how far along it is', (await ev("(() => { history.pushState({}, '', '/app/family-goals?mock=1&role=OWNER'); window.dispatchEvent(new PopStateEvent('popstate')); return true; })()")) && (await until("document.querySelectorAll('[data-testid=goal-card]').length === 1")) && await seen('New roof') && await seen('37%'), await path());
  check('adding to a goal moves the bar', (await byId('goal-add')) && (await typeInto('goal-amount', '50000')) && (await byId('goal-add-confirm')) && await seen('50%'), await path());
  check('an owner creates a new goal', (await byId('goal-new')) && (await typeInto('goal-name', 'Holiday')) && (await typeInto('goal-target', '100000')) && (await byId('goal-create')) && (await until("document.querySelectorAll('[data-testid=goal-card]').length === 2")), await path());
  check('the allowances screen lists every member for an owner, with what each has spent', (await ev("(() => { history.pushState({}, '', '/app/family-allowances?mock=1&role=OWNER'); window.dispatchEvent(new PopStateEvent('popstate')); return true; })()")) && (await until("document.querySelectorAll('[data-testid=allow-row]').length === 2")) && await seen('Spent 90K of 100K') || await seen('Spent'), await path());
  check('an owner sets an allowance for a member', (await ev("document.querySelectorAll('[data-testid=allow-limit]').length === 2")) && (await ev("(() => { const n = document.querySelectorAll('[data-testid=allow-limit]')[1]; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(n, '50000'); n.dispatchEvent(new Event('input', { bubbles: true })); return true; })()")) && (await until("!document.querySelectorAll('[data-testid=allow-save]')[1].disabled")) && (await ev("document.querySelectorAll('[data-testid=allow-save]')[1].click(); true")) && (await until("document.querySelectorAll('[data-testid=allow-spent]').length === 2")), await path());
  check('a member of the family sees what is left of their allowance on the Add form', (await ev("(() => { history.pushState({}, '', '/app/add?mock=1&role=OWNER'); window.dispatchEvent(new PopStateEvent('popstate')); return true; })()")) && (await until("!!document.querySelector('[data-testid=allowance-line]')")) && await seen('left of your allowance this month'), await path());
  check('the approvals screen shows the threshold and a request waiting', (await ev("(() => { history.pushState({}, '', '/app/family-approvals?mock=1&role=OWNER'); window.dispatchEvent(new PopStateEvent('popstate')); return true; })()")) && (await until("document.querySelectorAll('[data-testid=approval-row]').length === 1")) && await seen('New sofa') && await seen('Above'), await path());
  check('an owner approves it and it moves out of Waiting', (await click('Approve')) && (await until("!!document.querySelector('[data-testid=approval-status]')")) && await seen('Approved'), await path());
  check('an owner turns approvals off', (await byId('appr-off')) && await seen('Approvals are off'), await path());
  check('the contributions screen lets a member put money from their wallet into the family wallet', (await ev("(() => { history.pushState({}, '', '/app/family-transfers?mock=1&role=OWNER'); window.dispatchEvent(new PopStateEvent('popstate')); return true; })()")) && (await until("!!document.querySelector('[data-testid=xfer-mine-pw1]')")) && (await byId('xfer-mine-pw1')) && (await byId('xfer-fam-fw1')) && (await typeInto('xfer-amount', '20000')) && (await byId('xfer-submit')) && (await until("!!document.querySelector('[data-testid=xfer-done]')")) && await seen('The money is in the family wallet'), await path());
  check('an owner can switch to paying a member back', (await byId('xfer-mode-reimburse')) && (await byId('xfer-who-u2')) && (await byId('xfer-fam-fw1')) && (await typeInto('xfer-amount', '5000')) && (await byId('xfer-submit')) && (await until("!!document.querySelector('[data-testid=xfer-done]')")) && await seen('has been paid back'), await path());
  check('a transaction in the family shows its comments and takes a new one', (await ev("(() => { history.pushState({}, '', '/app/transaction-detail?mock=1&role=OWNER&id=t2&type=EXPENSE&category=transport&title=Moto&amount=-2500&date=2026-10-30T06%3A15%3A00.000Z&walletId=w2'); window.dispatchEvent(new PopStateEvent('popstate')); return true; })()")) && await seen('Was this the big bag?') && (await typeInto('comment-input', 'Yes, the big one')) && (await byId('comment-send')) && await seen('Yes, the big one'), await path());
  check('Settings in the family bar opens the family settings (the hub)', (await clickTab('Settings')) && await seen('MEMBERS') && (await path()) === '/app/family', await path());
  check('the Scheduled screen opens inside the family instead of asking to switch to Personal', (await ev("(() => { history.pushState({}, '', '/app/scheduled?mock=1&role=OWNER'); window.dispatchEvent(new PopStateEvent('popstate')); return true; })()")) && (await until("!!document.body.innerText.includes('Scheduled') && !document.querySelector('[data-testid=personal-only]')")), await path());
  check('Loans and debts open inside the family instead of asking to switch to Personal', (await ev("(() => { history.pushState({}, '', '/app/debts?mock=1&role=OWNER'); window.dispatchEvent(new PopStateEvent('popstate')); return true; })()")) && (await until("document.body.innerText.includes('Loans & debts') && !document.querySelector('[data-testid=personal-only]')")), await path());
  await ev("(() => { history.pushState({}, '', '/app/family'); window.dispatchEvent(new PopStateEvent('popstate')); return true; })()"); await seen('MEMBERS');
  check('the hub has a way to the app settings', (await clickContaining('app settings')) && (await path()) === '/app/profile', await path());
  const s1 = await clickTab('Home'), s2 = await seen('FAMILY BALANCE'), s3 = await clickContaining('where are you'), s4 = await seen('Only you'), s5 = await clickContaining('personal'), s6 = await seen('Include loans');
  const s7 = await ev(`!![...document.querySelectorAll('[role=tab]')].find(n => n.getAttribute('aria-label') === 'Loans')`);
  check('the pill brings Personal back with its own bar (Loans is there again)', s1 && s2 && s3 && s4 && s5 && s6 && s7, `${await path()} steps ${[s1, s2, s3, s4, s5, s6, s7].map(Number).join('')}`);
  await go('Home', '/app', 'Include loans');
  check('Settings has a Family row that opens the hub', (await go('Settings', '/app/profile', 'Profile'), await clickContaining('family')) && await seen('MEMBERS') && (await path()) === '/app/family', await path());
  check('the hub lists the members and the invite button (Owner)', await seen('Grace Uwase') && await seen('Invite someone'), await path());
  check('Invite someone opens the invite sheet', (await click('Invite someone')) && await seen('Choose what they can do'), await path());
  check('a Member cannot invite: the button is replaced by a note', await (async () => {
    await send('Page.navigate', { url: `${origin}/app/family?mock=1&role=MEMBER` });
    return (await seen('Only the owner and admins can invite people.')) && !(await text()).includes('Invite someone');
  })(), await path());
  check('a Viewer has no big + on the tab bar', await (async () => {
    await send('Page.navigate', { url: `${origin}/app?mock=1&role=VIEWER` });
    await seen('Personal');
    await clickContaining('where are you'); await seen('Mwiza Family');
    await clickContaining('mwiza family'); await seen('FAMILY BALANCE');
    return !(await ev(`!!document.querySelector('[aria-label="Add"]')`));
  })(), await path());
  await send('Page.navigate', { url: `${origin}/app?mock=1&role=OWNER` });

  check('a reminder about a debt from another space opens that space instead of offering to pay it from here', await (async () => {
    await send('Page.navigate', { url: `${origin}/app?mock=1&role=OWNER&reminder=family` });
    await seen('Marie Claire');
    return (await seen('Open loan')) && !(await text()).includes('Mark paid');
  })(), await path());
  await send('Page.navigate', { url: `${origin}/app?mock=1&role=OWNER` });

  // someone with no family: the create and join screens, and an invite code
  await send('Page.navigate', { url: `${origin}/app/family-create?mock=1&nofamily=1` });
  check('Create a family opens', await seen('Create family') && await seen('FAMILY NAME'), await path());
  check('an empty name is refused in words', (await click('Create family')) && await seen('Enter a family name.'), await path());
  await send('Page.navigate', { url: `${origin}/app/family-join?nofamily=1` });
  check('Join a family opens', await seen('Join a family') && await seen('INVITE CODE OR LINK'), await path());

  // an invite link, signed in: the secret leaves the address bar and the invite is shown
  await send('Page.navigate', { url: `${origin}/join/${TOKEN}` });
  check('the invite link lands on the Join screen', await seen('Join Mwiza Family') && (await path()).startsWith('/app/family-join'), await path());
  check('the secret is not in the address bar', !(await path()).includes(TOKEN) && !(await ev('JSON.stringify(history.state)')).includes(TOKEN), await path());
  check('the preview says who invited and the privacy notice', await seen('Invited by Aline Uwase') && await seen('They can never see your personal money'), await path());
  check('Join takes the person into the family', (await click('Join Mwiza Family')) && await seen('FAMILY BALANCE'), await path());

  // signed out: the invite link asks for sign-in first, and still keeps the secret out of the address bar
  await send('Page.navigate', { url: `${origin}/login` });
  await ev(`sessionStorage.clear(); localStorage.clear(); true`);
  await send('Page.navigate', { url: `${origin}/join/${TOKEN}` });
  check('signed out, the invite page asks to sign in or create an account', await seen("You're invited") && await seen('Sign in') && await seen('Create an account'), await path());
  check('and the address is plain /join', (await path()) === '/join', await path());
  check('Sign in goes to the sign-in screen', (await click('Sign in')) && (await path()) === '/login', await path());

  // signed out: the app address sends you to sign in
  await send('Page.navigate', { url: `${origin}/login` });
  await ev(`sessionStorage.clear(); localStorage.clear(); true`);
  await send('Page.navigate', { url: `${origin}/app/wallets` });
  await until("location.pathname === '/login'");
  check('without signing in, /app/wallets goes to /login', (await path()) === '/login', await path());
} catch (e) {
  check('the check ran to the end', false, String(e.message ?? e));
} finally {
  ws.close(); browser.kill(); server.kill();
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* still in use */ }
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
