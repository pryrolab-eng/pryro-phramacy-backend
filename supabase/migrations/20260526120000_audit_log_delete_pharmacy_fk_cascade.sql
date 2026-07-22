-- Pharmacy DELETE (and CASCADE child deletes) must not insert audit_logs.pharmacy_id
-- pointing at a row that no longer exists (FK audit_logs_pharmacy_id_fkey).

CREATE OR REPLACE FUNCTION public.create_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  pharmacy_id_val uuid;
BEGIN
  IF TG_TABLE_NAME = 'pharmacies' THEN
    pharmacy_id_val := CASE
      WHEN TG_OP = 'DELETE' THEN NULL
      ELSE COALESCE(NEW.id, OLD.id)
    END;
  ELSE
    pharmacy_id_val := COALESCE(NEW.pharmacy_id, OLD.pharmacy_id);
  END IF;

  -- Child rows deleted via CASCADE after pharmacies row is gone: avoid FK violation.
  IF TG_OP = 'DELETE' AND pharmacy_id_val IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pharmacies p WHERE p.id = pharmacy_id_val
    ) THEN
      pharmacy_id_val := NULL;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    pharmacy_id,
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values
  ) VALUES (
    pharmacy_id_val,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
