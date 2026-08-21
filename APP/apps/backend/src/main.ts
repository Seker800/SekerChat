import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { raw } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AttendanceTrackingInterceptor } from './common/attendance-tracking.interceptor';
import { isAllowedCorsOrigin, resolveCorsOrigins } from './common/cors-origins';
import { HttpExceptionLoggingFilter } from './common/http-exception.filter';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor';
import { RealtimeService } from './realtime/realtime.service';
import { DndConfigService } from './system-config/dnd-config.service';
import { UPLOAD_PART_SIZE_BYTES } from './uploads/upload-limits';
import { resolveTrustedProxyCidrs } from './common/trusted-proxies';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const allowedOrigins = resolveCorsOrigins();
  const isProduction = process.env.NODE_ENV === 'production';
  const trustedProxyCidrs = resolveTrustedProxyCidrs();
  app.set('trust proxy', trustedProxyCidrs);
  if (isProduction && trustedProxyCidrs === false) {
    console.warn('[proxy] TRUSTED_PROXY_CIDRS is empty; forwarded client addresses are ignored');
  }
  app.use(
    '/api/uploads/:sessionId/parts/:partNumber',
    raw({ type: '*/*', limit: `${UPLOAD_PART_SIZE_BYTES + 1024}b` }),
  );
  app.enableCors({
    origin: (requestOrigin: string | undefined, callback: (err: Error | null, ok?: boolean) => void) => {
      if (!requestOrigin || isAllowedCorsOrigin(requestOrigin, allowedOrigins)) {
        callback(null, true);
      } else {
        if (isProduction) {
          console.warn(`[cors] ORIGIN_REJECTED requestOrigin=${requestOrigin}`);
        }
        callback(null, false);
      }
    },
    credentials: true,
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalInterceptors(
    app.get(AttendanceTrackingInterceptor),
    app.get(RequestLoggingInterceptor),
  );
  app.useGlobalFilters(new HttpExceptionLoggingFilter());

  app.get(RealtimeService).attachServer(app.getHttpServer());
  await app.get(DndConfigService).ensureDefaults();

  const host = process.env.HOST ?? '0.0.0.0';
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, host);
}

void bootstrap();
