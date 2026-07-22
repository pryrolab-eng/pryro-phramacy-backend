-- Function to check and suspend expired subscriptions
CREATE OR REPLACE FUNCTION check_expired_subscriptions()
RETURNS void AS $$
BEGIN
  -- Update pharmacies with expired subscriptions to suspended status
  UPDATE pharmacies
  SET status = 'suspended',
      updated_at = now()
  WHERE subscription_expires_at <= now()
    AND status IN ('active', 'trial');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_expired_subscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION check_expired_subscriptions() TO service_role;

-- Create a function to get subscription status for a pharmacy
CREATE OR REPLACE FUNCTION get_subscription_status(pharmacy_uuid uuid)
RETURNS TABLE (
  is_active boolean,
  days_remaining integer,
  is_expired boolean,
  is_expiring_soon boolean,
  subscription_plan text,
  expires_at timestamp with time zone
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN p.status = 'suspended' THEN false
      WHEN p.subscription_expires_at IS NULL THEN true
      WHEN p.subscription_expires_at > now() THEN true
      ELSE false
    END as is_active,
    CASE 
      WHEN p.subscription_expires_at IS NULL THEN NULL
      ELSE GREATEST(0, EXTRACT(DAY FROM (p.subscription_expires_at - now()))::integer)
    END as days_remaining,
    CASE 
      WHEN p.subscription_expires_at IS NOT NULL AND p.subscription_expires_at <= now() THEN true
      ELSE false
    END as is_expired,
    CASE 
      WHEN p.subscription_expires_at IS NOT NULL 
        AND p.subscription_expires_at > now() 
        AND EXTRACT(DAY FROM (p.subscription_expires_at - now())) <= 7 THEN true
      ELSE false
    END as is_expiring_soon,
    p.subscription_plan::text,
    p.subscription_expires_at
  FROM pharmacies p
  WHERE p.id = pharmacy_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_subscription_status(uuid) TO authenticated;

-- Comment on functions
COMMENT ON FUNCTION check_expired_subscriptions() IS 'Automatically suspends pharmacies with expired subscriptions. Should be run daily via cron job.';
COMMENT ON FUNCTION get_subscription_status(uuid) IS 'Returns detailed subscription status for a pharmacy including expiry information.';
