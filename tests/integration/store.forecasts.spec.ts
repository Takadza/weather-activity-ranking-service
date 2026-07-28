import { ForecastsRepository } from '../../src/store/forecasts.repository';
import { PrismaService } from '../../src/store/prisma.service';
import type { WeatherDay } from '../../src/scoring/types';

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

  afterAll(async () => {
    if (locationId) {
      await prisma.location.delete({ where: { id: locationId } });
    }
    await prisma.$disconnect();
  });

  it('keeps one row per location and date with the second write winning', async () => {
    const first: WeatherDay = {
      date: '2026-07-29',
      tempMaxC: 10,
      tempMinC: 2,
      precipMm: 1,
      precipProbPct: 20,
      windMaxKmh: 15,
      snowfallCm: 0,
      waveHeightM: 1.2,
      weatherCode: 2,
    };
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
});
