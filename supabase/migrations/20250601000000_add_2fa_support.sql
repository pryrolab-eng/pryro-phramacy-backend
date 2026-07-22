-- Add 2FA columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[];

-- Add 2FA session tracking
CREATE TABLE IF NOT EXISTS two_factor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  verified BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_2fa_sessions_token ON two_factor_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_2fa_sessions_user ON two_factor_sessions(user_id);

-- RLS policies
ALTER TABLE two_factor_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own 2FA sessions" ON two_factor_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own 2FA sessions" ON two_factor_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own 2FA sessions" ON two_factor_sessions
  FOR DELETE USING (auth.uid() = user_id);
