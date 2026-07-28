export type LocationRow = {
  id: string;
  name: string;
  country: string | null;
  admin1: string | null;
  latitude: number;
  longitude: number;
  createdAt: Date;
  updatedAt: Date;
};

export type GeocodeCacheRow = {
  id: string;
  queryNormalized: string;
  resultsJson: unknown;
  bestLocationId: string | null;
  fetchedAt: Date;
};

export type RefreshMetaRow = {
  id: number;
  lastSuccessAt: Date | null;
  lastAttemptAt: Date | null;
  lastError: string | null;
};

export type ForecastMeta = {
  fetchedAt: Date | null;
};
