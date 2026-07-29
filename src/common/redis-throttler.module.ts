import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  REDIS_THROTTLER_STORAGE,
  RedisThrottlerLifecycle,
} from './redis-throttler.lifecycle';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_THROTTLER_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): RedisThrottlerStorage | null => {
        const redisUrl = config.get<string>('redisUrl', '');
        if (!redisUrl) {
          return null;
        }
        return new RedisThrottlerStorage(
          new Redis(redisUrl, { maxRetriesPerRequest: 1 }),
        );
      },
    },
    RedisThrottlerLifecycle,
  ],
  exports: [REDIS_THROTTLER_STORAGE],
})
export class RedisThrottlerModule {}
