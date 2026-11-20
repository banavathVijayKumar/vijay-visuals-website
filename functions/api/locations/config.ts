// ============================================================================
// GET /api/locations/config — Public Maps Client Capability Configuration
// Returns real Google Maps availability or manual fallback mode as JSON.
// ============================================================================

import { PagesContext, handleOptions, jsonResponse } from '../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { env } = context;
  const apiKey = String(env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const hasServerGeocodeKey = Boolean(
    String(env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY || '').trim()
  );

  return jsonResponse({
    configured: Boolean(apiKey),
    provider: apiKey ? 'google_maps' : 'manual_fallback',
    apiKey,
    mapboxConfigured: false,
    geocodingProxyEnabled: hasServerGeocodeKey,
    manualFallbackAlwaysAvailable: true,
  });
}
