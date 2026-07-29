-- AlterTable
ALTER TABLE "locations" ADD COLUMN "tracked" BOOLEAN NOT NULL DEFAULT false;

-- One-time upgrade tradeoff: preserve refresh coverage for locations that
-- already exist. Alternatives created after this migration are untracked.
-- Operators may manually set tracked=false for non-primary rows if needed.
UPDATE "locations" SET "tracked" = true;

-- CreateIndex
CREATE INDEX "locations_tracked_idx" ON "locations"("tracked");
