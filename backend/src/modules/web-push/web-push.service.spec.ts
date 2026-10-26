import { HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import * as webpush from 'web-push';
import { WebPushService } from './web-push.service';
import { buildWebPayload } from './lib/payload';

jest.mock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn() }));
const sendNotification = webpush.sendNotification as unknown as jest.Mock;

// A small in-memory stand-in for the one table the service uses.
function fakePrisma(initial: any[] = []) {
  const rows: any[] = initial.map(r => ({ failureCount: 0, label: null, createdAt: new Date(), ...r }));
  let seq = rows.length;
  const match = (r: any, where: any) => Object.entries(where).every(([k, v]) => r[k] === v);
  const table = {
    findFirst: async ({ where }: any) => rows.find(r => match(r, where)) ?? null,
    findMany: async ({ where }: any = {}) => rows.filter(r => match(r, where ?? {})),
    create: async ({ data }: any) => { const r = { id: `s${++seq}`, createdAt: new Date(), ...data }; rows.push(r); return r; },
    update: async ({ where, data }: any) => {
      const r = rows.find(x => x.id === where.id);
      if (!r) throw new Error('not found');
      for (const [k, v] of Object.entries(data)) r[k] = v && typeof v === 'object' && 'increment' in (v as any) ? r[k] + (v as any).increment : v;
      return r;
    },
    updateMany: async ({ where, data }: any) => { const hit = rows.filter(r => match(r, where)); hit.forEach(r => Object.assign(r, data)); return { count: hit.length }; },
    deleteMany: async ({ where }: any) => { const hit = rows.filter(r => match(r, where)); hit.forEach(r => rows.splice(rows.indexOf(r), 1)); return { count: hit.length }; },
  };
  return { prisma: { webPushSubscription: table } as any, rows };
}

const sub = (o: any = {}) => ({ id: 's1', clientId: 'c1', endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a', ...o });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

function service(rows: any[] = [], keys = true) {
  if (keys) { process.env.VAPID_PUBLIC_KEY = 'pub'; process.env.VAPID_PRIVATE_KEY = 'priv'; }
  else { delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; }
  const db = fakePrisma(rows);
  return { svc: new WebPushService(db.prisma), ...db };
}
const payload = buildWebPayload({ title: 'Hi', body: 'There', data: { type: 'system', notificationId: 'n1' } });

beforeEach(() => sendNotification.mockReset());

describe('subscribing', () => {
  it('saves a browser with a readable name and never returns its address', async () => {
    const { svc, rows } = service();
    const d: any = await svc.subscribe('c1', { endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a', userAgent: UA });
    expect(rows).toHaveLength(1);
    expect(d).toMatchObject({ label: 'Computer', browser: 'Chrome 127', os: 'Windows 10/11', deviceType: 'DESKTOP' });
    expect(d.endpoint).toBeUndefined();
    expect(d.endpointHash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('subscribing the same browser again moves it to the account that is signed in now', async () => {
    const { svc, rows } = service([sub({ clientId: 'old', label: 'Kept name' })]);
    await svc.subscribe('c2', { endpoint: 'https://push.example/1', p256dh: 'k2', auth: 'a2' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clientId: 'c2', p256dh: 'k2', label: 'Kept name', failureCount: 0 });
  });

  it('lists only this account\'s browsers', async () => {
    const { svc } = service([sub({ id: 'a' }), sub({ id: 'b', clientId: 'other', endpoint: 'https://push.example/2' })]);
    expect((await svc.listSubscriptions('c1')).map((d: any) => d.id)).toEqual(['a']);
  });
});

describe('managing devices', () => {
  it('rename and remove only work on your own device', async () => {
    const { svc, rows } = service([sub({ id: 'mine' }), sub({ id: 'theirs', clientId: 'other', endpoint: 'https://push.example/2' })]);
    await svc.renameSubscription('c1', 'mine', 'Work laptop');
    expect(rows.find(r => r.id === 'mine').label).toBe('Work laptop');
    await expect(svc.renameSubscription('c1', 'theirs', 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.deleteSubscription('c1', 'theirs')).rejects.toBeInstanceOf(NotFoundException);
    await svc.deleteSubscription('c1', 'mine');
    expect(rows.map(r => r.id)).toEqual(['theirs']);
  });

  it('unsubscribe removes one browser, or all of the account\'s', async () => {
    const { svc, rows } = service([sub({ id: 'a' }), sub({ id: 'b', endpoint: 'https://push.example/2' }), sub({ id: 'c', clientId: 'other', endpoint: 'https://push.example/3' })]);
    await svc.unsubscribeDevice('c1', 'https://push.example/1');
    expect(rows.map(r => r.id)).toEqual(['b', 'c']);
    await svc.unsubscribeAll('c1');
    expect(rows.map(r => r.id)).toEqual(['c']);
  });

  it('markSeen updates the last-seen time', async () => {
    const { svc, rows } = service([sub()]);
    await svc.markSeen('c1', 'https://push.example/1');
    expect(rows[0].lastSeenAt).toBeInstanceOf(Date);
  });
});

describe('sending', () => {
  it('does nothing, without throwing, when the server has no keys', async () => {
    const { svc } = service([sub()], false);
    expect(await svc.sendToClient('c1', payload)).toEqual({ sent: 0, total: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(svc.publicKeyInfo()).toEqual({ publicKey: null, enabled: false });
  });

  it('delivers to every browser of the account and records the success', async () => {
    sendNotification.mockResolvedValue({});
    const { svc, rows } = service([sub({ id: 'a' }), sub({ id: 'b', endpoint: 'https://push.example/2' }), sub({ id: 'x', clientId: 'other', endpoint: 'https://push.example/3' })]);
    expect(await svc.sendToClient('c1', payload)).toEqual({ sent: 2, total: 2 });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [target, body, opts] = sendNotification.mock.calls[0];
    expect(target.keys).toEqual({ p256dh: 'k', auth: 'a' });
    expect(JSON.parse(body)).toMatchObject({ title: 'Hi', tag: 'n-n1', url: '/app/notifications' });
    expect(opts).toMatchObject({ TTL: 86_400, urgency: 'normal' });
    expect(rows.find(r => r.id === 'a').lastSuccessAt).toBeInstanceOf(Date);
  });

  it('removes a browser the push service says is gone (404/410)', async () => {
    sendNotification.mockRejectedValue({ statusCode: 410 });
    const { svc, rows } = service([sub()]);
    expect(await svc.sendToClient('c1', payload)).toEqual({ sent: 0, total: 1 });
    expect(rows).toHaveLength(0);
  });

  it('keeps a browser through a one-off failure, and drops it after ten in a row', async () => {
    sendNotification.mockRejectedValue({ statusCode: 500 });
    const { svc, rows } = service([sub()]);
    await svc.sendToClient('c1', payload);
    expect(rows[0]).toMatchObject({ failureCount: 1 });
    expect(rows[0].lastFailureAt).toBeInstanceOf(Date);
    for (let i = 0; i < 9; i++) await svc.sendToClient('c1', payload);
    expect(rows).toHaveLength(0);
  });

  it('urgent messages use high urgency, and the topic is short and URL-safe', async () => {
    sendNotification.mockResolvedValue({});
    const { svc } = service([sub()]);
    await svc.sendToClient('c1', { ...payload, tag: 'reminder/abc def!', urgent: true });
    expect(sendNotification.mock.calls[0][2]).toMatchObject({ urgency: 'high', topic: 'reminderabcdef' });
  });

  it('never throws, even if the database does', async () => {
    const { svc, prisma } = (() => { const s = service(); return { svc: s.svc, prisma: s.prisma }; })();
    prisma.webPushSubscription.findMany = async () => { throw new Error('db down'); };
    await expect(svc.sendToClient('c1', payload)).resolves.toEqual({ sent: 0, total: 0 });
  });
});

describe('test notification', () => {
  it('needs the server to be set up', async () => {
    const { svc } = service([sub()], false);
    await expect(svc.sendTest('c1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('sends to one device or all, reports the result, and waits between tests', async () => {
    sendNotification.mockResolvedValue({});
    const { svc } = service([sub({ id: 'a' }), sub({ id: 'b', endpoint: 'https://push.example/2' })]);
    expect(await svc.sendTest('c1', 'a')).toMatchObject({ sent: 1, failed: 0 });
    await expect(svc.sendTest('c1')).rejects.toBeInstanceOf(HttpException); // too soon
  });

  it('says so when the device does not exist', async () => {
    const { svc } = service([sub()]);
    await expect(svc.sendTest('c1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('buildWebPayload', () => {
  it('a plain notification opens the inbox and can be replaced by its tag', () => {
    expect(buildWebPayload({ title: 'T', body: 'B', data: { type: 'transaction', notificationId: 'n9' }, now: 5 }))
      .toEqual({ title: 'T', body: 'B', tag: 'n-n9', url: '/app/notifications', urgent: false, stay: false, timestamp: 5, recipientRowId: 'n9' });
  });
  it('a security alert is urgent', () => {
    expect(buildWebPayload({ title: 'T', body: 'B', data: { type: 'security' } }).urgent).toBe(true);
  });
  it('a debt reminder opens that debt and stays on screen', () => {
    expect(buildWebPayload({ title: 'T', body: 'B', data: { type: 'reminder', reminderId: 'r1', debtId: 'd 1' } }))
      .toMatchObject({ tag: 'reminder-r1', url: '/app/debts?openId=d%201', stay: true });
  });
  it('a scheduled reminder opens that schedule', () => {
    expect(buildWebPayload({ title: 'T', body: 'B', data: { type: 'reminder', reminderId: 'r2', scheduleId: 's1' } }).url).toBe('/app/scheduled?id=s1');
  });
  it('a digest opens the reminder pop-up', () => {
    expect(buildWebPayload({ title: 'T', body: 'B', data: { type: 'reminder', digest: true } })).toMatchObject({ tag: 'reminder-digest', url: '/app?reminder=1', stay: true });
  });
  it('copes with no data at all', () => {
    expect(buildWebPayload({ title: 'T', body: 'B', now: 1, uniqueId: 'u' })).toMatchObject({ tag: 'n-u', url: '/app/notifications' });
  });
});
