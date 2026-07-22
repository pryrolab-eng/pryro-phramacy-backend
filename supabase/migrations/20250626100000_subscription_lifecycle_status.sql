-- Canonical subscription lifecycle statuses (unified orchestrator)
-- status is authoritative; is_active is derived at write time

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (
    status IN (
      'active',
      'pending',
      'pending_payment',
      'scheduled_change',
      'cancelled',
      'expired',
      'past_due'
    )
  );

-- Backfill from legacy is_active / payment_method / scheduled change fields
UPDATE public.subscriptions
SET status = 'pending_payment'
WHERE status = 'pending'
  AND COALESCE(is_active, false) = false
  AND COALESCE(payment_method, '') IN ('pending', '');

UPDATE public.subscriptions
SET status = 'scheduled_change'
WHERE pending_change_status = 'scheduled'
  AND next_plan_id IS NOT NULL
  AND status IN ('active', 'pending');

UPDATE public.subscriptions
SET status = 'active', is_active = true
WHERE COALESCE(is_active, false) = true
  AND status IN ('pending', 'active')
  AND (pending_change_status IS NULL OR pending_change_status <> 'scheduled');

UPDATE public.subscriptions
SET status = 'cancelled', is_active = false
WHERE COALESCE(payment_method, '') = 'cancelled'
  AND COALESCE(is_active, false) = false
  AND status NOT IN ('expired', 'cancelled');

COMMENT ON COLUMN public.subscriptions.status IS
  'Canonical lifecycle: pending_payment | active | scheduled_change | cancelled | expired | past_due (legacy pending mapped on read)';
