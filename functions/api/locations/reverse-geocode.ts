// ============================================================================
// POST /api/locations/reverse-geocode — Server-side Google reverse geocoding.
// Public/optional-auth route (map clicks and explicit-consent device GPS).
// The Google key is never exposed to the browser.
// ============================================================================

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

  // Same env handling as /api/locations/config. Placeholder values are not keys.
  const apiKey = String(env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GOOGLE_MAPS_API_KEY' || apiKey === 'YOUR_API_KEY') {
    return jsonResponse(
      {
        error: 'Google Maps API key is not configured. Coordinates are preserved and you can type the address manually.',
        configured: false,
      },
      503
    );
  }

  const rl = await checkRateLimit(env, `locations_geocode:${getClientIp(request)}`, 30, 60);
  if (!rl.allowed) {
    return rateLimitResponse(
      rl,
      'Too many map coordinate lookups. Please try again shortly or type the address manually.'
    );
  }

  const body = await parseJsonBody<{ latitude?: number; longitude?: number }>(request);
  const lat = body?.latitude;
  const lng = body?.longitude;
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return jsonResponse({ error: 'Valid latitude (-90..90) and longitude (-180..180) are required.' }, 400);
  }

  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat.toFixed(6)},${lng.toFixed(6)}` +
      `&language=en&key=${encodeURIComponent(apiKey)}`;

    const upstream = await fetch(url);
    if (upstream.status === 429) {
      return jsonResponse(
        {
          error: 'Google Maps API daily quota exceeded. Coordinates captured; please type the street address manually.',
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
          error: 'Google Maps API daily quota reached. Coordinates captured; please type your address manually.',
          quotaExceeded: true,
        },
        429
      );
    }
    if (data.status === 'REQUEST_DENIED') {
      return jsonResponse({ error: data.error_message || 'Reverse geocoding request denied.' }, 403);
    }
    if (data.status === 'ZERO_RESULTS' || !data.results || data.results.length === 0) {
      return jsonResponse(
        { error: 'No street address found for these coordinates. Please enter the address manually.' },
        404
      );
    }

    const top = data.results[0];
    return jsonResponse({
      latitude: lat,
      longitude: lng,
      formattedAddress: sanitizeText(top.formatted_address, 500),
      placeId: sanitizeText(top.place_id, 240),
      ...parseAddressComponents(top.address_components),
    });
  } catch (err) {
    return jsonResponse(
      { error: 'Unable to reach reverse geocoding service. You can enter the address manually.' },
      502
    );
  }
}
