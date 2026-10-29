/**
 * Seeds two verified people in a SCRATCH database and walks the family flow through the real HTTP API
 * (login, create family, wallet, invite, join, scoped transaction, scope isolation). Used to try the web app against a real backend.
 *   DATABASE_URL="mysql://root@localhost:3306/p1test_web" API=http://localhost:3999 npx ts-node scripts/web-e2e-seed.ts
 */
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

const API = process.env.API ?? 'http://localhost:3999';
if (!/p1test|scratch|_test/i.test(process.env.DATABASE_URL ?? '')) throw new Error('Refusing to run: DATABASE_URL must point at a scratch database.');
const prisma = new PrismaService();
let failed = 0;
const check = (name: string, ok: boolean, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

async function call(method: string, path: string, token?: string, body?: unknown, family?: string) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(family ? { 'x-family-id': family } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = text; try { data = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, data };
}

async function person(first: string, n: number) {
  const email = `${first.toLowerCase()}@webe2e.test`;
  await prisma.client.deleteMany({ where: { email } });
  await prisma.client.create({ data: { firstName: first, lastName: 'Uwase', email, phone: `+25078000000${n}`, emailVerifiedAt: new Date(), isVerified: true, passwordHash: await bcrypt.hash('Passw0rd!', 10) } });
  const r = await call('POST', '/client-auth/login', undefined, { identifier: email, password: 'Passw0rd!' });
  return { email, token: r.data.accessToken as string, status: r.status };
}

async function main() {
  const aline = await person('Aline', 1);
  const eric = await person('Eric', 2);
  check('both people can sign in', !!aline.token && !!eric.token, `${aline.status}/${eric.status}`);

  const none = await call('GET', '/family/mine', aline.token);
  check('no family yet', !none.data?.family, JSON.stringify(none.data).slice(0, 60));

  const created = await call('POST', '/family', aline.token, { name: 'Mwiza Family', currency: 'RWF' });
  const fid = created.data?.family?.id as string;
  check('create a family', created.status < 300 && !!fid, String(created.status));

  const w = await call('POST', '/wallets', aline.token, { name: 'Household', bank: 'Cash', walletType: 'CASH', balance: 100000, currency: 'RWF' }, fid);
  check('Owner adds a family wallet', w.status < 300, `${w.status} ${JSON.stringify(w.data).slice(0, 80)}`);
  const personalW = await call('POST', '/wallets', aline.token, { name: 'My own cash', bank: 'Cash', walletType: 'CASH', balance: 5000, currency: 'RWF' });
  check('Owner adds a personal wallet', personalW.status < 300, String(personalW.status));

  const inv = await call('POST', `/family/${fid}/invites`, aline.token, { role: 'MEMBER' });
  check('invite made with a code and a link', inv.status < 300 && /^[A-Z0-9]{6}$/.test(inv.data?.code ?? ''), JSON.stringify(inv.data).slice(0, 120));
  const code = inv.data?.code as string;
  const link: string = inv.data?.link ?? inv.data?.url ?? '';
  const token = (link.match(/\/join\/([\w-]+)/) ?? [])[1] ?? inv.data?.token;

  const pre = await call('GET', `/family/invites/preview?code=${code}`, eric.token);
  check('Eric previews the invite by code', pre.status < 300 && /Mwiza/.test(JSON.stringify(pre.data)), JSON.stringify(pre.data).slice(0, 100));
  const join = await call('POST', '/family/join', eric.token, { code });
  check('Eric joins by code', join.status < 300, `${join.status} ${JSON.stringify(join.data).slice(0, 80)}`);

  const ew = await call('GET', '/wallets', eric.token, undefined, fid);
  check('Eric sees the family wallet', Array.isArray(ew.data) ? ew.data.some((x: any) => x.name === 'Household') : JSON.stringify(ew.data).includes('Household'));
  check('Eric does not see Aline personal wallet in the family', !JSON.stringify(ew.data).includes('My own cash'));
  const ep = await call('GET', '/wallets', eric.token);
  check('Eric personal space does not show the family wallet', !JSON.stringify(ep.data).includes('Household'));

  const famWallet = (Array.isArray(ew.data) ? ew.data : ew.data?.wallets ?? []).find((x: any) => x.name === 'Household');
  const tx = await call('POST', '/transactions', eric.token, { type: 'EXPENSE', amount: 2500, category: 'food', walletId: famWallet?.id, title: 'Groceries', date: new Date().toISOString() }, fid);
  check('Eric adds a family expense', tx.status < 300, `${tx.status} ${JSON.stringify(tx.data).slice(0, 100)}`);
  const list = await call('GET', '/transactions', aline.token, undefined, fid);
  check('Aline sees it with Eric as the author', JSON.stringify(list.data).includes('Groceries') && JSON.stringify(list.data).includes('Eric'));
  const stranger = await call('GET', '/wallets', aline.token, undefined, '00000000-0000-0000-0000-000000000000');
  check('a made-up family id is refused', stranger.status === 403, String(stranger.status));
  const loans = await call('GET', '/debts', eric.token, undefined, fid);
  check('loans are personal only inside a family', loans.status === 400 || loans.status === 403, String(loans.status));

  const page = await fetch(`${API}/join/${token ?? 'abcDEF123_-abcDEF123_-abcd'}`);
  check('the join page is served with no-store', page.status === 200 && page.headers.get('cache-control') === 'no-store' && page.headers.get('referrer-policy') === 'no-referrer');

  console.log(`\nINVITE_CODE_FOR_BROWSER_TEST=pending  (log in as aline@webe2e.test / Passw0rd!)`);
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
