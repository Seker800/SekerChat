import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('SekerChat HTTP API')
    .setDescription('Published contract for browser, CLI, reminder, and mobile clients.')
    .setVersion('0.8.0')
    .addBearerAuth()
    .addCookieAuth('seker_access', { type: 'apiKey', in: 'cookie' })
    .build();

  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}`,
  });
}
