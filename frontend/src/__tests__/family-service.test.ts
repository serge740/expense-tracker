import { beforeEach, describe, expect, test, vi } from 'vitest';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('@/api', () => ({ default: api }));
import * as fam from '@/services/family.service';

beforeEach(() => { vi.clearAllMocks(); for (const m of Object.values(api)) m.mockResolvedValue({ data: { ok: true } }); });

describe('family service calls the right routes', () => {
  test('mine: a family comes back as is; no family (an empty body, or a web page) is null', async () => {
    api.get.mockResolvedValue({ data: { family: { id: 'f1', name: 'Mwiza' }, role: 'OWNER', memberCount: 2, limits: {} } });
    expect((await fam.getMyFamily())?.role).toBe('OWNER');
    expect(api.get).toHaveBeenCalledWith('/family/mine');
    for (const empty of ['', null, undefined, {}, '<html></html>']) {
      api.get.mockResolvedValue({ data: empty });
      expect(await fam.getMyFamily()).toBeNull();
    }
  });
  test('create, update, delete (the name goes in the body), members, role, remove, transfer', async () => {
    await fam.createFamily({ name: 'Mwiza', currency: 'RWF' });
    expect(api.post).toHaveBeenCalledWith('/family', { name: 'Mwiza', currency: 'RWF' });
    await fam.updateFamily('f1', { name: 'New' });
    expect(api.patch).toHaveBeenCalledWith('/family/f1', { name: 'New' });
    await fam.deleteFamily('f1', 'Mwiza');
    expect(api.delete).toHaveBeenCalledWith('/family/f1', { data: { confirmName: 'Mwiza' } });
    await fam.getMembers('f1');
    expect(api.get).toHaveBeenCalledWith('/family/f1/members');
    await fam.setMemberRole('f1', 'c2', 'ADMIN');
    expect(api.patch).toHaveBeenCalledWith('/family/f1/members/c2', { role: 'ADMIN' });
    await fam.removeMember('f1', 'c2');
    expect(api.delete).toHaveBeenCalledWith('/family/f1/members/c2');
    await fam.transferOwnership('f1', 'c2');
    expect(api.post).toHaveBeenCalledWith('/family/f1/transfer-ownership', { toClientId: 'c2' });
  });
  test('invites: create, list, revoke, revoke all, preview and join', async () => {
    await fam.createInvite('f1', { role: 'MEMBER', phone: '+250788000000' });
    expect(api.post).toHaveBeenCalledWith('/family/f1/invites', { role: 'MEMBER', phone: '+250788000000' });
    await fam.getInvites('f1');
    expect(api.get).toHaveBeenCalledWith('/family/f1/invites');
    await fam.revokeInvite('f1', 'i1');
    expect(api.delete).toHaveBeenCalledWith('/family/f1/invites/i1');
    await fam.revokeAllInvites('f1');
    expect(api.post).toHaveBeenCalledWith('/family/f1/invites/revoke-all');
    await fam.previewInvite({ code: 'K7M2QX' });
    expect(api.get).toHaveBeenCalledWith('/family/invites/preview', { params: { code: 'K7M2QX' } });
    await fam.joinFamily({ token: 'tok' });
    expect(api.post).toHaveBeenCalledWith('/family/join', { token: 'tok' });
  });
  test('activity passes its paging', async () => {
    await fam.getActivity('f1', { limit: 20, before: '2030-01-01T00:00:00.000Z' });
    expect(api.get).toHaveBeenCalledWith('/family/f1/activity', { params: { limit: 20, before: '2030-01-01T00:00:00.000Z' } });
  });
});
