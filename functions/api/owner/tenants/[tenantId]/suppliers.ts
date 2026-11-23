// ============================================================================
// POST /api/owner/tenants/:tenantId/suppliers — Add Inventory Supplier
// ============================================================================

import { requireUser } from '../../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../../_shared';
import { isMissingTableError, requireTenantOwnerAccess } from '../../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<{
    name?: string;
    contactPhone?: string;
    gstin?: string;
    category?: string;
    leadTimeDays?: number;
    notes?: string;
  }>(request);

  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const name = sanitizeText(body.name, 120);
  const contactPhone = sanitizeText(body.contactPhone, 30);
  const gstin = sanitizeText(body.gstin, 30);
  const category = sanitizeText(body.category, 60) || 'General Supplies';
  const leadTimeDays = Number.isFinite(Number(body.leadTimeDays)) ? Math.max(1, Number(body.leadTimeDays)) : 3;
  const notes = sanitizeText(body.notes, 300);

  if (!name || name.length < 2) {
    return jsonResponse({ error: 'Supplier name is required.' }, 400);
  }

  const tenantRowId = Number(access.row.rowid || 0);
  const websiteId = access.row.website_id;

  try {
    const res = await env.DB!.prepare(
      `INSERT INTO inventory_suppliers (website_id, owner_id, name, contact_phone, gst_number, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(websiteId, access.row.owner_id, name, contactPhone, gstin, notes)
      .run();

    const createdSup = {
      id: Number(res.meta?.last_row_id || Date.now()),
      tenantId: tenantRowId,
      name,
      contactPhone,
      gstin,
      category,
      leadTimeDays,
      notes,
    };

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'create_supplier',
      targetType: 'supplier',
      targetId: String(createdSup.id),
      details: { websiteId, name, contactPhone, gstin },
    });

    return jsonResponse({ success: true, supplier: createdSup });
  } catch (err) {
    if (isMissingTableError(err)) {
      const currentSup: any[] = Array.isArray(access.parsed.suppliers) ? [...access.parsed.suppliers] : [];
      const createdSup = {
        id: Date.now(),
        tenantId: tenantRowId,
        name,
        contactPhone,
        gstin,
        category,
        leadTimeDays,
        notes,
      };
      currentSup.unshift(createdSup);
      access.parsed.suppliers = currentSup;

      await env.DB!.prepare(
        `UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?`
      )
        .bind(JSON.stringify(access.parsed), websiteId)
        .run();

      return jsonResponse({ success: true, supplier: createdSup });
    }
    return jsonResponse({ error: 'Failed to record supplier.' }, 500);
  }
}
