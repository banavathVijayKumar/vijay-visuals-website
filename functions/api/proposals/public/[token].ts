// ============================================================================
// GET /api/proposals/public/:token — Customer Public Proposal View
// Secure token-based access without authentication. Tracks customer views.
// ============================================================================

import { PagesContext, errorJson, handleOptions, json, sanitizeText } from '../../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext<{ token: string }>): Promise<Response> {
  const { env, params } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const token = sanitizeText(params?.token || '', 80);
  if (!token || token.length < 10) {
    return errorJson('Invalid or missing proposal token.', 400);
  }

  try {
    const proposal = await env.DB.prepare(
      'SELECT * FROM platform_proposals WHERE secure_token = ? LIMIT 1'
    )
      .bind(token)
      .first<Record<string, any>>();

    if (!proposal) {
      return errorJson('Proposal not found or link has expired.', 404);
    }

    // Check expiry
    const isExpired = proposal.expires_at ? new Date(proposal.expires_at).getTime() < Date.now() : false;

    // Increment view count and update last viewed timestamp
    await env.DB.prepare(
      `UPDATE platform_proposals
       SET view_count = view_count + 1,
           last_viewed_at = datetime('now'),
           delivery_status = CASE
             WHEN delivery_status IN ('draft', 'ready', 'shared', 'email_sent') THEN 'viewed'
             ELSE delivery_status
           END,
           updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(proposal.id)
      .run();

    // Parse structured JSON fields safely
    let features = [];
    try {
      features = JSON.parse(proposal.feature_breakdown_json || '[]');
    } catch {}

    let products = [];
    try {
      products = JSON.parse(proposal.products_json || '[]');
    } catch {}

    let businessPhotos = [];
    try {
      businessPhotos = JSON.parse(proposal.business_photos_json || '[]');
    } catch {}

    let packagesComparison = {};
    try {
      packagesComparison = JSON.parse(proposal.packages_comparison_json || '{}');
    } catch {}

    let preferredColors = { primary: '#D4AF37', accent: '#0D0D12' };
    try {
      preferredColors = JSON.parse(proposal.preferred_colors_json || '{}');
    } catch {}

    return json({
      proposal: {
        ...proposal,
        features,
        products,
        businessPhotos,
        packagesComparison,
        preferredColors,
        isExpired,
      },
    });
  } catch (err) {
    console.error('Failed to load public proposal:', err);
    return errorJson('Failed to load proposal.', 500);
  }
}
