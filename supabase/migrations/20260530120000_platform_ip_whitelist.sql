-- Platform-level IP whitelist rows use pharmacy_id IS NULL (admin-managed).
ALTER TABLE public.ip_whitelist
  ALTER COLUMN pharmacy_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ip_whitelist_platform
  ON public.ip_whitelist (pharmacy_id)
  WHERE pharmacy_id IS NULL;
