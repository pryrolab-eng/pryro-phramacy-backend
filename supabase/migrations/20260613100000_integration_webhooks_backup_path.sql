-- Integration webhooks for external developers + backup file paths

ALTER TABLE backups
  ADD COLUMN IF NOT EXISTS file_path text;

CREATE TABLE IF NOT EXISTS integration_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text,
  events text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_webhooks_api_key
  ON integration_webhooks (api_key_id);

CREATE INDEX IF NOT EXISTS idx_integration_webhooks_active
  ON integration_webhooks (is_active);

CREATE TABLE IF NOT EXISTS integration_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES integration_webhooks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  response_status int,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_integration_webhook_deliveries_pending
  ON integration_webhook_deliveries (status, created_at)
  WHERE status = 'pending';
