-- Re-create SaaS usage RPC helpers when missing from earlier migrations.

CREATE OR REPLACE FUNCTION public.check_branch_can_transact(p_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage public.branch_usage%ROWTYPE;
  v_today date := CURRENT_DATE;
BEGIN
  SELECT * INTO v_usage
  FROM public.branch_usage
  WHERE branch_id = p_branch_id
    AND billing_cycle_start <= v_today
    AND billing_cycle_end   >= v_today
  ORDER BY billing_cycle_start DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason',  'no_subscription',
      'message', 'This branch has no active subscription.'
    );
  END IF;

  IF v_usage.is_blocked OR v_usage.tx_count >= v_usage.tx_limit THEN
    RETURN jsonb_build_object(
      'allowed',   false,
      'reason',    'limit_reached',
      'tx_count',  v_usage.tx_count,
      'tx_limit',  v_usage.tx_limit,
      'message',   'Transaction limit reached. Upgrade plan or add subscription.'
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed',   true,
    'tx_count',  v_usage.tx_count,
    'tx_limit',  v_usage.tx_limit,
    'remaining', v_usage.tx_limit - v_usage.tx_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_branch_tx(p_branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage     public.branch_usage%ROWTYPE;
  v_today     date := CURRENT_DATE;
  v_new_count integer;
  v_blocked   boolean;
BEGIN
  SELECT * INTO v_usage
  FROM public.branch_usage
  WHERE branch_id = p_branch_id
    AND billing_cycle_start <= v_today
    AND billing_cycle_end   >= v_today
  ORDER BY billing_cycle_start DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_usage_record');
  END IF;

  v_new_count := v_usage.tx_count + 1;
  v_blocked   := v_new_count >= v_usage.tx_limit;

  UPDATE public.branch_usage
  SET tx_count   = v_new_count,
      is_blocked = v_blocked,
      updated_at = now()
  WHERE id = v_usage.id;

  RETURN jsonb_build_object(
    'ok',        true,
    'tx_count',  v_new_count,
    'tx_limit',  v_usage.tx_limit,
    'remaining', v_usage.tx_limit - v_new_count,
    'blocked',   v_blocked
  );
END;
$$;
