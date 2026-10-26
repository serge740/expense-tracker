import { Injectable, Logger } from '@nestjs/common';
import { Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WebPushService } from '../web-push/web-push.service';
import { buildWebPayload } from '../web-push/lib/payload';

/** One Expo ticket, remembered with its token so a later receipt can prune a dead device. */
export interface PushTicket { id: string; token: string }

export interface PushPayload {
  title: string;
  body: string;
  data: Record<string, unknown>;
  /** Action buttons on the notification (Snooze / Open), set up by the app. */
  categoryId?: string;
}

/** What the reminder engine needs from push delivery (so tests can swap in a fake). */
export interface PushSender {
  /** Send to every device of a client. Returns the tickets that were accepted. */
  sendToClient(clientId: string, payload: PushPayload): Promise<PushTicket[]>;
  /** Check delivery receipts for earlier tickets and forget dead tokens. */
  checkReceipts(tickets: PushTicket[]): Promise<{ delivered: number; failed: number; pruned: number }>;
}

// expo-server-sdk is ESM-only; a dynamic import works from this CommonJS build on every Node version.
const loadExpo = () => import('expo-server-sdk');

@Injectable()
export class PushService implements PushSender {
  private readonly logger = new Logger(PushService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly webPush?: WebPushService,
  ) {}

  private async client() {
    const { Expo } = await loadExpo();
    return new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined });
  }

  async sendToClient(clientId: string, payload: PushPayload): Promise<PushTicket[]> {
    // Browsers and installed web apps get the same reminder (their own tickets are not tracked: the push service answers at once).
    void this.webPush?.sendToClient(clientId, buildWebPayload({ title: payload.title, body: payload.body, data: payload.data }));
    const { Expo } = await loadExpo();
    const devices = await this.prisma.device.findMany({
      where: { clientId, pushToken: { not: null } },
      select: { id: true, pushToken: true, channelId: true, sound: true },
    });
    const usable = devices.filter(d => d.pushToken && Expo.isExpoPushToken(d.pushToken));
    if (!usable.length) return [];

    const messages = usable.map(d => ({
      to: d.pushToken!,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      priority: 'high' as const,
      sound: d.sound === 'none' ? null : (d.sound || 'default'),
      ...(payload.categoryId ? { categoryId: payload.categoryId } : {}),
      ...(d.channelId ? { channelId: d.channelId } : {}),
    }));

    const expo = await this.client();
    const tickets: PushTicket[] = [];
    const dead: string[] = [];
    for (const chunk of expo.chunkPushNotifications(messages)) {
      try {
        const res = await expo.sendPushNotificationsAsync(chunk);
        res.forEach((t, i) => {
          if (t.status === 'ok') tickets.push({ id: t.id, token: String(chunk[i].to) });
          else if (t.details?.error === 'DeviceNotRegistered') dead.push(String(chunk[i].to));
          else this.logger.warn(`push ticket error: ${t.message}`);
        });
      } catch (e: any) {
        this.logger.warn(`push chunk failed: ${e?.message ?? e}`);
      }
    }
    await this.forget(dead);
    return tickets;
  }

  async checkReceipts(tickets: PushTicket[]) {
    const out = { delivered: 0, failed: 0, pruned: 0 };
    if (!tickets.length) return out;
    const expo = await this.client();
    const tokenOf = new Map(tickets.map(t => [t.id, t.token]));
    const dead: string[] = [];
    for (const chunk of expo.chunkPushNotificationReceiptIds(tickets.map(t => t.id))) {
      try {
        const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
        for (const [id, r] of Object.entries(receipts)) {
          if (r.status === 'ok') out.delivered++;
          else {
            out.failed++;
            if (r.details?.error === 'DeviceNotRegistered' && tokenOf.get(id)) dead.push(tokenOf.get(id)!);
          }
        }
      } catch (e: any) {
        this.logger.warn(`receipt check failed: ${e?.message ?? e}`);
      }
    }
    out.pruned = await this.forget(dead);
    return out;
  }

  /** Stop pushing to tokens of uninstalled apps. */
  private async forget(tokens: string[]) {
    const unique = [...new Set(tokens)];
    if (!unique.length) return 0;
    const res = await this.prisma.device.updateMany({ where: { pushToken: { in: unique } }, data: { pushToken: null } });
    return res.count;
  }
}
