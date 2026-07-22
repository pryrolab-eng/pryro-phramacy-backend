-- Persist selected stock location on inventory rows.

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS stock_location_id uuid
  REFERENCES public.stock_locations(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_stock_location_id
  ON public.inventory(stock_location_id);
