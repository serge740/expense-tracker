import { InviteAttemptLimiter } from './family-invites.service';
import { CODE_ALPHABET, hashToken } from './family-codes';
import { makeWorld } from './family.fake';

const codeOf = async (p: Promise<unknown>) => {
  try { await p; return 'OK'; } catch (e: any) { return e?.response?.code ?? e?.code ?? `ERR:${e?.message}`; }
};
const statusOf = async (p: Promise<unknown>) => {
  try { await p; return 200; } catch (e: any) { return e?.status ?? 500; }
};

async function setup() {
  const w = makeWorld();
  const { family } = await w.families.create('aline', { name: 'Mwiza Family' });
  return { w, id: family.id as string };
}
const row = (w: ReturnType<typeof makeWorld>, id: string) => w.db.tables.familyInvite.find(i => i.id === id)!;

describe('creating invites', () => {
  test('returns a code, a link and the token once; only the hash is stored', async () => {
    const { w, id } = await setup();
    const inv = await w.invites.create('aline', id, { role: 'MEMBER' });
    expect(inv.code).toMatch(new RegExp(`^[${CODE_ALPHABET}]{6}$`));
    expect(inv.link).toBe(`https://aby-ex.onrender.com/join/${inv.token}`);
    const stored = row(w, inv.id);
    expect(stored.tokenHash).toBe(hashToken(inv.token));
    expect(JSON.stringify(stored)).not.toContain(inv.token);
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    expect(stored.expiresAt.getTime() - Date.now()).toBeLessThan(7.1 * 86_400_000);
    expect(w.db.tables.familyActivity.map(a => a.action)).toContain('invite.created');
  });

  test('who may offer which role', async () => {
    const { w, id } = await setup();
    await w.join(id, 'aline', [['eric', 'ADMIN'], ['grace', 'MEMBER'], ['kevin', 'VIEWER']]);
    expect(await codeOf(w.invites.create('aline', id, { role: 'ADMIN' }))).toBe('OK');
    expect(await codeOf(w.invites.create('eric', id, { role: 'ADMIN' }))).toBe('FORBIDDEN_ACTION');      // an Admin cannot make Admins
    expect(await codeOf(w.invites.create('eric', id, { role: 'VIEWER' }))).toBe('OK');
    expect(await codeOf(w.invites.create('grace', id, { role: 'VIEWER' }))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.invites.create('kevin', id, { role: 'MEMBER' }))).toBe('FORBIDDEN_ACTION');
    expect(await codeOf(w.invites.create('aline', id, { role: 'OWNER' }))).toBe('INVALID_ROLE');          // never an owner
    expect(await codeOf(w.invites.create('aline', id, { role: 'BOSS' }))).toBe('INVALID_ROLE');
  });

  test('checks a targeted phone or email', async () => {
    const { w, id } = await setup();
    expect(await codeOf(w.invites.create('aline', id, { role: 'MEMBER', phone: '12' }))).toBe('INVALID_INPUT');
    expect(await codeOf(w.invites.create('aline', id, { role: 'MEMBER', email: 'nope' }))).toBe('INVALID_INPUT');
    const ok = await w.invites.create('aline', id, { role: 'MEMBER', phone: '+250 788 123 456', email: ' Dee@Example.com ' });
    expect(ok).toMatchObject({ phone: '+250788123456', email: 'dee@example.com' });
  });

  test('the member cap counts pending invites too (1 member + 11 pending = 12)', async () => {
    const { w, id } = await setup();
    for (let i = 0; i < 11; i++) await w.invites.create('aline', id, { role: 'MEMBER' });      // 1 member + 11 pending = 12: the member cap
    expect(await codeOf(w.invites.create('aline', id, { role: 'MEMBER' }))).toBe('FAMILY_FULL');
  });

  test('the 20 cap applies on its own when the member cap is not what stops it', async () => {
    const { w, id } = await setup();
    for (let i = 0; i < 20; i++) w.db.tables.familyInvite.push({ id: `x${i}`, familyId: id, status: 'PENDING', expiresAt: new Date(Date.now() + 1e9), code: `AAAA${String(i).padStart(2, '2')}`, tokenHash: `h${i}`, role: 'MEMBER', invitedBy: 'aline' });
    w.db.tables.familyMember.length = 0;          // an empty member count so only the invite cap can refuse
    w.db.tables.familyMember.push({ id: 'm', familyId: id, clientId: 'aline', role: 'OWNER', status: 'ACTIVE', activeKey: `aline:${id}` });
    expect(await codeOf(w.invites.create('aline', id, { role: 'MEMBER' }))).toBe('TOO_MANY_PENDING_INVITES');
  });

  test('expired invites do not count towards the cap', async () => {
    const { w, id } = await setup();
    for (let i = 0; i < 11; i++) await w.invites.create('aline', id, { role: 'MEMBER' });
    w.invites.now = () => new Date(Date.now() + 8 * 86_400_000);
    expect(await codeOf(w.invites.create('aline', id, { role: 'MEMBER' }))).toBe('OK');
  });
});

describe('listing and revoking', () => {
  test('the list shows pending invites with their code but never a token', async () => {
    const { w, id } = await setup();
    const a = await w.invites.create('aline', id, { role: 'MEMBER' });
    const b = await w.invites.create('aline', id, { role: 'VIEWER' });
    await w.invites.revoke('aline', id, b.id);
    const list = await w.invites.list('aline', id);
    expect(list.map((i: any) => i.id)).toEqual([a.id]);
    expect(list[0].code).toBe(a.code);
    expect(JSON.stringify(list)).not.toContain(a.token);
    expect(JSON.stringify(list)).not.toContain('tokenHash');
  });
  test('Members and Viewers cannot list or revoke', async () => {
    const { w, id } = await setup();
    await w.join(id, 'aline', [['grace', 'MEMBER'], ['kevin', 'VIEWER']]);
    const a = await w.invites.create('aline', id, { role: 'MEMBER' });
    for (const who of ['grace', 'kevin']) {
      expect(await codeOf(w.invites.list(who, id))).toBe('FORBIDDEN_ACTION');
      expect(await codeOf(w.invites.revoke(who, id, a.id))).toBe('FORBIDDEN_ACTION');
      expect(await codeOf(w.invites.revokeAll(who, id))).toBe('FORBIDDEN_ACTION');
    }
  });
  test('a revoked invite stops working at once; revoking twice or a made-up id says not found', async () => {
    const { w, id } = await setup();
    const a = await w.invites.create('aline', id, { role: 'MEMBER' });
    await w.invites.revoke('aline', id, a.id);
    expect(await codeOf(w.invites.accept('eric', { code: a.code }))).toBe('INVITE_INVALID');
    expect(await codeOf(w.invites.revoke('aline', id, a.id))).toBe('INVITE_NOT_FOUND');
    expect(await codeOf(w.invites.revoke('aline', id, 'nope'))).toBe('INVITE_NOT_FOUND');
  });
  test('revoke-all stops every pending invite', async () => {
    const { w, id } = await setup();
    const a = await w.invites.create('aline', id, { role: 'MEMBER' });
    const b = await w.invites.create('aline', id, { role: 'MEMBER' });
    expect(await w.invites.revokeAll('aline', id)).toEqual({ revoked: 2 });
    for (const inv of [a, b]) expect(await codeOf(w.invites.preview('eric', { token: inv.token }))).toBe('INVITE_INVALID');
  });
  test('one family cannot revoke another family\'s invite', async () => {
    const { w, id } = await setup();
    const { family: other } = await w.families.create('divine', { name: 'Other' });
    const a = await w.invites.create('aline', id, { role: 'MEMBER' });
    expect(await codeOf(w.invites.revoke('divine', other.id, a.id))).toBe('INVITE_NOT_FOUND');
    expect(row(w, a.id).status).toBe('PENDING');
  });
});

describe('previewing and joining', () => {
  test('a valid invite can be previewed (by code or by link) and then accepted', async () => {
    const { w, id } = await setup();
    const inv = await w.invites.create('aline', id, { role: 'VIEWER' });
    const byCode = await w.invites.preview('eric', { code: ` ${inv.code.toLowerCase().slice(0, 3)}-${inv.code.slice(3).toLowerCase()} ` });
    expect(byCode).toMatchObject({ family: { name: 'Mwiza Family' }, invitedBy: 'Aline Uwase', role: 'VIEWER' });
    expect(await w.invites.preview('eric', { token: inv.token })).toEqual(byCode);
    expect(row(w, inv.id).status).toBe('PENDING');                       // looking changes nothing
    const joined = await w.invites.accept('eric', { token: inv.token });
    expect(joined).toMatchObject({ family: { id, name: 'Mwiza Family' }, role: 'VIEWER' });
    expect(row(w, inv.id)).toMatchObject({ status: 'ACCEPTED', acceptedBy: 'eric' });
    expect(w.db.tables.familyMember.find(m => m.clientId === 'eric')).toMatchObject({ role: 'VIEWER', status: 'ACTIVE', activeKey: expect.stringMatching(/^eric:/) });
    expect(w.db.tables.familyActivity.some(a => a.action === 'member.joined' && a.actorId === 'eric')).toBe(true);
  });

  test('an expired invite is refused and marked as expired', async () => {
    const { w, id } = await setup();
    const inv = await w.invites.create('aline', id, { role: 'MEMBER' });
    w.invites.now = () => new Date(Date.now() + 8 * 86_400_000);
    expect(await statusOf(w.invites.preview('eric', { code: inv.code }))).toBe(410);
    expect(await codeOf(w.invites.preview('eric', { code: inv.code }))).toBe('INVITE_EXPIRED');
    expect(row(w, inv.id).status).toBe('EXPIRED');
    expect(await codeOf(w.invites.accept('eric', { code: inv.code }))).toBe('INVITE_EXPIRED');
  });

  test('revoked and already-used invites give the same answer, so nobody learns who used it', async () => {
    const { w, id } = await setup();
    const used = await w.invites.create('aline', id, { role: 'MEMBER' });
    await w.invites.accept('eric', { code: used.code });
    const revoked = await w.invites.create('aline', id, { role: 'MEMBER' });
    await w.invites.revoke('aline', id, revoked.id);
    const a: any = await w.invites.accept('grace', { code: used.code }).catch(e => e);
    const b: any = await w.invites.accept('grace', { code: revoked.code }).catch(e => e);
    expect(a.status).toBe(410);
    expect(a.response).toEqual(b.response);
    expect(a.response.code).toBe('INVITE_INVALID');
  });

  test('a code or token that matches nothing is "not found"', async () => {
    const { w } = await setup();
    expect(await statusOf(w.invites.preview('eric', { code: 'ZZZZZZ' }))).toBe(404);
    expect(await codeOf(w.invites.preview('eric', { code: 'ZZZZZZ' }))).toBe('INVITE_NOT_FOUND');
    expect(await codeOf(w.invites.preview('eric', { token: 'a'.repeat(32) }))).toBe('INVITE_NOT_FOUND');
    expect(await codeOf(w.invites.preview('eric', {}))).toBe('INVITE_NOT_FOUND');
    expect(await codeOf(w.invites.preview('eric', { code: 'bad' }))).toBe('INVITE_NOT_FOUND');
  });

  test('someone already in this family, or its owner, is told so', async () => {
    const { w, id } = await setup();
    await w.join(id, 'aline', [['eric', 'MEMBER']]);
    const inv = await w.invites.create('aline', id, { role: 'MEMBER' });
    expect(await codeOf(w.invites.accept('eric', { code: inv.code }))).toBe('ALREADY_MEMBER');
    expect(await codeOf(w.invites.accept('aline', { code: inv.code }))).toBe('ALREADY_MEMBER');
    expect(row(w, inv.id).status).toBe('PENDING');
  });

  test('someone already in another family can join this one too, up to three, and the fourth is refused without using the invite up', async () => {
    const { w, id } = await setup();
    await w.families.create('divine', { name: 'Other' });
    const inv = await w.invites.create('aline', id, { role: 'MEMBER' });
    expect(await codeOf(w.invites.accept('divine', { code: inv.code }))).toBe('OK');
    await w.families.create('divine', { name: 'Third' });
    const again = await w.invites.create('aline', id, { role: 'MEMBER' });
    const fam4 = (await w.families.create('kevin', { name: 'K' })).family.id;
    const inv4 = await w.invites.create('kevin', fam4, { role: 'MEMBER' });
    expect(await codeOf(w.invites.accept('divine', { code: inv4.code }))).toBe('TOO_MANY_FAMILIES');
    expect(row(w, inv4.id).status).toBe('PENDING');                      // nothing was used up
    expect(again.id).toBeTruthy();
  });

  test('an invite to a family that has been deleted says so', async () => {
    const { w, id } = await setup();
    const inv = await w.invites.create('aline', id, { role: 'MEMBER' });
    w.db.tables.family[0].status = 'ARCHIVED';                           // archiving normally revokes it first; this is the leftover case
    expect(await codeOf(w.invites.accept('eric', { code: inv.code }))).toBe('FAMILY_GONE');
  });

  test('an account without a verified email or phone can still join with a code', async () => {
    const { w, id } = await setup();
    const inv = await w.invites.create('aline', id, { role: 'MEMBER' });
    w.db.tables.client.find(c => c.id === 'eric')!.emailVerifiedAt = null;
    expect(await codeOf(w.invites.accept('eric', { code: inv.code }))).toBe('OK');
  });

  test('a deactivated account cannot join', async () => {
    const { w, id } = await setup();
    const inv = await w.invites.create('aline', id, { role: 'MEMBER' });
    w.db.tables.client.find(c => c.id === 'eric')!.isActive = false;
    expect(await codeOf(w.invites.accept('eric', { code: inv.code }))).toBe('NOT_VERIFIED');
  });

  test('a full family refuses new people', async () => {
    const { w, id } = await setup();
    for (let i = 0; i < 11; i++) w.db.tables.familyMember.push({ id: `f${i}`, familyId: id, clientId: `x${i}`, role: 'MEMBER', status: 'ACTIVE', activeKey: `x${i}:${id}` });
    const inv = { id: 'i', familyId: id, invitedBy: 'aline', role: 'MEMBER', tokenHash: 'h', code: 'AAAAAA', status: 'PENDING', expiresAt: new Date(Date.now() + 1e9) };
    w.db.tables.familyInvite.push(inv);
    expect(await codeOf(w.invites.accept('eric', { code: 'AAAAAA' }))).toBe('FAMILY_FULL');
  });
});

describe('invites aimed at one person', () => {
  test('a matching verified phone or email may join, someone else may not', async () => {
    const { w, id } = await setup();
    const clientOf = (cid: string) => w.db.tables.client.find(c => c.id === cid)!;
    clientOf('eric').phoneVerifiedAt = new Date();
    const byPhone = await w.invites.create('aline', id, { role: 'MEMBER', phone: clientOf('eric').phone });
    expect(await codeOf(w.invites.preview('grace', { code: byPhone.code }))).toBe('INVITE_FOR_SOMEONE_ELSE');
    expect(await codeOf(w.invites.preview('eric', { code: byPhone.code }))).toBe('OK');
    const byEmail = await w.invites.create('aline', id, { role: 'MEMBER', email: 'GRACE@example.com' });
    expect(await codeOf(w.invites.accept('kevin', { code: byEmail.code }))).toBe('INVITE_FOR_SOMEONE_ELSE');
    expect(await codeOf(w.invites.accept('grace', { code: byEmail.code }))).toBe('OK');
  });
  test('a phone that is not verified does not count as a match', async () => {
    const { w, id } = await setup();
    const eric = w.db.tables.client.find(c => c.id === 'eric')!;
    eric.phoneVerifiedAt = null;
    const inv = await w.invites.create('aline', id, { role: 'MEMBER', phone: eric.phone });
    expect(await codeOf(w.invites.accept('eric', { code: inv.code }))).toBe('INVITE_FOR_SOMEONE_ELSE');
  });
});

describe('two people at once', () => {
  test('one single-use invite lets exactly one of two people in', async () => {
    const { w, id } = await setup();
    const inv = await w.invites.create('aline', id, { role: 'MEMBER' });
    const results = await Promise.all([w.invites.accept('eric', { code: inv.code }), w.invites.accept('grace', { code: inv.code })].map(codeOf));
    expect(results.sort()).toEqual(['INVITE_INVALID', 'OK']);
    expect(w.db.tables.familyMember.filter(m => m.status === 'ACTIVE')).toHaveLength(2);      // the owner and the one who won
  });

  test('the conditional update itself decides: an invite revoked after it was read cannot be accepted', async () => {
    const { w, id } = await setup();
    const inv = await w.invites.create('aline', id, { role: 'MEMBER' });
    let flipped = false;
    w.db.beforeWrite = table => {
      if (table === 'familyInvite' && !flipped) { flipped = true; row(w, inv.id).status = 'REVOKED'; }
    };
    expect(await codeOf(w.invites.accept('eric', { code: inv.code }))).toBe('INVITE_INVALID');
    expect(w.db.tables.familyMember.find(m => m.clientId === 'eric')).toBeUndefined();
  });

  test('the same person accepting two different invites at once ends up in both families', async () => {
    const w = makeWorld();
    const a = (await w.families.create('aline', { name: 'A' })).family.id;
    const b = (await w.families.create('divine', { name: 'B' })).family.id;
    const ia = await w.invites.create('aline', a, { role: 'MEMBER' });
    const ib = await w.invites.create('divine', b, { role: 'MEMBER' });
    const results = await Promise.all([w.invites.accept('eric', { code: ia.code }), w.invites.accept('eric', { code: ib.code })].map(codeOf));
    expect(results).toEqual(['OK', 'OK']);
    expect(w.db.tables.familyMember.filter(m => m.clientId === 'eric' && m.status === 'ACTIVE')).toHaveLength(2);
  });

  test('a failed join leaves no half-used invite behind', async () => {
    const { w, id } = await setup();
    const inv = await w.invites.create('aline', id, { role: 'MEMBER' });
    w.db.tables.familyMember.push({ id: 'ghost', familyId: 'elsewhere', clientId: 'x', role: 'MEMBER', status: 'ACTIVE', activeKey: `eric:${id}` });      // eric's key for this family is taken
    expect(await codeOf(w.invites.accept('eric', { code: inv.code }))).toBe('ALREADY_MEMBER');
    expect(row(w, inv.id).status).toBe('PENDING');
  });
});

describe('coming back', () => {
  test('a person who left is reactivated on their old row, with the new role', async () => {
    const { w, id } = await setup();
    await w.join(id, 'aline', [['grace', 'ADMIN']]);
    await w.families.removeMember('grace', id, 'grace');
    const inv = await w.invites.create('aline', id, { role: 'VIEWER' });
    await w.invites.accept('grace', { code: inv.code });
    const rows = w.db.tables.familyMember.filter(m => m.clientId === 'grace');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: 'VIEWER', status: 'ACTIVE', activeKey: expect.stringMatching(/^grace:/), leftAt: null });
  });
  test('a removed person can be invited again', async () => {
    const { w, id } = await setup();
    await w.join(id, 'aline', [['kevin', 'MEMBER']]);
    await w.families.removeMember('aline', id, 'kevin');
    await w.join(id, 'aline', [['kevin', 'MEMBER']]);
    expect((await w.families.mine('kevin'))?.family.id).toBe(id);
  });
});

describe('guessing codes', () => {
  test('ten wrong codes lock that person out for fifteen minutes, even for a right code', async () => {
    const { w, id } = await setup();
    const inv = await w.invites.create('aline', id, { role: 'MEMBER' });
    for (let i = 0; i < 10; i++) expect(await codeOf(w.invites.preview('eric', { code: 'ZZZZZ' + CODE_ALPHABET[i] }))).toBe('INVITE_NOT_FOUND');
    expect(await statusOf(w.invites.preview('eric', { code: inv.code }))).toBe(429);
    expect(await codeOf(w.invites.accept('eric', { code: inv.code }))).toBe('TOO_MANY_ATTEMPTS');
    expect(await codeOf(w.invites.preview('grace', { code: inv.code }))).toBe('OK');                // someone else is unaffected
  });
  test('a successful join clears the count', async () => {
    const { w, id } = await setup();
    for (let i = 0; i < 9; i++) await codeOf(w.invites.preview('eric', { code: 'ZZZZZ' + CODE_ALPHABET[i] }));
    const inv = await w.invites.create('aline', id, { role: 'MEMBER' });
    expect(await codeOf(w.invites.accept('eric', { code: inv.code }))).toBe('OK');
    expect(w.invites.limiter.isLocked('eric')).toBe(false);
  });
});

describe('InviteAttemptLimiter', () => {
  test('locks after the limit, frees itself after the lock time, and forgets old misses', () => {
    let now = 0;
    const l = new InviteAttemptLimiter(() => now, 3, 1000, 5000);
    l.recordFailure('p'); l.recordFailure('p');
    expect(l.isLocked('p')).toBe(false);
    l.recordFailure('p');
    expect(l.isLocked('p')).toBe(true);
    now = 999; expect(l.isLocked('p')).toBe(true);
    now = 1001; expect(l.isLocked('p')).toBe(false);
    now = 2000; l.recordFailure('p'); now = 9000; l.recordFailure('p'); l.recordFailure('p');          // the first one is older than the window
    expect(l.isLocked('p')).toBe(false);
  });
});
