import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool, type PoolClient } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly connectionString: string;
  /** Dedicated pool so session advisory locks stay on one client. */
  private readonly leadershipPool: Pool;

  constructor(@Optional() config?: ConfigService) {
    const connectionString =
      config?.get<string>('databaseUrl') || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }

    super({
      adapter: new PrismaPg({ connectionString }),
    });

    this.connectionString = connectionString;
    this.leadershipPool = new Pool({
      connectionString,
      max: 2,
      allowExitOnIdle: true,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.leadershipPool.end();
  }

  /**
   * Run `work` while holding a Postgres session advisory lock on a pinned
   * client (safe with connection pooling). Returns false if the lock was not
   * acquired.
   */
  async withAdvisoryLock(
    key: number,
    work: () => Promise<void>,
  ): Promise<boolean> {
    const client: PoolClient = await this.leadershipPool.connect();
    try {
      const result = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [key],
      );
      if (result.rows[0]?.locked !== true) {
        return false;
      }
      try {
        await work();
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [key]);
      }
      return true;
    } finally {
      client.release();
    }
  }
}
