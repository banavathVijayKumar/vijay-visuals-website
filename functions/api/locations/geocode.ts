// ============================================================================
// POST /api/locations/geocode — Authenticated, server-side Google geocoding.
// The browser never receives or uses a server API key. Manual entry fallback
// remains available in the client when this endpoint is unavailable.
// ============================================================================

import { requireUser } from '../_auth';
import {
  PagesContext,
  checkRateLimit,
  getClientIp,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  rateLimitResponse,
  sanitizeText,
} from '../_shared';

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeocodeResult {
  formatted_address: string;
  place_id: string;
  geometry?: { location?: { lat: number; lng: number } };
  address_components?: AddressComponent[];
}

function parseAddressComponents(components: AddressComponent[] = []) {
  const find = (type: string) =>
    components.find((c) => Array.isArray(c?.types) && c.types.includes(type))?.long_name || '';
  return {
    city: find('locality') || find('administrative_area_level_2') || find('sublocality_level_1') || '',
    state: find('administrative_area_level_1') || '',
    postalCode: find('postal_code') || '',
    country: find('country') || 'India',
  };
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  // Same env handling as /api/locations/config. Placeholder values are not keys.
  const apiKey = String(env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GOOGLE_MAPS_API_KEY' || apiKey === 'YOUR_API_KEY') {
    return jsonResponse(
      {
        error: 'Google Maps API key is not configured on this server. You can enter your address manually.',
        configured: false,
      },
      503
    );
  }

  // Shared 30/min limiter with reverse geocoding in the Express implementation.
  const rl = await checkRateLimit(env, `locations_geocode:${getClientIp(request)}`, 30, 60);
  if (!rl.allowed) {
    return rateLimitResponse(rl, 'Too many address searches. Please try again shortly or enter the address manually.');
  }

  const body = await parseJsonBody<{ address?: string; region?: string }>(request);
  const address = sanitizeText(body?.address, 300);
  const region = sanitizeText(body?.region, 10) || 'in';
  if (address.length < 3) {
    return jsonResponse({ error: 'Enter at least 3 characters to search an address.' }, 400);
  }

  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}` +
      `&region=${encodeURIComponent(region)}&language=en&key=${encodeURIComponent(apiKey)}`;

    const upstream = await fetch(url);
    if (upstream.status === 429) {
      return jsonResponse(
        {
          error: 'Google Maps API daily quota exceeded. Manual address entry remains fully available.',
          quotaExceeded: true,
        },
        429
      );
    }

    const data = (await upstream.json()) as {
      status: string;
      error_message?: string;
      results?: GoogleGeocodeResult[];
    };

    if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'OVER_DAILY_LIMIT') {
      return jsonResponse(
        {
          error: 'Google Maps API daily quota reached. You can continue using manual address entry.',
          quotaExceeded: true,
        },
        429
      );
    }
    if (data.status === 'REQUEST_DENIED') {
      return jsonResponse(
        { error: data.error_message || 'Geocoding API access denied for the configured key.' },
        403
      );
    }
    if (data.status === 'ZERO_RESULTS' || !data.results || data.results.length === 0) {
      return jsonResponse(
        { error: 'No exact match found. Try a nearby landmark, click directly on the map, or save manually.' },
        404
      );
    }

    const top = data.results[0];
    const lat = top.geometry?.location?.lat;
    const lng = top.geometry?.location?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return jsonResponse({ error: 'Geocoding response did not contain coordinates.' }, 404);
    }

    return jsonResponse({
      latitude: lat,
      longitude: lng,
      formattedAddress: sanitizeText(top.formatted_address, 500),
      placeId: sanitizeText(top.place_id, 240),
      ...parseAddressComponents(top.address_components),
    });
  } catch (err) {
    return jsonResponse(
      { error: 'Unable to reach Google Geocoding service. Manual address entry still works.' },
      502
    );
  }
}
