// ============================================================================
// GET & DELETE /api/proposals/:id
// ============================================================================

import { requireUser } from '../_auth';
import { PagesContext, errorJson, handleOptions, json } from '../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext<{ id: string }>): Promise<Response> {
  const { env, params, request } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const id = Number(params?.id);
  if (!id) return errorJson('Invalid proposal ID.', 400);

  const proposal = await env.DB.prepare('SELECT * FROM platform_proposals WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!proposal) return errorJson('Proposal not found.', 404);

  const isOwner =
    proposal.owner_id === auth.user.id ||
    proposal.owner_id === auth.user.authSubject ||
    auth.user.isSuperAdmin;

  if (!isOwner) return errorJson('Forbidden.', 403);

  return json({ proposal });
}

export async function onRequestDelete(context: PagesContext<{ id: string }>): Promise<Response> {
  const { env, params, request } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const id = Number(params?.id);
  if (!id) return errorJson('Invalid proposal ID.', 400);

  const proposal = await env.DB.prepare('SELECT * FROM platform_proposals WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!proposal) return errorJson('Proposal not found.', 404);

  const isOwner =
    proposal.owner_id === auth.user.id ||
    proposal.owner_id === auth.user.authSubject ||
    auth.user.isSuperAdmin;

  if (!isOwner) return errorJson('Forbidden.', 403);

  await env.DB.prepare('DELETE FROM platform_proposals WHERE id = ?').bind(id).run();
  return json({ ok: true, deletedId: id });
}
