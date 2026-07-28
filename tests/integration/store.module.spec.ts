import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import configuration from '../../src/config/configuration';
import { ForecastsRepository } from '../../src/store/forecasts.repository';
import { GeocodeCacheRepository } from '../../src/store/geocode-cache.repository';
import { LocationsRepository } from '../../src/store/locations.repository';
import { PrismaService } from '../../src/store/prisma.service';
import { RefreshMetaRepository } from '../../src/store/refresh-meta.repository';
import { StoreModule } from '../../src/store/store.module';

describe('StoreModule', () => {
  it('boots and resolves store providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        StoreModule,
      ],
    }).compile();

    await moduleRef.init();

    expect(moduleRef.get(PrismaService)).toBeDefined();
    expect(moduleRef.get(LocationsRepository)).toBeDefined();
    expect(moduleRef.get(ForecastsRepository)).toBeDefined();
    expect(moduleRef.get(GeocodeCacheRepository)).toBeDefined();
    expect(moduleRef.get(RefreshMetaRepository)).toBeDefined();

    await moduleRef.close();
  });
});
