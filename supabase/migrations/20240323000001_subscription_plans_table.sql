-- Create subscription plans table for superadmin management
CREATE TABLE IF NOT EXISTS subscription_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    price decimal(10,2) NOT NULL DEFAULT 0.00,
    period text NOT NULL DEFAULT 'per month',
    features text[] NOT NULL DEFAULT '{}',
    is_active boolean DEFAULT true,
    is_popular boolean DEFAULT false,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Insert default plans
INSERT INTO subscription_plans (name, price, period, features, is_popular, is_active) VALUES
('Free', 0, 'forever', ARRAY['Basic POS', 'Up to 3 users', 'Email support', 'Basic reports'], false, true),
('Standard', 50000, 'per month', ARRAY['Full POS', 'Up to 10 users', 'Insurance integration', 'Phone support', 'Advanced reports'], true, true),
('Premium', 120000, 'per month', ARRAY['Everything in Standard', 'Unlimited users', 'Advanced analytics', 'Priority support', 'Custom integrations'], false, true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE subscription_plans;

-- Create index
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active);

-- Create trigger for updated_at
CREATE TRIGGER update_subscription_plans_updated_at 
    BEFORE UPDATE ON subscription_plans 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();