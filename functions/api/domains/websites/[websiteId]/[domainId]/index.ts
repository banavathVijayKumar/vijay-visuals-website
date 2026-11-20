// ============================================================================
// PATCH & DELETE /api/domains/websites/:websiteId/:domainId
// Update domain settings (registrar, www_mode, primary, expiry) or disconnect.
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../../../../_auth';
import { PagesContext, errorJson, json, parseJsonBody, sanitizeText } from '../../../../_shared';
import { TenantDomainRow, buildDnsInstructions, recordDomainEvent } from '../../../_helpers';

export async function onRequestPatch(
  context: PagesContext<{ websiteId: string; domainId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireWebsiteAccess(env, auth.user, params.websiteId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const domainId = Number(params.domainId);
  if (!Number.isInteger(domainId) || domainId <= 0) {
    return errorJson('Invalid domain ID.', 400);
  }

  const existing = await env.DB.prepare(
    'SELECT * FROM tenant_domains WHERE id = ? AND website_id = ? LIMIT 1'
  )
    .bind(domainId, params.websiteId)
    .first<TenantDomainRow>();

  if (!existing) {
    return errorJson('Domain not found for this website.', 404);
  }

  const body = await parseJsonBody<{
    registrarName?: string;
    wwwMode?: 'redirect_to_root' | 'redirect_to_www' | 'both';
    isPrimary?: boolean;
    expiryDate?: string | null;
    renewalDate?: string | null;
  }>(request);
  if (!body) return errorJson('Invalid JSON payload.', 400);

  const registrarName =
    body.registrarName !== undefined
      ? sanitizeText(body.registrarName, 80)
      : existing.registrar_name;

  const wwwMode =
    body.wwwMode === 'redirect_to_root' ||
    body.wwwMode === 'redirect_to_www' ||
    body.wwwMode === 'both'
      ? body.wwwMode
      : existing.www_mode;

  const expiryDate =
    body.expiryDate !== undefined
      ? body.expiryDate
        ? sanitizeText(body.expiryDate, 32)
        : null
      : existing.expiry_date;

  const renewalDate =
    body.renewalDate !== undefined
      ? body.renewalDate
        ? sanitizeText(body.renewalDate, 32)
        : null
      : existing.renewal_date;

  let isPrimary = existing.is_primary;
  if (body.isPrimary === true) {
    await env.DB.prepare('UPDATE tenant_domains SET is_primary = 0 WHERE website_id = ?')
      .bind(params.websiteId)
      .run();
    isPrimary = 1;
  } else if (body.isPrimary === false) {
    isPrimary = 0;
  }

  await env.DB.prepare(
    `UPDATE tenant_domains
     SET registrar_name = ?, www_mode = ?, is_primary = ?, expiry_date = ?, renewal_date = ?, updated_at = datetime('now')
     WHERE id = ? AND website_id = ?`
  )
    .bind(registrarName, wwwMode, isPrimary, expiryDate, renewalDate, domainId, params.websiteId)
    .run();

  const updated = await env.DB.prepare('SELECT * FROM tenant_domains WHERE id = ? LIMIT 1')
    .bind(domainId)
    .first<TenantDomainRow>();

  await recordDomainEvent(env, {
    domainId,
    websiteId: params.websiteId,
    ownerId: existing.owner_id,
    eventType: 'domain_settings_updated',
    actorRole: access.effectiveRole,
    actorId: auth.user.id,
    reason: 'Updated domain metadata/routing preferences',
    details: { registrarName, wwwMode, isPrimary: Boolean(isPrimary), expiryDate, renewalDate },
  });

  return json({
    domain: updated
      ? {
          ...updated,
          is_primary: Boolean(updated.is_primary),
          dnsInstructions: buildDnsInstructions(updated.domain_name, updated.verification_token, env),
        }
      : null,
  });
}

export async function onRequestDelete(
  context: PagesContext<{ websiteId: string; domainId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireWebsiteAccess(env, auth.user, params.websiteId, ['business_owner']);
  if (!access.ok) return access.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const domainId = Number(params.domainId);
  if (!Number.isInteger(domainId) || domainId <= 0) {
    return errorJson('Invalid domain ID.', 400);
  }

  const existing = await env.DB.prepare(
    'SELECT * FROM tenant_domains WHERE id = ? AND website_id = ? LIMIT 1'
  )
    .bind(domainId, params.websiteId)
    .first<TenantDomainRow>();

  if (!existing) {
    return errorJson('Domain not found for this website.', 404);
  }

  await env.DB.prepare(
    `UPDATE tenant_domains
     SET status = 'disconnected', is_primary = 0, updated_at = datetime('now')
     WHERE id = ? AND website_id = ?`
  )
    .bind(domainId, params.websiteId)
    .run();

  await recordDomainEvent(env, {
    domainId,
    websiteId: params.websiteId,
    ownerId: existing.owner_id,
    eventType: 'domain_disconnected',
    actorRole: access.effectiveRole,
    actorId: auth.user.id,
    reason: 'Customer disconnected domain from website',
    details: { domain: existing.domain_name },
  });

  return json({
    disconnected: true,
    domainId,
    domainName: existing.domain_name,
    message:
      'Domain disconnected from Vijay Visuals routing. Remove DNS records at your registrar if you no longer wish to point traffic here.',
  });
}
