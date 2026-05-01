import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { ClientAuthService } from './client-auth.service';
import { RegisterClientDto } from './dto/register-client.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
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
      res.cookie('AccessClientToken', result.token, COOKIE_OPTIONS);
      return res.json(result);
    } catch (error: any) {
      throw new HttpException(error.message || 'Registration failed', error.status || 400);
    }
  }

  @Post('google-auth')
  async googleAuth(@Body() dto: GoogleAuthDto, @Res() res: Response) {
    try {
      const result = await this.clientAuthService.googleAuth(dto);
      res.cookie('AccessClientToken', result.token, COOKIE_OPTIONS);
      return res.json(result);
    } catch (error: any) {
      throw new HttpException(error.message || 'Google auth failed', error.status || 400);
    }
  }

  @Post('face-enroll')
  @UseGuards(ClientJwtAuthGuard)
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
  async enrollFace(
    @Req() req: RequestWithClient,
    @UploadedFile() file: Express.Multer.File,
  ) {
    try {
      if (!file) throw new HttpException('Image file is required', 400);
      return await this.clientAuthService.enrollFace(req.client.id, file.buffer);
    } catch (error: any) {
      throw new HttpException(error.message || 'Face enrollment failed', error.status || 400);
    }
  }

  @Post('face-identify')
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
  async faceIdentify(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ) {
    try {
      if (!file) throw new HttpException('Image file is required', 400);
      const result = await this.clientAuthService.faceIdentify(file.buffer);
      res.cookie('AccessClientToken', result.token, COOKIE_OPTIONS);
      return res.json(result);
    } catch (error: any) {
      throw new HttpException(error.message || 'Face identification failed', error.status || 401);
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

  @Get('me')
  @UseGuards(ClientJwtAuthGuard)
  async getMe(@Req() req: RequestWithClient) {
    try {
      return await this.clientAuthService.getMe(req.client.id);
    } catch (error: any) {
      throw new HttpException(error.message || 'Failed to fetch profile', error.status || 400);
    }
  }

  @Post('logout')
  @UseGuards(ClientJwtAuthGuard)
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('AccessClientToken', { httpOnly: true, sameSite: 'lax' });
    return { message: 'Logged out successfully' };
  }
}
