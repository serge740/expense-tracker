import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async registerDevice(clientId: string, data: {
    deviceName: string;
    platform: string;
    pushToken?: string;
    ipAddress?: string;
    channelId?: string;
    sound?: string;
  }) {
    // A push token belongs to one phone. If another account (or another row) still holds it, take it away
    // so a signed-out account stops receiving this phone's pushes.
    if (data.pushToken) {
      await this.prisma.device.updateMany({
        where: { pushToken: data.pushToken, NOT: { clientId, deviceName: data.deviceName, platform: data.platform } },
        data: { pushToken: null },
      });
    }

    const existing = await this.prisma.device.findFirst({
      where: { clientId, deviceName: data.deviceName, platform: data.platform },
    });

    if (existing) {
      return this.prisma.device.update({
        where: { id: existing.id },
        data: {
          pushToken: data.pushToken ?? existing.pushToken,
          ipAddress: data.ipAddress ?? existing.ipAddress,
          channelId: data.channelId ?? existing.channelId,
          sound: data.sound ?? existing.sound,
          lastActiveAt: new Date(),
        },
      });
    }

    return this.prisma.device.create({
      data: {
        clientId,
        deviceName: data.deviceName,
        platform: data.platform,
        pushToken: data.pushToken ?? null,
        ipAddress: data.ipAddress ?? null,
        channelId: data.channelId ?? null,
        sound: data.sound ?? null,
      },
    });
  }

  /** Called at sign-out: this account stops receiving pushes on the phone that holds this token. */
  async clearPushToken(clientId: string, pushToken: string) {
    const r = await this.prisma.device.updateMany({ where: { clientId, pushToken }, data: { pushToken: null } });
    return { cleared: r.count };
  }

  async getDevices(clientId: string) {
    return this.prisma.device.findMany({
      where: { clientId },
      orderBy: { lastActiveAt: 'desc' },
      select: {
        id: true,
        deviceName: true,
        platform: true,
        ipAddress: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });
  }

  async removeDevice(clientId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, clientId } });
    if (!device) return { message: 'Device not found' };
    await this.prisma.device.delete({ where: { id: deviceId } });
    return { message: 'Device removed' };
  }
}
