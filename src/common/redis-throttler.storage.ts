import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';

type ThrottlerStorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

/** Atomic INCR + PEXPIRE on first hit; returns [hits, pttl]. */
const INCR_WITH_TTL_LUA = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {hits, ttl}
`;

/**
 * Shared Redis-backed ThrottlerStorage for multi-replica rate limits.
 * Fail-closed: Redis errors propagate (prefer unavailable over unbounded traffic).
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async quit(): Promise<void> {
    await this.redis.quit();
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle-block:${throttlerName}:${key}`;

    const blockTtl = await this.redis.pttl(blockKey);
    if (blockTtl > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: 0,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockTtl / 1000),
      };
    }

    const result = (await this.redis.eval(
      INCR_WITH_TTL_LUA,
      1,
      redisKey,
      String(ttl),
    )) as [number, number];
    const hits = Number(result[0]);
    const ttlRemaining = Number(result[1]);
    const isBlocked = hits > limit;
    if (isBlocked && blockDuration > 0) {
      await this.redis.set(blockKey, '1', 'PX', blockDuration);
    }

    return {
      totalHits: hits,
      timeToExpire: Math.max(0, Math.ceil(ttlRemaining / 1000)),
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.ceil(blockDuration / 1000) : 0,
    };
  }
}
