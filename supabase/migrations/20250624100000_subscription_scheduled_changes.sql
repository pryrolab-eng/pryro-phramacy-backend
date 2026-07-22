-- Scheduled subscription plan changes (v1: downgrades at period end)

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS next_plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS change_scheduled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS change_type text,
  ADD COLUMN IF NOT EXISTS pending_change_status text;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_change_type_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_change_type_check
  CHECK (change_type IS NULL OR change_type = 'downgrade');

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_pending_change_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_pending_change_status_check
  CHECK (
    pending_change_status IS NULL
    OR pending_change_status IN ('scheduled', 'applied', 'canceled')
  );

CREATE INDEX IF NOT EXISTS idx_subscriptions_scheduled_changes
  ON public.subscriptions (change_scheduled_at)
  WHERE pending_change_status = 'scheduled' AND next_plan_id IS NOT NULL;

COMMENT ON COLUMN public.subscriptions.next_plan_id IS 'Target catalog plan applied at change_scheduled_at (downgrade v1)';
COMMENT ON COLUMN public.subscriptions.change_scheduled_at IS 'When the scheduled change takes effect (typically expires_at)';
COMMENT ON COLUMN public.subscriptions.change_type IS 'downgrade (v1)';
COMMENT ON COLUMN public.subscriptions.pending_change_status IS 'scheduled | applied | canceled';

-- Support / audit trail for subscription transitions
CREATE TABLE IF NOT EXISTS public.subscription_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  event text NOT NULL CHECK (
    event IN ('downgrade_scheduled', 'downgrade_applied', 'downgrade_canceled')
  ),
  from_plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  to_plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_change_events_pharmacy
  ON public.subscription_change_events (pharmacy_id, created_at DESC);

ALTER TABLE public.subscription_change_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscription_change_events' AND policyname = 'subscription_change_events_select_own'
  ) THEN
    CREATE POLICY subscription_change_events_select_own
      ON public.subscription_change_events FOR SELECT
      USING (
        pharmacy_id IN (
          SELECT pharmacy_id FROM public.pharmacy_users
          WHERE user_id = auth.uid() AND is_active = true
        )
      );
  END IF;
END $$;
