import { CloudflareEnv, handleOptions, jsonResponse } from '../_shared';

export const onRequestOptions = () => handleOptions();

export const onRequestGet = async ({ params, env }: { params: { slug: string }; env: CloudflareEnv }) => {
  const slug = String(params.slug || '').toLowerCase().trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return jsonResponse({ error: 'Website not found.' }, 404);
  try {
    const row = await env.DB!.prepare(`SELECT p.public_slug, p.business_name, p.website_json, p.published_at,
        u.status AS owner_status
      FROM customer_website_publications p
      LEFT JOIN vv_users u ON u.id = p.owner_id
      WHERE p.public_slug = ? AND p.status = 'published' LIMIT 1`)
      .bind(slug).first<any>();
    if (!row) return jsonResponse({ error: 'This website is not published or does not exist.' }, 404);
    // A published row is not enough: a suspended account must not keep serving
    // its public website. Unknown legacy owners remain governed by publication
    // state; a known suspended owner is always blocked.
    if (String(row.owner_status || '').toLowerCase() === 'suspended') {
      return jsonResponse({ error: 'This website is temporarily unavailable.' }, 403);
    }
    let website: any;
    try { website = JSON.parse(row.website_json); } catch { return jsonResponse({ error: 'Published website data is invalid.' }, 500); }
    return jsonResponse({ success: true, slug: row.public_slug, businessName: row.business_name, website, publishedAt: row.published_at }, 200, { 'Cache-Control': 'public, max-age=60, s-maxage=300' });
  } catch (error) {
    console.error('Public website lookup failed:', error);
    return jsonResponse({ error: 'Website publishing storage is not configured yet.' }, 503);
  }
};
