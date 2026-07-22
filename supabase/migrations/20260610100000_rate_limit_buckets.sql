-- Step 13 — application rate limiting (auth + platform API)
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hit_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_updated_at
  ON public.rate_limit_buckets(updated_at);

COMMENT ON TABLE public.rate_limit_buckets IS
  'Sliding-window rate limit counters for auth and platform API enforcement.';
