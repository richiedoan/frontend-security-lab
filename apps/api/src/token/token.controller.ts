import { Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Header, HttpCode, Injectable, Post, UseGuards } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import type { Request } from 'express';
import { LoginDto } from '../login.dto';
import { TokenService, type TokenPair } from './token.service';

export class RefreshTokenDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  refresh_token!: string;
}

@Injectable()
export class LocalTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    // Inspect the actual peer, never a client-controlled forwarded header.
    if (process.env.NODE_ENV === 'production' ||
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')) {
      throw new ForbiddenException('Local lab only');
    }
    return true;
  }
}

// Username selection is intentionally passwordless for this local exercise.
// This is NOT a production identity provider. Never log request/response tokens.
@Controller('token')
@UseGuards(LocalTokenGuard)
export class TokenController {
  constructor(private readonly tokens: TokenService) {}

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  login(@Body() body: LoginDto): Promise<TokenPair> {
    return this.tokens.login(body.username);
  }

  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  refresh(@Body() body: RefreshTokenDto): Promise<TokenPair> {
    return this.tokens.refresh(body.refresh_token);
  }

  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  logout(@Body() body: RefreshTokenDto): void {
    this.tokens.revokeFamily(body.refresh_token);
  }
}
