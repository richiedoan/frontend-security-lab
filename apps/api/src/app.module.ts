import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { INSECURE_AUTHZ_MODE, readInsecureAuthzMode } from './authz-mode';
import { AdminController, DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { RequestMetadataLoggerMiddleware } from './request-metadata-logger.middleware';
import { SessionController } from './session.controller';
import { CsrfGuard } from './csrf.guard';
import { SessionAuthGuard } from './session-auth.guard';
import { ProfileController, ProfileService } from './profile.controller';
import { INSECURE_CSRF, readInsecureCsrf } from './csrf-mode';

import { TokenModule } from './token/token.module';
import { OidcModule } from './oidc/oidc.module';

@Module({
  imports: [TokenModule, OidcModule],
  controllers: [AppController, SessionController, DocumentController, AdminController, CommentController, ProfileController],
  providers: [
    { provide: APP_GUARD, useClass: CsrfGuard },
    ProfileService,
    { provide: INSECURE_CSRF, useFactory: (): boolean => readInsecureCsrf() },
    CommentService,
    DocumentService,
    SessionAuthGuard,
    {
      provide: INSECURE_AUTHZ_MODE,
      useFactory: (): boolean => readInsecureAuthzMode(),
    },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, transform: true }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestMetadataLoggerMiddleware).forRoutes('*');
  }
}
