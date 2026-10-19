import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationChannel, NotificationType } from '../../../generated/prisma';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
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

  /**
   * Stores a notification (inbox) and, when push is enabled, delivers it as a
   * high-priority push so the phone rings even if the app is closed.
   */
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

    if (pref.pushEnabled) {
      await this.sendPushToClient(clientId, data.title, data.body, {
        ...(data.notificationData ?? {}),
        notificationId: notification.id,
        type: data.type,
      });
    }

    return notification;
  }

  /** Fire-and-forget helper for other modules: never throws. */
  notify(clientId: string, title: string, body: string, type: NotificationType = 'system', notificationData?: Record<string, any>) {
    this.createNotification(clientId, { title, body, type, channel: 'push', notificationData })
      .catch(err => this.logger.warn(`notify failed: ${err?.message ?? err}`));
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

  private async sendPushToClient(clientId: string, title: string, body: string, data: Record<string, any>) {
    const devices = await this.prisma.device.findMany({
      where: { clientId, pushToken: { not: null } },
      select: { id: true, pushToken: true, channelId: true, sound: true },
    });
    if (!devices.length) return;

    const messages = devices.map(d => ({
      to: d.pushToken!,
      title,
      body,
      data,
      priority: 'high',                       // wake the device / heads-up on Android
      sound: d.sound === 'none' ? null : (d.sound || 'default'),   // iOS: bundled file or default
      ...(d.channelId ? { channelId: d.channelId } : {}),            // Android: channel decides ringtone
    }));

    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      // Forget tokens of uninstalled apps so we stop pushing to them.
      const dead = (json.data ?? [])
        .map((ticket, i) => (ticket.details?.error === 'DeviceNotRegistered' ? devices[i].id : null))
        .filter((id): id is string => !!id);
      if (dead.length) {
        await this.prisma.device.updateMany({ where: { id: { in: dead } }, data: { pushToken: null } });
      }
    } catch (err: any) {
      this.logger.warn(`push delivery failed: ${err?.message ?? err}`);
    }
  }
}
