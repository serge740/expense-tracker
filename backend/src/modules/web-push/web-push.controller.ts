import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';
import { WebPushService } from './web-push.service';

const text = (v: unknown, name: string, max: number, required = true): string | undefined => {
  if (v === undefined || v === null || v === '') {
    if (required) throw new BadRequestException(`${name} is required`);
    return undefined;
  }
  if (typeof v !== 'string' || v.length > max) throw new BadRequestException(`${name} is not valid`);
  return v;
};

/** The account is always taken from the signed-in request, never from the body. */
@Controller('push-notifications')
@UseGuards(ClientJwtAuthGuard)
export class WebPushController {
  constructor(private readonly push: WebPushService) {}

  @Get('public-key')
  publicKey() {
    return this.push.publicKeyInfo();
  }

  @Post('subscribe')
  subscribe(@Req() req: RequestWithClient, @Body() body: Record<string, unknown>) {
    return this.push.subscribe(req.client.id, {
      endpoint: text(body.endpoint, 'endpoint', 2048)!,
      p256dh: text(body.p256dh, 'p256dh', 255)!,
      auth: text(body.auth, 'auth', 255)!,
      label: text(body.label, 'label', 40, false),
      userAgent: text(body.userAgent, 'userAgent', 400, false),
    });
  }

  @Delete('unsubscribe/device')
  unsubscribeDevice(@Req() req: RequestWithClient, @Body() body: Record<string, unknown>) {
    return this.push.unsubscribeDevice(req.client.id, text(body.endpoint, 'endpoint', 2048)!);
  }

  @Delete('unsubscribe/all')
  unsubscribeAll(@Req() req: RequestWithClient) {
    return this.push.unsubscribeAll(req.client.id);
  }

  @Get('subscriptions')
  list(@Req() req: RequestWithClient) {
    return this.push.listSubscriptions(req.client.id);
  }

  @Patch('subscriptions/:id')
  rename(@Req() req: RequestWithClient, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.push.renameSubscription(req.client.id, id, text(body.label, 'label', 40)!);
  }

  @Delete('subscriptions/:id')
  remove(@Req() req: RequestWithClient, @Param('id') id: string) {
    return this.push.deleteSubscription(req.client.id, id);
  }

  @Post('test')
  test(@Req() req: RequestWithClient, @Body() body: Record<string, unknown>) {
    return this.push.sendTest(req.client.id, text(body?.subscriptionId, 'subscriptionId', 64, false));
  }

  @Post('seen')
  seen(@Req() req: RequestWithClient, @Body() body: Record<string, unknown>) {
    return this.push.markSeen(req.client.id, text(body.endpoint, 'endpoint', 2048)!);
  }
}
