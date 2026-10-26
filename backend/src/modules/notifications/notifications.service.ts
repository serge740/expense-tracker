import { Injectable, Logger, Optional } from '@nestjs/common';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WebPushService } from '../web-push/web-push.service';
import { buildWebPayload } from '../web-push/lib/payload';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationChannel, NotificationType } from '../../../generated/prisma';
import { BadRequestException } from '@nestjs/common';
import { isValidClock, isValidTimeZone } from '../reminders/reminder-policy';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtime?: RealtimeGateway,
    @Optional() private readonly webPush?: WebPushService,
  ) {}

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
    timezone?: string;
    quietEnabled?: boolean;
    quietStart?: string;
    quietEnd?: string;
    remindersPush?: boolean;
    remindersEmail?: boolean;
    dailyPushCap?: number;
    language?: string;
  }) {
    // Only known fields are stored, each checked, so a bad value can never break reminder delivery later.
    const data: Record<string, unknown> = {};
    for (const k of ['pushEnabled', 'emailEnabled', 'inAppEnabled', 'quietEnabled', 'remindersPush', 'remindersEmail'] as const) {
      if (dto[k] !== undefined) data[k] = !!dto[k];
    }
    if (dto.timezone !== undefined) {
      if (!isValidTimeZone(dto.timezone)) throw new BadRequestException('Unknown time zone');
      data.timezone = dto.timezone;
    }
    for (const k of ['quietStart', 'quietEnd'] as const) {
      if (dto[k] !== undefined) {
        if (!isValidClock(dto[k]!)) throw new BadRequestException('Use a time like 22:00');
        data[k] = dto[k]!.padStart(5, '0');
      }
    }
    if (dto.language !== undefined) {
      if (!['en', 'fr', 'rw', 'sw'].includes(dto.language)) throw new BadRequestException('Unknown language');
      data.language = dto.language;
    }
    if (dto.dailyPushCap !== undefined) {
      const n = Number(dto.dailyPushCap);
      if (!Number.isInteger(n) || n < 1 || n > 50) throw new BadRequestException('Daily limit must be between 1 and 50');
      data.dailyPushCap = n;
    }
    return this.prisma.notificationPreference.upsert({
      where: { clientId },
      create: { clientId, ...data },
      update: data,
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

    this.realtime?.emitToClient(clientId, 'new-notification', { id: notification.id, type: data.type, title: data.title, body: data.body });

    if (pref.pushEnabled) {
      const pushData = { ...(data.notificationData ?? {}), notificationId: notification.id, type: data.type };
      await this.sendPushToClient(clientId, data.title, data.body, pushData);
      // Browsers and installed web apps get the same push (never blocks or breaks the phone push).
      void this.webPush?.sendToClient(clientId, buildWebPayload({ title: data.title, body: data.body, data: pushData }));
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
