// End-to-end check of the live channel: a real server, real sockets, real tokens.
// Run: npx ts-node scripts/realtime-check.ts   (needs no database)
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { RealtimeGateway } from '../src/modules/realtime/realtime.gateway';
import { RealtimeModule } from '../src/modules/realtime/realtime.module';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { io } = require('../../expo_app/node_modules/socket.io-client');

process.env.JWT_CLIENT_SECRET = 'realtime-check-secret';
let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const mod = await Test.createTestingModule({ imports: [RealtimeModule] }).compile();
  const app = mod.createNestApplication();
  await app.listen(0);
  const port = (app.getHttpServer().address() as any).port;
  const gateway = app.get(RealtimeGateway);
  const jwt = app.get(JwtService);
  const sign = (id: string) => jwt.signAsync({ id }, { secret: process.env.JWT_CLIENT_SECRET, expiresIn: '5m' });
  const url = `http://localhost:${port}`;

  const got: Record<string, any[]> = { a: [], b: [] };
  const connect = (who: string, token: string) => {
    const s = io(url, { transports: ['websocket'], auth: { token }, reconnection: false });
    s.on('new-notification', (p: any) => got[who].push(p));
    return s;
  };
  const a = connect('a', await sign('client-A'));
  const b = connect('b', await sign('client-B'));
  const bad = io(url, { transports: ['websocket'], auth: { token: 'not-a-token' }, reconnection: false });
  const none = io(url, { transports: ['websocket'], reconnection: false });
  await wait(800);

  gateway.emitToClient('client-A', 'new-notification', { id: 'n1', type: 'transaction' });
  await wait(400);
  check('account A receives its own event', got.a.length === 1 && got.a[0].id === 'n1');
  check('account B does not receive A\'s event', got.b.length === 0);
  check('a bad token is disconnected', bad.connected === false);
  check('no token is disconnected', none.connected === false);

  [a, b, bad, none].forEach(s => s.close());
  await app.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
