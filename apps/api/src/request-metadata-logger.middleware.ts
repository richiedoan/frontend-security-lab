import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestMetadataLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('RequestMetadata');

  use(request: Request, _response: Response, next: NextFunction): void {
    // Token requests are excluded entirely: even URLs/headers can contain secrets.
    if (/^\/(?:token|oidc)(?:\/|$)/i.test(request.path)) {
      next();
      return;
    }
    this.logger.log(
      JSON.stringify({
        method: request.method,
        path: request.originalUrl,
        origin: request.get('origin') ?? null,
        contentType: request.get('content-type') ?? null,
        hasCookie: request.headers.cookie !== undefined,
        hasAuthorization: request.headers.authorization !== undefined,
      }),
    );

    next();
  }
}
