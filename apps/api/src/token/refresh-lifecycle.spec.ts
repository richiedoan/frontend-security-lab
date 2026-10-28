import { UnauthorizedException } from '@nestjs/common';
import { generateKeyPair, jwtVerify } from 'jose';
import { ACCESS_TOKEN_SECONDS, REFRESH_FAMILY_SECONDS, TOKEN_AUDIENCE, TOKEN_ISSUER, TokenService } from './token.service';

// No sleeps or scheduling assumptions: time is fixed, and key lookup is an explicit barrier.
describe('deterministic single-process refresh lifecycle', () => {
  const epoch = 1_800_000_000;
  let now: number;
  let keys: Awaited<ReturnType<typeof generateKeyPair>>;
  let service: TokenService;
  let getKey: jest.Mock<Promise<CryptoKey>, []>;

  beforeEach(async () => {
    now = epoch;
    jest.spyOn(Date, 'now').mockImplementation(() => now * 1000);
    keys = await generateKeyPair('ES256');
    getKey = jest.fn(() => Promise.resolve(keys.privateKey));
    service = new TokenService(getKey);
  });
  afterEach(() => jest.restoreAllMocks());

  function verify(token: string) {
    return jwtVerify(token, keys.publicKey, {
      algorithms: ['ES256'], issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE,
      currentDate: new Date(now * 1000),
    });
  }

  function pauseNextIssuance() {
    let release!: () => void;
    const barrier = new Promise<CryptoKey>(resolve => {
      release = () => resolve(keys.privateKey);
    });
    getKey.mockReturnValueOnce(barrier);
    return release;
  }

  it('normally rotates A -> B, with B usable for a subsequent rotation', async () => {
    const a = await service.login('alice');
    const b = await service.refresh(a.refresh_token);
    expect(b.refresh_token).not.toBe(a.refresh_token);
    const original = await verify(a.access_token);
    const rotated = await verify(b.access_token);
    expect(rotated.payload.jti).not.toBe(original.payload.jti);
    expect(rotated.payload).toMatchObject({ sub: 'alice', iat: epoch, exp: epoch + ACCESS_TOKEN_SECONDS });
    await expect(service.refresh(b.refresh_token)).resolves.toHaveProperty('access_token');
  });

  it('retrying A after success revokes B, but not the already-issued access token', async () => {
    const a = await service.login('alice');
    const b = await service.refresh(a.refresh_token);
    await expect(service.refresh(a.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh(b.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(verify(b.access_token)).resolves.toHaveProperty('payload.sub', 'alice');
  });

  it('two attempts using A both fail when the second arrives during first issuance', async () => {
    const a = await service.login('alice');
    const independent = await service.login('alice');
    const release = pauseNextIssuance();
    const first = service.refresh(a.refresh_token); // Consumes A, then waits at the barrier.
    const firstRejected = expect(first).rejects.toBeInstanceOf(UnauthorizedException);
    try {
      await expect(service.refresh(a.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    } finally { release(); }
    await firstRejected;
    await expect(service.refresh(a.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    // No descendant was published by the paused attempt.
    expect(service['refreshTokens'].size).toBe(2);
    await expect(service.refresh(independent.refresh_token)).resolves.toHaveProperty('access_token');
  });

  it.each(['current', 'ancestor'] as const)('logout using a %s token revokes only that family', async tokenKind => {
    const a = await service.login('alice');
    const b = await service.refresh(a.refresh_token);
    const independent = await service.login('alice');
    const logoutToken = tokenKind === 'current' ? b.refresh_token : a.refresh_token;
    service.revokeFamily(logoutToken);
    service.revokeFamily(logoutToken); // Repeated logout is harmless.
    await expect(service.refresh(a.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh(b.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh(independent.refresh_token)).resolves.toHaveProperty('access_token');
    await expect(verify(b.access_token)).resolves.toHaveProperty('payload.sub', 'alice');
    now += ACCESS_TOKEN_SECONDS;
    await expect(verify(b.access_token)).rejects.toMatchObject({ code: 'ERR_JWT_EXPIRED' });
  });

  it('logout during issuance prevents an in-flight descendant from being returned', async () => {
    const a = await service.login('alice');
    const release = pauseNextIssuance();
    const refresh = service.refresh(a.refresh_token);
    const rejected = expect(refresh).rejects.toBeInstanceOf(UnauthorizedException);
    service.revokeFamily(a.refresh_token);
    release();
    await rejected;
    expect(service['refreshTokens'].size).toBe(1);
  });

  it('an expired access token can be replaced using a still-valid refresh token', async () => {
    const a = await service.login('alice');
    now += ACCESS_TOKEN_SECONDS;
    await expect(verify(a.access_token)).rejects.toMatchObject({ code: 'ERR_JWT_EXPIRED' });
    const b = await service.refresh(a.refresh_token);
    await expect(verify(b.access_token)).resolves.toHaveProperty('payload.exp', now + ACCESS_TOKEN_SECONDS);
    // Rotation does not extend the original family's absolute lifetime.
    now = epoch + REFRESH_FAMILY_SECONDS;
    await expect(service.refresh(b.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('clearing a client copy alone does not revoke the server family', async () => {
    const issued = await service.login('alice');
    let clientCopy: string | null = issued.refresh_token;
    const retainedCopy = clientCopy;
    clientCopy = null;
    expect(clientCopy).toBeNull();
    await expect(service.refresh(retainedCopy)).resolves.toHaveProperty('access_token');
  });

  it('logout of an unknown or expired token is an idempotent no-op', async () => {
    service.revokeFamily('unknown');
    const a = await service.login('alice');
    now += REFRESH_FAMILY_SECONDS;
    expect(() => service.revokeFamily(a.refresh_token)).not.toThrow();
    await expect(service.refresh(a.refresh_token)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
