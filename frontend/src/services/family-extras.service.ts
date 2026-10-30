import api from '@/api';

export interface GoalContribution { id: string; amount: number; note: string | null; createdAt: string; by: string; clientId: string }
export interface Goal {
  id: string; name: string; target: number; targetDate: string | null; status: string; createdAt: string;
  saved: number; fromContributions: number; fromWallet: number; percent: number; reached: boolean; wallet: { id: string; name: string } | null;
  contributions?: GoalContribution[];
}
export interface FamilyComment { id: string; body: string; createdAt: string; author: { clientId: string; name: string; isYou: boolean } }

const base = (familyId: string) => `/family/${familyId}`;
export const getGoals = (familyId: string): Promise<{ items: Goal[] }> => api.get(`${base(familyId)}/goals`).then(r => r.data);
export const getGoal = (familyId: string, id: string): Promise<Goal> => api.get(`${base(familyId)}/goals/${id}`).then(r => r.data);
export const createGoal = (familyId: string, data: { name: string; target: number; targetDate?: string | null; walletId?: string | null }): Promise<Goal> => api.post(`${base(familyId)}/goals`, data).then(r => r.data);
export const deleteGoal = (familyId: string, id: string) => api.delete(`${base(familyId)}/goals/${id}`).then(r => r.data);
export const contributeToGoal = (familyId: string, id: string, data: { amount: number; note?: string }): Promise<Goal> => api.post(`${base(familyId)}/goals/${id}/contributions`, data).then(r => r.data);
export const removeContribution = (familyId: string, id: string, cid: string): Promise<Goal> => api.delete(`${base(familyId)}/goals/${id}/contributions/${cid}`).then(r => r.data);

export const getComments = (familyId: string, txId: string): Promise<{ items: FamilyComment[] }> => api.get(`${base(familyId)}/transactions/${txId}/comments`).then(r => r.data);
export const addComment = (familyId: string, txId: string, body: string): Promise<{ items: FamilyComment[] }> => api.post(`${base(familyId)}/transactions/${txId}/comments`, { body }).then(r => r.data);
export const removeComment = (familyId: string, commentId: string) => api.delete(`${base(familyId)}/comments/${commentId}`).then(r => r.data);

export interface AllowanceRow { clientId: string; name: string; role: string; isYou: boolean; spent: number; limit: number | null; left: number | null; percent: number; over: boolean }
export interface MyAllowance { limit: number; spent: number; left: number; percent: number; over: boolean }
export const getAllowances = (familyId: string): Promise<{ canManage: boolean; items: AllowanceRow[] }> => api.get(`${base(familyId)}/allowances`).then(r => r.data);
export const getMyAllowance = (familyId: string): Promise<MyAllowance | null> => api.get(`${base(familyId)}/allowances/mine`).then(r => (r.data && !r.data.none ? r.data : null));
export const setAllowance = (familyId: string, memberId: string, limit: number) => api.put(`${base(familyId)}/allowances/${memberId}`, { limit }).then(r => r.data);
export const clearAllowance = (familyId: string, memberId: string) => api.delete(`${base(familyId)}/allowances/${memberId}`).then(r => r.data);

export interface ApprovalRow { id: string; title: string; amount: number; status: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: string; decidedAt: string | null; reason: string | null; category: string; requestedBy: { clientId: string; name: string }; decidedBy: { clientId: string; name: string } | null }
export const getApprovalSettings = (familyId: string): Promise<{ threshold: number | null; canManage: boolean; canDecide: boolean }> => api.get(`${base(familyId)}/approvals/settings`).then(r => r.data);
export const setApprovalThreshold = (familyId: string, threshold: number | null) => api.put(`${base(familyId)}/approvals/settings`, { threshold }).then(r => r.data);
export const getApprovals = (familyId: string): Promise<{ canDecide: boolean; items: ApprovalRow[] }> => api.get(`${base(familyId)}/approvals`).then(r => r.data);
export const approveRequest = (familyId: string, id: string) => api.post(`${base(familyId)}/approvals/${id}/approve`).then(r => r.data);
export const rejectRequest = (familyId: string, id: string, reason?: string) => api.post(`${base(familyId)}/approvals/${id}/reject`, { reason }).then(r => r.data);
export const cancelRequest = (familyId: string, id: string) => api.delete(`${base(familyId)}/approvals/${id}`).then(r => r.data);

export interface TransferWallet { id: string; name: string; currency: string; balance: number }
export interface TransferOptions { canContribute: boolean; canReimburse: boolean; currency: string; personalWallets: TransferWallet[]; familyWallets: TransferWallet[]; members: { clientId: string; name: string; isYou: boolean }[] }
export const getTransferOptions = (familyId: string): Promise<TransferOptions> => api.get(`${base(familyId)}/transfers/options`).then(r => r.data);
export const contributeMoney = (familyId: string, data: { personalWalletId: string; familyWalletId: string; amount: number; note?: string }) => api.post(`${base(familyId)}/transfers/contribute`, data).then(r => r.data);
export const reimburseMember = (familyId: string, data: { memberId: string; familyWalletId: string; amount: number; note?: string }) => api.post(`${base(familyId)}/transfers/reimburse`, data).then(r => r.data);
