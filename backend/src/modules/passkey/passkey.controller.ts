import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res, UseGuards, HttpException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { PasskeyService } from './passkey.service';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

@Controller('client-auth/passkey')
export class PasskeyController {
  constructor(private readonly passkeyService: PasskeyService) {}

  @Post('register/options')
  @UseGuards(ClientJwtAuthGuard)
  async registerOptions(@Req() req: RequestWithClient) {
    try {
      return await this.passkeyService.registrationOptions(req.client.id);
    } catch (error: any) {
      throw new HttpException(error.message || 'Could not start passkey registration', error.status || 400);
    }
  }

  @Post('register/verify')
  @UseGuards(ClientJwtAuthGuard)
  async registerVerify(@Req() req: RequestWithClient, @Body() body: { deviceName: string; [key: string]: any }) {
    try {
      const { deviceName, ...response } = body;
      return await this.passkeyService.verifyRegistration(req.client.id, deviceName, response);
    } catch (error: any) {
      throw new HttpException(error.message || 'Passkey registration failed', error.status || 400);
    }
  }

  @Post('login/options')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async loginOptions() {
    try {
      return await this.passkeyService.loginOptions();
    } catch (error: any) {
      throw new HttpException(error.message || 'Could not start passkey login', error.status || 400);
    }
  }

  @Post('login/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async loginVerify(@Body() body: { key: string; response: any }, @Res() res: Response) {
    try {
      const result = await this.passkeyService.verifyLogin(body.key, body.response);
      res.cookie('AccessClientToken', result.accessToken, COOKIE_OPTIONS);
      return res.json(result);
    } catch (error: any) {
      throw new HttpException(error.message || 'Passkey sign-in failed', error.status || 401);
    }
  }

  @Get()
  @UseGuards(ClientJwtAuthGuard)
  async list(@Req() req: RequestWithClient) {
    try {
      return await this.passkeyService.listPasskeys(req.client.id);
    } catch (error: any) {
      throw new HttpException(error.message || 'Could not load passkeys', error.status || 400);
    }
  }

  @Delete(':id')
  @UseGuards(ClientJwtAuthGuard)
  async remove(@Req() req: RequestWithClient, @Param('id') id: string) {
    try {
      return await this.passkeyService.deletePasskey(req.client.id, id);
    } catch (error: any) {
      throw new HttpException(error.message || 'Could not remove passkey', error.status || 400);
    }
  }
}
