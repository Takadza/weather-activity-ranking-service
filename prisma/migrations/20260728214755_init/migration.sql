-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "admin1" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geocode_cache" (
    "id" UUID NOT NULL,
    "query_normalized" TEXT NOT NULL,
    "results_json" JSONB NOT NULL,
    "best_location_id" UUID,
    "fetched_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geocode_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_days" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "forecast_date" DATE NOT NULL,
    "temp_max_c" DOUBLE PRECISION,
    "temp_min_c" DOUBLE PRECISION,
    "precip_mm" DOUBLE PRECISION,
    "precip_prob_pct" DOUBLE PRECISION,
    "wind_max_kmh" DOUBLE PRECISION,
    "snowfall_cm" DOUBLE PRECISION,
    "wave_height_m" DOUBLE PRECISION,
    "weather_code" INTEGER,
    "raw_json" JSONB,
    "fetched_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forecast_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_meta" (
    "id" INTEGER NOT NULL,
    "last_success_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,

    CONSTRAINT "refresh_meta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_latitude_longitude_key" ON "locations"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "geocode_cache_query_normalized_key" ON "geocode_cache"("query_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_days_location_id_forecast_date_key" ON "forecast_days"("location_id", "forecast_date");

-- AddForeignKey
ALTER TABLE "geocode_cache" ADD CONSTRAINT "geocode_cache_best_location_id_fkey" FOREIGN KEY ("best_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_days" ADD CONSTRAINT "forecast_days_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
