import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationChannel, NotificationType } from '../../../generated/prisma';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(clientId: string) {
    let pref = await this.prisma.notificationPreference.findUnique({ where: { clientId } });
    if (!pref) {
      pref = await this.prisma.notificationPreference.create({
        data: { clientId, pushEnabled: true, emailEnabled: true, inAppEnabled: true },
      });
    }
    return pref;
  }

  async updatePreferences(clientId: string, dto: {
    pushEnabled?: boolean;
    emailEnabled?: boolean;
    inAppEnabled?: boolean;
  }) {
    return this.prisma.notificationPreference.upsert({
      where: { clientId },
      create: { clientId, ...dto },
      update: dto,
    });
  }

  async getNotifications(clientId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { clientId } }),
    ]);
    const unreadCount = await this.prisma.notification.count({ where: { clientId, read: false } });
    return { items, total, unreadCount, page, limit };
  }

  async markRead(clientId: string, notificationId: string) {
    const n = await this.prisma.notification.findFirst({ where: { id: notificationId, clientId } });
    if (!n) return { message: 'Not found' };
    return this.prisma.notification.update({ where: { id: notificationId }, data: { read: true } });
  }

  async markAllRead(clientId: string) {
    await this.prisma.notification.updateMany({ where: { clientId, read: false }, data: { read: true } });
    return { message: 'All notifications marked as read' };
  }

  async createNotification(clientId: string, data: {
    title: string;
    body: string;
    type: NotificationType;
    channel: NotificationChannel;
    notificationData?: Record<string, any>;
  }) {
    const pref = await this.getPreferences(clientId);

    if (data.channel === 'in_app' && !pref.inAppEnabled) return null;
    if (data.channel === 'email' && !pref.emailEnabled) return null;
    if (data.channel === 'push' && !pref.pushEnabled) return null;

    const notification = await this.prisma.notification.create({
      data: {
        clientId,
        title: data.title,
        body: data.body,
        type: data.type,
        channel: data.channel,
        ...(data.notificationData ? { data: data.notificationData } : {}),
      },
    });

    if (data.channel === 'push' && pref.pushEnabled) {
      await this.sendPushToClient(clientId, data.title, data.body);
    }

    return notification;
  }

  async sendPushNotification(clientId: string, title: string, body: string, notifData?: Record<string, any>) {
    const pref = await this.getPreferences(clientId);
    if (!pref.pushEnabled) return { skipped: true };

    await this.createNotification(clientId, {
      title,
      body,
      type: 'system',
      channel: 'push',
      notificationData: notifData,
    });

    return { sent: true };
  }

  private async sendPushToClient(clientId: string, title: string, body: string) {
    const devices = await this.prisma.device.findMany({
      where: { clientId, pushToken: { not: null } },
      select: { pushToken: true },
    });

    const tokens = devices.map(d => d.pushToken!).filter(Boolean);
    if (!tokens.length) return;

    const messages = tokens.map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: {},
    }));

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
    } catch { /* push delivery is best-effort */ }
  }
}
