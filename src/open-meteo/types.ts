export type GeocodeResult = {
  name: string;
  country: string | null;
  admin1: string | null;
  latitude: number;
  longitude: number;
};

export type OpenMeteoDailyForecast = {
  time: string[];
  temperature_2m_max?: Array<number | null>;
  temperature_2m_min?: Array<number | null>;
  precipitation_sum?: Array<number | null>;
  precipitation_probability_max?: Array<number | null>;
  wind_speed_10m_max?: Array<number | null>;
  snowfall_sum?: Array<number | null>;
  weather_code?: Array<number | null>;
  weathercode?: Array<number | null>;
};

export type OpenMeteoDailyMarine = {
  time: string[];
  wave_height_max?: Array<number | null>;
};

export type OpenMeteoForecastResponse = {
  daily?: OpenMeteoDailyForecast;
};

export type OpenMeteoMarineResponse = {
  daily?: OpenMeteoDailyMarine;
};

export type OpenMeteoGeocodeResponse = {
  results?: Array<{
    name?: string;
    country?: string | null;
    admin1?: string | null;
    latitude?: number;
    longitude?: number;
  }>;
};
