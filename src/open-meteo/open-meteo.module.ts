import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenMeteoClient } from './client';

@Module({
  providers: [
    {
      provide: OpenMeteoClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new OpenMeteoClient({
          timeoutMs: config.get<number>('openMeteoTimeoutMs', 5000),
        }),
    },
  ],
  exports: [OpenMeteoClient],
})
export class OpenMeteoModule {}
