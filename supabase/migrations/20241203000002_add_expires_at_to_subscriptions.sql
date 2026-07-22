-- Add missing columns to subscriptions table
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_method text;
