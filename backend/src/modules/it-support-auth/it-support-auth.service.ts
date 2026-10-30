import { BadRequestException, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ITSupportAuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  onModuleInit() {
    if (!process.env.JWT_IT_ADMIN_SECRET) {
      throw new Error('JWT_IT_ADMIN_SECRET env var is required but not set');
    }
  }

  async login(email: string, password: string): Promise<{ accessToken: string; itAdmin: any }> {
    if (!email || !password) throw new BadRequestException('Email and password are required');
    const itAdmin = await this.prisma.iTAdmin.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!itAdmin || !(await bcrypt.compare(password, itAdmin.passwordHash))) {
      throw new UnauthorizedException('Incorrect email or password');
    }
    if (!itAdmin.isActive) throw new UnauthorizedException('This account is disabled');

    await this.prisma.iTAdmin.update({ where: { id: itAdmin.id }, data: { lastLoginAt: new Date() } });

    const accessToken = this.jwtService.sign(
      { id: itAdmin.id, email: itAdmin.email, name: itAdmin.name },
      { secret: process.env.JWT_IT_ADMIN_SECRET!, expiresIn: '8h' },
    );
    return { accessToken, itAdmin: this.sanitize(itAdmin) };
  }

  async me(id: string) {
    const itAdmin = await this.prisma.iTAdmin.findUnique({ where: { id } });
    if (!itAdmin) throw new UnauthorizedException('Account not found');
    return this.sanitize(itAdmin);
  }

  private sanitize(itAdmin: any) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safe } = itAdmin;
    return safe;
  }
}
