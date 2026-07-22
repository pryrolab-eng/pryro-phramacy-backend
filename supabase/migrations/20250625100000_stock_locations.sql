-- Stock locations (warehouses / storage areas within a pharmacy)

CREATE TABLE IF NOT EXISTS public.stock_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  description text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_locations_pharmacy
  ON public.stock_locations(pharmacy_id);

CREATE INDEX IF NOT EXISTS idx_stock_locations_active
  ON public.stock_locations(is_active);

ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'stock_locations' AND policyname = 'stock_locations_select_own'
  ) THEN
    CREATE POLICY stock_locations_select_own ON public.stock_locations
      FOR SELECT
      USING (
        pharmacy_id IN (
          SELECT pharmacy_id FROM public.pharmacy_users
          WHERE user_id = auth.uid() AND is_active = true
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'stock_locations' AND policyname = 'stock_locations_insert_own'
  ) THEN
    CREATE POLICY stock_locations_insert_own ON public.stock_locations
      FOR INSERT
      WITH CHECK (
        pharmacy_id IN (
          SELECT pharmacy_id FROM public.pharmacy_users
          WHERE user_id = auth.uid() AND is_active = true
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'stock_locations' AND policyname = 'stock_locations_update_own'
  ) THEN
    CREATE POLICY stock_locations_update_own ON public.stock_locations
      FOR UPDATE
      USING (
        pharmacy_id IN (
          SELECT pharmacy_id FROM public.pharmacy_users
          WHERE user_id = auth.uid() AND is_active = true
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_stock_locations_updated_at'
      AND event_object_table = 'stock_locations'
  ) THEN
    CREATE TRIGGER update_stock_locations_updated_at
      BEFORE UPDATE ON public.stock_locations
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
