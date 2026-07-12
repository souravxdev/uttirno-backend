import { INestApplication } from '@nestjs/common';

export const API_PREFIX = 'api';

/**
 * Shared between main.ts (runtime), scripts/emit-openapi.ts (contract emit)
 * and e2e tests, so the served routes and the OpenAPI spec can never drift.
 */
export function configureApp(app: INestApplication, corsOrigin: string): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({ origin: corsOrigin });
}
