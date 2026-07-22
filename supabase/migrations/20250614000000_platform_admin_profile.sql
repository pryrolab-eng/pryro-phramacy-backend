-- Platform operators (Pryrox staff) are flagged on public.users, not pharmacy_users.
-- Legacy: admin was a synthetic row on pharmacy 00000000-0000-0000-0000-000000000000.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_platform_admin IS
  'Pryrox platform staff; may use superadmin UI without pharmacy_users. Set via seed, migration backfill, or service_role SQL — not self-service in the app.';

-- RLS policies on public.users already scope SELECT to auth.uid() = id.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.is_platform_admin = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.pharmacy_users pu
    WHERE pu.user_id = auth.uid()
      AND pu.role = 'admin'
      AND pu.is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.is_platform_admin = true
  )
  OR EXISTS (
    SELECT 1
    FROM auth.users au
    WHERE au.id = auth.uid()
      AND au.email = 'abdousentore@gmail.com'
  );
END;
$$;

-- New auth users: platform seed email gets profile flag only (no synthetic pharmacy).
CREATE OR REPLACE FUNCTION public.setup_all_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'abdousentore@gmail.com' THEN
    UPDATE public.users
    SET is_platform_admin = true
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  IF NEW.email = 'pharmacy@test.com' THEN
    INSERT INTO public.pharmacy_users (
      pharmacy_id,
      user_id,
      role,
      is_active
    ) VALUES (
      '11111111-1111-1111-1111-111111111111',
      NEW.id,
      'pharmacy_owner',
      true
    ) ON CONFLICT (pharmacy_id, user_id) DO UPDATE SET
      role = 'pharmacy_owner',
      is_active = true;
  END IF;

  IF NEW.email = 'pharmacist@test.com' THEN
    INSERT INTO public.pharmacy_users (
      pharmacy_id,
      user_id,
      role,
      is_active
    ) VALUES (
      '11111111-1111-1111-1111-111111111111',
      NEW.id,
      'pharmacist',
      true
    ) ON CONFLICT (pharmacy_id, user_id) DO UPDATE SET
      role = 'pharmacist',
      is_active = true;
  END IF;

  IF NEW.email = 'cashier@test.com' THEN
    INSERT INTO public.pharmacy_users (
      pharmacy_id,
      user_id,
      role,
      is_active
    ) VALUES (
      '11111111-1111-1111-1111-111111111111',
      NEW.id,
      'cashier',
      true
    ) ON CONFLICT (pharmacy_id, user_id) DO UPDATE SET
      role = 'cashier',
      is_active = true;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill profile flag and drop legacy synthetic membership for seeded platform user.
UPDATE public.users u
SET is_platform_admin = true
FROM auth.users au
WHERE u.id = au.id
  AND au.email = 'abdousentore@gmail.com';

DELETE FROM public.pharmacy_users pu
USING auth.users au
WHERE pu.user_id = au.id
  AND au.email = 'abdousentore@gmail.com'
  AND pu.pharmacy_id = '00000000-0000-0000-0000-000000000000'::uuid;
