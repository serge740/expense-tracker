import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { ClientAuthService } from './client-auth.service';
import { RegisterClientDto } from './dto/register-client.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { GoogleCodeDto } from './dto/google-code.dto';
import { AppleAuthDto } from './dto/apple-auth.dto';
import { FacebookAuthDto } from './dto/facebook-auth.dto';
import { ClientJwtAuthGuard } from '../../guards/clientGuard.guard';
import { RequestWithClient } from '../../common/interfaces/client.interface';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

@Controller('client-auth')
export class ClientAuthController {
  constructor(private readonly clientAuthService: ClientAuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterClientDto, @Res() res: Response) {
    try {
      const result = await this.clientAuthService.register(dto);
      if (result.accessToken) {
        res.cookie('AccessClientToken', result.accessToken, COOKIE_OPTIONS);
      }
      return res.json(result);
    } catch (error: any) {
      throw new HttpException(error.message || 'Registration failed', error.status || 400);
    }
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() body: { email: string; otp: string }, @Res() res: Response) {
    try {
      const result = await this.clientAuthService.verifyEmail(body.email, body.otp);
      res.cookie('AccessClientToken', result.accessToken, COOKIE_OPTIONS);
      return res.json(result);
    } catch (error: any) {
      throw new HttpException(error.message || 'Verification failed', error.status || 400);
    }
  }

  @Post('resend-otp')
  @HttpCode(200)
  async resendOtp(@Body() body: { email: string }) {
    try {
      return await this.clientAuthService.resendOtp(body.email);
    } catch (error: any) {
      throw new HttpException(error.message || 'Failed to resend code', error.status || 400);
    }
  }

  @Post('google-auth')
  async googleAuth(@Body() dto: GoogleAuthDto, @Res() res: Response) {
    try {
      const result = await this.clientAuthService.googleAuth(dto);
      res.cookie('AccessClientToken', result.accessToken, COOKIE_OPTIONS);
      return res.json(result);
    } catch (error: any) {
      throw new HttpException(error.message || 'Google auth failed', error.status || 400);
    }
  }

  @Post('google-code')
  async googleCode(@Body() dto: GoogleCodeDto, @Res() res: Response) {
    try {
      const result = await this.clientAuthService.googleCodeAuth(dto);
      res.cookie('AccessClientToken', result.accessToken, COOKIE_OPTIONS);
      return res.json(result);
    } catch (error: any) {
      throw new HttpException(error.message || 'Google auth failed', error.status || 400);
    }
  }

  @Post('apple-auth')
  async appleAuth(@Body() dto: AppleAuthDto, @Res() res: Response) {
    try {
      const result = await this.clientAuthService.appleAuth(dto);
      res.cookie('AccessClientToken', result.accessToken, COOKIE_OPTIONS);
      return res.json(result);
    } catch (error: any) {
      throw new HttpException(error.message || 'Apple sign-in failed', error.status || 400);
    }
  }

  @Post('facebook-auth')
  async facebookAuth(@Body() dto: FacebookAuthDto, @Res() res: Response) {
    try {
      const result = await this.clientAuthService.facebookAuth(dto);
      res.cookie('AccessClientToken', result.accessToken, COOKIE_OPTIONS);
      return res.json(result);
    } catch (error: any) {
      throw new HttpException(error.message || 'Facebook sign-in failed', error.status || 400);
    }
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(@Body() body: { identifier: string; password: string }, @Res() res: Response) {
    try {
      const result = await this.clientAuthService.login(body.identifier, body.password);
      res.cookie('AccessClientToken', result.accessToken, COOKIE_OPTIONS);
      return res.json(result);
    } catch (error: any) {
      throw new HttpException(error.message || 'Login failed', error.status || 401);
    }
  }

  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async forgotPassword(@Body() body: { identifier: string }) {
    try {
      return await this.clientAuthService.forgotPassword(body.identifier);
    } catch (error: any) {
      throw new HttpException(error.message || 'Failed to send reset code', error.status || 400);
    }
  }

  @Post('verify-reset-otp')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifyResetOtp(@Body() body: { identifier: string; otp: string }) {
    try {
      return await this.clientAuthService.verifyResetOtp(body.identifier, body.otp);
    } catch (error: any) {
      throw new HttpException(error.message || 'Verification failed', error.status || 400);
    }
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: { resetToken: string; password: string }) {
    try {
      return await this.clientAuthService.resetPassword(body.resetToken, body.password);
    } catch (error: any) {
      throw new HttpException(error.message || 'Password reset failed', error.status || 400);
    }
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: { refreshToken: string }, @Res() res: Response) {
    try {
      if (!body.refreshToken) throw new HttpException('Refresh token required', 400);
      const result = await this.clientAuthService.refreshTokens(body.refreshToken);
      res.cookie('AccessClientToken', result.accessToken, COOKIE_OPTIONS);
      return res.json(result);
    } catch (error: any) {
      throw new HttpException(error.message || 'Token refresh failed', error.status || 401);
    }
  }

  @Patch('enable-biometric')
  @UseGuards(ClientJwtAuthGuard)
  async enableBiometric(@Req() req: RequestWithClient) {
    try {
      return await this.clientAuthService.enableBiometric(req.client.id);
    } catch (error: any) {
      throw new HttpException(error.message || 'Failed to enable biometric', error.status || 400);
    }
  }

  @Post('verification/email/send')
  @HttpCode(200)
  @UseGuards(ClientJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async sendEmailVerification(@Req() req: RequestWithClient) {
    try {
      return await this.clientAuthService.sendEmailVerification(req.client.id);
    } catch (error: any) {
      throw new HttpException(error.message || 'Could not send code', error.status || 400);
    }
  }

  @Post('verification/email/confirm')
  @HttpCode(200)
  @UseGuards(ClientJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async confirmEmailVerification(@Req() req: RequestWithClient, @Body() body: { otp: string }) {
    try {
      return await this.clientAuthService.confirmEmailVerification(req.client.id, body.otp);
    } catch (error: any) {
      throw new HttpException(error.message || 'Verification failed', error.status || 400);
    }
  }

  @Post('verification/phone/send')
  @HttpCode(200)
  @UseGuards(ClientJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async sendPhoneVerification(@Req() req: RequestWithClient) {
    try {
      return await this.clientAuthService.sendPhoneVerification(req.client.id);
    } catch (error: any) {
      throw new HttpException(error.message || 'Could not send code', error.status || 400);
    }
  }

  @Post('verification/phone/confirm')
  @HttpCode(200)
  @UseGuards(ClientJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async confirmPhoneVerification(@Req() req: RequestWithClient, @Body() body: { otp: string }) {
    try {
      return await this.clientAuthService.confirmPhoneVerification(req.client.id, body.otp);
    } catch (error: any) {
      throw new HttpException(error.message || 'Verification failed', error.status || 400);
    }
  }

  @Get('me')
  @UseGuards(ClientJwtAuthGuard)
  async getMe(@Req() req: RequestWithClient) {
    try {
      return await this.clientAuthService.getMe(req.client.id);
    } catch (error: any) {
      throw new HttpException(error.message || 'Failed to fetch profile', error.status || 400);
    }
  }

  @Patch('profile')
  @UseGuards(ClientJwtAuthGuard)
  async updateProfile(
    @Req() req: RequestWithClient,
    @Body() body: { firstName?: string; lastName?: string; phone?: string },
  ) {
    try {
      return await this.clientAuthService.updateProfile(req.client.id, body);
    } catch (error: any) {
      throw new HttpException(error.message || 'Profile update failed', error.status || 400);
    }
  }

  @Post('profile/image')
  @UseGuards(ClientJwtAuthGuard)
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
  async uploadProfileImage(@Req() req: RequestWithClient, @UploadedFile() file: Express.Multer.File) {
    try {
      if (!file) throw new HttpException('Image file is required', 400);
      return await this.clientAuthService.uploadProfileImage(req.client.id, file.buffer, file.mimetype);
    } catch (error: any) {
      throw new HttpException(error.message || 'Image upload failed', error.status || 400);
    }
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() body: { refreshToken?: string }, @Res({ passthrough: true }) res: Response) {
    await this.clientAuthService.logout(body.refreshToken);
    res.clearCookie('AccessClientToken', { httpOnly: true, sameSite: 'lax' });
    return { message: 'Logged out successfully' };
  }
}
