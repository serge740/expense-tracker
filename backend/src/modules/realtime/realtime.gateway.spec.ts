import { clientRoom, RealtimeGateway } from './realtime.gateway';

const socket = (auth: any = {}, headers: any = {}) => {
  const s: any = { handshake: { auth, headers }, join: jest.fn(async () => {}), disconnect: jest.fn() };
  return s;
};
const jwt = (impl: (t: string) => any) => ({ verifyAsync: jest.fn(async (t: string) => impl(t)) }) as any;

describe('RealtimeGateway', () => {
  const OLD = process.env.JWT_CLIENT_SECRET;
  beforeEach(() => { process.env.JWT_CLIENT_SECRET = 'secret'; });
  afterAll(() => { process.env.JWT_CLIENT_SECRET = OLD; });

  it('puts a phone with a valid token in the room of its own account', async () => {
    const g = new RealtimeGateway(jwt(() => ({ id: 'c1' })));
    const s = socket({ token: 'good' });
    await g.handleConnection(s);
    expect(s.join).toHaveBeenCalledWith(clientRoom('c1'));
    expect(s.disconnect).not.toHaveBeenCalled();
  });

  it('also accepts a Bearer header', async () => {
    const g = new RealtimeGateway(jwt(() => ({ id: 'c1' })));
    const s = socket({}, { authorization: 'Bearer good' });
    await g.handleConnection(s);
    expect(s.join).toHaveBeenCalledWith('client:c1');
  });

  it('disconnects when there is no token, a bad token, or no id in it', async () => {
    for (const [s, g] of [
      [socket({}), new RealtimeGateway(jwt(() => ({ id: 'c1' })))],
      [socket({ token: 'bad' }), new RealtimeGateway(jwt(() => { throw new Error('bad'); }))],
      [socket({ token: 'noid' }), new RealtimeGateway(jwt(() => ({})))],
    ] as const) {
      await g.handleConnection(s);
      expect(s.disconnect).toHaveBeenCalledWith(true);
      expect(s.join).not.toHaveBeenCalled();
    }
  });

  it('sends only to that account\'s room, and never throws', () => {
    const g = new RealtimeGateway(jwt(() => ({})));
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    g.server = { to } as any;
    g.emitToClient('c1', 'new-notification', { id: 'n1' });
    expect(to).toHaveBeenCalledWith('client:c1');
    expect(emit).toHaveBeenCalledWith('new-notification', { id: 'n1' });
    g.server = { to: () => { throw new Error('boom'); } } as any;
    expect(() => g.emitToClient('c1', 'x')).not.toThrow();
    g.server = undefined as any;
    expect(() => g.emitToClient('c1', 'x')).not.toThrow();
  });
});
