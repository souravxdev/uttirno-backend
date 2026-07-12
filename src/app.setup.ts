import { INestApplication } from '@nestjs/common';

export const API_PREFIX = 'api';

/**
 * Shared between main.ts (runtime), scripts/emit-openapi.ts (contract emit)
 * and e2e tests, so the served routes and the OpenAPI spec can never drift.
 * CORS origin/port move to the validated config module in Phase 0 Session 2.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({ origin: 'http://localhost:4200' });
}
