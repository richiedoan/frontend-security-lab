import { Logger } from '@nestjs/common';

export const INSECURE_AUTHZ_MODE = Symbol('INSECURE_AUTHZ_MODE');

export function readInsecureAuthzMode(environment: NodeJS.ProcessEnv = process.env): boolean {
  const enabled = environment.LAB_INSECURE_AUTHZ === 'true';
  if (enabled) {
    Logger.warn(
      'LOCAL LAB ONLY: insecure document reads skip ownership and sharing policy checks.',
      'InsecureAuthz',
    );
  }
  return enabled;
}
