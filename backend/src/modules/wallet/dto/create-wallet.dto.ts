import { WalletType } from '../../../../generated/prisma';

export class CreateWalletDto {
  name: string;
  bank: string;
  last4?: string;
  accountHolder?: string;
  accountNumber?: string;
  color?: string;
  walletType?: WalletType;
  balance?: number;
  currency?: string;
}
