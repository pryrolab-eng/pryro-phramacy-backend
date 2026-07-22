-- Per-pharmacy branding (logo, colors) — plan feature: customization

INSERT INTO public.platform_features (key, display_name, description, "group", feature_type, limit_column, nav_routes, sort_order) VALUES
  (
    'customization',
    'Customization',
    'Per-pharmacy logo and brand colors in the app',
    'Settings',
    'boolean',
    NULL,
    ARRAY['/settings'],
    91
  )
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  "group" = EXCLUDED."group",
  feature_type = EXCLUDED.feature_type,
  nav_routes = EXCLUDED.nav_routes,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Enable on paid tiers (pro / premium / enterprise and aliases)
INSERT INTO public.plan_features (plan_id, feature_key, enabled, feature_label)
SELECT sp.id, 'customization', true, 'Customization'
FROM public.subscription_plans sp
WHERE coalesce(sp.plan_type, 'main') = 'main'
  AND sp.is_active = true
  AND lower(sp.name) IN ('standard', 'pro', 'professional', 'premium', 'enterprise')
ON CONFLICT DO NOTHING;
