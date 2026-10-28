import type { INestApplication } from '@nestjs/common';
import session from 'express-session';

export const LOCAL_SESSION_COOKIE_NAME = 'session';

export function configureSession(app: INestApplication): void {
  app.use(
    session({
      name: LOCAL_SESSION_COOKIE_NAME,
      secret: 'local-lab-only-not-a-production-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
      },
      // The default MemoryStore is intentional for this local lab and is not production-safe.
    }),
  );
}
