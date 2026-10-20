import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientAuthService } from '../client-auth/client-auth.service';

const rpName = 'Rabbit Tracker';

@Injectable()
export class PasskeyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientAuthService: ClientAuthService,
  ) {}

  private get rpID(): string {
    const rpID = process.env.RP_ID;
    if (!rpID) throw new BadRequestException('Passkeys are not configured on the server');
    return rpID;
  }

  private get origin(): string | string[] {
    const origin = process.env.ORIGIN;
    if (!origin) throw new BadRequestException('Passkeys are not configured on the server');
    const androidOrigin = process.env.ANDROID_ORIGIN;
    return androidOrigin ? [origin, androidOrigin] : origin;
  }

  private async saveChallenge(key: string, challenge: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    await this.prisma.passkeyChallenge.upsert({
      where: { key },
      update: { challenge, expiresAt },
      create: { key, challenge, expiresAt },
    });
  }

  private async takeChallenge(key: string): Promise<string> {
    const c = await this.prisma.passkeyChallenge.findUnique({ where: { key } });
    if (!c || c.expiresAt < new Date()) throw new UnauthorizedException('Challenge expired. Please try again.');
    await this.prisma.passkeyChallenge.delete({ where: { key } });
    return c.challenge;
  }

  // ── Registration (user already logged in) ────────────────────────────────
  async registrationOptions(clientId: string) {
    const client = await this.prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      include: { passkeys: true },
    });

    const options = await generateRegistrationOptions({
      rpName,
      rpID: this.rpID,
      userName: client.email,
      userID: new TextEncoder().encode(client.id),
      attestationType: 'none',
      excludeCredentials: client.passkeys.map(p => ({ id: p.id, transports: p.transports as string[] })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });

    await this.saveChallenge(clientId, options.challenge);
    return options;
  }

  async verifyRegistration(clientId: string, deviceName: string, body: any) {
    const expectedChallenge = await this.takeChallenge(clientId);
    const v = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      requireUserVerification: true,
    });
    if (!v.verified || !v.registrationInfo) throw new UnauthorizedException('Could not verify passkey');

    const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
    await this.prisma.passkey.create({
      data: {
        id: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: (credential.transports ?? []) as object,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        deviceName: deviceName || 'Unknown device',
        clientId,
      },
    });
    return { message: 'Passkey added' };
  }

  // ── Login (no client known yet, discoverable credentials) ────────────────
  async loginOptions() {
    const options = await generateAuthenticationOptions({ rpID: this.rpID, userVerification: 'required' });
    const key = randomUUID();
    await this.saveChallenge(key, options.challenge);
    return { options, key };
  }

  async verifyLogin(key: string, body: any) {
    const expectedChallenge = await this.takeChallenge(key);
    const passkey = await this.prisma.passkey.findUnique({ where: { id: body.id }, include: { client: true } });
    if (!passkey) throw new UnauthorizedException('Unknown passkey');

    const v = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports as string[],
      },
    });
    if (!v.verified) throw new UnauthorizedException('Could not verify passkey');

    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: { counter: v.authenticationInfo.newCounter },
    });

    return this.clientAuthService.issueTokenPair(passkey.client);
  }

  // ── Manage ─────────────────────────────────────────────────────────────────
  async listPasskeys(clientId: string) {
    return this.prisma.passkey.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, deviceName: true, deviceType: true, backedUp: true, createdAt: true },
    });
  }

  async deletePasskey(clientId: string, id: string) {
    const passkey = await this.prisma.passkey.findFirst({ where: { id, clientId } });
    if (!passkey) throw new NotFoundException('Passkey not found');
    await this.prisma.passkey.delete({ where: { id } });
    return { message: 'Passkey removed' };
  }
}
