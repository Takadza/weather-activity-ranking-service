import { LocationsRepository } from '../../src/store/locations.repository';
import { PrismaService } from '../../src/store/prisma.service';

describe('LocationsRepository', () => {
  const prisma = new PrismaService();
  const repository = new LocationsRepository(prisma);

  const CAP_LAT_BASE = 57.11111;
  const CAP_LON_BASE = 46.22222;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.location.deleteMany({
      where: {
        OR: [
          { latitude: 55.11111, longitude: 44.22222 },
          { latitude: 56.11111, longitude: 45.22222 },
          {
            latitude: { gte: CAP_LAT_BASE, lte: CAP_LAT_BASE + 0.00005 },
            longitude: { gte: CAP_LON_BASE, lte: CAP_LON_BASE + 0.00005 },
          },
        ],
      },
    });
    await prisma.$disconnect();
  });

  it('returns the same id for the same coordinates and does not overwrite name', async () => {
    const first = await repository.findOrCreateLocation(
      {
        name: 'Original',
        country: 'NO',
        latitude: 55.111111,
        longitude: 44.222222,
      },
      { tracked: true },
    );
    const second = await repository.findOrCreateLocation({
      name: 'Changed',
      country: 'XX',
      latitude: 55.111111,
      longitude: 44.222222,
    });

    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Original');
    expect(second.country).toBe('NO');
    expect(first.tracked).toBe(true);
    expect(second.tracked).toBe(true);
  });

  it('lists only tracked locations for refresh', async () => {
    const tracked = await repository.findOrCreateLocation(
      {
        name: 'Tracked',
        latitude: 55.111111,
        longitude: 44.222222,
      },
      { tracked: true },
    );
    const untracked = await repository.findOrCreateLocation({
      name: 'Alt',
      latitude: 56.111111,
      longitude: 45.222222,
    });

    const listed = await repository.listTrackedLocations();
    const ids = listed.map((row) => row.id);
    expect(ids).toContain(tracked.id);
    expect(ids).not.toContain(untracked.id);

    await prisma.location.deleteMany({
      where: { id: { in: [tracked.id, untracked.id] } },
    });
  });

  it('tryPromoteTracked respects maxTracked and findOrCreateLocation does not bypass the cap', async () => {
    const baseline = await repository.countTrackedLocations();
    const cap = baseline + 1;

    const a = await repository.findOrCreateLocation(
      {
        name: 'Cap-A',
        latitude: CAP_LAT_BASE,
        longitude: CAP_LON_BASE,
      },
      { tracked: true, maxTracked: cap },
    );
    const b = await repository.findOrCreateLocation(
      {
        name: 'Cap-B',
        latitude: CAP_LAT_BASE + 0.00001,
        longitude: CAP_LON_BASE + 0.00001,
      },
      { tracked: true, maxTracked: cap },
    );

    expect(a.tracked).toBe(true);
    expect(b.tracked).toBe(false);

    const again = await repository.tryPromoteTracked(b.id, cap);
    expect(again.tracked).toBe(false);

    await prisma.location.deleteMany({
      where: { id: { in: [a.id, b.id] } },
    });
  });
});
