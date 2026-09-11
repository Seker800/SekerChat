import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { createOpenApiDocument } from './openapi-document';

async function main(): Promise<void> {
  const documentationEnvironment = {
    APP_BASE_URL: 'http://openapi.local',
    API_BASE_URL: 'http://openapi.local/api',
    DATABASE_URL: 'postgresql://openapi:openapi@127.0.0.1:5432/openapi',
    JWT_ACCESS_SECRET: 'openapi-access-secret',
    JWT_REFRESH_SECRET: 'openapi-refresh-secret',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    S3_ENDPOINT: 'http://127.0.0.1:9000',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'openapi',
    S3_ACCESS_KEY_ID: 'openapi',
    S3_SECRET_ACCESS_KEY: 'openapi-secret',
    FILE_ACCESS_SECRET: 'openapi-file-access-secret',
    FILE_ACCESS_TTL: '15m',
  } as const;

  for (const [key, value] of Object.entries(documentationEnvironment)) {
    process.env[key] ??= value;
  }

  const { AppModule } = await import('../app.module');
  const app = await NestFactory.create(AppModule, { abortOnError: false, logger: false });
  app.setGlobalPrefix('api');
  const serialized = `${JSON.stringify(createOpenApiDocument(app), null, 2)}\n`;
  await app.close();

  const outputPath = resolve(process.cwd(), 'contracts/openapi.json');
  if (process.env.SEKERCHAT_OPENAPI_CHECK === '1') {
    const existing = await readFile(outputPath, 'utf8').catch(() => '');
    if (existing !== serialized) {
      throw new Error('OpenAPI contract is stale. Run npm run contracts:generate.');
    }
    return;
  }
  await writeFile(outputPath, serialized, 'utf8');
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
