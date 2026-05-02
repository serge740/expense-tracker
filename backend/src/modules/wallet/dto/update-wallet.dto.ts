import { WalletType } from '../../../../generated/prisma';

export class UpdateWalletDto {
  name?: string;
  bank?: string;
  last4?: string;
  color?: string;
  walletType?: WalletType;
  balance?: number;
  isDefault?: boolean;
}
