import type Redis from 'ioredis';
import { RedisThrottlerStorage } from '../../../src/common/redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  it('uses atomic eval for incr+ttl and sets block key when over limit', async () => {
    const evalMock = jest.fn().mockResolvedValue([4, 12_000]);
    const setMock = jest.fn().mockResolvedValue('OK');
    const pttlMock = jest.fn().mockResolvedValue(-2);
    const quitMock = jest.fn().mockResolvedValue('OK');
    const redis = {
      pttl: pttlMock,
      eval: evalMock,
      set: setMock,
      quit: quitMock,
    } as unknown as Redis;

    const storage = new RedisThrottlerStorage(redis);
    const record = await storage.increment('ip:1', 60_000, 3, 5_000, 'default');

    expect(evalMock).toHaveBeenCalledWith(
      expect.stringContaining('INCR'),
      1,
      'throttle:default:ip:1',
      '60000',
    );
    expect(setMock).toHaveBeenCalledWith(
      'throttle-block:default:ip:1',
      '1',
      'PX',
      5_000,
    );
    expect(record).toEqual({
      totalHits: 4,
      timeToExpire: 12,
      isBlocked: true,
      timeToBlockExpire: 5,
    });

    await storage.quit();
    expect(quitMock).toHaveBeenCalled();
  });
});
