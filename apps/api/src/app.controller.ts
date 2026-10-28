import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { TransferDto } from './transfer.dto';

interface PublicResponse {
  message: string;
  requestOrigin: string | null;
}

interface TransferResponse {
  amount: number;
  labCounter: number;
}

@Controller()
export class AppController {
  private labCounter = 0;

  @Get('health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }

  @Get('public')
  getPublic(@Headers('origin') origin?: string): PublicResponse {
    return {
      message: 'This is a public, local-only lab endpoint.',
      requestOrigin: origin ?? null,
    };
  }

  @Get('private')
  getPrivate(@Headers('x-lab-user') labUser?: string): { message: string } {
    if (!labUser) {
      throw new UnauthorizedException('x-lab-user header is required');
    }

    return { message: 'Local lab user recognized.' };
  }

  @Post('transfer')
  transfer(@Body() transfer: TransferDto): TransferResponse {
    this.labCounter += transfer.amount;
    return { amount: transfer.amount, labCounter: this.labCounter };
  }
}
