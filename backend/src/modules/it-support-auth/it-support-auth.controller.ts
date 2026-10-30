import { Body, Controller, Get, HttpCode, HttpException, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { ITSupportAuthService } from './it-support-auth.service';
import { ITAdminJwtAuthGuard } from '../../guards/itAdminGuard.guard';
import { RequestWithITAdmin } from '../../common/interfaces/it-admin.interface';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: 8 * 60 * 60 * 1000,
};

@Controller('it-support-auth')
export class ITSupportAuthController {
  constructor(private readonly itSupportAuthService: ITSupportAuthService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(@Body() body: { email: string; password: string }, @Res() res: Response) {
    try {
      const result = await this.itSupportAuthService.login(body.email, body.password);
      res.cookie('AccessITAdminToken', result.accessToken, COOKIE_OPTIONS);
      return res.json(result);
    } catch (error: any) {
      throw new HttpException(error.message || 'Login failed', error.status || 401);
    }
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res() res: Response) {
    res.clearCookie('AccessITAdminToken');
    return res.json({ message: 'Logged out' });
  }

  @Get('me')
  @UseGuards(ITAdminJwtAuthGuard)
  async me(@Req() req: RequestWithITAdmin) {
    return this.itSupportAuthService.me(req.itAdmin.id);
  }
}
