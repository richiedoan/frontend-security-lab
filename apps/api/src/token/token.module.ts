import { createPublicKey, KeyObject } from 'node:crypto';
import { BearerTokenGuard } from './bearer-token.guard';
import { TokenDocumentController } from './token-document.controller';
import { Module } from '@nestjs/common';
import { LocalTokenGuard, TokenController } from './token.controller';
import { loadTokenKey, TOKEN_KEY, TOKEN_PUBLIC_KEY } from './token-key';
import { TokenService } from './token.service';

@Module({
  controllers: [TokenController, TokenDocumentController],
  providers: [
    TokenService,
    BearerTokenGuard,
    {
      provide: TOKEN_PUBLIC_KEY,
      inject: [TOKEN_KEY],
      useFactory: (getKey: () => Promise<CryptoKey>) => {
        let key: Promise<KeyObject> | undefined;
        return (): Promise<KeyObject> => key ??= getKey().then(
          privateKey => createPublicKey(KeyObject.from(privateKey)),
        );
      },
    },
    LocalTokenGuard,
    {
      provide: TOKEN_KEY,
      useFactory: () => {
        // Lazy loading avoids creating private material until the lab is used.
        let key: Promise<CryptoKey> | undefined;
        return (): Promise<CryptoKey> => key ??= loadTokenKey();
      },
    },
  ],
})
export class TokenModule {}
