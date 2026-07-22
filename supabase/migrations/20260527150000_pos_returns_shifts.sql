-- POS returns (restock rules) + cashier shifts

CREATE TYPE return_disposition AS ENUM ('restock', 'damaged', 'destroy');
CREATE TYPE return_type AS ENUM ('return', 'refund', 'exchange');
CREATE TYPE cashier_shift_status AS ENUM ('open', 'closed');

ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS return_type return_type DEFAULT 'return',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS refund_method text;

ALTER TABLE return_items
  ADD COLUMN IF NOT EXISTS sale_item_id uuid REFERENCES sale_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_id uuid REFERENCES inventory(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disposition return_disposition NOT NULL DEFAULT 'restock',
  ADD COLUMN IF NOT EXISTS batch_number text,
  ADD COLUMN IF NOT EXISTS expiry_date date;

CREATE TABLE IF NOT EXISTS cashier_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  cashier_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status cashier_shift_status NOT NULL DEFAULT 'open',
  opening_cash decimal(12,2) NOT NULL DEFAULT 0,
  expected_cash decimal(12,2),
  actual_cash decimal(12,2),
  cash_variance decimal(12,2),
  total_sales decimal(12,2) DEFAULT 0,
  total_refunds decimal(12,2) DEFAULT 0,
  transaction_count integer DEFAULT 0,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  close_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cashier_shifts_one_open_per_cashier_branch
  ON cashier_shifts (cashier_id, branch_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_cashier_shifts_pharmacy_branch ON cashier_shifts (pharmacy_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_opened_at ON cashier_shifts (opened_at DESC);

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES cashier_shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_shift_id ON sales (shift_id);

ALTER PUBLICATION supabase_realtime ADD TABLE cashier_shifts;

CREATE TRIGGER update_cashier_shifts_updated_at
  BEFORE UPDATE ON cashier_shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
