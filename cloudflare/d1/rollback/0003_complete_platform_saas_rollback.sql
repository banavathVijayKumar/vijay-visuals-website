-- ============================================================================
-- VIJAY VISUALS — ROLLBACK FOR MIGRATION 0003 (COMPLETE SAAS MODULES ONLY)
-- SAFE ROLLBACK: NEVER DROPS THE 9 ORIGINAL TABLES OR 0002 DOMAIN TABLES
-- ============================================================================

DROP TABLE IF EXISTS api_rate_limits;
DROP TABLE IF EXISTS backup_audit_records;
DROP TABLE IF EXISTS support_tickets;
DROP TABLE IF EXISTS media_assets;
DROP TABLE IF EXISTS marketing_campaigns;
DROP TABLE IF EXISTS finance_ledger;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS crm_contacts_leads;
DROP TABLE IF EXISTS delivery_assignments;
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS purchase_orders;
DROP TABLE IF EXISTS inventory_suppliers;
DROP TABLE IF EXISTS inventory_warehouses;
DROP TABLE IF EXISTS store_orders;
DROP TABLE IF EXISTS store_products;
DROP TABLE IF EXISTS payment_webhook_events;
DROP TABLE IF EXISTS seller_payout_accounts;
DROP TABLE IF EXISTS tenant_subscriptions;
DROP TABLE IF EXISTS subscription_plans;
DROP TABLE IF EXISTS website_templates;
DROP TABLE IF EXISTS website_revisions;
DROP TABLE IF EXISTS business_profiles;
DROP TABLE IF EXISTS staff_attendance_payroll;
DROP TABLE IF EXISTS tenant_memberships;
DROP TABLE IF EXISTS platform_staff;
