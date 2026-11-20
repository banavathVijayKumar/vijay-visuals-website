// ============================================================================
// GET /api/admin/overview — Strictly Protected Super Admin Console Endpoint
// Enforces backend `requireAdmin` (Supabase role === 'admin' | 'super_admin').
// Non-admin accounts ALWAYS receive HTTP 403. Zero hardcoded passwords.
// ============================================================================

import { requireAdmin } from '../_auth';
import { PagesContext, handleOptions, jsonResponse } from '../_shared';
import { mapOrderRowToUi } from '../_tenantAccess';
import { PublicationRow, mapPublicationToTenant } from '../_tenantMapper';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const tenants: Array<Record<string, unknown>> = [];
  const users: Array<Record<string, unknown>> = [];
  const orders: Array<Record<string, unknown>> = [];
  const tickets: Array<Record<string, unknown>> = [];
  const plans: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const proposals: Array<Record<string, unknown>> = [];
  const domains: Array<Record<string, unknown>> = [];

  let totalGmv = 0;
  let totalAiUsed = 0;
  let verifiedDomainsCount = 0;

  if (env.DB) {
    // 1. All websites / tenants
    try {
      let rows: PublicationRow[] = [];
      try {
        const res = await env.DB.prepare(
          `SELECT rowid, website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at
           FROM customer_website_publications
           ORDER BY updated_at DESC LIMIT 200`
        ).all<PublicationRow>();
        rows = res.results || [];
      } catch {
        const res = await env.DB.prepare(
          `SELECT website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at
           FROM customer_website_publications
           ORDER BY updated_at DESC LIMIT 200`
        ).all<PublicationRow>();
        rows = res.results || [];
      }
      for (const row of rows) {
        let parsed: Record<string, any> = {};
        try {
          parsed = row.website_json ? JSON.parse(row.website_json) : {};
        } catch {}
        tenants.push(mapPublicationToTenant(row, parsed) as unknown as Record<string, unknown>);
      }
    } catch {}

    // 2. Users from vv_users
    try {
      const userRes = await env.DB.prepare(
        `SELECT id, email, full_name, role, status, created_at
         FROM vv_users ORDER BY created_at DESC LIMIT 200`
      ).all<Record<string, any>>();
      (userRes.results || []).forEach((u, idx) => {
        users.push({
          id: idx + 1,
          uid: String(u.id || ''),
          email: String(u.email || ''),
          name: String(u.full_name || u.email || 'User'),
          phone: '',
          role: u.role === 'admin' ? 'super_admin' : 'business_owner',
          preferredLang: 'en',
          savedAddressesJson: '[]',
          createdAt: String(u.created_at || ''),
        });
      });
    } catch {}

    // 3. Orders & GMV (optional migration 0003)
    try {
      const ordRes = await env.DB.prepare(
        `SELECT * FROM store_orders ORDER BY created_at DESC LIMIT 100`
      ).all<Record<string, any>>();
      for (const o of ordRes.results || []) {
        orders.push(mapOrderRowToUi(o, 0));
        if (o.order_status !== 'cancelled' && o.order_status !== 'returned') {
          totalGmv += Number(o.total_inr || 0);
        }
      }
    } catch {}

    // 4. Support tickets (optional migration 0003)
    try {
      const tktRes = await env.DB.prepare(
        `SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT 100`
      ).all<Record<string, any>>();
      for (const t of tktRes.results || []) {
        tickets.push({
          id: Number(t.id),
          tenantId: null,
          userId: null,
          customerName: String(t.owner_id || ''),
          customerEmail: '',
          customerPhone: '',
          subject: String(t.subject || ''),
          message: String(t.messages_json || ''),
          category: String(t.category || 'general'),
          status: String(t.status || 'open'),
          createdAt: String(t.created_at || ''),
        });
      }
    } catch {}

    // 5. Subscription plans (optional migration 0003)
    try {
      const planRes = await env.DB.prepare(
        `SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY monthly_price_inr ASC`
      ).all<Record<string, any>>();
      (planRes.results || []).forEach((p, idx) => {
        plans.push({
          id: idx + 1,
          code: String(p.code),
          name: String(p.name),
          category: 'saas',
          priceInr: Number(p.monthly_price_inr || 0),
          billingCycle: 'monthly',
          includesPwa: Number(p.monthly_price_inr || 0) >= 2999,
          aiCreditsIncluded: Number(p.monthly_ai_credits || 0),
          storageGb: Math.round(Number(p.storage_quota_mb || 250) / 1024),
          featuresJson: String(p.features_json || '[]'),
          thirdPartyDisclosure: 'GST 18% applicable. Custom domain fees paid directly to customer registrar.',
          active: Boolean(p.is_active),
        });
      });
    } catch {}

    // 6. Security audit logs
    try {
      const audRes = await env.DB.prepare(
        `SELECT id, actor_user_id, actor_role, action, resource_type, resource_id, metadata_json, created_at
         FROM vv_audit_log ORDER BY created_at DESC LIMIT 100`
      ).all<Record<string, any>>();
      (audRes.results || []).forEach((a, idx) => {
        audits.push({
          id: idx + 1,
          actorEmail: String(a.actor_user_id || 'system'),
          actorRole: String(a.actor_role || ''),
          tenantId: null,
          action: String(a.action || ''),
          details: `${a.resource_type || ''}:${a.resource_id || ''} ${a.metadata_json || ''}`.trim(),
          createdAt: String(a.created_at || ''),
        });
      });
    } catch {}

    // 7. Custom domains (optional migration 0002)
    try {
      const domRes = await env.DB.prepare(
        `SELECT * FROM tenant_custom_domains ORDER BY created_at DESC LIMIT 100`
      ).all<Record<string, any>>();
      for (const d of domRes.results || []) {
        if (d.dns_status === 'verified') verifiedDomainsCount += 1;
        domains.push({
          id: Number(d.id),
          tenantId: 0,
          domainName: String(d.domain_name || ''),
          dnsStatus: String(d.dns_status || 'pending'),
          sslStatus: String(d.ssl_status || 'pending'),
          expiryDate: String(d.expiry_date || ''),
        });
      }
    } catch {}

    // 8. Proposals (optional migration 0005)
    try {
      const propRes = await env.DB.prepare(
        `SELECT * FROM platform_proposals ORDER BY created_at DESC LIMIT 100`
      ).all<Record<string, any>>();
      for (const p of propRes.results || []) {
        proposals.push({
          id: Number(p.id),
          proposalNumber: String(p.proposal_number || ''),
          businessName: String(p.business_name || ''),
          customerName: String(p.customer_name || ''),
          customerEmail: String(p.customer_email || ''),
          grandTotalInr: Number(p.grand_total_inr || 0),
          gstInr: Number(p.gst_inr || 0),
          status: String(p.status || 'draft'),
        });
      }
    } catch {}

    // 9. AI usage count
    try {
      const aiRow = await env.DB.prepare('SELECT COUNT(*) AS cnt FROM vv_ai_usage').first<{
        cnt?: number;
      }>();
      totalAiUsed = Number(aiRow?.cnt || 0);
    } catch {}
  }

  const publishedTenantsCount = tenants.filter((t) => t.published === true).length;
  const pwaEnabledCount = tenants.filter((t) => t.pwaEnabled === true).length;

  return jsonResponse({
    stats: {
      tenantCount: tenants.length,
      publishedTenantsCount,
      userCount: users.length,
      orderCount: orders.length,
      gmv: totalGmv,
      domainsCount: domains.length,
      verifiedDomainsCount,
      proposalsCount: proposals.length,
      pwaEnabledCount,
      totalAiUsed,
    },
    tenants,
    users,
    orders,
    tickets,
    plans,
    audits,
    proposals,
    domains,
  });
}
