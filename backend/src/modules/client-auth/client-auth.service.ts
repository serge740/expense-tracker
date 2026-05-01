import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { FaceService } from './face.service';
import { EmailService } from '../../global/email/email.service';
import { RegisterClientDto } from './dto/register-client.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';

type TokenPair = { accessToken: string; refreshToken: string };
type AuthResult = TokenPair & { client: any };

@Injectable()
export class ClientAuthService implements OnModuleInit {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly faceService: FaceService,
    private readonly emailService: EmailService,
  ) {
    this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

  async onModuleInit() {
    if (!process.env.JWT_CLIENT_SECRET) {
      throw new Error('JWT_CLIENT_SECRET env var is required but not set');
    }
  }

  // ── Register (creates unverified account, sends OTP, returns provisional tokens) ──
  async register(dto: RegisterClientDto): Promise<{ message: string; accessToken: string; refreshToken: string }> {
    const existing = await this.prisma.client.findFirst({
      where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
    });
    if (existing) {
      throw new ConflictException(
        existing.email === dto.email ? 'Email already registered' : 'Phone number already registered',
      );
    }

    const client = await this.prisma.client.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName ?? null,
        email: dto.email,
        phone: dto.phone,
        isVerified: false,
      },
    });

    await this.sendOtp(client.id, client.email, client.firstName);

    const accessToken = this.signAccessToken(client);
    const { rawToken, selector, verifier } = this.makeRefreshToken();
    await this.storeRefreshToken(client.id, selector, verifier);

    return { message: 'Verification code sent to your email', accessToken, refreshToken: rawToken };
  }

  // ── Verify Email OTP ──────────────────────────────────────────────────────
  async verifyEmail(email: string, otp: string): Promise<AuthResult> {
    const client = await this.prisma.client.findUnique({ where: { email } });
    if (!client) throw new NotFoundException('Account not found');
    if (client.isVerified) throw new BadRequestException('Email already verified');
    if (!client.emailOtp || !client.emailOtpExpiry)
      throw new BadRequestException('No verification code on file. Please register again.');
    if (client.emailOtpExpiry < new Date())
      throw new BadRequestException('Verification code expired. Request a new one.');

    const valid = await bcrypt.compare(otp, client.emailOtp);
    if (!valid) throw new UnauthorizedException('Invalid verification code');

    const verified = await this.prisma.client.update({
      where: { id: client.id },
      data: { isVerified: true, emailOtp: null, emailOtpExpiry: null },
    });

    return this.issueTokenPair(verified);
  }

  // ── Resend OTP ────────────────────────────────────────────────────────────
  async resendOtp(email: string): Promise<{ message: string }> {
    const client = await this.prisma.client.findUnique({ where: { email } });
    if (!client) throw new NotFoundException('Account not found');
    if (client.isVerified) throw new BadRequestException('Email already verified');
    await this.sendOtp(client.id, client.email, client.firstName);
    return { message: 'New verification code sent' };
  }

  // ── Google Auth ───────────────────────────────────────────────────────────
  async googleAuth(dto: GoogleAuthDto): Promise<AuthResult> {
    const ticket = await this.googleClient
      .verifyIdToken({ idToken: dto.idToken, audience: process.env.GOOGLE_CLIENT_ID })
      .catch(() => { throw new UnauthorizedException('Invalid Google token'); });

    const payload = ticket.getPayload();
    if (!payload?.email) throw new BadRequestException('Google account has no email');

    let client = await this.prisma.client.findFirst({
      where: { OR: [{ googleId: payload.sub }, { email: payload.email }] },
    });

    if (!client) {
      client = await this.prisma.client.create({
        data: {
          firstName: payload.given_name ?? payload.name ?? 'User',
          lastName: payload.family_name ?? null,
          email: payload.email,
          phone: dto.phone || `google_${payload.sub}`,
          googleId: payload.sub,
          profileImage: payload.picture ?? null,
          isVerified: true,
        },
      });
    } else if (!client.googleId) {
      client = await this.prisma.client.update({
        where: { id: client.id },
        data: {
          googleId: payload.sub,
          profileImage: client.profileImage ?? payload.picture ?? null,
          isVerified: true,
        },
      });
    }

    return this.issueTokenPair(client);
  }

  // ── Refresh Token (rotate) ────────────────────────────────────────────────
  async refreshTokens(rawToken: string): Promise<AuthResult> {
    const parts = rawToken.split(':');
    if (parts.length !== 2) throw new UnauthorizedException('Malformed refresh token');
    const [selector, verifier] = parts;

    const record = await this.prisma.refreshToken.findUnique({
      where: { selector },
      include: { client: true },
    });

    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired or not found. Please log in again.');
    }

    const valid = await bcrypt.compare(verifier, record.verifierHash);
    if (!valid) throw new UnauthorizedException('Invalid refresh token');

    // Rotate — delete old, issue new
    await this.prisma.refreshToken.delete({ where: { selector } });
    return this.issueTokenPair(record.client);
  }

  // ── Face Enroll ───────────────────────────────────────────────────────────
  async enrollFace(clientId: string, imageBuffer: Buffer) {
    const descriptor = await this.faceService.extractDescriptor(imageBuffer);
    if (!descriptor) {
      throw new BadRequestException('No face detected. Please ensure your face is clearly visible.');
    }

    const client = await this.prisma.client.update({
      where: { id: clientId },
      data: { faceDescriptor: descriptor, isFaceRecognition: true },
    });

    return { message: 'Face enrolled successfully', client: this.sanitize(client) };
  }

  // ── Face Identify (1:N) ───────────────────────────────────────────────────
  async faceIdentify(imageBuffer: Buffer): Promise<AuthResult> {
    const submitted = await this.faceService.extractDescriptor(imageBuffer);
    if (!submitted) {
      throw new BadRequestException('No face detected. Please ensure your face is clearly visible.');
    }

    const enrolled = await this.prisma.client.findMany({ where: { isFaceRecognition: true } });
    if (!enrolled.length) {
      throw new NotFoundException('No face-registered accounts found. Please register first.');
    }

    let bestMatch: any = null;
    let bestDist = Infinity;

    for (const c of enrolled) {
      if (!c.faceDescriptor) continue;
      const dist = this.faceService.computeDistance(c.faceDescriptor as number[], submitted);
      if (dist <= 0.5 && dist < bestDist) { bestDist = dist; bestMatch = c; }
    }

    if (!bestMatch) throw new UnauthorizedException('Face not recognised. Please register first.');
    return this.issueTokenPair(bestMatch);
  }

  // ── Enable Biometric ──────────────────────────────────────────────────────
  async enableBiometric(clientId: string) {
    const client = await this.prisma.client.update({
      where: { id: clientId },
      data: { isBiometric: true },
    });
    return { message: 'Biometric enabled', client: this.sanitize(client) };
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  async logout(rawToken?: string): Promise<void> {
    if (!rawToken) return;
    const [selector] = rawToken.split(':');
    if (selector) {
      await this.prisma.refreshToken.deleteMany({ where: { selector } }).catch(() => {});
    }
  }

  // ── Me ────────────────────────────────────────────────────────────────────
  async getMe(clientId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new UnauthorizedException('Client not found');
    return this.sanitize(client);
  }

  // ── Update Profile ────────────────────────────────────────────────────────
  async updateProfile(clientId: string, dto: { firstName?: string; lastName?: string; phone?: string }) {
    if (dto.phone) {
      const existing = await this.prisma.client.findFirst({
        where: { phone: dto.phone, NOT: { id: clientId } },
      });
      if (existing) throw new ConflictException('Phone number already in use');
    }
    const client = await this.prisma.client.update({
      where: { id: clientId },
      data: {
        ...(dto.firstName ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName || null } : {}),
        ...(dto.phone ? { phone: dto.phone } : {}),
      },
    });
    return this.sanitize(client);
  }

  // ── Upload Profile Image ──────────────────────────────────────────────────
  async uploadProfileImage(clientId: string, imageBuffer: Buffer, mimeType: string): Promise<{ profileImage: string }> {
    const { join } = await import('path');
    const { mkdirSync, writeFileSync } = await import('fs');

    const ext = mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';
    const filename = `profile_${clientId}_${Date.now()}${ext}`;
    const dir = join(process.cwd(), '..', 'uploads', 'profiles');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), imageBuffer);

    const relativePath = `profiles/${filename}`;
    await this.prisma.client.update({
      where: { id: clientId },
      data: { profileImage: relativePath },
    });
    return { profileImage: relativePath };
  }

  // ── Private helpers ───────────────────────────────────────────────────────
  private async issueTokenPair(client: any): Promise<AuthResult> {
    const accessToken = this.signAccessToken(client);
    const { rawToken, selector, verifier } = this.makeRefreshToken();
    await this.storeRefreshToken(client.id, selector, verifier);
    return { accessToken, refreshToken: rawToken, client: this.sanitize(client) };
  }

  private signAccessToken(client: { id: string; email: string; phone: string }): string {
    return this.jwtService.sign(
      { id: client.id, email: client.email, phone: client.phone },
      { secret: process.env.JWT_CLIENT_SECRET!, expiresIn: '2m' },
    );
  }

  private makeRefreshToken(): { rawToken: string; selector: string; verifier: string } {
    const selector = crypto.randomBytes(8).toString('hex');
    const verifier = crypto.randomBytes(24).toString('hex');
    return { rawToken: `${selector}:${verifier}`, selector, verifier };
  }

  private async storeRefreshToken(clientId: string, selector: string, verifier: string): Promise<void> {
    const verifierHash = await bcrypt.hash(verifier, 10);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({ data: { selector, verifierHash, clientId, expiresAt } });
  }

  private async sendOtp(clientId: string, email: string, firstName: string): Promise<void> {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.client.update({
      where: { id: clientId },
      data: { emailOtp: otpHash, emailOtpExpiry: otpExpiry },
    });

    await this.emailService.sendEmail(
      email,
      'Your ABY Expense verification code',
      'verify-email',
      { firstName, otp, expiryMinutes: 10 },
    );
  }

  private sanitize(client: any) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { faceDescriptor, emailOtp, emailOtpExpiry, ...safe } = client;
    return safe;
  }
}
