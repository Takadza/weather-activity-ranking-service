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
      where: { queryNormalized: { in: ['bergen', 'oslo'] } },
    });
    await prisma.location.deleteMany({
      where: {
        OR: [
          { latitude: 60.3913, longitude: 5.3221 },
          { latitude: 59.9139, longitude: 10.7522 },
        ],
      },
    });
    await prisma.$disconnect();
  });

  it('finds geocode cache by normalized query and returns null on miss', async () => {
    expect(await repository.findGeocodeCacheByQuery('oslo')).toBeNull();

    const location = await locations.findOrCreateLocation({
      name: 'Oslo',
      latitude: 59.9139,
      longitude: 10.7522,
    });
    const resultsJson = [
      {
        name: 'Oslo',
        country: 'Norway',
        admin1: null,
        latitude: 59.9139,
        longitude: 10.7522,
      },
    ];
    await repository.upsertGeocodeCache({
      queryNormalized: 'oslo',
      resultsJson,
      bestLocationId: location.id,
      fetchedAt: new Date('2026-07-29T00:00:00.000Z'),
    });

    const found = await repository.findGeocodeCacheByQuery('oslo');
    expect(found).not.toBeNull();
    expect(found?.queryNormalized).toBe('oslo');
    expect(found?.resultsJson).toEqual(resultsJson);
    expect(found?.bestLocationId).toBe(location.id);
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
