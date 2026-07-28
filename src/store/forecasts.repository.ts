import { Injectable } from '@nestjs/common';
import type { WeatherDay } from '../scoring/types';
import { PrismaService } from './prisma.service';

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
    const forecastDates = days.map(
      (day) => new Date(`${day.date}T00:00:00.000Z`),
    );

    await this.prisma.$transaction(async (transaction) => {
      await transaction.forecastDay.deleteMany({
        where: {
          locationId,
          forecastDate: { notIn: forecastDates },
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
}
