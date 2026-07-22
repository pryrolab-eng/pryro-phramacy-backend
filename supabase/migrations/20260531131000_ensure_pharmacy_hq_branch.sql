-- Prevent duplicate auto-provisioned HQ branches (race on concurrent session/API calls).

CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_one_hq_per_pharmacy
  ON public.branches (pharmacy_id)
  WHERE is_headquarters = true AND is_active = true;

CREATE OR REPLACE FUNCTION public.ensure_pharmacy_hq_branch(p_pharmacy_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id uuid;
  v_pharmacy record;
BEGIN
  IF p_pharmacy_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Serialize HQ creation per pharmacy (fixes parallel /api/me/context races).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_pharmacy_id::text, 0));

  SELECT id INTO v_branch_id
  FROM public.branches
  WHERE pharmacy_id = p_pharmacy_id
    AND is_active = true
  ORDER BY is_headquarters DESC, created_at ASC
  LIMIT 1;

  IF v_branch_id IS NOT NULL THEN
    RETURN v_branch_id;
  END IF;

  SELECT name, address, phone, email
  INTO v_pharmacy
  FROM public.pharmacies
  WHERE id = p_pharmacy_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO public.branches (
      pharmacy_id,
      name,
      address,
      phone,
      email,
      is_active,
      is_headquarters
    ) VALUES (
      p_pharmacy_id,
      'Headquarters (HQ)',
      v_pharmacy.address,
      v_pharmacy.phone,
      v_pharmacy.email,
      true,
      true
    );
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  SELECT id INTO v_branch_id
  FROM public.branches
  WHERE pharmacy_id = p_pharmacy_id
    AND is_active = true
  ORDER BY is_headquarters DESC, created_at ASC
  LIMIT 1;

  RETURN v_branch_id;
END;
$$;

COMMENT ON FUNCTION public.ensure_pharmacy_hq_branch(uuid) IS
  'Returns active default branch for pharmacy; creates HQ once under advisory lock.';

GRANT EXECUTE ON FUNCTION public.ensure_pharmacy_hq_branch(uuid) TO service_role;
