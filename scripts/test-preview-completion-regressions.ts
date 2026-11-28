// ============================================================================
// PREVIEW COMPLETION REGRESSIONS
// Static source contracts for the final consolidated audit fixes. No network,
// no provider calls, no secrets, no D1 writes, and no Production resources.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLATFORM_CONTACT } from '../functions/api/_platformContact';
import { sanitizeLogoConfig } from '../functions/api/_tenantMapper';
import { UI_ROLE_TO_SUPABASE_PROFILE_ROLE } from '../functions/api/auth/_supabaseAdmin';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`PASS ${passed.toString().padStart(2, '0')} — ${name}`);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(directory: string, extensions: string[]): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (/scratch|backup|legacy|__old__/i.test(entry.name)) return [];
      return walk(fullPath, extensions);
    }
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [fullPath] : [];
  });
}

await test('public announcements read only active durable rows', () => {
  const source = read('functions/api/announcements.ts');
  assert.match(source, /FROM platform_announcements/);
  assert.match(source, /WHERE active = 1/);
  assert.match(source, /severity: \['info', 'update', 'maintenance'\]/);
  assert.equal((source.match(/announcements: \[\]/g) ?? []).length, 2, 'only empty/unavailable fallbacks');
});

await test('backup verification and full export use the real revision table', () => {
  const verify = read('functions/api/owner/tenants/[tenantId]/backup-verify.ts');
  const exportSource = read('functions/api/owner/tenants/[tenantId]/full-export.ts');
  assert.match(verify, /COUNT\(\*\) as cnt FROM website_revisions/);
  assert.doesNotMatch(verify, /website_version_snapshots/);
  assert.match(exportSource, /summary AS label, created_at FROM website_revisions/);
  assert.doesNotMatch(exportSource, /website_version_snapshots/);
});

await test('ecosystem history reads vv_audit_log columns, not the absent legacy table', () => {
  const source = read('functions/api/admin/ecosystem.ts');
  assert.match(source, /FROM vv_audit_log/);
  assert.match(source, /entity_type, entity_id, metadata_json/);
  assert.doesNotMatch(source, /platform_audit_logs/);
  assert.doesNotMatch(source, /target_type = 'cashfree_payments'/);
});

await test('fresh D1 schema carries AI idempotency scope and completion tables', () => {
  const m0009 = read('cloudflare/d1/migrations/0009_tenant_ai_credit_ledger.sql');
  assert.match(m0009, /idempotency_scope TEXT NOT NULL DEFAULT ''/);
  assert.match(m0009, /idx_tenant_ai_usage_request_scope/);

  const m0026 = read('cloudflare/d1/migrations/0026_preview_completion_tables.sql');
  for (const table of [
    'platform_feedback',
    'business_locations',
    'vv_audit_log',
    'platform_announcements',
  ]) {
    assert.match(m0026, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(m0026, /entity_type TEXT NOT NULL DEFAULT ''/);
  assert.match(m0026, /metadata_json TEXT NOT NULL DEFAULT '\{\}'/);
});

await test('Super Admin role changes update the authoritative identity before mirroring D1', () => {
  assert.deepEqual(UI_ROLE_TO_SUPABASE_PROFILE_ROLE, {
    super_admin: 'super_admin',
    business_owner: 'shop_owner',
    staff: 'business_staff',
    delivery_partner: 'delivery_partner',
    customer: 'customer',
  });

  const roleEndpoint = read('functions/api/admin/users/[id]/role.ts');
  const adminService = read('functions/api/auth/_supabaseAdmin.ts');
  assert.match(roleEndpoint, /updateSupabaseProfileRole\(env, authSubject, supabaseRole\)/);
  assert.match(roleEndpoint, /if \(!identityUpdate\.ok\)/);
  assert.match(roleEndpoint, /D1_ROLE_BY_UI_ROLE/);
  assert.match(adminService, /`\$\{config\.url\}\/rest\/v1\/profiles\?id=eq\./);
  assert.match(adminService, /method: 'PATCH'/);
  assert.match(adminService, /body: JSON\.stringify\(\{ role: supabaseRole \}\)/);
  assert.match(adminService, /const allowedRoles = new Set<string>\(Object\.values\(UI_ROLE_TO_SUPABASE_PROFILE_ROLE\)\)/);
  assert.doesNotMatch(adminService, /body: JSON\.stringify\(\{ role \}\)/);
  assert.ok(
    roleEndpoint.indexOf('updateSupabaseProfileRole(env, authSubject, supabaseRole)') <
      roleEndpoint.indexOf('UPDATE vv_users SET role'),
    'D1 mirror must not be written before identity succeeds'
  );

  const overview = read('functions/api/admin/overview.ts');
  assert.match(overview, /u\.role === 'admin' \|\| u\.role === 'super_admin'/);
  assert.match(overview, /delivery_partner', 'customer'\]/);
});

await test('admin role UI reports failures and refreshes the authoritative list', () => {
  const dashboard = read('src/components/DashboardsHub.tsx');
  assert.match(dashboard, /Could not update role for \$\{u\.email\}/);
  assert.match(dashboard, /await loadSuperAdmin\(\);[\s\S]{0,220}Could not update role/);
});

await test('shop-owner cancel/return accepts legacy authSubject ownership', () => {
  const source = read('functions/api/platform/commerce.ts');
  assert.match(source, /order\.owner_id === auth\.user\.id \|\|\s*order\.owner_id === auth\.user\.authSubject/);
});

await test('all customer-facing outbound messages use one configured contact source', () => {
  assert.equal(PLATFORM_CONTACT.phone, '+91 9381362201');
  assert.equal(PLATFORM_CONTACT.whatsappNumber, '919381362201');
  assert.equal(PLATFORM_CONTACT.email, 'vk66278@gmail.com');

  const activeSources = [...walk(path.join(root, 'functions'), ['.ts']), ...walk(path.join(root, 'src'), ['.ts', '.tsx'])];
  const stale = activeSources.filter((file) => {
    const content = fs.readFileSync(file, 'utf8');
    return content.includes('+91 93610 24823') || content.includes('+919361024823') || content.includes('tel:+919361024823');
  });
  assert.deepEqual(stale, [], `stale support number found in: ${stale.join(', ')}`);
});

await test('proposal copy-link uses the current request origin', () => {
  const source = read('src/components/ProposalManager.tsx');
  assert.match(source, /`\$\{window\.location\.origin\}\/proposal\/\$\{p\.secure_token\}`/);
  assert.doesNotMatch(source, /master\.vijay-visuals-site\.pages\.dev\/proposal/);
});

await test('website editor syncs stored hero copy and saves unsaved drafts', () => {
  const source = read('src/components/CustomerWebsiteEditor.tsx');
  assert.match(source, /useState\(tenant\.heroHeadline \|\| tenant\.name \|\| ''\)/);
  assert.match(source, /setHeroHeadline\(tenant\.heroHeadline \|\| tenant\.name \|\| ''\)/);
  assert.match(source, /setHeroSubheadline\(\s*tenant\.heroSubheadline/);
  assert.match(source, /setCtaText\(tenant\.ctaText \|\| 'Explore Catalog'\)/);
  assert.match(source, /const buildEditorPayload = \(published\?: boolean\)/);
  assert.match(source, /\.\.\.\(published === undefined \? \{\} : \{ published \}\)/);
  assert.match(source, /await apiFetch\(`\/api\/tenants\/\$\{tenant\.slug\}`/);
  assert.match(source, /body: JSON\.stringify\(buildEditorPayload\(\)\)/);
  assert.match(source, /onNotify\('Draft saved with rollback snapshot\. Live status was not changed\.'\)/);
});

await test('logo save uses the working tenant PATCH endpoint and cannot falsely succeed', () => {
  const source = read('src/components/DashboardsHub.tsx');
  assert.match(source, /apiFetch\(`\/api\/tenants\/\$\{ownerData\.tenant\.slug\}`, \{\s*method: 'PATCH'/);
  assert.doesNotMatch(source, /apiFetch\(`\/api\/owner\/tenants\/\$\{ownerData\.tenant\.id\}\/overview`, \{\s*method: 'PATCH'/);
  const customizer = read('src/components/CustomerLogoCustomizer.tsx');
  assert.match(customizer, /await onSaveLogo\(config\);[\s\S]{0,80}onNotify\?\.\('Website logo customized/);
  assert.match(customizer, /} catch \(err: any\) \{[\s\S]{0,120}onNotify\?\.\(err/);
});

await test('public /site/:slug storefronts are tenant-facing in React', () => {
  const app = read('src/App.tsx');
  assert.match(app, /const publicStorefront = isPublicTenantHost \|\| activeView === 'storefront'/);
  assert.match(app, /publicHost=\{publicStorefront\}/);
  assert.equal((app.match(/publicHost=\{publicStorefront\}/g) ?? []).length, 3, 'boundary, storefront, and not-found');
  const storefront = read('src/components/StorefrontView.tsx');
  assert.match(storefront, /publicHost \? \([\s\S]{0,220}Please try again later or contact the business directly/);
  assert.match(storefront, /\{!publicHost && ' Store owners can add items from the Business Owner Dashboard\.'\}/);
});

await test('client-side storefront hydration removes platform icons/manifests', () => {
  const source = read('src/lib/storefrontMetadata.ts');
  assert.match(source, /link\[rel="icon"\]/);
  assert.match(source, /link\[rel="apple-touch-icon"\]/);
  assert.match(source, /link\[rel="manifest"\]/);
  assert.match(source, /data-vv-tenant-icon/);
  assert.match(source, /for \(const link of removedBrandLinks\)/);
});

await test('licensed tenant PWA manifest prefers tenant-owned icon assets', () => {
  const source = read('functions/api/tenants/[slug]/manifest.webmanifest.ts');
  assert.match(source, /\[parsed\.pwaIconUrl, tenant\.logoImage\]/);
  assert.match(source, /icons: tenantIcon/);
  assert.match(source, /purpose: 'maskable'/);
});

await test('live status and help-center copy no longer claim Razorpay', () => {
  const health = read('server.ts');
  assert.match(health, /cashfreeGateway: Boolean\(process\.env\.CASHFREE_CLIENT_ID/);
  assert.match(health, /cashfreeMode,/);
  assert.doesNotMatch(health, /razorpayGateway:/);
  assert.doesNotMatch(health, /razorpayMode:/);

  const businessOs = read('src/routes/businessOs.ts');
  assert.match(businessOs, /Cashfree Payment Gateway \(\$\{cashfreeMode\}\)/);
  assert.match(businessOs, /seller settlements remain pending activation until separately verified/);
  assert.doesNotMatch(businessOs, /getRazorpayStatus/);

  const ecosystem = read('src/routes/ecosystem.ts');
  assert.doesNotMatch(ecosystem, /razorpay: getRazorpayStatus\(\)/);
  assert.match(ecosystem, /gateway: 'cashfree'/);
  assert.match(ecosystem, /sellerSettlementStatus: 'pending_activation'/);
});

await test('saved section order is rendered by the public storefront', () => {
  const source = read('src/components/StorefrontView.tsx');
  assert.match(source, /const resolvedSectionOrder = useMemo/);
  assert.match(source, /Array\.isArray\(tenant\?\.sectionOrder\)/);
  assert.match(source, /sectionStyle\('hero'\)/);
  assert.match(source, /sectionStyle\('catalog'\)/);
  assert.match(source, /sectionStyle\('gallery'\)/);
  assert.match(source, /sectionStyle\('contact'\)/);
  assert.match(source, /style=\{sectionStyle\('reviews', 2\)\}/);
  assert.match(source, /<div className="flex flex-col">/);

  const builder = read('src/components/WebsiteBuilder.tsx');
  assert.match(builder, /sectionOrderJson: JSON\.stringify\(sectionOrder\)/);
  assert.match(builder, /if \(Array\.isArray\(t\.sectionOrder\) && t\.sectionOrder\.length > 0\) setSectionOrder\(t\.sectionOrder\)/);
});

await test('logo studio styling is persisted and rendered instead of discarded', () => {
  const sanitized = sanitizeLogoConfig(
    {
      type: 'text',
      initials: 'vvk',
      businessName: 'Vijay Visuals',
      layout: 'stacked',
      badgeShape: 'hexagon',
      badgeBgColor: 'red',
      badgeBorderColor: '#D4AF37',
      badgeTextColor: '#FFFFFF',
      nameTextColor: '#111111',
      taglineTextColor: '#ECC86A',
      fontFamily: 'Cinzel',
      size: 'lg',
      letterSpacing: 'luxury',
      tagline: 'Handcrafted visuals',
      imageUrl: 'javascript:alert(1)',
    },
    'Fallback Name',
    'FB'
  );
  assert.ok(sanitized);
  assert.equal(sanitized.type, 'text');
  assert.equal(sanitized.initials, 'VVK');
  assert.equal(sanitized.badgeShape, 'hexagon');
  assert.equal(sanitized.badgeBgColor, '#181822', 'unsafe colors fall back');
  assert.equal(sanitized.size, 'lg');
  assert.equal(sanitized.letterSpacing, 'luxury');

  const patch = read('functions/api/tenants/[slug].ts');
  assert.match(patch, /sanitizeLogoConfig/);
  assert.match(patch, /current\.logoConfig = logoConfig/);

  const create = read('functions/api/tenants.ts');
  assert.match(create, /const logoConfig = sanitizeLogoConfig\(body\.logoConfig, name, logoText\)/);
  assert.match(create, /\.\.\.\(logoConfig \? \{ logoConfig \} : \{\}\)/);

  const mapper = read('functions/api/_tenantMapper.ts');
  assert.match(mapper, /logoConfig\?: MappedTenantLogoConfig/);
  assert.match(mapper, /\.\.\.\(resolvedLogoConfig \? \{ logoConfig: resolvedLogoConfig \} : \{\}\)/);

  const dashboard = read('src/components/DashboardsHub.tsx');
  assert.match(dashboard, /logoConfig: cfg/);
  assert.match(dashboard, /\.\.\.\(ownerData\.tenant\.logoConfig \|\| \{\}\)/);

  const builder = read('src/components/WebsiteBuilder.tsx');
  assert.match(builder, /const \[logoConfig, setLogoConfig\] = useState<TenantLogoConfig \| undefined>/);
  assert.match(builder, /\.\.\.\(logoConfig \? \{ logoConfig \} : \{\}\)/);

  const storefront = read('src/components/StorefrontView.tsx');
  assert.match(storefront, /function StorefrontLogo/);
  assert.match(storefront, /cfg\?\.badgeShape \|\| 'circle'/);
  assert.match(storefront, /cfg\?\.letterSpacing === 'luxury'/);
  assert.match(storefront, /<StorefrontLogo tenant=\{tenant\} variant="compact" \/>/);
  assert.match(storefront, /<StorefrontLogo tenant=\{tenant\} variant="hero" \/>/);
});

console.log(`\n${passed}/${passed} Preview completion regression checks passed.`);
