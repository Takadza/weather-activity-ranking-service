import { LocationsRepository } from '../../src/store/locations.repository';
import { PrismaService } from '../../src/store/prisma.service';

describe('LocationsRepository', () => {
  const prisma = new PrismaService();
  const repository = new LocationsRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.location.deleteMany({
      where: {
        OR: [
          { latitude: 55.11111, longitude: 44.22222 },
          { latitude: 56.11111, longitude: 45.22222 },
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
});
