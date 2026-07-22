-- Daily closes table for audit trail of end-of-day reports.
-- Idempotent: uses IF NOT EXISTS for safe re-runs.

CREATE TABLE IF NOT EXISTS public.daily_closes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id     UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  close_date      DATE NOT NULL,
  total_sales     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_transactions INT NOT NULL DEFAULT 0,
  cash_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  card_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  mobile_money_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  insurance_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  mixed_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  closed_by       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  closed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_closes_branch_date
  ON public.daily_closes(branch_id, close_date);

CREATE INDEX IF NOT EXISTS idx_daily_closes_pharmacy_id
  ON public.daily_closes(pharmacy_id);

-- Enable RLS
ALTER TABLE public.daily_closes ENABLE ROW LEVEL SECURITY;

-- Service role full access (matches other tables)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'daily_closes' AND policyname = 'Service role full access on daily_closes'
  ) THEN
    CREATE POLICY "Service role full access on daily_closes"
      ON public.daily_closes
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
