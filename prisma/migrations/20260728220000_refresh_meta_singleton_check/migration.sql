-- Enforce singleton refresh_meta row (id must always be 1)
ALTER TABLE "refresh_meta" ADD CONSTRAINT "refresh_meta_singleton_id" CHECK (id = 1);
