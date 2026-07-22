-- Pryrox analytics schema (ClickHouse)
-- Apply: npm run clickhouse:migrate

CREATE DATABASE IF NOT EXISTS pryrox_analytics;

CREATE TABLE IF NOT EXISTS pryrox_analytics.sync_state
(
  stream LowCardinality(String),
  last_synced_at DateTime64(3, 'UTC'),
  rows_synced UInt64,
  updated_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY stream;

-- Null branch_id uses zero UUID (unknown / unset). No Nullable keys in ORDER BY.
CREATE TABLE IF NOT EXISTS pryrox_analytics.sales_fact
(
  sale_id UUID,
  pharmacy_id UUID,
  branch_id UUID DEFAULT toUUID('00000000-0000-0000-0000-000000000000'),
  cashier_id Nullable(UUID),
  customer_id Nullable(UUID),
  customer_name Nullable(String),
  created_at DateTime64(3, 'UTC'),
  total_amount Decimal(12, 2),
  insurance_amount Decimal(12, 2),
  customer_amount Decimal(12, 2),
  payment_method LowCardinality(String),
  status LowCardinality(String),
  _ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(_ingested_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (pharmacy_id, created_at, sale_id);

CREATE TABLE IF NOT EXISTS pryrox_analytics.sale_items_fact
(
  sale_item_id UUID,
  sale_id UUID,
  pharmacy_id UUID,
  branch_id UUID DEFAULT toUUID('00000000-0000-0000-0000-000000000000'),
  sold_at DateTime64(3, 'UTC'),
  medication_name String,
  category LowCardinality(String),
  quantity Int32,
  unit_price Decimal(12, 2),
  total_price Decimal(12, 2),
  _ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(_ingested_at)
PARTITION BY toYYYYMM(sold_at)
ORDER BY (pharmacy_id, sold_at, sale_id, sale_item_id);

CREATE TABLE IF NOT EXISTS pryrox_analytics.daily_sales_agg
(
  pharmacy_id UUID,
  branch_id UUID DEFAULT toUUID('00000000-0000-0000-0000-000000000000'),
  day Date,
  revenue Decimal(18, 2),
  orders UInt64,
  insurance_revenue Decimal(18, 2),
  customer_revenue Decimal(18, 2)
)
ENGINE = SummingMergeTree((revenue, orders, insurance_revenue, customer_revenue))
PARTITION BY toYYYYMM(day)
ORDER BY (pharmacy_id, day, branch_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS pryrox_analytics.daily_sales_mv
TO pryrox_analytics.daily_sales_agg
AS
SELECT
  pharmacy_id,
  ifNull(branch_id, toUUID('00000000-0000-0000-0000-000000000000')) AS branch_id,
  toDate(created_at) AS day,
  sum(total_amount) AS revenue,
  count() AS orders,
  sum(insurance_amount) AS insurance_revenue,
  sum(customer_amount) AS customer_revenue
FROM pryrox_analytics.sales_fact
WHERE status = 'completed'
GROUP BY pharmacy_id, branch_id, day;

CREATE TABLE IF NOT EXISTS pryrox_analytics.category_sales_agg
(
  pharmacy_id UUID,
  branch_id UUID DEFAULT toUUID('00000000-0000-0000-0000-000000000000'),
  day Date,
  category LowCardinality(String),
  revenue Decimal(18, 2),
  quantity Int64
)
ENGINE = SummingMergeTree((revenue, quantity))
PARTITION BY toYYYYMM(day)
ORDER BY (pharmacy_id, day, category, branch_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS pryrox_analytics.category_sales_mv
TO pryrox_analytics.category_sales_agg
AS
SELECT
  pharmacy_id,
  ifNull(branch_id, toUUID('00000000-0000-0000-0000-000000000000')) AS branch_id,
  toDate(sold_at) AS day,
  category,
  sum(total_price) AS revenue,
  sum(quantity) AS quantity
FROM pryrox_analytics.sale_items_fact
GROUP BY pharmacy_id, branch_id, day, category;
