// ============================================================================
// PATCH /api/customer/consent — Update Marketing Consent & Privacy Preferences
// ============================================================================

import { requireUser } from '../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  writeAuditLog,
} from '../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPatch(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody<{
    marketingConsent?: boolean;
    unsubscribed?: boolean;
  }>(request);

  const consent = Boolean(body?.marketingConsent);

  if (env.DB) {
    try {
      await env.DB.prepare(
        `UPDATE crm_contacts_leads
         SET marketing_consent = ?, unsubscribed_at = ?
         WHERE email = ? OR phone = ?`
      )
        .bind(
          consent ? 1 : 0,
          consent ? null : new Date().toISOString(),
          auth.user.email,
          auth.user.email
        )
        .run();
    } catch {}
  }

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: auth.user.platformRole,
    action: 'update_customer_consent',
    targetType: 'user',
    targetId: auth.user.id,
    details: { marketingConsent: consent },
  });

  return jsonResponse({ success: true, marketingConsent: consent });
}
