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
    const fetchedAt = new Date();

    await this.prisma.$transaction(
      days.map((day) => {
        const forecastDate = new Date(`${day.date}T00:00:00.000Z`);
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

        return this.prisma.forecastDay.upsert({
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
      }),
    );
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
