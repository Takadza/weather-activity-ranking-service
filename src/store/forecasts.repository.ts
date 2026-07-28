import { Injectable } from '@nestjs/common';
import type { WeatherDay } from '../scoring/types';
import { PrismaService } from './prisma.service';
import type { ForecastMeta } from './types';

const FORECAST_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseForecastDate(date: string): Date {
  if (!FORECAST_DATE_RE.test(date)) {
    throw new Error(`Invalid forecast date: ${date}`);
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid forecast date: ${date}`);
  }
  return parsed;
}

function startOfUtcDay(date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

@Injectable()
export class ForecastsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertForecastDays(
    locationId: string,
    days: WeatherDay[],
  ): Promise<void> {
    // Empty payload is a no-op so a bad/empty provider response cannot wipe
    // last-known-good forecasts (stale-over-empty). Use an explicit clear API
    // if wipe semantics are ever required.
    if (days.length === 0) {
      return;
    }

    const fetchedAt = new Date();
    const forecastDates = days.map((day) => parseForecastDate(day.date));
    const windowStart = new Date(
      Math.min(...forecastDates.map((d) => d.getTime())),
    );
    const windowEnd = new Date(
      Math.max(...forecastDates.map((d) => d.getTime())),
    );
    const today = startOfUtcDay();

    await this.prisma.$transaction(async (transaction) => {
      // Serialize concurrent refresh/cold-start writers for the same location.
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${locationId}))
      `;

      // Drop past days always; inside the payload range, drop dates not present
      // so a truncated payload cannot erase days outside its span.
      await transaction.forecastDay.deleteMany({
        where: {
          locationId,
          OR: [
            { forecastDate: { lt: today } },
            {
              forecastDate: {
                gte: windowStart,
                lte: windowEnd,
                notIn: forecastDates,
              },
            },
          ],
        },
      });

      for (const [index, day] of days.entries()) {
        const forecastDate = forecastDates[index];
        const values = {
          tempMaxC: day.tempMaxC,
          tempMinC: day.tempMinC,
          precipMm: day.precipMm,
          precipProbPct: day.precipProbPct,
          windMaxKmh: day.windMaxKmh,
          snowfallCm: day.snowfallCm,
          waveHeightM: day.waveHeightM,
          weatherCode: day.weatherCode,
          fetchedAt,
        };

        await transaction.forecastDay.upsert({
          where: {
            locationId_forecastDate: { locationId, forecastDate },
          },
          create: {
            locationId,
            forecastDate,
            ...values,
          },
          update: values,
        });
      }
    });
  }

  async getForecastDays(locationId: string): Promise<WeatherDay[]> {
    const days = await this.prisma.forecastDay.findMany({
      where: { locationId },
      orderBy: { forecastDate: 'asc' },
    });

    return days.map((day) => ({
      date: day.forecastDate.toISOString().slice(0, 10),
      tempMaxC: day.tempMaxC,
      tempMinC: day.tempMinC,
      precipMm: day.precipMm,
      precipProbPct: day.precipProbPct,
      windMaxKmh: day.windMaxKmh,
      snowfallCm: day.snowfallCm,
      waveHeightM: day.waveHeightM,
      weatherCode: day.weatherCode,
    }));
  }

  async getForecastMeta(locationId: string): Promise<ForecastMeta> {
    const latest = await this.prisma.forecastDay.findFirst({
      where: { locationId },
      orderBy: { fetchedAt: 'desc' },
      select: { fetchedAt: true },
    });
    return { fetchedAt: latest?.fetchedAt ?? null };
  }
}
