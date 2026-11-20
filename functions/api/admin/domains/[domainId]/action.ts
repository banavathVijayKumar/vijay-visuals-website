// ============================================================================
// PATCH /api/admin/domains/:domainId/action — Super Admin Governance Actions
// Requires Super Admin role + mandatory audit reason on destructive/override actions.
// ============================================================================

import { requireAdmin } from '../../../_auth';
import { PagesContext, errorJson, json, parseJsonBody, sanitizeText, writeAuditLog } from '../../../_shared';
import {
  TenantDomainRow,
  createDomainNotification,
  recordDomainEvent,
} from '../../../domains/_helpers';

type AdminDomainAction =
  | 'approve'
  | 'reject'
  | 'suspend'
  | 'reactivate'
  | 'disconnect'
  | 'send_dns_instructions'
  | 'send_renewal_reminder'
  | 'confirm_renewal'
  | 'assign_website';

export async function onRequestPatch(
  context: PagesContext<{ domainId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const domainId = Number(params.domainId);
  if (!Number.isInteger(domainId) || domainId <= 0) {
    return errorJson('Invalid domain ID.', 400);
  }

  const domainRow = await env.DB.prepare('SELECT * FROM tenant_domains WHERE id = ? LIMIT 1')
    .bind(domainId)
    .first<TenantDomainRow>();
  if (!domainRow) return errorJson('Domain not found.', 404);

  const body = await parseJsonBody<{
    action?: AdminDomainAction;
    reason?: string;
    targetWebsiteId?: string;
    newExpiryDate?: string;
    allowCrossOwnerTransfer?: boolean;
  }>(request);
  if (!body || !body.action) {
    return errorJson('Action is required.', 400);
  }

  const reason = sanitizeText(body.reason || '', 400);
  const actionsRequiringReason: AdminDomainAction[] = [
    'reject',
    'suspend',
    'disconnect',
    'assign_website',
    'reactivate',
  ];
  if (actionsRequiringReason.includes(body.action) && reason.length < 5) {
    return errorJson('A clear audit reason (at least 5 characters) is mandatory for this Super Admin action.', 400);
  }

  let updatedStatus = domainRow.status;
  let message = 'Action completed.';

  switch (body.action) {
    case 'approve': {
      // Honest approval: never fake SSL active if DNS/HTTPS have not passed
      updatedStatus =
        domainRow.dns_verification_status === 'verified' && domainRow.ssl_status === 'active'
          ? 'live'
          : domainRow.dns_verification_status === 'verified'
            ? 'ssl_pending'
            : 'pending_dns';
      await env.DB.prepare(
        `UPDATE tenant_domains
         SET status = ?, approved_by = ?, approved_at = datetime('now'), admin_notes = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(updatedStatus, auth.user.id, reason || domainRow.admin_notes, domainId)
        .run();
      message = `Domain approved (current technical state: ${updatedStatus}).`;
      break;
    }

    case 'reject': {
      updatedStatus = 'rejected';
      await env.DB.prepare(
        `UPDATE tenant_domains SET status = 'rejected', admin_notes = ?, updated_at = datetime('now') WHERE id = ?`
      )
        .bind(reason, domainId)
        .run();
      await createDomainNotification(env, {
        domainId,
        websiteId: domainRow.website_id,
        ownerId: domainRow.owner_id,
        notificationType: 'admin_rejected',
        title: `Domain Request Rejected: ${domainRow.domain_name}`,
        message: `Reason: ${reason}`,
        severity: 'critical',
      });
      message = 'Domain rejected and customer notified.';
      break;
    }

    case 'suspend': {
      updatedStatus = 'suspended';
      await env.DB.prepare(
        `UPDATE tenant_domains SET status = 'suspended', admin_notes = ?, updated_at = datetime('now') WHERE id = ?`
      )
        .bind(reason, domainId)
        .run();
      await createDomainNotification(env, {
        domainId,
        websiteId: domainRow.website_id,
        ownerId: domainRow.owner_id,
        notificationType: 'admin_suspended',
        title: `Domain Suspended: ${domainRow.domain_name}`,
        message: `Your custom domain routing has been suspended. Reason: ${reason}`,
        severity: 'critical',
      });
      message = 'Domain suspended immediately across edge routing.';
      break;
    }

    case 'reactivate': {
      updatedStatus =
        domainRow.dns_verification_status === 'verified' && domainRow.ssl_status === 'active'
          ? 'live'
          : 'pending_dns';
      await env.DB.prepare(
        `UPDATE tenant_domains SET status = ?, admin_notes = ?, updated_at = datetime('now') WHERE id = ?`
      )
        .bind(updatedStatus, reason, domainId)
        .run();
      message = `Domain reactivated with status ${updatedStatus}.`;
      break;
    }

    case 'disconnect': {
      updatedStatus = 'disconnected';
      await env.DB.prepare(
        `UPDATE tenant_domains SET status = 'disconnected', is_primary = 0, admin_notes = ?, updated_at = datetime('now') WHERE id = ?`
      )
        .bind(reason, domainId)
        .run();
      message = 'Domain disconnected.';
      break;
    }

    case 'send_dns_instructions': {
      await createDomainNotification(env, {
        domainId,
        websiteId: domainRow.website_id,
        ownerId: domainRow.owner_id,
        notificationType: 'dns_instructions',
        title: `DNS Setup Instructions for ${domainRow.domain_name}`,
        message: `Add TXT record _vijayvisuals.${domainRow.domain_name} = ${domainRow.verification_token} and CNAME -> ${domainRow.dns_target}. ${reason}`,
        severity: 'info',
      });
      message = 'DNS setup instructions delivered in-app (external Email/WhatsApp require connector setup).';
      break;
    }

    case 'send_renewal_reminder': {
      await createDomainNotification(env, {
        domainId,
        websiteId: domainRow.website_id,
        ownerId: domainRow.owner_id,
        notificationType: 'manual_renewal_reminder',
        title: `Action Required: Renew ${domainRow.domain_name}`,
        message: `Please renew ${domainRow.domain_name} at ${domainRow.registrar_name || 'your registrar'} before ${domainRow.expiry_date || 'expiry'}. ${reason}`,
        severity: 'warning',
      });
      message = 'Manual renewal reminder sent in-app.';
      break;
    }

    case 'confirm_renewal': {
      const nextExpiry = sanitizeText(body.newExpiryDate || '', 32);
      if (!nextExpiry || Number.isNaN(Date.parse(nextExpiry))) {
        return errorJson('A valid ISO newExpiryDate (YYYY-MM-DD) is required to confirm renewal.', 400);
      }
      updatedStatus =
        domainRow.dns_verification_status === 'verified' && domainRow.ssl_status === 'active'
          ? 'live'
          : domainRow.status === 'expired' || domainRow.status === 'expiring_soon'
            ? 'pending_dns'
            : domainRow.status;
      await env.DB.prepare(
        `UPDATE tenant_domains
         SET expiry_date = ?, renewal_date = ?, status = ?, admin_notes = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(nextExpiry, nextExpiry, updatedStatus, reason || 'Renewal confirmed by Super Admin', domainId)
        .run();
      message = `Renewal confirmed through ${nextExpiry}.`;
      break;
    }

    case 'assign_website': {
      const targetWebsiteId = sanitizeText(body.targetWebsiteId || '', 120);
      if (!targetWebsiteId) {
        return errorJson('targetWebsiteId is required for assign_website.', 400);
      }
      const targetSite = await env.DB.prepare(
        'SELECT website_id, owner_id, business_name FROM customer_website_publications WHERE website_id = ? LIMIT 1'
      )
        .bind(targetWebsiteId)
        .first<{ website_id: string; owner_id: string; business_name: string }>();
      if (!targetSite) {
        return errorJson('Target website not found.', 404);
      }
      // Ownership guardrail: prevent accidental cross-owner domain reassignment without explicit opt-in
      if (targetSite.owner_id !== domainRow.owner_id && !body.allowCrossOwnerTransfer) {
        return errorJson(
          'Cross-owner domain reassignment blocked by safety guardrail. Pass allowCrossOwnerTransfer: true only after verifying written domain ownership.',
          409
        );
      }
      await env.DB.prepare(
        `UPDATE tenant_domains
         SET website_id = ?, owner_id = ?, admin_notes = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(targetSite.website_id, targetSite.owner_id, reason, domainId)
        .run();
      message = `Domain reassigned to website ${targetSite.business_name} (${targetSite.website_id}).`;
      break;
    }

    default:
      return errorJson('Unsupported domain admin action.', 400);
  }

  await recordDomainEvent(env, {
    domainId,
    websiteId: domainRow.website_id,
    ownerId: domainRow.owner_id,
    eventType: `admin_${body.action}`,
    actorRole: 'super_admin',
    actorId: auth.user.id,
    reason,
    details: { updatedStatus, targetWebsiteId: body.targetWebsiteId || null },
  });

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: 'super_admin',
    action: `domain_${body.action}`,
    targetType: 'tenant_domain',
    targetId: String(domainId),
    details: { domainName: domainRow.domain_name, reason, updatedStatus },
  });

  const refreshed = await env.DB.prepare('SELECT * FROM tenant_domains WHERE id = ? LIMIT 1')
    .bind(domainId)
    .first();

  return json({ message, domain: refreshed });
}
