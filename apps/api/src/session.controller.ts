import { randomBytes } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Header,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { LAB_USERS, type LabUser } from './lab-data';
import { LoginDto } from './login.dto';
import type { LabSessionRequest } from './request-types';
import { LOCAL_SESSION_COOKIE_NAME } from './session';

function rejectSessionError(reject: (reason?: unknown) => void, error: unknown): void {
  reject(error instanceof Error ? error : new Error('Session operation failed'));
}

@Controller('session')
export class SessionController {
  @Post('login')
  @HttpCode(200)
  async login(@Body() login: LoginDto, @Req() request: LabSessionRequest): Promise<{ user: LabUser }> {
    await this.regenerate(request);
    request.session.userId = login.username;
    request.session.csrfToken = randomBytes(32).toString('hex');
    await this.save(request);

    return { user: LAB_USERS[login.username] };
  }

  @Get('csrf')
  @Header('Cache-Control', 'no-store')
  getCsrfToken(@Req() request: LabSessionRequest): { csrfToken: string } {
    if (!request.session.userId || !request.session.csrfToken) throw new UnauthorizedException('Sign in again');
    return { csrfToken: request.session.csrfToken };
  }

  @Get('me')
  getCurrentUser(@Req() request: LabSessionRequest): { user: LabUser } {
    const userId = request.session.userId;
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    return { user: LAB_USERS[userId] };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: LabSessionRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      request.session.destroy((error) => {
        if (error) rejectSessionError(reject, error);
        else resolve();
      });
    });
    response.clearCookie(LOCAL_SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
    });
  }

  private regenerate(request: LabSessionRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      request.session.regenerate((error) => {
        if (error) rejectSessionError(reject, error);
        else resolve();
      });
    });
  }

  private save(request: LabSessionRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      request.session.save((error) => {
        if (error) rejectSessionError(reject, error);
        else resolve();
      });
    });
  }
}
