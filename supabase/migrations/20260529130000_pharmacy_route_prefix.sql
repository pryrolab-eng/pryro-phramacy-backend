-- Pharmacy tenant URLs: migrate platform_features.nav_routes to /pharmacy/* prefix.
-- Legacy paths (pre-redirect): /pharmacy-dashboard, /pharmacist-dashboard, /inventory, /pos, etc.

UPDATE public.platform_features SET nav_routes = ARRAY['/pharmacy/dashboard', '/pharmacy/pharmacist', '/app'], updated_at = now()
WHERE key = 'app.dashboard';

UPDATE public.platform_features SET nav_routes = ARRAY['/pharmacy/pos'], updated_at = now()
WHERE key = 'pos.access';

UPDATE public.platform_features SET nav_routes = ARRAY['/pharmacy/inventory'], updated_at = now()
WHERE key = 'inventory.access';

UPDATE public.platform_features SET nav_routes = ARRAY['/pharmacy/customers'], updated_at = now()
WHERE key = 'customers.access';

UPDATE public.platform_features SET nav_routes = ARRAY['/pharmacy/patients'], updated_at = now()
WHERE key = 'patients.access';

UPDATE public.platform_features SET nav_routes = ARRAY['/pharmacy/prescriptions'], updated_at = now()
WHERE key = 'prescriptions.access';

UPDATE public.platform_features SET nav_routes = ARRAY['/pharmacy/sales'], updated_at = now()
WHERE key = 'sales.view';

UPDATE public.platform_features SET nav_routes = ARRAY['/pharmacy/reports', '/pharmacy/activity'], updated_at = now()
WHERE key = 'reports.view';

UPDATE public.platform_features SET nav_routes = ARRAY['/pharmacy/branches'], updated_at = now()
WHERE key = 'branches.access';

UPDATE public.platform_features SET nav_routes = ARRAY['/pharmacy/staff'], updated_at = now()
WHERE key = 'staff.access';

UPDATE public.platform_features SET nav_routes = ARRAY['/pharmacy/settings'], updated_at = now()
WHERE key = 'settings.access';

UPDATE public.platform_features SET nav_routes = ARRAY['/pharmacy/billing'], updated_at = now()
WHERE key = 'billing.self_serve';
