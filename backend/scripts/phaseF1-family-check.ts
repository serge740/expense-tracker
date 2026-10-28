/**
 * Phase F1 end-to-end check. Runs the REAL family services against whatever DATABASE_URL points to, so ONLY run it
 * on a scratch copy (the real MySQL is what proves the unique "one active family" key and the transactions):
 *
 *   DATABASE_URL="mysql://root@localhost:3306/p1test_family" npx prisma migrate deploy
 *   DATABASE_URL="mysql://root@localhost:3306/p1test_family" npx ts-node scripts/phaseF1-family-check.ts
 *
 * It creates its own accounts and removes everything it created at the end.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { FamilyAccessService } from '../src/modules/family/family-access.service';
import { FamilyService } from '../src/modules/family/family.service';
import { FamilyInvitesService } from '../src/modules/family/family-invites.service';

let failures = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`}`);
};
const codeOf = async (p: Promise<unknown>) => {
  try { await p; return 'OK'; } catch (e: any) { return e?.response?.code ?? e?.code ?? `ERR:${e?.message}`; }
};

async function main() {
  if (!/p1test|scratch|_test/i.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('Refusing to run: DATABASE_URL must point at a scratch database (name containing p1test / scratch / _test).');
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  const access = new FamilyAccessService(prisma);
  const families = new FamilyService(prisma, access);
  const invites = new FamilyInvitesService(prisma, access, families);

  const stamp = Date.now().toString(36);
  const ids: Record<string, string> = {};
  const familyIds: string[] = [];
  try {
    let i = 0;
    for (const name of ['Aline', 'Eric', 'Grace', 'Kevin', 'Divine']) {
      const c = await prisma.client.create({
        data: { firstName: name, lastName: 'Check', email: `${name.toLowerCase()}.${stamp}@f1check.test`, phone: `+2507${stamp.slice(-5)}${i++}`, emailVerifiedAt: new Date(), isVerified: true },
      });
      ids[name.toLowerCase()] = c.id;
    }
    const { aline, eric, grace, kevin, divine } = ids;

    console.log('\n— creating —');
    const unverified = await prisma.client.create({ data: { firstName: 'Nope', email: `nope.${stamp}@f1check.test`, phone: `+2506${stamp.slice(-5)}9` } });
    ids.nope = unverified.id;
    check('an unverified account cannot create a family', await codeOf(families.create(unverified.id, { name: 'X' })), 'NOT_VERIFIED');
    const created = await families.create(aline, { name: 'Check Family', currency: 'rwf', timezone: 'Africa/Kigali' });
    const fid = created.family.id as string;
    familyIds.push(fid);
    check('the creator is the Owner', created.role, 'OWNER');
    check('a second family for the same person is refused', await codeOf(families.create(aline, { name: 'Again' })), 'ALREADY_IN_FAMILY');

    console.log('\n— the database itself refuses a second active family —');
    const clash = await prisma.familyMember.create({ data: { familyId: fid, clientId: eric, role: 'MEMBER', status: 'ACTIVE', activeKey: aline } }).then(() => 'created', (e: any) => e.code);
    check('a duplicate activeKey is rejected by MySQL (P2002)', clash, 'P2002');

    console.log('\n— two creations at once —');
    const race = await Promise.all([families.create(divine, { name: 'Race one' }), families.create(divine, { name: 'Race two' })].map(codeOf));
    check('exactly one wins', race.sort(), ['ALREADY_IN_FAMILY', 'OK']);
    const raceFamilies = await prisma.family.findMany({ where: { createdBy: divine } });
    raceFamilies.forEach(f => familyIds.push(f.id));
    check('and only one family exists', raceFamilies.length, 1);
    await families.removeMember(divine, raceFamilies[0].id, divine).catch(() => undefined);      // the owner cannot leave
    await families.archive(divine, raceFamilies[0].id, raceFamilies[0].name);
    check('archiving frees the person', await families.mine(divine), null);

    console.log('\n— inviting and joining —');
    const aInvite = await invites.create(aline, fid, { role: 'ADMIN' });
    check('the link carries the token and the code is 6 characters', [aInvite.link.endsWith(aInvite.token), aInvite.code.length], [true, 6]);
    const stored = await prisma.familyInvite.findUnique({ where: { id: aInvite.id } });
    check('the token itself is not stored', JSON.stringify(stored).includes(aInvite.token), false);
    check('preview shows the family and the role', (await invites.preview(eric, { code: aInvite.code }) as any).role, 'ADMIN');
    check('Eric joins as Admin', (await invites.accept(eric, { token: aInvite.token })).role, 'ADMIN');
    check('the same invite cannot be used twice', await codeOf(invites.accept(grace, { code: aInvite.code })), 'INVITE_INVALID');

    const m1 = await invites.create(aline, fid, { role: 'MEMBER' });
    const v1 = await invites.create(eric, fid, { role: 'VIEWER' });
    await invites.accept(grace, { code: m1.code });
    await invites.accept(kevin, { code: v1.code });
    check('an Admin cannot make an Admin invite', await codeOf(invites.create(eric, fid, { role: 'ADMIN' })), 'FORBIDDEN_ACTION');
    check('four active members', (await families.members(aline, fid)).map((m: any) => m.role), ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);
    check('member list shows no email or phone', /@f1check|\+2507/.test(JSON.stringify(await families.members(grace, fid))), false);

    console.log('\n— one invite, two people at once —');
    const hot = await invites.create(aline, fid, { role: 'MEMBER' });
    const [r1, r2] = await Promise.all([invites.accept(divine, { code: hot.code }), invites.accept(unverified.id, { code: hot.code })].map(codeOf));
    check('the unverified one is refused and the other can join', [r1, r2].sort(), ['NOT_VERIFIED', 'OK']);
    await families.removeMember(aline, fid, divine);
    const hot2 = await invites.create(aline, fid, { role: 'MEMBER' });
    await prisma.client.update({ where: { id: unverified.id }, data: { emailVerifiedAt: new Date() } });
    const both = await Promise.all([invites.accept(divine, { code: hot2.code }), invites.accept(unverified.id, { code: hot2.code })].map(codeOf));
    check('two verified people, one invite: one winner, one INVITE_INVALID', both.sort(), ['INVITE_INVALID', 'OK']);
    const winner = both.indexOf('OK') === 0 ? divine : unverified.id;
    await families.removeMember(aline, fid, winner);

    console.log('\n— roles, removal, leaving —');
    check('an Admin cannot change roles', await codeOf(families.setRole(eric, fid, grace, 'VIEWER')), 'FORBIDDEN_ACTION');
    check('the Owner promotes Grace', (await families.setRole(aline, fid, grace, 'ADMIN')).role, 'ADMIN');
    check('an Admin cannot remove another Admin', await codeOf(families.removeMember(eric, fid, grace)), 'FORBIDDEN_ACTION');
    await families.removeMember(eric, fid, kevin);
    check('Kevin is out at once: his next request is "not found"', await codeOf(families.members(kevin, fid)), 'FAMILY_NOT_FOUND');
    check('the Owner cannot leave', await codeOf(families.removeMember(aline, fid, aline)), 'OWNER_MUST_TRANSFER');
    check('a stranger cannot read the family', await codeOf(families.members(divine, fid)), 'FAMILY_NOT_FOUND');

    console.log('\n— coming back —');
    const back = await invites.create(aline, fid, { role: 'VIEWER' });
    await invites.accept(kevin, { code: back.code });
    check('Kevin has one row, active, as Viewer', (await prisma.familyMember.findMany({ where: { familyId: fid, clientId: kevin } })).map(m => [m.role, m.status, m.activeKey === kevin]), [['VIEWER', 'ACTIVE', true]]);

    console.log('\n— ownership —');
    await families.transferOwnership(aline, fid, grace);
    check('Grace is the Owner and Aline an Admin', (await prisma.familyMember.findMany({ where: { familyId: fid, status: 'ACTIVE' }, orderBy: { joinedAt: 'asc' } })).filter(m => m.clientId === aline || m.clientId === grace).map(m => [m.clientId === aline ? 'aline' : 'grace', m.role]).sort(), [['aline', 'ADMIN'], ['grace', 'OWNER']]);
    check('exactly one Owner', await prisma.familyMember.count({ where: { familyId: fid, status: 'ACTIVE', role: 'OWNER' } }), 1);
    check('Aline can now leave', await codeOf(families.removeMember(aline, fid, aline)), 'OK');

    console.log('\n— history —');
    const actions = (await families.activity(grace, fid, { limit: 50 })).map((r: any) => r.action);
    for (const a of ['family.created', 'invite.created', 'member.joined', 'member.removed', 'member.left', 'member.role_changed', 'ownership.transferred']) {
      check(`activity has ${a}`, actions.includes(a), true);
    }

    console.log('\n— the rules the database must hold —');
    const dup = await prisma.$queryRaw<any[]>`SELECT clientId, COUNT(*) AS n FROM FamilyMember WHERE status = 'ACTIVE' AND familyId = ${fid} GROUP BY clientId HAVING COUNT(*) > 1`;
    check('nobody is active twice', dup.length, 0);
    const keys = await prisma.$queryRaw<any[]>`SELECT id FROM FamilyMember WHERE familyId = ${fid} AND ((status = 'ACTIVE' AND (activeKey IS NULL OR activeKey <> clientId)) OR (status <> 'ACTIVE' AND activeKey IS NOT NULL))`;
    check('activeKey matches status on every row', keys.length, 0);

    console.log('\n— deleting the family —');
    const pending = await invites.create(grace, fid, { role: 'MEMBER' });
    check('only the Owner may delete', await codeOf(families.archive(eric, fid, 'Check Family')), 'FORBIDDEN_ACTION');
    check('the name must be typed', await codeOf(families.archive(grace, fid, 'nope')), 'CONFIRM_NAME_MISMATCH');
    await families.archive(grace, fid, 'check family');
    check('everyone is back to Personal', await Promise.all([grace, eric, kevin].map(p => families.mine(p))), [null, null, null]);
    check('pending invites no longer work', await codeOf(invites.accept(aline, { code: pending.code })), 'INVITE_INVALID');
    check('a person can start a new family after', await codeOf(families.create(grace, { name: 'Second' })), 'OK');
    (await prisma.family.findMany({ where: { createdBy: grace } })).forEach(f => familyIds.push(f.id));
  } finally {
    await prisma.family.deleteMany({ where: { id: { in: familyIds } } });
    await prisma.client.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
