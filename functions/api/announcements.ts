// ============================================================================
// GET /api/announcements — Public Platform Announcements (Cloudflare Pages)
// ============================================================================

import { PagesContext, handleOptions, jsonResponse } from './_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(_context: PagesContext): Promise<Response> {
  return jsonResponse({ announcements: [] });
}
