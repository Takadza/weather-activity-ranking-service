import { PrismaService } from '../../src/store/prisma.service';
import { RefreshMetaRepository } from '../../src/store/refresh-meta.repository';

describe('RefreshMetaRepository', () => {
  const prisma = new PrismaService();
  const repository = new RefreshMetaRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.refreshMeta.deleteMany();
  });

  afterAll(async () => {
    await prisma.refreshMeta.deleteMany();
    await prisma.$disconnect();
  });

  it('clears lastError when a failure is followed by success', async () => {
    await repository.recordRefreshFailure('provider down');
    let meta = await repository.getRefreshMeta();
    expect(meta.lastError).toBe('provider down');
    expect(meta.lastSuccessAt).toBeNull();

    await repository.recordRefreshSuccess();
    meta = await repository.getRefreshMeta();
    expect(meta.lastError).toBeNull();
    expect(meta.lastSuccessAt).toBeInstanceOf(Date);
    expect(meta.lastAttemptAt).toBeInstanceOf(Date);
  });
});
