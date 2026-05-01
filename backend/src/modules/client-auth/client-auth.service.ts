import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';
import { FaceService } from './face.service';
import { RegisterClientDto } from './dto/register-client.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';

@Injectable()
export class ClientAuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly faceService: FaceService,
  ) {
    this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

  // ── Register ──────────────────────────────────────────────────────────────
  async register(dto: RegisterClientDto) {
    const existing = await this.prisma.client.findFirst({
      where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
    });

    if (existing) {
      throw new ConflictException(
        existing.email === dto.email
          ? 'Email already registered'
          : 'Phone number already registered',
      );
    }

    const client = await this.prisma.client.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName ?? null,
        email: dto.email,
        phone: dto.phone,
        isVerified: true,
      },
    });

    return { token: this.signToken(client), client: this.sanitize(client) };
  }

  // ── Google Auth (login + register) ────────────────────────────────────────
  async googleAuth(dto: GoogleAuthDto) {
    const ticket = await this.googleClient
      .verifyIdToken({
        idToken: dto.idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      })
      .catch(() => {
        throw new UnauthorizedException('Invalid Google token');
      });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new BadRequestException('Google account has no email');
    }

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
        },
      });
    }

    return { token: this.signToken(client), client: this.sanitize(client) };
  }

  // ── Face Enroll ───────────────────────────────────────────────────────────
  async enrollFace(clientId: string, imageBuffer: Buffer) {
    const descriptor = await this.faceService.extractDescriptor(imageBuffer);

    if (!descriptor) {
      throw new BadRequestException(
        'No face detected in the image. Please ensure your face is clearly visible.',
      );
    }

    const client = await this.prisma.client.update({
      where: { id: clientId },
      data: { faceDescriptor: descriptor, isFaceRecognition: true },
    });

    return { message: 'Face enrolled successfully', client: this.sanitize(client) };
  }

  // ── Face Identify (1:N — no email required) ───────────────────────────────
  async faceIdentify(imageBuffer: Buffer) {
    const submitted = await this.faceService.extractDescriptor(imageBuffer);

    if (!submitted) {
      throw new BadRequestException('No face detected in the image. Please ensure your face is clearly visible.');
    }

    const enrolled = await this.prisma.client.findMany({
      where: { isFaceRecognition: true },
    });

    if (!enrolled.length) {
      throw new NotFoundException('No face-registered accounts found. Please register first.');
    }

    let bestMatch: any = null;
    let bestDist = Infinity;

    for (const client of enrolled) {
      if (!client.faceDescriptor) continue;
      const dist = this.faceService.computeDistance(client.faceDescriptor as number[], submitted);
      if (dist <= 0.5 && dist < bestDist) {
        bestDist = dist;
        bestMatch = client;
      }
    }

    if (!bestMatch) {
      throw new UnauthorizedException('Face not recognised. Please register first.');
    }

    return { token: this.signToken(bestMatch), client: this.sanitize(bestMatch) };
  }

  // ── Enable Biometric ──────────────────────────────────────────────────────
  async enableBiometric(clientId: string) {
    const client = await this.prisma.client.update({
      where: { id: clientId },
      data: { isBiometric: true },
    });
    return { message: 'Biometric enabled', client: this.sanitize(client) };
  }

  // ── Me ────────────────────────────────────────────────────────────────────
  async getMe(clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });
    if (!client) throw new UnauthorizedException('Client not found');
    return this.sanitize(client);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private signToken(client: { id: string; email: string; phone: string }) {
    return this.jwtService.sign(
      { id: client.id, email: client.email, phone: client.phone },
      {
        secret: process.env.JWT_CLIENT_SECRET || 'client-secret',
        expiresIn: '30d',
      },
    );
  }

  private sanitize(client: any) {
    const { faceDescriptor: _, ...safe } = client;
    return safe;
  }
}
