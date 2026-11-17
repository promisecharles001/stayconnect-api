import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { HttpThrottlerGuard } from './http-throttler.guard';

@Controller()
class PingController {
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Get('strict')
  strict() {
    return 'ok';
  }

  @Get('loose')
  loose() {
    return 'ok';
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }])],
  controllers: [PingController],
  providers: [{ provide: APP_GUARD, useClass: HttpThrottlerGuard }],
})
class TestModule {}

/**
 * Login, password reset and uploads had no limit at all. This proves the
 * global guard actually answers 429 once a route's limit is spent.
 */
describe('HttpThrottlerGuard', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('returns 429 once a route-level limit is used up', async () => {
    await request(app.getHttpServer()).get('/strict').expect(200);
    await request(app.getHttpServer()).get('/strict').expect(200);
    await request(app.getHttpServer()).get('/strict').expect(429);
  });

  it('leaves routes under the default limit working', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).get('/loose').expect(200);
    }
  });
});
