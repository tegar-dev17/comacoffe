-- Optional defense-in-depth RLS (enable with ENABLE_RLS=true and app setting tenant context).
-- Applied manually when operating with a non-superuser DB role.

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_tenant_isolation ON payments;
CREATE POLICY payments_tenant_isolation ON payments
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

DROP POLICY IF EXISTS orders_tenant_isolation ON orders;
CREATE POLICY orders_tenant_isolation ON orders
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );
