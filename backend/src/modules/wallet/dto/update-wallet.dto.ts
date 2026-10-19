import { WalletType } from '../../../../generated/prisma';

export class UpdateWalletDto {
  name?: string;
  bank?: string;
  last4?: string;
  accountHolder?: string;
  accountNumber?: string;
  color?: string;
  walletType?: WalletType;
  balance?: number;
  isDefault?: boolean;
  archived?: boolean;
  currency?: string;
}
