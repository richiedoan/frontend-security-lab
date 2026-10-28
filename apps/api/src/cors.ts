import type { Request, Response, NextFunction } from 'express';
import { Logger, type INestApplication } from '@nestjs/common';

const DEVELOPMENT_ORIGIN = 'http://localhost:3000';
const METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];
const ALLOWED_HEADERS = ['Content-Type', 'x-lab-user', 'x-csrf-token'];

export function configureCors(
  app: INestApplication,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (environment.LAB_INSECURE_CORS === 'true') {
    app.enableCors({
      origin: '*',
      credentials: false,
      methods: METHODS,
      allowedHeaders: ALLOWED_HEADERS,
    });
    Logger.warn(
      'LOCAL LAB ONLY: insecure CORS mode allows any origin for non-credentialed requests.',
      'InsecureCors',
    );
    return;
  }

  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.vary('Origin');
    next();
  });
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ): void => {
      callback(null, origin === DEVELOPMENT_ORIGIN);
    },
    credentials: true,
    methods: METHODS,
    allowedHeaders: ALLOWED_HEADERS,
  });
}
