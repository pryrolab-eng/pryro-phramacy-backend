-- Seed missing plan features used by the app (AI + ensure customization),
-- and index platform-scoped in-app notifications (pharmacy_id IS NULL).

INSERT INTO public.platform_features (
  key, display_name, description, "group", feature_type, limit_column, nav_routes, sort_order, is_active
) VALUES
  (
    'customization',
    'Customization',
    'Per-pharmacy logo, platform name, and brand colors (Settings → Branding)',
    'Settings',
    'boolean',
    NULL,
    ARRAY['/pharmacy/settings'],
    91,
    true
  ),
  (
    'ai.safety',
    'AI drug safety',
    'AI-powered drug interaction analysis at POS',
    'AI',
    'boolean',
    NULL,
    '{}',
    110,
    true
  ),
  (
    'ai.chat',
    'AI Assistant chat',
    'Pharmacy AI assistant slide-over chat',
    'AI',
    'boolean',
    NULL,
    ARRAY['/pharmacy/ai'],
    111,
    true
  )
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  "group" = EXCLUDED."group",
  feature_type = EXCLUDED.feature_type,
  nav_routes = EXCLUDED.nav_routes,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

-- Enable customization on common paid main plans (idempotent)
INSERT INTO public.plan_features (plan_id, feature_key, enabled, feature_label)
SELECT sp.id, 'customization', true, 'Customization'
FROM public.subscription_plans sp
WHERE coalesce(sp.plan_type, 'main') = 'main'
  AND sp.is_active = true
  AND lower(sp.name) IN ('standard', 'pro', 'professional', 'premium', 'enterprise', 'growth')
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_notifications_platform_feed
  ON public.notifications (created_at DESC)
  WHERE pharmacy_id IS NULL;
