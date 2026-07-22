-- Platform admin downloadable reports: metadata in Postgres, files in Storage.
-- Listed via GET /api/admin/reports/summary (service role signs URLs).
-- Created via POST /api/admin/reports (platform admin + service role upload).

CREATE TABLE IF NOT EXISTS public.platform_admin_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  storage_bucket text NOT NULL DEFAULT 'platform-reports',
  storage_object_path text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_admin_reports_generated_at
  ON public.platform_admin_reports (generated_at DESC);

ALTER TABLE public.platform_admin_reports ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.platform_admin_reports IS
  'Admin export catalog; binary at storage_bucket/storage_object_path. No client policies — use service role from Next.js API.';

-- Private bucket; access only through signed URLs created by the API.
INSERT INTO storage.buckets (id, name, public)
VALUES ('platform-reports', 'platform-reports', false)
ON CONFLICT (id) DO NOTHING;
