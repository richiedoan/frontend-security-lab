import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { LAB_USERS, type LabUser } from '../lab-data';
import { TOKEN_ALGORITHM, TOKEN_KEY } from './token-key';

export const TOKEN_ISSUER = 'http://localhost:4000/token';
export const TOKEN_AUDIENCE = 'frontend-security-lab';
export const ACCESS_TOKEN_SECONDS = 300;
export const REFRESH_FAMILY_SECONDS = 3600;

interface Family {
  user: LabUser;
  expiresAt: number;
  revoked: boolean;
}
interface RefreshRecord {
  family: Family;
  used: boolean;
}
export interface TokenPair {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
}

// Educational, single-process lab ONLY: this is not a production identity provider.
// No password authentication, durable storage, distributed locking, or Keycloak integration.
@Injectable()
export class TokenService {
  // Retain used hashes until family expiry so replay of ANY ancestor revokes descendants.
  private readonly refreshTokens = new Map<string, RefreshRecord>();

  constructor(@Inject(TOKEN_KEY) private readonly getKey: () => Promise<CryptoKey>) {}

  async login(username: string): Promise<TokenPair> {
    this.assertLocalLab();
    this.pruneExpired();
    if (!Object.hasOwn(LAB_USERS, username)) throw new UnauthorizedException('Unknown lab user');
    const user = LAB_USERS[username as keyof typeof LAB_USERS];
    return this.issue({ user, expiresAt: this.now() + REFRESH_FAMILY_SECONDS, revoked: false });
  }

  async refresh(token: string): Promise<TokenPair> {
    this.assertLocalLab();
    this.pruneExpired();
    const record = this.refreshTokens.get(this.hash(token));
    if (!record || record.family.revoked) throw new UnauthorizedException('Invalid refresh token');
    if (record.used) {
      record.family.revoked = true;
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Consume synchronously before any await: concurrent requests cannot both rotate.
    record.used = true;
    return this.issue(record.family);
  }

  // Idempotent local family revocation. Even a consumed ancestor identifies its family.
  // This does not revoke signed access tokens or remove client-side copies.
  revokeFamily(token: string): void {
    this.assertLocalLab();
    this.pruneExpired();
    const record = this.refreshTokens.get(this.hash(token));
    if (record) record.family.revoked = true;
  }

  private async issue(family: Family): Promise<TokenPair> {
    const key = await this.getKey();
    const now = this.now();
    const accessToken = await new SignJWT({
      scope: family.user.role === 'admin' ? 'documents:read documents:write admin' : 'documents:read documents:write',
      role: family.user.role,
    })
      .setProtectedHeader({ alg: TOKEN_ALGORITHM, typ: 'JWT' })
      .setIssuer(TOKEN_ISSUER).setAudience(TOKEN_AUDIENCE).setSubject(family.user.id)
      .setIssuedAt(now).setExpirationTime(now + ACCESS_TOKEN_SECONDS).setJti(randomUUID())
      .sign(key);
    // A concurrent replay can revoke the family while signing is in progress.
    if (family.revoked || family.expiresAt <= this.now()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const refreshToken = randomBytes(32).toString('base64url');
    this.refreshTokens.set(this.hash(refreshToken), { family, used: false });
    return { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TOKEN_SECONDS, refresh_token: refreshToken };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private now(): number { return Math.floor(Date.now() / 1000); }

  private pruneExpired(): void {
    for (const [hash, record] of this.refreshTokens) {
      if (record.family.expiresAt <= this.now()) this.refreshTokens.delete(hash);
    }
  }

  private assertLocalLab(): void {
    if (process.env.NODE_ENV === 'production') throw new UnauthorizedException('Local lab only');
  }
}
