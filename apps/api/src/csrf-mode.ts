import { Logger } from '@nestjs/common';
export const INSECURE_CSRF = Symbol('INSECURE_CSRF');
export function readInsecureCsrf(environment: NodeJS.ProcessEnv = process.env): boolean {
  const enabled = environment.LAB_INSECURE_CSRF === 'true';
  if (enabled) Logger.warn('LOCAL LAB ONLY: theme changes skip CSRF token and Origin validation.', 'InsecureCsrf');
  return enabled;
}
