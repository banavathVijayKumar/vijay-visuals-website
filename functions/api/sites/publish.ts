import { CloudflareEnv, handleOptions, jsonResponse } from '../_shared';
import { isResponse, requireUser } from '../marketplace/_auth';

export const onRequestOptions = () => handleOptions();

export const onRequestPost = async ({ request, env }: { request: Request; env: CloudflareEnv }) => {
  const user = await requireUser(request, env);
  if (isResponse(user)) return user;

  let body: any;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON request.' }, 400); }
  const slug = String(body?.slug || '').toLowerCase().trim();
  const businessName = String(body?.businessName || '').trim();
  const website = body?.website;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 70) {
    return jsonResponse({ error: 'Business URL name is invalid. Use 2–70 letters, numbers or hyphens.' }, 400);
  }
  if (!businessName || businessName.length > 120 || !website || typeof website !== 'object') {
    return jsonResponse({ error: 'Business name or website content is missing.' }, 400);
  }
  const serialized = JSON.stringify(website);
  if (serialized.length > 200_000) return jsonResponse({ error: 'Website content is too large (maximum 200 KB).' }, 413);

  try {
    const existing = await env.DB!.prepare(
      'SELECT website_id, owner_id FROM customer_website_publications WHERE public_slug = ?'
    ).bind(slug).first<any>();
    const now = new Date().toISOString();
    if (existing && existing.owner_id !== user.id) {
      return jsonResponse({ error: 'This website URL is already in use. Change the business name and try again.' }, 409);
    }
    if (existing) {
      await env.DB!.prepare(`UPDATE customer_website_publications
        SET business_name = ?, website_json = ?, status = 'published', published_at = ?, updated_at = ?
        WHERE public_slug = ? AND owner_id = ?`)
        .bind(businessName, serialized, now, now, slug, user.id).run();
    } else {
      await env.DB!.prepare(`INSERT INTO customer_website_publications
        (website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'published', ?, ?, ?)`)
        .bind(crypto.randomUUID(), user.id, slug, businessName, serialized, now, now, now).run();
    }
    return jsonResponse({ success: true, slug, url: `/sites/${slug}`, publishedAt: now });
  } catch (error) {
    console.error('Website publication failed:', error);
    return jsonResponse({ error: 'Website publishing database is not ready. Apply the customer website publication migration, then retry.' }, 503);
  }
};
