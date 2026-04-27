-- Track which Owl's Eye search categories have been fetched for each run.
-- Enables targeted backfills when new categories are added (hybrid Option B/C versioning)
-- so existing runs are not re-fetched unnecessarily.
-- NULL = legacy run (pre-versioning); treat as needing a full run.
ALTER TABLE owls_eye_runs
  ADD COLUMN IF NOT EXISTS categories_fetched text[] DEFAULT NULL;

-- GIN index supports future @> containment queries (e.g. "runs missing category X").
CREATE INDEX IF NOT EXISTS idx_owls_eye_runs_categories_fetched
  ON owls_eye_runs USING GIN (categories_fetched);
