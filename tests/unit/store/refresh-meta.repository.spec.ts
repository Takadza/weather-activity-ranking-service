import { RefreshMetaRepository } from '../../../src/store/refresh-meta.repository';

describe('RefreshMetaRepository.getRefreshMeta', () => {
  it('reads without writing when the singleton row is missing', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const upsert = jest.fn();
    const prisma = {
      refreshMeta: { findUnique, upsert },
    };
    const repository = new RefreshMetaRepository(prisma as never);

    const meta = await repository.getRefreshMeta();

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(upsert).not.toHaveBeenCalled();
    expect(meta).toEqual({
      id: 1,
      lastSuccessAt: null,
      lastAttemptAt: null,
      lastError: null,
    });
  });

  it('returns the existing row when present', async () => {
    const row = {
      id: 1,
      lastSuccessAt: new Date('2026-07-28T12:00:00.000Z'),
      lastAttemptAt: new Date('2026-07-28T12:00:00.000Z'),
      lastError: null,
    };
    const findUnique = jest.fn().mockResolvedValue(row);
    const upsert = jest.fn();
    const prisma = {
      refreshMeta: { findUnique, upsert },
    };
    const repository = new RefreshMetaRepository(prisma as never);

    await expect(repository.getRefreshMeta()).resolves.toEqual(row);
    expect(upsert).not.toHaveBeenCalled();
  });
});
