// ============================================================================
// GET & POST /api/platform/media-support
// Plan-Enforced Media Storage Quota, Support Tickets & Backup Audit Records
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../_auth';
import { PagesContext, errorJson, json, parseJsonBody, sanitizeText } from '../_shared';

const ALLOWED_MIME_PREFIXES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf'];

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const url = new URL(request.url);
  const websiteId = sanitizeText(url.searchParams.get('websiteId') || '', 120);

  // Support tickets visible to owner (own tickets) OR Platform Staff / Super Admin (all tickets)
  const ticketsRes = auth.user.isPlatformStaff
    ? await env.DB.prepare('SELECT * FROM support_tickets ORDER BY updated_at DESC LIMIT 100').all()
    : await env.DB.prepare(
        'SELECT * FROM support_tickets WHERE owner_id = ? OR owner_id = ? ORDER BY updated_at DESC LIMIT 50'
      )
        .bind(auth.user.id, auth.user.authSubject)
        .all();

  if (!websiteId) {
    return json({ tickets: ticketsRes.results || [] });
  }

  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const [mediaRes, usageRow, planRow, backupsRes] = await Promise.all([
    env.DB.prepare('SELECT * FROM media_assets WHERE website_id = ? ORDER BY created_at DESC LIMIT 200')
      .bind(websiteId)
      .all(),
    env.DB.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes FROM media_assets WHERE website_id = ?')
      .bind(websiteId)
      .first<{ total_bytes: number }>(),
    env.DB.prepare(
      `SELECT sp.storage_quota_mb
       FROM tenant_subscriptions ts
       INNER JOIN subscription_plans sp ON sp.code = ts.plan_code
       WHERE ts.website_id = ? AND ts.status IN ('trial', 'active')
       ORDER BY ts.id DESC LIMIT 1`
    )
      .bind(websiteId)
      .first<{ storage_quota_mb: number }>(),
    env.DB.prepare('SELECT * FROM backup_audit_records WHERE website_id = ? ORDER BY created_at DESC LIMIT 25')
      .bind(websiteId)
      .all(),
  ]);

  const quotaMb = planRow?.storage_quota_mb || 250;
  const usedBytes = Number(usageRow?.total_bytes || 0);

  return json({
    media: mediaRes.results || [],
    storage: {
      usedBytes,
      usedMb: Number((usedBytes / (1024 * 1024)).toFixed(2)),
      quotaMb,
      quotaBytes: quotaMb * 1024 * 1024,
      r2ObjectStorageConfigured: false,
      note: 'Asset metadata & external CDN URLs are tracked in D1 with strict quota enforcement. Attach a Cloudflare R2 bucket when enabling direct binary uploads.',
    },
    tickets: ticketsRes.results || [],
    backups: backupsRes.results || [],
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<Record<string, unknown>>(request);
  if (!body || !body.action) return errorJson('action is required.', 400);
  const action = String(body.action);

  if (action === 'register_media') {
    const websiteId = sanitizeText(body.websiteId || '', 120);
    if (!websiteId) return errorJson('websiteId is required.', 400);
    const access = await requireWebsiteAccess(env, auth.user, websiteId, [
      'business_owner',
      'business_manager',
      'business_staff',
    ]);
    if (!access.ok) return access.response;

    const fileName = sanitizeText(body.fileName || '', 180);
    const mimeType = sanitizeText(body.mimeType || '', 80).toLowerCase();
    const sizeBytes = Math.round(Number(body.sizeBytes || 0));
    const publicUrl = sanitizeText(body.publicUrl || '', 600);

    if (!fileName || !publicUrl || !/^https?:\/\//i.test(publicUrl)) {
      return errorJson('fileName and valid https:// publicUrl are required.', 400);
    }
    if (!ALLOWED_MIME_PREFIXES.includes(mimeType)) {
      return errorJson(`Unsupported file type "${mimeType}". Allowed: ${ALLOWED_MIME_PREFIXES.join(', ')}`, 400);
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > 10 * 1024 * 1024) {
      return errorJson('File size must be between 1 byte and 10 MB per asset.', 400);
    }

    const [usageRow, planRow] = await Promise.all([
      env.DB.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes FROM media_assets WHERE website_id = ?')
        .bind(websiteId)
        .first<{ total_bytes: number }>(),
      env.DB.prepare(
        `SELECT sp.storage_quota_mb
         FROM tenant_subscriptions ts
         INNER JOIN subscription_plans sp ON sp.code = ts.plan_code
         WHERE ts.website_id = ? AND ts.status IN ('trial', 'active')
         ORDER BY ts.id DESC LIMIT 1`
      )
        .bind(websiteId)
        .first<{ storage_quota_mb: number }>(),
    ]);

    const quotaBytes = (planRow?.storage_quota_mb || 250) * 1024 * 1024;
    if (Number(usageRow?.total_bytes || 0) + sizeBytes > quotaBytes) {
      return errorJson(
        `Storage quota exceeded (${planRow?.storage_quota_mb || 250} MB plan limit). Delete unused assets or upgrade your plan.`,
        413
      );
    }

    const res = await env.DB.prepare(
      `INSERT INTO media_assets (website_id, owner_id, file_name, mime_type, size_bytes, storage_provider, public_url, alt_text, created_at)
       VALUES (?, ?, ?, ?, ?, 'external_url', ?, ?, datetime('now'))`
    )
      .bind(
        websiteId,
        access.website.owner_id,
        fileName,
        mimeType,
        sizeBytes,
        publicUrl,
        sanitizeText(body.altText || '', 180)
      )
      .run();

    return json({ mediaId: Number(res.meta?.last_row_id || 0), fileName, sizeBytes }, 201);
  }

  if (action === 'create_ticket') {
    const subject = sanitizeText(body.subject || '', 180);
    const message = sanitizeText(body.message || '', 2000);
    const websiteId = body.websiteId ? sanitizeText(body.websiteId, 120) : null;
    if (subject.length < 3 || message.length < 5) {
      return errorJson('Support ticket subject and message are required.', 400);
    }
    const priority = ['low', 'normal', 'high', 'urgent'].includes(String(body.priority || ''))
      ? String(body.priority)
      : 'normal';

    const messages = [
      {
        senderId: auth.user.id,
        senderRole: auth.user.platformRole,
        text: message,
        sentAt: new Date().toISOString(),
      },
    ];

    const res = await env.DB.prepare(
      `INSERT INTO support_tickets (website_id, owner_id, subject, category, priority, status, messages_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, datetime('now'), datetime('now'))`
    )
      .bind(
        websiteId,
        auth.user.id,
        subject,
        sanitizeText(body.category || 'general', 60),
        priority,
        JSON.stringify(messages)
      )
      .run();

    return json({ ticketId: Number(res.meta?.last_row_id || 0), status: 'open' }, 201);
  }

  if (action === 'update_ticket') {
    const ticketId = Number(body.ticketId);
    if (!Number.isInteger(ticketId) || ticketId <= 0) return errorJson('Valid ticketId is required.', 400);

    const ticket = await env.DB.prepare('SELECT * FROM support_tickets WHERE id = ? LIMIT 1')
      .bind(ticketId)
      .first<{ id: number; owner_id: string; status: string; messages_json: string; assigned_staff_id: string | null }>();
    if (!ticket) return errorJson('Support ticket not found.', 404);

    const isOwner = ticket.owner_id === auth.user.id || ticket.owner_id === auth.user.authSubject;
    if (!isOwner && !auth.user.isPlatformStaff) {
      return errorJson('Forbidden: you cannot access another customer’s support ticket.', 403);
    }

    let messages: Array<Record<string, unknown>> = [];
    try {
      messages = JSON.parse(ticket.messages_json || '[]');
    } catch {
      messages = [];
    }
    if (body.replyMessage) {
      messages.push({
        senderId: auth.user.id,
        senderRole: auth.user.platformRole,
        text: sanitizeText(body.replyMessage, 2000),
        sentAt: new Date().toISOString(),
      });
    }

    const nextStatus =
      auth.user.isPlatformStaff &&
      ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'].includes(String(body.status || ''))
        ? String(body.status)
        : ticket.status;
    const assignedStaffId =
      auth.user.isPlatformStaff && body.assignedStaffId !== undefined
        ? sanitizeText(body.assignedStaffId, 120)
        : ticket.assigned_staff_id;

    await env.DB.prepare(
      `UPDATE support_tickets SET status = ?, assigned_staff_id = ?, messages_json = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(nextStatus, assignedStaffId, JSON.stringify(messages), ticketId)
      .run();

    return json({ ticketId, status: nextStatus, assignedStaffId, messageCount: messages.length });
  }

  return errorJson('Unsupported media-support action.', 400);
}
