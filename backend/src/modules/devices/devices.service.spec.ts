import { DevicesService } from './devices.service';

function fake(existing: any = null) {
  const calls: any = { updateMany: [], update: [], create: [] };
  const prisma: any = {
    device: {
      updateMany: async (a: any) => { calls.updateMany.push(a); return { count: 1 }; },
      findFirst: async () => existing,
      update: async (a: any) => { calls.update.push(a); return {}; },
      create: async (a: any) => { calls.create.push(a); return {}; },
    },
  };
  return { svc: new DevicesService(prisma), calls };
}
const phone = { deviceName: 'Pixel', platform: 'android', pushToken: 'ExponentPushToken[abc]' };

describe('DevicesService push tokens', () => {
  it('takes the token away from any other account or row before saving it', async () => {
    const { svc, calls } = fake();
    await svc.registerDevice('c1', phone);
    expect(calls.updateMany[0]).toEqual({
      where: { pushToken: phone.pushToken, NOT: { clientId: 'c1', deviceName: 'Pixel', platform: 'android' } },
      data: { pushToken: null },
    });
    expect(calls.create).toHaveLength(1);
  });

  it('does not touch other rows when no token was sent', async () => {
    const { svc, calls } = fake();
    await svc.registerDevice('c1', { deviceName: 'Pixel', platform: 'android' });
    expect(calls.updateMany).toHaveLength(0);
  });

  it('sign-out clears the token only for the signed-in account', async () => {
    const { svc, calls } = fake();
    await expect(svc.clearPushToken('c1', 'tok')).resolves.toEqual({ cleared: 1 });
    expect(calls.updateMany[0]).toEqual({ where: { clientId: 'c1', pushToken: 'tok' }, data: { pushToken: null } });
  });
});
