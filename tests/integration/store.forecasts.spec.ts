import type { WeatherDay } from '../../src/scoring/types';
import { ForecastsRepository } from '../../src/store/forecasts.repository';
import { PrismaService } from '../../src/store/prisma.service';

function weatherDay(date: string, tempMaxC: number): WeatherDay {
  return {
    date,
    tempMaxC,
    tempMinC: 2,
    precipMm: 1,
    precipProbPct: 20,
    windMaxKmh: 15,
    snowfallCm: 0,
    waveHeightM: 1.2,
    weatherCode: 2,
  };
}

function utcDateOffset(daysFromToday: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

describe('ForecastsRepository', () => {
  const prisma = new PrismaService();
  const repository = new ForecastsRepository(prisma);
  let locationId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.location.deleteMany({
      where: { latitude: 12.345678, longitude: 98.765432 },
    });
    const location = await prisma.location.create({
      data: {
        name: 'TDD Test Location',
        latitude: 12.345678,
        longitude: 98.765432,
      },
    });
    locationId = location.id;
  });

  beforeEach(async () => {
    await prisma.forecastDay.deleteMany({ where: { locationId } });
  });

  afterAll(async () => {
    if (locationId) {
      await prisma.location.delete({ where: { id: locationId } });
    }
    await prisma.$disconnect();
  });

  it('keeps one row per location and date with the second write winning', async () => {
    const date = utcDateOffset(1);
    const first = weatherDay(date, 10);
    const second: WeatherDay = { ...first, tempMaxC: 11 };

    await repository.upsertForecastDays(locationId, [first]);
    await repository.upsertForecastDays(locationId, [second]);

    const stored = await repository.getForecastDays(locationId);
    const rowCount = await prisma.forecastDay.count({
      where: { locationId, forecastDate: new Date(`${date}T00:00:00Z`) },
    });

    expect(rowCount).toBe(1);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual(second);
    expect(stored[0].tempMaxC).toBe(11);
  });

  it('removes omitted dates only inside the payload window', async () => {
    const d0 = utcDateOffset(1);
    const d1 = utcDateOffset(2);
    const d2 = utcDateOffset(3);

    await repository.upsertForecastDays(locationId, [
      weatherDay(d0, 9),
      weatherDay(d1, 10),
      weatherDay(d2, 11),
    ]);
    await repository.upsertForecastDays(locationId, [
      weatherDay(d0, 12),
      weatherDay(d2, 13),
    ]);

    expect(await repository.getForecastDays(locationId)).toEqual([
      weatherDay(d0, 12),
      weatherDay(d2, 13),
    ]);
  });

  it('keeps dates outside a truncated payload span', async () => {
    const outsideBefore = utcDateOffset(1);
    const windowStart = utcDateOffset(2);
    const windowEnd = utcDateOffset(3);
    const outsideAfter = utcDateOffset(5);

    await repository.upsertForecastDays(locationId, [
      weatherDay(outsideBefore, 1),
      weatherDay(windowStart, 2),
      weatherDay(windowEnd, 3),
      weatherDay(outsideAfter, 4),
    ]);
    await repository.upsertForecastDays(locationId, [
      weatherDay(windowStart, 20),
    ]);

    expect(await repository.getForecastDays(locationId)).toEqual([
      weatherDay(outsideBefore, 1),
      weatherDay(windowStart, 20),
      weatherDay(windowEnd, 3),
      weatherDay(outsideAfter, 4),
    ]);
  });

  it('prunes past forecast dates on upsert', async () => {
    const past = utcDateOffset(-1);
    const future = utcDateOffset(1);

    await prisma.forecastDay.create({
      data: {
        locationId,
        forecastDate: new Date(`${past}T00:00:00.000Z`),
        tempMaxC: 5,
        fetchedAt: new Date(),
      },
    });
    await repository.upsertForecastDays(locationId, [weatherDay(future, 8)]);

    expect(await repository.getForecastDays(locationId)).toEqual([
      weatherDay(future, 8),
    ]);
  });

  it('leaves existing forecasts unchanged when given no days', async () => {
    const existing = weatherDay(utcDateOffset(1), 10);
    await repository.upsertForecastDays(locationId, [existing]);

    await repository.upsertForecastDays(locationId, []);

    expect(await repository.getForecastDays(locationId)).toEqual([existing]);
  });

  it('rejects malformed forecast dates', async () => {
    await expect(
      repository.upsertForecastDays(locationId, [weatherDay('not-a-date', 1)]),
    ).rejects.toThrow(/Invalid forecast date/);
  });

  it('returns latest fetchedAt via getForecastMeta', async () => {
    const date = utcDateOffset(1);
    await repository.upsertForecastDays(locationId, [weatherDay(date, 10)]);
    const meta = await repository.getForecastMeta(locationId);
    expect(meta.fetchedAt).toBeInstanceOf(Date);
  });
});
