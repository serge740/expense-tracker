// Ported from expo_app/services/family.service.ts
import api from '@/api';
import type { FamilyRole } from '@/utils/family-permissions';

export interface FamilyInfo { id: string; name: string; currency: string; timezone: string }
export interface FamilyLimits { maxMembers: number; maxPendingInvites: number; inviteDays: number }
export interface MyFamily { family: FamilyInfo; role: FamilyRole; memberCount: number; limits: FamilyLimits }
export interface FamilyMemberRow {
  clientId: string; role: FamilyRole; nickname: string | null; name: string; profileImage: string | null; joinedAt: string; isYou: boolean;
}
export interface InviteRow {
  id: string; code: string; role: FamilyRole; phone: string | null; email: string | null; invitedBy: string; createdAt: string; expiresAt: string;
}
/** The one moment the secret token is available. Only its hash is kept by the server. */
export interface CreatedInvite { id: string; code: string; token: string; link: string; role: FamilyRole; expiresAt: string; phone: string | null; email: string | null }
export interface InvitePreview { family: { id: string; name: string }; invitedBy: string; role: FamilyRole; expiresAt: string }
export interface ActivityRow {
  id: string; action: string; createdAt: string; meta: Record<string, unknown> | null;
  actor: { clientId: string; name: string }; target: { clientId: string; name: string | null } | null;
}
export interface InviteInput { token?: string; code?: string }

/** The person's family and role, or null when they have none. (The server answers an empty body for "none".) */
export const getMyFamily = (): Promise<MyFamily | null> =>
  api.get('/family/mine').then(r => (r.data && typeof r.data === 'object' && r.data.family ? (r.data as MyFamily) : null));

export const createFamily = (data: { name: string; currency?: string; timezone?: string }): Promise<{ family: FamilyInfo; role: FamilyRole }> =>
  api.post('/family', data).then(r => r.data);

export const updateFamily = (id: string, data: { name?: string; currency?: string; timezone?: string }): Promise<{ family: FamilyInfo; currencyChanged: boolean; amountsUnchanged: boolean }> =>
  api.patch(`/family/${id}`, data).then(r => r.data);

/** Archives the family. The name must be typed to confirm. */
export const deleteFamily = (id: string, confirmName: string): Promise<{ success: boolean }> =>
  api.delete(`/family/${id}`, { data: { confirmName } }).then(r => r.data);

export const getMembers = (id: string): Promise<FamilyMemberRow[]> => api.get(`/family/${id}/members`).then(r => r.data);

export const setMemberRole = (id: string, clientId: string, role: FamilyRole): Promise<{ clientId: string; role: FamilyRole }> =>
  api.patch(`/family/${id}/members/${clientId}`, { role }).then(r => r.data);

/** Remove someone else, or leave (when `clientId` is yourself). */
export const removeMember = (id: string, clientId: string): Promise<{ success: boolean }> =>
  api.delete(`/family/${id}/members/${clientId}`).then(r => r.data);

export const transferOwnership = (id: string, toClientId: string): Promise<{ success: boolean; newOwner: string }> =>
  api.post(`/family/${id}/transfer-ownership`, { toClientId }).then(r => r.data);

export const createInvite = (id: string, data: { role: FamilyRole; phone?: string; email?: string }): Promise<CreatedInvite> =>
  api.post(`/family/${id}/invites`, data).then(r => r.data);

export const getInvites = (id: string): Promise<InviteRow[]> => api.get(`/family/${id}/invites`).then(r => r.data);

export const revokeInvite = (id: string, inviteId: string): Promise<{ success: boolean }> =>
  api.delete(`/family/${id}/invites/${inviteId}`).then(r => r.data);

export const revokeAllInvites = (id: string): Promise<{ revoked: number }> =>
  api.post(`/family/${id}/invites/revoke-all`).then(r => r.data);

/** What joining would mean, without joining. Counts towards the wrong-code limit when it does not match. */
export const previewInvite = (input: InviteInput): Promise<InvitePreview> =>
  api.get('/family/invites/preview', { params: input }).then(r => r.data);

export const joinFamily = (input: InviteInput): Promise<{ family: FamilyInfo; role: FamilyRole }> =>
  api.post('/family/join', input).then(r => r.data);

export const getActivity = (id: string, opts: { limit?: number; before?: string } = {}): Promise<ActivityRow[]> =>
  api.get(`/family/${id}/activity`, { params: opts }).then(r => r.data);
