import { makeWorld } from './family.fake';

/** The error code a rejected call carries (the apps translate it). */
const codeOf = async (p: Promise<unknown>) => {
  try { await p; return 'OK'; } catch (e: any) { return e?.response?.code ?? e?.code ?? `ERR:${e?.message}`; }
};
const owners = (w: ReturnType<typeof makeWorld>, familyId: string) =>
  w.db.tables.familyMember.filter(m => m.familyId === familyId && m.status === 'ACTIVE' && m.role === 'OWNER');

async function family(w = makeWorld()) {
  const { family: f } = await w.families.create('aline', { name: 'Mwiza Family', currency: 'RWF', timezone: 'Africa/Kigali' });
  await w.join(f.id, 'aline', [['eric', 'ADMIN'], ['grace', 'MEMBER'], ['kevin', 'VIEWER']]);
  return { w, id: f.id as string };
}

describe('creating a family', () => {
  test('makes the creator the one Owner, with the database key and a history line', async () => {
    const w = makeWorld();
    const res = await w.families.create('aline', { name: '  Mwiza   Family ', currency: 'rwf', timezone: 'Africa/Kigali' });
    expect(res.role).toBe('OWNER');
    expect(res.family).toMatchObject({ name: 'Mwiza Family', currency: 'RWF', timezone: 'Africa/Kigali' });
    const member = w.db.tables.familyMember[0];
    expect(member).toMatchObject({ clientId: 'aline', role: 'OWNER', status: 'ACTIVE', activeKey: 'aline' });
    expect(w.db.tables.familyActivity.map(a => a.action)).toEqual(['family.created']);
  });

  test('needs a verified email or phone, and an active account', async () => {
    const w = makeWorld();
    w.db.tables.client.find(c => c.id === 'aline')!.emailVerifiedAt = null;
    expect(await codeOf(w.families.create('aline', { name: 'X' }))).toBe('NOT_VERIFIED');
    w.db.tables.client.find(c => c.id === 'aline')!.phoneVerifiedAt = new Date();       // a verified phone is enough
    expect(await codeOf(w.families.create('aline', { name: 'X' }))).toBe('OK');
    w.db.tables.client.find(c => c.id === 'eric')!.isActive = false;
    expect(await codeOf(w.families.create('eric', { name: 'Y' }))).toBe('NOT_VERIFIED');
  });

  test.each([
    ['an empty name', { name: '   ' }], ['a name over 60 characters', { name: 'x'.repeat(61) }],
    ['a bad currency', { name: 'A', currency: 'RWFX' }], ['a bad time zone', { name: 'A', timezone: 'Mars/Base' }],
  ])('refuses %s', async (_what, input) => {
    expect(await codeOf(makeWorld().families.create('aline', input as any))).toBe('INVALID_INPUT');
  });

  test('a second family for the same person is refused', async () => {
    const w = makeWorld();
    await w.families.create('aline', { name: 'One' });
    expect(await codeOf(w.families.create('aline', { name: 'Two' }))).toBe('ALREADY_IN_FAMILY');
    expect(w.db.tables.family).toHaveLength(1);
  });

  test('two creations at the same moment make exactly one family', async () => {
    const w = makeWorld();
    const results = await Promise.all([w.families.create('aline', { name: 'One' }), w.families.create('aline', { name: 'Two' })].map(p => codeOf(p)));
    expect(results.sort()).toEqual(['ALREADY_IN_FAMILY', 'OK']);
    expect(w.db.tables.family).toHaveLength(1);
    expect(w.db.tables.familyMember).toHaveLength(1);
  });
});

describe('my family', () => {
  test('is null without a family, and shows role, size and limits with one', async () => {
    const { w } = await family();
    expect(await w.families.mine('divine')).toBeNull();
    expect(await w.families.mine('grace')).toMatchObject({ role: 'MEMBER', memberCount: 4, limits: { maxMembers: 12, maxPendingInvites: 20, inviteDays: 7 } });
  });
});

describe('changing the family', () => {
  test('only the Owner renames it, and a currency change says amounts are untouched', async () => {
    const { w, id } = await family();
    expect(await codeOf(w.families.update('eric', id, { name: 'Nope' }))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.families.update('kevin', id, { name: 'Nope' }))).toBe('FORBIDDEN_ACTION');
    const res = await w.families.update('aline', id, { name: 'Mwiza & Co', currency: 'usd' });
    expect(res).toMatchObject({ family: { name: 'Mwiza & Co', currency: 'USD' }, currencyChanged: true, amountsUnchanged: true });
    expect((await w.families.update('aline', id, { name: 'Again' })).currencyChanged).toBe(false);
  });
  test('an empty change and someone outside the family are refused', async () => {
    const { w, id } = await family();
    expect(await codeOf(w.families.update('aline', id, {}))).toBe('INVALID_INPUT');
    expect(await codeOf(w.families.update('divine', id, { name: 'Hijack' }))).toBe('FAMILY_NOT_FOUND');
  });
});

describe('members list', () => {
  test('shows names and roles, never email or phone', async () => {
    const { w, id } = await family();
    const list = await w.families.members('grace', id);
    expect(list.map((m: any) => [m.name, m.role])).toEqual([['Aline Uwase', 'OWNER'], ['Eric Uwase', 'ADMIN'], ['Grace Uwase', 'MEMBER'], ['Kevin Uwase', 'VIEWER']]);
    expect(list.find((m: any) => m.isYou)?.clientId).toBe('grace');
    expect(JSON.stringify(list)).not.toMatch(/@example\.com|\+2507800/);
  });
  test('a nickname replaces the full name', async () => {
    const { w, id } = await family();
    w.db.tables.familyMember.find(m => m.clientId === 'eric')!.nickname = 'Dad';
    expect((await w.families.members('aline', id)).find((m: any) => m.clientId === 'eric')?.name).toBe('Dad');
  });
});

describe('roles', () => {
  test('only the Owner changes roles, never their own, never to or from Owner', async () => {
    const { w, id } = await family();
    expect(await codeOf(w.families.setRole('eric', id, 'grace', 'VIEWER'))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.families.setRole('aline', id, 'aline', 'ADMIN'))).toBe('CANNOT_CHANGE_OWN_ROLE');
    expect(await codeOf(w.families.setRole('aline', id, 'grace', 'OWNER'))).toBe('INVALID_ROLE');
    expect(await codeOf(w.families.setRole('aline', id, 'grace', 'BOSS'))).toBe('INVALID_ROLE');
    expect(await codeOf(w.families.setRole('aline', id, 'divine', 'MEMBER'))).toBe('MEMBER_NOT_FOUND');
    expect(await w.families.setRole('aline', id, 'grace', 'ADMIN')).toEqual({ clientId: 'grace', role: 'ADMIN' });
    expect(owners(w, id)).toHaveLength(1);
  });
});

describe('removing and leaving', () => {
  test('the Owner can remove anyone except themselves; the person loses the family at once', async () => {
    const { w, id } = await family();
    await w.families.removeMember('aline', id, 'eric');
    expect(w.db.tables.familyMember.find(m => m.clientId === 'eric')).toMatchObject({ status: 'REMOVED', activeKey: null });
    expect(await w.families.mine('eric')).toBeNull();
    expect(await codeOf(w.families.members('eric', id))).toBe('FAMILY_NOT_FOUND');     // the very next request is refused
  });
  test('an Admin removes Members and Viewers, not Admins or the Owner', async () => {
    const { w, id } = await family();
    expect(await codeOf(w.families.removeMember('eric', id, 'aline'))).toBe('OWNER_CANNOT_BE_CHANGED');
    await w.join(id, 'aline', [['divine', 'ADMIN']]);
    expect(await codeOf(w.families.removeMember('eric', id, 'divine'))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.families.removeMember('eric', id, 'grace'))).toBe('OK');
    expect(await codeOf(w.families.removeMember('eric', id, 'kevin'))).toBe('OK');
  });
  test('Members and Viewers remove nobody', async () => {
    const { w, id } = await family();
    expect(await codeOf(w.families.removeMember('grace', id, 'kevin'))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.families.removeMember('kevin', id, 'grace'))).toBe('FORBIDDEN_ACTION');
  });
  test('removing someone who is not in the family says so', async () => {
    const { w, id } = await family();
    expect(await codeOf(w.families.removeMember('aline', id, 'divine'))).toBe('MEMBER_NOT_FOUND');
  });
  test('a member can leave; their old entries are not touched and the key is freed', async () => {
    const { w, id } = await family();
    await w.families.removeMember('grace', id, 'grace');
    expect(w.db.tables.familyMember.find(m => m.clientId === 'grace')).toMatchObject({ status: 'LEFT', activeKey: null });
    expect((await w.families.create('grace', { name: 'My own' })).role).toBe('OWNER');     // free to start another
  });
  test('the Owner cannot leave', async () => {
    const { w, id } = await family();
    expect(await codeOf(w.families.removeMember('aline', id, 'aline'))).toBe('OWNER_MUST_TRANSFER');
  });
});

describe('transferring ownership', () => {
  test('hands over, keeps exactly one Owner, and the old owner becomes an Admin', async () => {
    const { w, id } = await family();
    await w.families.transferOwnership('aline', id, 'grace');
    expect(w.db.tables.familyMember.find(m => m.clientId === 'grace')!.role).toBe('OWNER');
    expect(w.db.tables.familyMember.find(m => m.clientId === 'aline')!.role).toBe('ADMIN');
    expect(owners(w, id)).toHaveLength(1);
    expect(await codeOf(w.families.transferOwnership('aline', id, 'eric'))).toBe('FORBIDDEN_ACTION');       // no longer the owner
  });
  test('refuses yourself, a non-member and a non-owner', async () => {
    const { w, id } = await family();
    expect(await codeOf(w.families.transferOwnership('aline', id, 'aline'))).toBe('INVALID_INPUT');
    expect(await codeOf(w.families.transferOwnership('aline', id, 'divine'))).toBe('MEMBER_NOT_FOUND');
    expect(await codeOf(w.families.transferOwnership('eric', id, 'grace'))).toBe('FORBIDDEN_ACTION');
  });
  test('after a transfer the old owner can leave', async () => {
    const { w, id } = await family();
    await w.families.transferOwnership('aline', id, 'eric');
    expect(await codeOf(w.families.removeMember('aline', id, 'aline'))).toBe('OK');
  });
});

describe('archiving (deleting) the family', () => {
  test('needs the family name typed, then ends every membership and every pending invite', async () => {
    const { w, id } = await family();
    const pending = await w.invites.create('aline', id, { role: 'MEMBER' });
    expect(await codeOf(w.families.archive('eric', id, 'Mwiza Family'))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.families.archive('aline', id, 'wrong'))).toBe('CONFIRM_NAME_MISMATCH');
    expect(await codeOf(w.families.archive('aline', id, undefined))).toBe('CONFIRM_NAME_MISMATCH');
    await w.families.archive('aline', id, '  mwiza family ');
    expect(w.db.tables.family[0]).toMatchObject({ status: 'ARCHIVED' });
    expect(w.db.tables.familyMember.every(m => m.activeKey === null && m.status !== 'ACTIVE')).toBe(true);
    expect(w.db.tables.familyInvite.find(i => i.id === pending.id)!.status).toBe('REVOKED');
    for (const p of ['aline', 'eric', 'grace', 'kevin']) expect(await w.families.mine(p)).toBeNull();
    expect((await w.families.create('eric', { name: 'Fresh start' })).role).toBe('OWNER');
  });
});

describe('nobody outside a family reaches it', () => {
  test('every call answers "not found" for a stranger, so the id is never confirmed', async () => {
    const { w, id } = await family();
    const calls: Array<() => Promise<unknown>> = [
      () => w.families.update('divine', id, { name: 'x' }), () => w.families.archive('divine', id, 'Mwiza Family'),
      () => w.families.members('divine', id), () => w.families.setRole('divine', id, 'grace', 'VIEWER'),
      () => w.families.removeMember('divine', id, 'grace'), () => w.families.transferOwnership('divine', id, 'grace'),
      () => w.families.activity('divine', id), () => w.invites.create('divine', id, { role: 'MEMBER' }),
      () => w.invites.list('divine', id), () => w.invites.revokeAll('divine', id), () => w.invites.revoke('divine', id, 'x'),
    ];
    for (const call of calls) expect(await codeOf(call())).toBe('FAMILY_NOT_FOUND');
  });
  test('a member of another family is a stranger here too', async () => {
    const { w, id } = await family();
    await w.families.create('divine', { name: 'Other' });
    expect(await codeOf(w.families.members('divine', id))).toBe('FAMILY_NOT_FOUND');
  });
});

describe('activity', () => {
  test('one line per event, newest first, with names; members only', async () => {
    const { w, id } = await family();
    await w.families.setRole('aline', id, 'grace', 'ADMIN');
    const rows = await w.families.activity('kevin', id);
    expect(rows[0]).toMatchObject({ action: 'member.role_changed', actor: { name: 'Aline Uwase' }, target: { name: 'Grace Uwase' }, meta: { from: 'MEMBER', to: 'ADMIN' } });
    expect(rows.map((r: any) => r.action)).toContain('family.created');
    expect(rows.filter((r: any) => r.action === 'member.joined')).toHaveLength(3);
  });
  test('pages by date and clamps the page size', async () => {
    const { w, id } = await family();
    const all = await w.families.activity('aline', id, { limit: 500 });
    const first = await w.families.activity('aline', id, { limit: 2 });
    expect(first).toHaveLength(2);
    expect(all.length).toBeGreaterThan(2);
    expect(await codeOf(w.families.activity('aline', id, { before: 'not a date' }))).toBe('INVALID_INPUT');
  });
  test('an actor who no longer has an account still shows as a former member', async () => {
    const { w, id } = await family();
    w.db.tables.client.splice(w.db.tables.client.findIndex(c => c.id === 'grace'), 1);
    const joined = (await w.families.activity('aline', id)).find((r: any) => r.action === 'member.joined' && r.actor.clientId === 'grace');
    expect(joined?.actor.name).toBe('Former member');
  });
});

describe('the rules that must always hold', () => {
  test('after any mix of actions there is one Owner, nobody is active twice, and keys match status', async () => {
    const { w, id } = await family();
    await w.families.setRole('aline', id, 'grace', 'ADMIN');
    await w.families.transferOwnership('aline', id, 'grace');
    await w.families.removeMember('grace', id, 'kevin');
    await w.families.removeMember('eric', id, 'eric');
    await w.join(id, 'grace', [['divine', 'MEMBER']]);
    expect(owners(w, id)).toHaveLength(1);
    const active = w.db.tables.familyMember.filter(m => m.status === 'ACTIVE');
    expect(new Set(active.map(m => m.clientId)).size).toBe(active.length);
    for (const m of w.db.tables.familyMember) expect(m.activeKey).toBe(m.status === 'ACTIVE' ? m.clientId : null);
  });
});
