/**
 * Writes openapi/openapi.json WITHOUT starting an HTTP listener.
 * This file is the single source of truth for frontend API types
 * (see root CLAUDE.md, "API contract workflow").
 *
 * Run with: pnpm openapi:emit
 */
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

async function emitOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);

  const { version } = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
  ) as { version: string };

  const config = new DocumentBuilder()
    .setTitle('Uttirno API')
    .setDescription(
      'MCQ exam prep platform for BD govt job aspirants. ' +
        'This spec is the single source of truth for frontend API types.',
    )
    .setVersion(version)
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const outDir = join(process.cwd(), 'openapi');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'openapi.json'),
    JSON.stringify(document, null, 2) + '\n',
    'utf8',
  );
  await app.close();
  console.log('openapi/openapi.json written');
}

void emitOpenApi();
