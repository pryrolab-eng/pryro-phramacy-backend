-- Fix pharmacy delete + audit trigger FK conflict.
-- On DELETE of pharmacies, the row no longer exists when AFTER trigger inserts audit_logs,
-- so audit_logs.pharmacy_id FK can fail. Store pharmacy_id as NULL for that specific case.

CREATE OR REPLACE FUNCTION public.create_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  pharmacy_id_val uuid;
BEGIN
  -- Special case: deleting from pharmacies itself.
  -- Keep record_id/old_values for traceability, but avoid FK violation.
  IF TG_TABLE_NAME = 'pharmacies' AND TG_OP = 'DELETE' THEN
    pharmacy_id_val := NULL;
  ELSIF TG_TABLE_NAME = 'pharmacies' THEN
    pharmacy_id_val := COALESCE(NEW.id, OLD.id);
  ELSE
    pharmacy_id_val := COALESCE(NEW.pharmacy_id, OLD.pharmacy_id);
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

