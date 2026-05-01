import {
  Body, Controller, Delete, Get, HttpException, Param, Post, Req, UseGuards,
} from '@nestjs/common';
import { DevicesService } from './devices.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';

@Controller('devices')
@UseGuards(ClientJwtAuthGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post('register')
  async register(
    @Req() req: RequestWithClient,
    @Body() body: { deviceName: string; platform: string; pushToken?: string },
  ) {
    try {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        ?? (req.socket as any)?.remoteAddress ?? 'unknown';
      return await this.devicesService.registerDevice(req.client.id, { ...body, ipAddress: ip });
    } catch (error: any) {
      throw new HttpException(error.message || 'Failed to register device', 400);
    }
  }

  @Get()
  async list(@Req() req: RequestWithClient) {
    try {
      return await this.devicesService.getDevices(req.client.id);
    } catch (error: any) {
      throw new HttpException(error.message || 'Failed to fetch devices', 400);
    }
  }

  @Delete(':id')
  async remove(@Req() req: RequestWithClient, @Param('id') id: string) {
    try {
      return await this.devicesService.removeDevice(req.client.id, id);
    } catch (error: any) {
      throw new HttpException(error.message || 'Failed to remove device', 400);
    }
  }
}
