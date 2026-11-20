// ============================================================================
// GET & POST /api/platform/admin-summary
// Super Admin Control Center: Live D1 Aggregates, Audit Logs, Security Checks,
// and Platform Staff RBAC Management
// ============================================================================

import { requireAdmin } from '../_auth';
import { PagesContext, errorJson, json, parseJsonBody, sanitizeText, writeAuditLog } from '../_shared';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const [
    usersCount,
    websitesCount,
    domainsCount,
    liveDomainsCount,
    subsCount,
    ordersAgg,
    openTicketsCount,
    staffList,
    recentAudits,
  ] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS cnt FROM vv_users').first<{ cnt: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS cnt FROM customer_website_publications').first<{ cnt: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS cnt FROM tenant_domains').first<{ cnt: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS cnt FROM tenant_domains WHERE status = 'live'").first<{ cnt: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS cnt FROM tenant_subscriptions WHERE status IN ('trial','active')").first<{ cnt: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS cnt, COALESCE(SUM(total_inr), 0) AS gmv_inr FROM store_orders').first<{
      cnt: number;
      gmv_inr: number;
    }>(),
    env.DB.prepare("SELECT COUNT(*) AS cnt FROM support_tickets WHERE status IN ('open','in_progress')").first<{
      cnt: number;
    }>(),
    env.DB.prepare('SELECT * FROM platform_staff ORDER BY created_at DESC').all(),
    env.DB.prepare('SELECT * FROM vv_audit_log ORDER BY created_at DESC LIMIT 40')
      .all()
      .catch(() => ({ results: [] })),
  ]);

  return json({
    aggregates: {
      totalUsers: Number(usersCount?.cnt || 0),
      totalWebsites: Number(websitesCount?.cnt || 0),
      totalDomains: Number(domainsCount?.cnt || 0),
      liveDomains: Number(liveDomainsCount?.cnt || 0),
      activeSubscriptions: Number(subsCount?.cnt || 0),
      totalStoreOrders: Number(ordersAgg?.cnt || 0),
      recordedStoreGmvInr: Number(ordersAgg?.gmv_inr || 0),
      openSupportTickets: Number(openTicketsCount?.cnt || 0),
    },
    platformStaff: staffList.results || [],
    recentAuditLogs: recentAudits.results || [],
    integrationChecklist: {
      supabaseAuth: Boolean((env.SUPABASE_URL || env.VITE_SUPABASE_URL) && (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY)),
      cloudflareD1: Boolean(env.DB),
      geminiAi: Boolean(env.GEMINI_API_KEY),
      razorpay: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
      razorpayWebhook: Boolean(env.RAZORPAY_WEBHOOK_SECRET),
      cloudflareApi: Boolean(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID),
      registrarApi: Boolean(env.DOMAIN_REGISTRAR_PROVIDER && env.DOMAIN_REGISTRAR_API_KEY),
      smtpEmail: Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS),
      whatsappCloud: Boolean(env.WHATSAPP_CLOUD_API_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
      cronSecret: Boolean(env.CRON_SECRET),
    },
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<{
    action?: 'assign_platform_staff' | 'revoke_platform_staff';
    userId?: string;
    email?: string;
    fullName?: string;
    staffRole?: 'support_agent' | 'onboarding_specialist' | 'operations_manager';
    permissions?: string[];
  }>(request);

  if (!body || !body.action || !body.userId) {
    return errorJson('action and userId are required.', 400);
  }

  const userId = sanitizeText(body.userId, 120);

  if (body.action === 'revoke_platform_staff') {
    await env.DB.prepare(
      `UPDATE platform_staff SET is_active = 0, updated_at = datetime('now') WHERE user_id = ?`
    )
      .bind(userId)
      .run();
    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: 'super_admin',
      action: 'platform_staff_revoked',
      targetType: 'platform_staff',
      targetId: userId,
    });
    return json({ revoked: true, userId });
  }

  if (body.action === 'assign_platform_staff') {
    const staffRole =
      body.staffRole === 'onboarding_specialist' || body.staffRole === 'operations_manager'
        ? body.staffRole
        : 'support_agent';
    const permissions = Array.isArray(body.permissions)
      ? body.permissions.map((p) => sanitizeText(p, 60))
      : ['view_tickets', 'assist_onboarding', 'view_domains'];

    await env.DB.prepare(
      `INSERT INTO platform_staff (user_id, email, full_name, staff_role, permissions_json, is_active, assigned_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         email = excluded.email,
         full_name = excluded.full_name,
         staff_role = excluded.staff_role,
         permissions_json = excluded.permissions_json,
         is_active = 1,
         assigned_by = excluded.assigned_by,
         updated_at = datetime('now')`
    )
      .bind(
        userId,
        sanitizeText(body.email || '', 120),
        sanitizeText(body.fullName || '', 120),
        staffRole,
        JSON.stringify(permissions),
        auth.user.id
      )
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: 'super_admin',
      action: 'platform_staff_assigned',
      targetType: 'platform_staff',
      targetId: userId,
      details: { staffRole, permissions },
    });

    return json({ assigned: true, userId, staffRole, permissions }, 201);
  }

  return errorJson('Unsupported admin-summary action.', 400);
}
