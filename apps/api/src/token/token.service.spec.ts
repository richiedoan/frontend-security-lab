import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { generateKeyPair, jwtVerify } from 'jose';
import { ACCESS_TOKEN_SECONDS, REFRESH_FAMILY_SECONDS, TOKEN_AUDIENCE, TOKEN_ISSUER, TokenService } from './token.service';

describe('educational token service', () => {
  let service: TokenService;
  let keys: Awaited<ReturnType<typeof generateKeyPair>>;

  beforeEach(async () => {
    keys = await generateKeyPair('ES256');
    service = new TokenService(() => Promise.resolve(keys.privateKey));
  });
  afterEach(() => jest.restoreAllMocks());

  it('issues a verifiable short-lived access token with all claims and an opaque refresh token', async () => {
    const pair = await service.login('alice');
    const { payload, protectedHeader } = await jwtVerify(pair.access_token, keys.publicKey, {
      issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE, algorithms: ['ES256'],
    });
    expect(protectedHeader.typ).toBe('JWT');
    expect(payload).toMatchObject({ iss: TOKEN_ISSUER, aud: TOKEN_AUDIENCE, sub: 'alice',
      role: 'user', scope: 'documents:read documents:write' });
    expect(typeof payload.iat).toBe('number');
    expect(payload.exp! - payload.iat!).toBe(ACCESS_TOKEN_SECONDS);
    expect(payload.jti).toEqual(expect.any(String));
    expect(pair.expires_in).toBe(ACCESS_TOKEN_SECONDS);
    expect(pair.token_type).toBe('Bearer');
    expect(pair.refresh_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Inspect storage explicitly to verify raw refresh secrets are never retained.
    const records = service['refreshTokens'];
    expect(records.has(pair.refresh_token)).toBe(false);
    expect(records.has(createHash('sha256').update(pair.refresh_token).digest('hex'))).toBe(true);
    expect(JSON.stringify([...records])).not.toContain(pair.refresh_token);
    await expect(jwtVerify(pair.access_token, keys.publicKey, {
      currentDate: new Date(payload.exp! * 1000),
    })).rejects.toThrow();
  });

  it('rotates refresh tokens and issues distinct access token identifiers', async () => {
    const first = await service.login('admin');
    const second = await service.refresh(first.refresh_token);
    const third = await service.refresh(second.refresh_token);
    expect(new Set([first.refresh_token, second.refresh_token, third.refresh_token]).size).toBe(3);
    const a = await jwtVerify(first.access_token, keys.publicKey);
    const b = await jwtVerify(second.access_token, keys.publicKey);
    expect(a.payload.jti).not.toBe(b.payload.jti);
    expect(b.payload).toMatchObject({ sub: 'admin', role: 'admin', scope: 'documents:read documents:write admin' });
  });

  it('revokes the entire family on ancestor reuse, leaving other logins usable', async () => {
    const first = await service.login('alice');
    const unrelated = await service.login('alice');
    const second = await service.refresh(first.refresh_token);
    const third = await service.refresh(second.refresh_token);
    await expect(service.refresh(first.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh(third.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh(second.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh(unrelated.refresh_token)).resolves.toHaveProperty('access_token');
  });

  it('rejects unknown users and refresh tokens', async () => {
    await expect(service.login('__proto__')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh('unknown')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('expires the family after one hour even after rotation', async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    const first = await service.login('alice');
    clock.mockReturnValue(now + 1800 * 1000);
    const second = await service.refresh(first.refresh_token);
    clock.mockReturnValue(now + REFRESH_FAMILY_SECONDS * 1000);
    await expect(service.refresh(second.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service['refreshTokens'].size).toBe(0);
  });
});
