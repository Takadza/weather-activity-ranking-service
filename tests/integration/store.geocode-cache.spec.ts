import { GeocodeCacheRepository } from '../../src/store/geocode-cache.repository';
import { LocationsRepository } from '../../src/store/locations.repository';
import { PrismaService } from '../../src/store/prisma.service';

describe('GeocodeCacheRepository', () => {
  const prisma = new PrismaService();
  const locations = new LocationsRepository(prisma);
  const repository = new GeocodeCacheRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.geocodeCache.deleteMany({
      where: { queryNormalized: 'bergen' },
    });
    await prisma.location.deleteMany({
      where: { latitude: 60.3913, longitude: 5.3221 },
    });
    await prisma.$disconnect();
  });

  it('upserts geocode cache by normalized query', async () => {
    const location = await locations.findOrCreateLocation({
      name: 'Bergen',
      latitude: 60.3913,
      longitude: 5.3221,
    });

    const first = await repository.upsertGeocodeCache({
      queryNormalized: 'bergen',
      resultsJson: [{ name: 'Bergen' }],
      bestLocationId: location.id,
      fetchedAt: new Date('2026-07-29T00:00:00.000Z'),
    });
    const second = await repository.upsertGeocodeCache({
      queryNormalized: 'bergen',
      resultsJson: [{ name: 'Bergen' }, { name: 'Bergen Municipality' }],
      bestLocationId: location.id,
      fetchedAt: new Date('2026-07-29T01:00:00.000Z'),
    });

    expect(second.id).toBe(first.id);
    expect(second.resultsJson).toEqual([
      { name: 'Bergen' },
      { name: 'Bergen Municipality' },
    ]);
  });
});
