-- ============================================================================
-- VIJAY VISUALS — CLOUDFLARE D1 MIGRATION 0008: FIX PACKAGE QUOTAS & STORAGE
-- Resolves the inverted storage quota & AI credits bug between Starter & Business
-- Establishes monotonic quota hierarchy across all official website packages.
-- DO NOT APPLY TO REMOTE PRODUCTION WITHOUT USER EXPLICIT AUTHORIZATION.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. Correct Starter Website Package (₹2,999): 1 GB storage (1024 MB), 25 AI credits
UPDATE subscription_plans
SET storage_quota_mb = 1024,
    monthly_ai_credits = 25
WHERE code = 'starter-website';

-- 2. Correct Business Website Package (₹7,999): 5 GB storage (5120 MB), 100 AI credits
UPDATE subscription_plans
SET storage_quota_mb = 5120,
    monthly_ai_credits = 100
WHERE code = 'business-website';

-- 3. Verify monotonic quota hierarchy for remaining packages:
-- Website-Only Business Package (₹14,999): 10 GB storage (10240 MB), 250 AI credits
UPDATE subscription_plans
SET storage_quota_mb = 10240,
    monthly_ai_credits = 250
WHERE code = 'website-only';

-- E-Commerce Website Package (₹14,999): 25 GB storage (25600 MB), 500 AI credits
UPDATE subscription_plans
SET storage_quota_mb = 25600,
    monthly_ai_credits = 500
WHERE code = 'ecommerce-website';

-- Website + Optional Branded PWA Add-On (₹22,999): 25 GB storage (25600 MB), 750 AI credits
UPDATE subscription_plans
SET storage_quota_mb = 25600,
    monthly_ai_credits = 750
WHERE code = 'website-plus-pwa';

-- Custom Development & Multi-Branch Enterprise (₹49,999): 100 GB storage (102400 MB), 5000 AI credits
UPDATE subscription_plans
SET storage_quota_mb = 102400,
    monthly_ai_credits = 5000
WHERE code = 'custom-dev-enterprise';
