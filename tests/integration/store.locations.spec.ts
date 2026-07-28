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
      where: { latitude: 55.111111, longitude: 44.222222 },
    });
    await prisma.$disconnect();
  });

  it('returns the same id for the same coordinates and does not overwrite name', async () => {
    const first = await repository.findOrCreateLocation({
      name: 'Original',
      country: 'NO',
      latitude: 55.111111,
      longitude: 44.222222,
    });
    const second = await repository.findOrCreateLocation({
      name: 'Changed',
      country: 'XX',
      latitude: 55.111111,
      longitude: 44.222222,
    });

    expect(second.id).toBe(first.id);
    expect(second.name).toBe('Original');
    expect(second.country).toBe('NO');
  });
});
