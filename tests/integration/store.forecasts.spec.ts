import { ForecastsRepository } from '../../src/store/forecasts.repository';
import { PrismaService } from '../../src/store/prisma.service';
import type { WeatherDay } from '../../src/scoring/types';

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
    const first = weatherDay('2026-07-29', 10);
    const second: WeatherDay = { ...first, tempMaxC: 11 };

    await repository.upsertForecastDays(locationId, [first]);
    await repository.upsertForecastDays(locationId, [second]);

    const stored = await repository.getForecastDays(locationId);
    const rowCount = await prisma.forecastDay.count({
      where: { locationId, forecastDate: new Date('2026-07-29T00:00:00Z') },
    });

    expect(rowCount).toBe(1);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual(second);
    expect(stored[0].tempMaxC).toBe(11);
  });

  it('removes dates omitted from a replacement forecast window', async () => {
    const stale = weatherDay('2026-07-28', 9);
    const retained = weatherDay('2026-07-29', 10);
    const replacement = { ...retained, tempMaxC: 11 };

    await repository.upsertForecastDays(locationId, [stale, retained]);
    await repository.upsertForecastDays(locationId, [replacement]);

    expect(await repository.getForecastDays(locationId)).toEqual([replacement]);
  });

  it('leaves existing forecasts unchanged when given no days', async () => {
    const existing = weatherDay('2026-07-29', 10);
    await repository.upsertForecastDays(locationId, [existing]);

    await repository.upsertForecastDays(locationId, []);

    expect(await repository.getForecastDays(locationId)).toEqual([existing]);
  });
});
