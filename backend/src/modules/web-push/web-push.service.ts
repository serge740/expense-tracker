import { HttpException, HttpStatus, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';
import { parseUserAgent } from './lib/user-agent';
import type { WebPushPayload } from './lib/payload';

export interface SubscribeInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  label?: string;
  userAgent?: string;
}

type Subscriber = { id: string; endpoint: string; p256dh: string; auth: string };

const TTL_SECONDS = 24 * 60 * 60;
const MAX_CONSECUTIVE_FAILURES = 10;
const TEST_COOLDOWN_MS = 10_000;

/**
 * Web push for browsers and installed web apps. A browser subscribes with the server's public key and its
 * subscription is kept per account; sending goes to every subscription of the account. Dead subscriptions
 * (the push service says 404/410, or ten failures in a row) are removed so nothing retries forever.
 */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private readonly lastTestAt = new Map<string, number>();
  readonly enabled: boolean;

  constructor(private readonly prisma: PrismaService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    this.enabled = Boolean(publicKey && privateKey);
    if (this.enabled) {
      webpush.setVapidDetails(process.env.VAPID_MAILTO ?? 'mailto:admin@rabbit-tracker.app', publicKey!, privateKey!);
    } else {
      // web-push throws if given empty keys, so they are applied only when both exist. Subscriptions are still
      // stored; only delivery needs real keys (run: npx web-push generate-vapid-keys).
      this.logger.warn('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set: web push will not be delivered until they are.');
    }
  }

  publicKeyInfo() {
    return { publicKey: this.enabled ? process.env.VAPID_PUBLIC_KEY! : null, enabled: this.enabled };
  }

  /** Saves this browser for the account. The same browser subscribing again moves to whoever is signed in now. */
  async subscribe(clientId: string, dto: SubscribeInput) {
    const agent = parseUserAgent(dto.userAgent);
    const fields = {
      p256dh: dto.p256dh, auth: dto.auth, userAgent: dto.userAgent?.slice(0, 400) ?? null,
      browser: agent.browser, os: agent.os, deviceType: agent.deviceType, lastSeenAt: new Date(), failureCount: 0,
    };
    const existing = await this.prisma.webPushSubscription.findFirst({ where: { endpoint: dto.endpoint } });
    const row = existing
      ? await this.prisma.webPushSubscription.update({ where: { id: existing.id }, data: { ...fields, clientId, label: dto.label ?? existing.label } })
      : await this.prisma.webPushSubscription.create({ data: { ...fields, clientId, endpoint: dto.endpoint, label: dto.label ?? this.defaultLabel(agent.deviceType) } });
    return this.toDevice(row);
  }

  unsubscribeDevice(clientId: string, endpoint: string) {
    return this.prisma.webPushSubscription.deleteMany({ where: { clientId, endpoint } });
  }

  unsubscribeAll(clientId: string) {
    return this.prisma.webPushSubscription.deleteMany({ where: { clientId } });
  }

  async listSubscriptions(clientId: string) {
    const rows = await this.prisma.webPushSubscription.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } });
    return rows.map(r => this.toDevice(r));
  }

  async renameSubscription(clientId: string, id: string, label: string) {
    const { count } = await this.prisma.webPushSubscription.updateMany({ where: { id, clientId }, data: { label } });
    if (count === 0) throw new NotFoundException('Device not found');
    return { ok: true };
  }

  async deleteSubscription(clientId: string, id: string) {
    const { count } = await this.prisma.webPushSubscription.deleteMany({ where: { id, clientId } });
    if (count === 0) throw new NotFoundException('Device not found');
    return { ok: true };
  }

  async markSeen(clientId: string, endpoint: string) {
    await this.prisma.webPushSubscription.updateMany({ where: { endpoint, clientId }, data: { lastSeenAt: new Date() } });
    return { ok: true };
  }

  async sendTest(clientId: string, subscriptionId?: string) {
    if (!this.enabled) throw new ServiceUnavailableException('Web push is not configured on the server');
    const now = Date.now();
    if (now - (this.lastTestAt.get(clientId) ?? 0) < TEST_COOLDOWN_MS) {
      throw new HttpException('Wait a few seconds before sending another test', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.lastTestAt.set(clientId, now);

    const subscriptions = await this.prisma.webPushSubscription.findMany({ where: { clientId, ...(subscriptionId ? { id: subscriptionId } : {}) } });
    if (subscriptionId && subscriptions.length === 0) throw new NotFoundException('Device not found');

    const payload: WebPushPayload = {
      title: 'Test notification', body: 'Notifications work on this device.', tag: `test-${randomUUID().slice(0, 8)}`,
      url: '/app/notifications', urgent: false, stay: false, timestamp: now,
    };
    const details = await Promise.all(subscriptions.map(async sub => ({ id: sub.id, ...(await this.deliver(sub, payload)) })));
    return {
      sent: details.filter(d => d.ok).length,
      failed: details.filter(d => !d.ok).length,
      details: details.map(({ id, ok, statusCode }) => ({ id, ok, statusCode: statusCode ?? null })),
    };
  }

  /** Sends to every browser of the account. Never throws: a failed web push must not break what caused it. */
  async sendToClient(clientId: string, payload: WebPushPayload): Promise<{ sent: number; total: number }> {
    if (!this.enabled) return { sent: 0, total: 0 };
    try {
      const subscriptions = await this.prisma.webPushSubscription.findMany({ where: { clientId } });
      const results = await Promise.allSettled(subscriptions.map(sub => this.deliver(sub, payload)));
      const sent = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
      return { sent, total: subscriptions.length };
    } catch (e: any) {
      this.logger.warn(`web push failed: ${e?.message ?? e}`);
      return { sent: 0, total: 0 };
    }
  }

  private async deliver(sub: Subscriber, payload: WebPushPayload): Promise<{ ok: boolean; statusCode?: number }> {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: TTL_SECONDS, urgency: payload.urgent ? 'high' : 'normal', topic: this.topicOf(payload.tag) },
      );
    } catch (error: any) {
      return this.recordFailure(sub.id, error?.statusCode);
    }
    await this.prisma.webPushSubscription.updateMany({ where: { id: sub.id }, data: { lastSuccessAt: new Date(), failureCount: 0 } });
    return { ok: true };
  }

  private async recordFailure(id: string, statusCode?: number): Promise<{ ok: boolean; statusCode?: number }> {
    // 404/410: the browser dropped the subscription, so it can never receive again.
    if (statusCode === 404 || statusCode === 410) {
      await this.prisma.webPushSubscription.deleteMany({ where: { id } });
      return { ok: false, statusCode };
    }
    const row = await this.prisma.webPushSubscription
      .update({ where: { id }, data: { lastFailureAt: new Date(), failureCount: { increment: 1 } } })
      .catch(() => null);
    if (row && row.failureCount >= MAX_CONSECUTIVE_FAILURES) await this.prisma.webPushSubscription.deleteMany({ where: { id } });
    return { ok: false, statusCode };
  }

  /** The push service's "topic" lets a newer message replace an older undelivered one; it must be short and URL-safe. */
  private topicOf(tag: string) {
    return tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined;
  }

  private defaultLabel(deviceType: string | null) {
    return deviceType === 'MOBILE' ? 'Mobile' : deviceType === 'TABLET' ? 'Tablet' : 'Computer';
  }

  private toDevice(row: {
    id: string; label: string | null; browser: string | null; os: string | null; deviceType: string | null; createdAt: Date;
    lastSeenAt: Date | null; lastSuccessAt: Date | null; lastFailureAt: Date | null; failureCount: number; endpoint: string;
  }) {
    return {
      id: row.id, label: row.label, browser: row.browser, os: row.os, deviceType: row.deviceType, createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt, lastSuccessAt: row.lastSuccessAt, lastFailureAt: row.lastFailureAt, failureCount: row.failureCount,
      // The browser's own address is never sent back; this short hash lets the page recognise its own entry.
      endpointHash: createHash('sha256').update(row.endpoint).digest('hex').slice(0, 12),
    };
  }
}
