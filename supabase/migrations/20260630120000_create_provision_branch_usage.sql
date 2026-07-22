-- Creates the provision_branch_usage function if it doesn't exist.
-- This function provisions branch usage records for subscriptions.

CREATE OR REPLACE FUNCTION public.provision_branch_usage(
  p_branch_id       uuid,
  p_pharmacy_id     uuid,
  p_subscription_id uuid,
  p_tx_limit        integer,
  p_period_start    date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_end date;
  v_id         uuid;
BEGIN
  v_period_end := (date_trunc('month', p_period_start) + interval '1 month - 1 day')::date;

  INSERT INTO public.branch_usage (
    branch_id, pharmacy_id, subscription_id,
    billing_cycle_start, billing_cycle_end,
    tx_count, tx_limit, is_blocked
  )
  VALUES (
    p_branch_id, p_pharmacy_id, p_subscription_id,
    date_trunc('month', p_period_start)::date, v_period_end,
    0, p_tx_limit, false
  )
  ON CONFLICT (branch_id, billing_cycle_start)
  DO UPDATE SET
    tx_limit        = EXCLUDED.tx_limit,
    subscription_id = EXCLUDED.subscription_id,
    is_blocked      = false,
    updated_at      = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
