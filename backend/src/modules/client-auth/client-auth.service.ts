import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  forwardRef,
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
import { NotificationsService } from '../notifications/notifications.service';
import { RegisterClientDto } from './dto/register-client.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { AppleAuthDto } from './dto/apple-auth.dto';
import { FacebookAuthDto } from './dto/facebook-auth.dto';

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
    @Inject(forwardRef(() => NotificationsService))
    private readonly notifications: NotificationsService,
  ) {
    this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

  async onModuleInit() {
    if (!process.env.JWT_CLIENT_SECRET) {
      throw new Error('JWT_CLIENT_SECRET env var is required but not set');
    }
  }

  // ── Register (creates account, returns tokens; email verified later) ─────
  async register(dto: RegisterClientDto): Promise<AuthResult> {
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
        passwordHash: dto.password ? await bcrypt.hash(dto.password, 10) : null,
        // Email/password sign-ups confirm their email from Profile → Verify.
        isVerified: false,
      },
    });

    return this.issueTokenPair(client);
  }

  // ── Login (email or phone + password) ─────────────────────────────────────
  async login(identifier: string, password: string): Promise<AuthResult> {
    if (!identifier || !password) throw new BadRequestException('Email/phone and password are required');
    const client = await this.findByIdentifier(identifier);
    if (!client?.passwordHash || !(await bcrypt.compare(password, client.passwordHash))) {
      throw new UnauthorizedException('Incorrect email/phone or password');
    }
    if (!client.isActive) throw new UnauthorizedException('This account is disabled');
    this.notifications.notify(client.id, 'New sign-in', 'Your account was just signed in to. Not you? Change your password.', 'security');
    return this.issueTokenPair(client);
  }

  // ── Forgot password: email a 6-digit code ─────────────────────────────────
  // Phone lookups also go to the account's email (no SMS provider configured).
  async forgotPassword(identifier: string): Promise<{ message: string; sentTo: string }> {
    if (!identifier) throw new BadRequestException('Email or phone number is required');
    const client = await this.findByIdentifier(identifier);
    if (!client) throw new NotFoundException('No account found with that email or phone number');
    await this.sendOtp(client.id, client.email, client.firstName, 'reset');
    return { message: 'Reset code sent', sentTo: this.maskEmail(client.email) };
  }

  // ── Verify reset code → short-lived reset token ───────────────────────────
  async verifyResetOtp(identifier: string, otp: string): Promise<{ resetToken: string }> {
    const client = await this.findByIdentifier(identifier || '');
    if (!client?.emailOtp || !client.emailOtpExpiry) throw new BadRequestException('No reset code on file. Request a new one.');
    if (client.emailOtpExpiry < new Date()) throw new BadRequestException('Reset code expired. Request a new one.');
    if (!(await bcrypt.compare(otp, client.emailOtp))) throw new UnauthorizedException('Invalid reset code');

    await this.prisma.client.update({ where: { id: client.id }, data: { emailOtp: null, emailOtpExpiry: null } });
    const resetToken = this.jwtService.sign(
      { id: client.id, purpose: 'password-reset' },
      { secret: process.env.JWT_CLIENT_SECRET!, expiresIn: '10m' },
    );
    return { resetToken };
  }

  // ── Reset password ────────────────────────────────────────────────────────
  async resetPassword(resetToken: string, password: string): Promise<{ message: string }> {
    if (!password || password.length < 6) throw new BadRequestException('Password must be at least 6 characters');
    let payload: { id: string; purpose: string };
    try {
      payload = this.jwtService.verify(resetToken, { secret: process.env.JWT_CLIENT_SECRET! });
    } catch {
      throw new UnauthorizedException('Reset session expired. Please start again.');
    }
    if (payload.purpose !== 'password-reset') throw new UnauthorizedException('Invalid reset token');

    await this.prisma.client.update({
      where: { id: payload.id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    // Sign out every device after a password change
    await this.prisma.refreshToken.deleteMany({ where: { clientId: payload.id } });
    this.notifications.notify(payload.id, 'Password changed', 'Your password was changed and other devices were signed out.', 'security');
    return { message: 'Password updated. Please sign in.' };
  }

  // ── Email verification (signed-in user) ───────────────────────────────────
  async sendEmailVerification(clientId: string): Promise<{ sentTo: string }> {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Account not found');
    if (client.emailVerifiedAt) throw new BadRequestException('Email is already verified');
    await this.sendOtp(client.id, client.email, client.firstName, 'verify');
    return { sentTo: this.maskEmail(client.email) };
  }

  async confirmEmailVerification(clientId: string, otp: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Account not found');
    if (client.emailVerifiedAt) return this.sanitize(client);
    if (!client.emailOtp || !client.emailOtpExpiry) throw new BadRequestException('No code on file. Send a new one.');
    if (client.emailOtpExpiry < new Date()) throw new BadRequestException('Code expired. Send a new one.');
    if (!(await bcrypt.compare(String(otp ?? ''), client.emailOtp))) throw new UnauthorizedException('Incorrect code');

    const updated = await this.prisma.client.update({
      where: { id: clientId },
      data: { emailVerifiedAt: new Date(), isVerified: true, emailOtp: null, emailOtpExpiry: null },
    });
    return this.sanitize(updated);
  }

  // ── Phone verification (signed-in user, SMS) ──────────────────────────────
  async sendPhoneVerification(clientId: string): Promise<{ sentTo: string; devNote?: string }> {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Account not found');
    if (/^(google|apple|facebook)_/.test(client.phone)) throw new BadRequestException('Add a phone number to your profile first');
    if (client.phoneVerifiedAt) throw new BadRequestException('Phone number is already verified');

    const otp = String(crypto.randomInt(100000, 1000000));
    await this.prisma.client.update({
      where: { id: clientId },
      data: { phoneOtp: await bcrypt.hash(otp, 10), phoneOtpExpiry: new Date(Date.now() + 10 * 60 * 1000) },
    });
    const delivered = await this.sendSms(client.phone, `Your Rabbit Tracker code is ${otp}. It expires in 10 minutes.`);
    const masked = `${client.phone.slice(0, 4)}•••${client.phone.slice(-3)}`;
    return delivered
      ? { sentTo: masked }
      : { sentTo: masked, devNote: 'SMS is not configured on the server; the code was printed in the server console.' };
  }

  async confirmPhoneVerification(clientId: string, otp: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Account not found');
    if (client.phoneVerifiedAt) return this.sanitize(client);
    if (!client.phoneOtp || !client.phoneOtpExpiry) throw new BadRequestException('No code on file. Send a new one.');
    if (client.phoneOtpExpiry < new Date()) throw new BadRequestException('Code expired. Send a new one.');
    if (!(await bcrypt.compare(String(otp ?? ''), client.phoneOtp))) throw new UnauthorizedException('Incorrect code');

    const updated = await this.prisma.client.update({
      where: { id: clientId },
      data: { phoneVerifiedAt: new Date(), phoneOtp: null, phoneOtpExpiry: null },
    });
    return this.sanitize(updated);
  }

  // ── Facebook Sign-In ──────────────────────────────────────────────────────
  async facebookAuth(dto: FacebookAuthDto): Promise<AuthResult> {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret) throw new BadRequestException('Facebook login is not configured on the server');
    if (!dto.accessToken) throw new BadRequestException('Facebook access token is required');

    // Confirm the token was issued for OUR app before trusting it.
    const debug = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(dto.accessToken)}&access_token=${appId}|${appSecret}`,
    ).then(r => r.json() as Promise<{ data?: { is_valid?: boolean; app_id?: string } }>);
    if (!debug.data?.is_valid || debug.data.app_id !== appId) throw new UnauthorizedException('Invalid Facebook token');

    const profile = await fetch(
      `https://graph.facebook.com/me?fields=id,email,first_name,last_name,picture.type(large)&access_token=${encodeURIComponent(dto.accessToken)}`,
    ).then(r => r.json() as Promise<{
      id?: string; email?: string; first_name?: string; last_name?: string;
      picture?: { data?: { url?: string } };
    }>);
    if (!profile.id) throw new UnauthorizedException('Could not read Facebook profile');

    let client = await this.prisma.client.findFirst({
      where: { OR: [{ facebookId: profile.id }, ...(profile.email ? [{ email: profile.email }] : [])] },
    });

    if (!client) {
      if (!profile.email) throw new BadRequestException('Your Facebook account has no email. Please sign up with email instead.');
      client = await this.prisma.client.create({
        data: {
          firstName: profile.first_name || 'User',
          lastName: profile.last_name || null,
          email: profile.email,
          phone: `facebook_${profile.id}`,
          facebookId: profile.id,
          profileImage: profile.picture?.data?.url ?? null,
          isVerified: true,
        },
      });
    } else if (!client.facebookId) {
      client = await this.prisma.client.update({ where: { id: client.id }, data: { facebookId: profile.id, isVerified: true } });
    }

    return this.issueTokenPair(client);
  }

  // ── Apple Sign-In ─────────────────────────────────────────────────────────
  async appleAuth(dto: AppleAuthDto): Promise<AuthResult> {
    const payload = await this.verifyAppleToken(dto.identityToken);

    let client = await this.prisma.client.findFirst({
      where: { OR: [{ appleId: payload.sub }, ...(payload.email ? [{ email: payload.email }] : [])] },
    });

    if (!client) {
      if (!payload.email) throw new BadRequestException('Apple did not share an email for this account');
      client = await this.prisma.client.create({
        data: {
          firstName: dto.firstName || 'User',
          lastName: dto.lastName || null,
          email: payload.email,
          phone: `apple_${payload.sub}`,
          appleId: payload.sub,
          isVerified: true,
        },
      });
    } else if (!client.appleId) {
      client = await this.prisma.client.update({ where: { id: client.id }, data: { appleId: payload.sub, isVerified: true } });
    }

    return this.issueTokenPair(client);
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
    const current = await this.prisma.client.findUnique({ where: { id: clientId }, select: { phone: true } });
    const client = await this.prisma.client.update({
      where: { id: clientId },
      data: {
        ...(dto.firstName ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName || null } : {}),
        ...(dto.phone ? { phone: dto.phone } : {}),
        ...(dto.phone && dto.phone !== current?.phone ? { phoneVerifiedAt: null, phoneOtp: null, phoneOtpExpiry: null } : {}),
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
    // Same base as the /uploads static route and receipts: <backend>/uploads
    const dir = join(process.cwd(), 'uploads', 'profiles');
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

  /** Sends an SMS through Twilio. Returns false (and logs the text) when SMS isn't configured outside production. */
  private async sendSms(to: string, body: string): Promise<boolean> {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    if (!sid || !token || !from) {
      if (process.env.NODE_ENV === 'production') throw new BadRequestException('SMS is not configured on the server');
      console.warn(`[DEV SMS] to ${to}: ${body}`);
      return false;
    }
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });
    if (!res.ok) throw new BadRequestException('Could not send SMS. Check the phone number and try again.');
    return true;
  }

  private findByIdentifier(identifier: string) {
    const value = identifier.trim();
    return this.prisma.client.findFirst({
      where: value.includes('@') ? { email: value.toLowerCase() } : { phone: value.replace(/[\s()-]/g, '') },
    });
  }

  private maskEmail(email: string): string {
    const [user, domain] = email.split('@');
    return `${user.slice(0, 2)}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`;
  }

  // Verifies an Apple identity token against Apple's published signing keys.
  private async verifyAppleToken(identityToken: string): Promise<{ sub: string; email?: string }> {
    let kid: string | undefined;
    try {
      kid = JSON.parse(Buffer.from(identityToken.split('.')[0], 'base64url').toString()).kid;
    } catch {
      throw new UnauthorizedException('Invalid Apple token');
    }
    const res = await fetch('https://appleid.apple.com/auth/keys');
    const { keys } = (await res.json()) as { keys: (crypto.JsonWebKey & { kid: string })[] };
    const jwk = keys.find(k => k.kid === kid);
    if (!jwk) throw new UnauthorizedException('Invalid Apple token');

    // Expo Go signs in as host.exp.Exponent; standalone builds use the app's bundle id.
    const [first, ...rest] = (process.env.APPLE_AUDIENCES || 'host.exp.Exponent').split(',').map(a => a.trim());
    const audience: [string, ...string[]] = [first, ...rest];
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' }).toString();
    try {
      return this.jwtService.verify(identityToken, {
        publicKey,
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience,
      });
    } catch {
      throw new UnauthorizedException('Invalid Apple token');
    }
  }

  private async sendOtp(
    clientId: string,
    email: string,
    firstName: string,
    kind: 'verify' | 'reset' = 'verify',
  ): Promise<void> {
    const otp = String(crypto.randomInt(100000, 1000000));
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.client.update({
      where: { id: clientId },
      data: { emailOtp: otpHash, emailOtpExpiry: otpExpiry },
    });

    await this.emailService.sendEmail(
      email,
      kind === 'reset' ? 'Your Rabbit Tracker password reset code' : 'Your Rabbit Tracker verification code',
      kind === 'reset' ? 'reset-password' : 'verify-email',
      { firstName, otp, expiryMinutes: 10 },
    );
  }

  private sanitize(client: any) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { faceDescriptor, emailOtp, emailOtpExpiry, passwordHash, phoneOtp, phoneOtpExpiry, ...safe } = client;
    return safe;
  }
}
