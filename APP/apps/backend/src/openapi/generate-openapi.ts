import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { createOpenApiDocument } from './openapi-document';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  const serialized = `${JSON.stringify(createOpenApiDocument(app), null, 2)}\n`;
  await app.close();

  const outputPath = resolve(process.cwd(), 'contracts/openapi.json');
  if (process.argv.includes('--check')) {
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
