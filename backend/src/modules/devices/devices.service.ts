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
  }) {
    const existing = await this.prisma.device.findFirst({
      where: { clientId, deviceName: data.deviceName, platform: data.platform },
    });

    if (existing) {
      return this.prisma.device.update({
        where: { id: existing.id },
        data: {
          pushToken: data.pushToken ?? existing.pushToken,
          ipAddress: data.ipAddress ?? existing.ipAddress,
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
      },
    });
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
