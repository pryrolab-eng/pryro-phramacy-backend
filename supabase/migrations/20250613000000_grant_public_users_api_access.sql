-- public.users is the app profile table (synced from auth via triggers).
-- The PostgREST "authenticated" role must have table privileges; RLS alone does not grant SELECT/INSERT/UPDATE.
-- Without this, API calls can fail with: permission denied for table users
GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;

-- Prefer matching on primary key id (uuid) — same as auth.users.id from handle_new_user().
DROP POLICY IF EXISTS "Users can view own data" ON public.users;
CREATE POLICY "Users can view own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own data" ON public.users;
CREATE POLICY "Users can update own data" ON public.users
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own data" ON public.users;
CREATE POLICY "Users can insert own data" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);
