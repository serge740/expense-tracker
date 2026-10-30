const getToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ getToken, verifyIdToken: jest.fn() })),
}));

import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ClientAuthService } from './client-auth.service';

describe('ClientAuthService.googleCodeAuth (Google sign-in on the web)', () => {
  const service = new ClientAuthService({} as any, {} as any, {} as any, {} as any);
  const saved = { ...process.env };
  beforeEach(() => {
    getToken.mockReset();
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
  });
  afterAll(() => { process.env = saved; });

  it('swaps the popup code for an ID token and signs in with it', async () => {
    getToken.mockResolvedValue({ tokens: { id_token: 'the-id-token' } });
    const signIn = jest.spyOn(service, 'googleAuth').mockResolvedValue({ accessToken: 'a' } as any);
    await expect(service.googleCodeAuth({ code: 'c', phone: '+250788000000' })).resolves.toEqual({ accessToken: 'a' });
    expect(getToken).toHaveBeenCalledWith('c');
    expect(signIn).toHaveBeenCalledWith({ idToken: 'the-id-token', phone: '+250788000000' });
  });

  it('refuses an expired or reused code', async () => {
    getToken.mockRejectedValue(new Error('invalid_grant'));
    await expect(service.googleCodeAuth({ code: 'old' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses when Google returned no identity token', async () => {
    getToken.mockResolvedValue({ tokens: {} });
    await expect(service.googleCodeAuth({ code: 'c' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('says so when the server has no client secret', async () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    await expect(service.googleCodeAuth({ code: 'c' })).rejects.toBeInstanceOf(BadRequestException);
    expect(getToken).not.toHaveBeenCalled();
  });
});
