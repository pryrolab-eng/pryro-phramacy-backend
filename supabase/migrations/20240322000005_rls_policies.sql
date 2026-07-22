-- Row Level Security (RLS) Policies for Multi-tenant SaaS
-- Enable RLS on all tables

-- Enable RLS
ALTER TABLE pharmacies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_sessions ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's pharmacy IDs
CREATE OR REPLACE FUNCTION get_user_pharmacy_ids()
RETURNS uuid[] AS $$
BEGIN
    RETURN ARRAY(
        SELECT pharmacy_id 
        FROM pharmacy_users 
        WHERE user_id = auth.uid() AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM pharmacy_users 
        WHERE user_id = auth.uid() 
        AND role = 'admin' 
        AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Pharmacies policies
CREATE POLICY "Users can view their pharmacies" ON pharmacies
    FOR SELECT USING (
        id = ANY(get_user_pharmacy_ids()) OR 
        owner_id = auth.uid() OR 
        is_admin()
    );

CREATE POLICY "Pharmacy owners can update their pharmacies" ON pharmacies
    FOR UPDATE USING (owner_id = auth.uid() OR is_admin());

CREATE POLICY "Authenticated users can create pharmacies" ON pharmacies
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Pharmacy users policies
CREATE POLICY "Users can view pharmacy staff" ON pharmacy_users
    FOR SELECT USING (
        pharmacy_id = ANY(get_user_pharmacy_ids()) OR 
        user_id = auth.uid() OR 
        is_admin()
    );

CREATE POLICY "Pharmacy owners and admins can manage staff" ON pharmacy_users
    FOR ALL USING (
        pharmacy_id IN (
            SELECT id FROM pharmacies WHERE owner_id = auth.uid()
        ) OR 
        is_admin()
    );

-- Insurance providers policies
CREATE POLICY "Pharmacy staff can view insurance providers" ON insurance_providers
    FOR SELECT USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

CREATE POLICY "Pharmacy staff can manage insurance providers" ON insurance_providers
    FOR ALL USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

-- Suppliers policies
CREATE POLICY "Pharmacy staff can view suppliers" ON suppliers
    FOR SELECT USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

CREATE POLICY "Pharmacy staff can manage suppliers" ON suppliers
    FOR ALL USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

-- Medications policies
CREATE POLICY "Pharmacy staff can view medications" ON medications
    FOR SELECT USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

CREATE POLICY "Pharmacy staff can manage medications" ON medications
    FOR ALL USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

-- Inventory policies
CREATE POLICY "Pharmacy staff can view inventory" ON inventory
    FOR SELECT USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

CREATE POLICY "Pharmacy staff can manage inventory" ON inventory
    FOR ALL USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

-- Sales policies
CREATE POLICY "Pharmacy staff can view sales" ON sales
    FOR SELECT USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

CREATE POLICY "Pharmacy staff can create sales" ON sales
    FOR INSERT WITH CHECK (pharmacy_id = ANY(get_user_pharmacy_ids()));

CREATE POLICY "Pharmacy staff can update sales" ON sales
    FOR UPDATE USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

-- Sale items policies
CREATE POLICY "Pharmacy staff can view sale items" ON sale_items
    FOR SELECT USING (
        sale_id IN (
            SELECT id FROM sales WHERE pharmacy_id = ANY(get_user_pharmacy_ids())
        )
    );

CREATE POLICY "Pharmacy staff can manage sale items" ON sale_items
    FOR ALL USING (
        sale_id IN (
            SELECT id FROM sales WHERE pharmacy_id = ANY(get_user_pharmacy_ids())
        )
    );

-- Insurance claims policies
CREATE POLICY "Pharmacy staff can view insurance claims" ON insurance_claims
    FOR SELECT USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

CREATE POLICY "Pharmacy staff can manage insurance claims" ON insurance_claims
    FOR ALL USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

-- Stock movements policies
CREATE POLICY "Pharmacy staff can view stock movements" ON stock_movements
    FOR SELECT USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

CREATE POLICY "Pharmacy staff can create stock movements" ON stock_movements
    FOR INSERT WITH CHECK (pharmacy_id = ANY(get_user_pharmacy_ids()));

-- Subscriptions policies
CREATE POLICY "Pharmacy owners can view subscriptions" ON subscriptions
    FOR SELECT USING (
        pharmacy_id IN (
            SELECT id FROM pharmacies WHERE owner_id = auth.uid()
        ) OR 
        is_admin()
    );

CREATE POLICY "Admins can manage subscriptions" ON subscriptions
    FOR ALL USING (is_admin());

-- Audit logs policies
CREATE POLICY "Pharmacy staff can view audit logs" ON audit_logs
    FOR SELECT USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

-- Customers policies
CREATE POLICY "Pharmacy staff can view customers" ON customers
    FOR SELECT USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

CREATE POLICY "Pharmacy staff can manage customers" ON customers
    FOR ALL USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

-- Purchase orders policies
CREATE POLICY "Pharmacy staff can view purchase orders" ON purchase_orders
    FOR SELECT USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

CREATE POLICY "Pharmacy staff can manage purchase orders" ON purchase_orders
    FOR ALL USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

-- Purchase order items policies
CREATE POLICY "Pharmacy staff can view purchase order items" ON purchase_order_items
    FOR SELECT USING (
        purchase_order_id IN (
            SELECT id FROM purchase_orders WHERE pharmacy_id = ANY(get_user_pharmacy_ids())
        )
    );

CREATE POLICY "Pharmacy staff can manage purchase order items" ON purchase_order_items
    FOR ALL USING (
        purchase_order_id IN (
            SELECT id FROM purchase_orders WHERE pharmacy_id = ANY(get_user_pharmacy_ids())
        )
    );

-- Pharmacy settings policies
CREATE POLICY "Pharmacy staff can view settings" ON pharmacy_settings
    FOR SELECT USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

CREATE POLICY "Pharmacy staff can manage settings" ON pharmacy_settings
    FOR ALL USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

-- Notifications policies
CREATE POLICY "Users can view their notifications" ON notifications
    FOR SELECT USING (
        user_id = auth.uid() OR 
        pharmacy_id = ANY(get_user_pharmacy_ids())
    );

CREATE POLICY "Users can update their notifications" ON notifications
    FOR UPDATE USING (user_id = auth.uid());

-- API keys policies
CREATE POLICY "Pharmacy owners can view API keys" ON api_keys
    FOR SELECT USING (
        pharmacy_id IN (
            SELECT id FROM pharmacies WHERE owner_id = auth.uid()
        ) OR 
        is_admin()
    );

CREATE POLICY "Pharmacy owners can manage API keys" ON api_keys
    FOR ALL USING (
        pharmacy_id IN (
            SELECT id FROM pharmacies WHERE owner_id = auth.uid()
        ) OR 
        is_admin()
    );

-- Webhooks policies
CREATE POLICY "Pharmacy owners can view webhooks" ON webhooks
    FOR SELECT USING (
        pharmacy_id IN (
            SELECT id FROM pharmacies WHERE owner_id = auth.uid()
        ) OR 
        is_admin()
    );

CREATE POLICY "Pharmacy owners can manage webhooks" ON webhooks
    FOR ALL USING (
        pharmacy_id IN (
            SELECT id FROM pharmacies WHERE owner_id = auth.uid()
        ) OR 
        is_admin()
    );

-- Webhook deliveries policies
CREATE POLICY "Pharmacy owners can view webhook deliveries" ON webhook_deliveries
    FOR SELECT USING (
        webhook_id IN (
            SELECT id FROM webhooks WHERE pharmacy_id IN (
                SELECT id FROM pharmacies WHERE owner_id = auth.uid()
            )
        ) OR 
        is_admin()
    );

-- Report cache policies
CREATE POLICY "Pharmacy staff can view report cache" ON report_cache
    FOR SELECT USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

CREATE POLICY "Pharmacy staff can manage report cache" ON report_cache
    FOR ALL USING (pharmacy_id = ANY(get_user_pharmacy_ids()));

-- Mobile sessions policies
CREATE POLICY "Users can view their mobile sessions" ON mobile_sessions
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can manage their mobile sessions" ON mobile_sessions
    FOR ALL USING (user_id = auth.uid());