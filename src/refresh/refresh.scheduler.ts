import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RefreshService } from './refresh.service';

@Injectable()
export class RefreshScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RefreshScheduler.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly refresh: RefreshService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const intervalMs = this.config.get<number>('refreshIntervalMs', 21600000);
    void this.safeRun();
    this.timer = setInterval(() => {
      void this.safeRun();
    }, intervalMs);
    this.logger.log(`Refresh scheduled every ${intervalMs}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async safeRun(): Promise<void> {
    try {
      await this.refresh.runCycle();
    } catch (err) {
      this.logger.error(
        `Refresh cycle crashed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
