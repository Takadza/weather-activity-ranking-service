import {
  Injectable,
  OnApplicationShutdown,
  Optional,
  Inject,
} from '@nestjs/common';
import { RedisThrottlerStorage } from './redis-throttler.storage';

export const REDIS_THROTTLER_STORAGE = 'REDIS_THROTTLER_STORAGE';

/** Quits the shared Redis client used for throttling on shutdown. */
@Injectable()
export class RedisThrottlerLifecycle implements OnApplicationShutdown {
  constructor(
    @Optional()
    @Inject(REDIS_THROTTLER_STORAGE)
    private readonly storage: RedisThrottlerStorage | null,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.storage) {
      await this.storage.quit();
    }
  }
}
