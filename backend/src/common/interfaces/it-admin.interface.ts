import { Request } from 'express';

export interface RequestWithITAdmin extends Request {
  // Optional: a machine-to-machine call via ITAdminOrBackupKeyGuard's backup-api-key path never
  // sets this (there's no JWT to read it from) — see isBackupServiceCall below.
  itAdmin?: {
    id: string;
    email: string;
    name: string;
  };
  isBackupServiceCall?: boolean;
}
