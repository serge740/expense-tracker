// Plain shapes: like the other modules, input is checked by the service itself so every rule and error code lives in one place.
export class CreateFamilyDto { name: string; currency?: string; timezone?: string }
export class UpdateFamilyDto { name?: string; currency?: string; timezone?: string }
export class DeleteFamilyDto { confirmName: string }
export class SetRoleDto { role: string }
export class TransferOwnershipDto { toClientId: string }
export class CreateInviteDto { role: string; phone?: string; email?: string }
export class JoinFamilyDto { token?: string; code?: string }
