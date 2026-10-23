import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'node:net';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NetworkModule } from './network.module';

test('network endpoint requires auth, prevents caching and respects only trusted proxy IPs', async () => {
  const module = await Test.createTestingModule({ imports: [NetworkModule] })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate(context: ExecutionContext) {
        if (context.switchToHttp().getRequest().headers.authorization === 'Bearer test')
          return true;
        throw new UnauthorizedException();
      },
    })
    .compile();
  const app = module.createNestApplication<NestExpressApplication>();
  app.setGlobalPrefix('api');
  app.set('trust proxy', false);
  await app.listen(0, '127.0.0.1');
  const url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/network/status`;
  try {
    assert.equal((await fetch(url)).status, 401);
    const getStatus = (ip: string) =>
      fetch(url, {
        headers: { authorization: 'Bearer test', 'x-forwarded-for': ip },
      });
    const untrusted = await getStatus('8.8.8.8');
    assert.equal(untrusted.status, 200);
    assert.equal(untrusted.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await untrusted.json(), { showWarning: false });
    app.set('trust proxy', ['loopback']);
    assert.deepEqual(await (await getStatus('8.8.8.8')).json(), { showWarning: true });
    assert.deepEqual(await (await getStatus('223.5.5.5')).json(), { showWarning: false });
    assert.deepEqual(await (await getStatus('192.168.1.1')).json(), { showWarning: false });
  } finally {
    await app.close();
  }
});
