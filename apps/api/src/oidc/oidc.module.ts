import { Module } from '@nestjs/common';
import { OidcController } from './oidc.controller';
import { OidcGuard } from './oidc.guard';
import { discoverKeys, OIDC_KEYS } from './oidc-verifier';

@Module({
  controllers: [OidcController],
  providers: [OidcGuard, { provide: OIDC_KEYS, useFactory: () => discoverKeys() }],
})
export class OidcModule {}
