import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

export const clientRoom = (clientId: string) => `client:${clientId}`;

/**
 * Live channel to the signed-in app. A phone connects with its access token; the server checks it and
 * puts that phone in a room for its own account, so a client can never listen to anyone else's events.
 * Everything sent here is only a nudge ("something new, refresh"): the data itself still comes from
 * the normal authenticated endpoints.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(socket: Socket) {
    const token = this.tokenOf(socket);
    const secret = process.env.JWT_CLIENT_SECRET;
    if (!token || !secret) return socket.disconnect(true);
    try {
      const decoded: any = await this.jwt.verifyAsync(token, { secret });
      if (!decoded?.id) return socket.disconnect(true);
      await socket.join(clientRoom(decoded.id));
    } catch {
      socket.disconnect(true);
    }
  }

  /** Never throws: a failed nudge must not break the thing that caused it. */
  emitToClient(clientId: string, event: string, payload: Record<string, unknown> = {}) {
    try { this.server?.to(clientRoom(clientId)).emit(event, payload); }
    catch (e: any) { this.logger.warn(`emit failed: ${e?.message ?? e}`); }
  }

  private tokenOf(socket: Socket): string | undefined {
    const auth = socket.handshake?.auth?.token;
    if (typeof auth === 'string' && auth) return auth;
    const header = socket.handshake?.headers?.authorization;
    return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
  }
}
