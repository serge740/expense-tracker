import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(clientId: string) {
    const wallets = await this.prisma.wallet.findMany({
      where: { clientId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return wallets.map(w => ({ ...w, balance: Number(w.balance) }));
  }

  async summary(clientId: string) {
    const wallets = await this.prisma.wallet.findMany({ where: { clientId } });
    const totalBalance = wallets.reduce((s, w) => s + Number(w.balance), 0);
    return { totalBalance, walletCount: wallets.length };
  }

  async create(clientId: string, dto: CreateWalletDto) {
    const count = await this.prisma.wallet.count({ where: { clientId } });
    const wallet = await this.prisma.wallet.create({
      data: {
        clientId,
        name: dto.name,
        bank: dto.bank,
        last4: dto.last4,
        color: dto.color ?? '#2D336B',
        walletType: dto.walletType ?? 'CHECKING',
        balance: dto.balance ?? 0,
        isDefault: count === 0,
      },
    });
    return { ...wallet, balance: Number(wallet.balance) };
  }

  async update(clientId: string, id: string, dto: UpdateWalletDto) {
    await this.assertOwner(clientId, id);
    const wallet = await this.prisma.wallet.update({ where: { id }, data: dto });
    return { ...wallet, balance: Number(wallet.balance) };
  }

  async remove(clientId: string, id: string) {
    await this.assertOwner(clientId, id);
    await this.prisma.wallet.delete({ where: { id } });
    return { success: true };
  }

  private async assertOwner(clientId: string, id: string) {
    const w = await this.prisma.wallet.findFirst({ where: { id, clientId } });
    if (!w) throw new NotFoundException('Wallet not found');
    return w;
  }
}
