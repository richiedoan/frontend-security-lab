import { Body, Controller, Get, HttpCode, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import type { LabUserId } from './lab-data';
import type { AuthenticatedRequest } from './request-types';
import { SessionAuthGuard } from './session-auth.guard';

type Theme = 'light' | 'dark';
class ThemeDto {
  @IsString()
  @IsIn(['light', 'dark'])
  theme!: Theme;
}

@Injectable()
export class ProfileService {
  private readonly themes = new Map<LabUserId, Theme>();

  getTheme(userId: LabUserId): { theme: Theme } {
    return { theme: this.themes.get(userId) ?? 'light' };
  }

  setTheme(userId: LabUserId, theme: Theme): { theme: Theme } {
    this.themes.set(userId, theme);
    return this.getTheme(userId);
  }
}

@Controller('profile')
@UseGuards(SessionAuthGuard)
export class ProfileController {
  constructor(
    private readonly profiles: ProfileService,
  ) {}

  @Get('theme')
  getTheme(@Req() request: AuthenticatedRequest): { theme: Theme } {
    return this.profiles.getTheme(request.user.id);
  }

  @Post('theme')
  @HttpCode(200)
  setTheme(@Body() input: ThemeDto, @Req() request: AuthenticatedRequest): { theme: Theme } {
    return this.profiles.setTheme(request.user.id, input.theme);
  }
}
