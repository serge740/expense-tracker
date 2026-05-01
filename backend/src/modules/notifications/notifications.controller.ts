import {
  Body, Controller, Get, HttpException, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';

@Controller('notifications')
@UseGuards(ClientJwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(
    @Req() req: RequestWithClient,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      return await this.notificationsService.getNotifications(
        req.client.id,
        page ? parseInt(page) : 1,
        limit ? parseInt(limit) : 20,
      );
    } catch (error: any) {
      throw new HttpException(error.message || 'Failed to fetch notifications', 400);
    }
  }

  @Get('preferences')
  async getPreferences(@Req() req: RequestWithClient) {
    try {
      return await this.notificationsService.getPreferences(req.client.id);
    } catch (error: any) {
      throw new HttpException(error.message || 'Failed to fetch preferences', 400);
    }
  }

  @Patch('preferences')
  async updatePreferences(
    @Req() req: RequestWithClient,
    @Body() body: { pushEnabled?: boolean; emailEnabled?: boolean; inAppEnabled?: boolean },
  ) {
    try {
      return await this.notificationsService.updatePreferences(req.client.id, body);
    } catch (error: any) {
      throw new HttpException(error.message || 'Failed to update preferences', 400);
    }
  }

  @Patch('mark-all-read')
  async markAllRead(@Req() req: RequestWithClient) {
    try {
      return await this.notificationsService.markAllRead(req.client.id);
    } catch (error: any) {
      throw new HttpException(error.message || 'Failed to mark notifications as read', 400);
    }
  }

  @Patch(':id/read')
  async markRead(@Req() req: RequestWithClient, @Param('id') id: string) {
    try {
      return await this.notificationsService.markRead(req.client.id, id);
    } catch (error: any) {
      throw new HttpException(error.message || 'Failed to mark notification as read', 400);
    }
  }

  @Post('send-push')
  async sendPush(
    @Req() req: RequestWithClient,
    @Body() body: { title: string; body: string },
  ) {
    try {
      return await this.notificationsService.sendPushNotification(req.client.id, body.title, body.body);
    } catch (error: any) {
      throw new HttpException(error.message || 'Failed to send push notification', 400);
    }
  }
}
