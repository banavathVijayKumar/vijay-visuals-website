import { apiFetch } from './api';

export interface MapsClientConfig {
  configured: boolean;
  provider: 'google_maps' | 'manual_fallback';
  apiKey: string;
  mapboxConfigured: boolean;
  geocodingProxyEnabled: boolean;
  manualFallbackAlwaysAvailable: boolean;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  placeId: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

let cachedConfigPromise: Promise<MapsClientConfig> | null = null;

export function fetchMapsConfig(forceRefresh = false): Promise<MapsClientConfig> {
  if (!cachedConfigPromise || forceRefresh) {
    cachedConfigPromise = apiFetch<MapsClientConfig>('/api/locations/config')
      .then((res): MapsClientConfig => {
        const envFallbackKey =
          (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GOOGLE_MAPS_API_KEY || '';
        const finalKey = (res.apiKey || envFallbackKey || '').trim();
        return {
          ...res,
          apiKey: finalKey,
          configured: Boolean(finalKey),
          provider: finalKey ? 'google_maps' : 'manual_fallback',
        };
      })
      .catch((): MapsClientConfig => {
        const envFallbackKey =
          (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GOOGLE_MAPS_API_KEY || '';
        return {
          configured: Boolean(envFallbackKey),
          provider: envFallbackKey ? 'google_maps' : 'manual_fallback',
          apiKey: envFallbackKey,
          mapboxConfigured: false,
          geocodingProxyEnabled: false,
          manualFallbackAlwaysAvailable: true,
        };
      });
  }
  return cachedConfigPromise!;
}

export function notifyQuotaExceededIfNeeded(status: number, body?: { quotaExceeded?: boolean; error?: string }) {
  const errText = body?.error || '';
  if (
    status === 429 ||
    body?.quotaExceeded ||
    errText.includes('RESOURCE_EXHAUSTED') ||
    errText.includes('OVER_QUERY_LIMIT')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

export async function geocodeAddressViaProxy(address: string, authToken?: string | null): Promise<GeocodeResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch('/api/locations/geocode', {
    method: 'POST',
    headers,
    body: JSON.stringify({ address }),
  });
  const data = await res.json().catch(() => ({}));
  notifyQuotaExceededIfNeeded(res.status, data);
  if (!res.ok) {
    throw new Error(data.error || `Geocoding failed (${res.status}).`);
  }
  return data as GeocodeResult;
}

export async function reverseGeocodeViaProxy(
  latitude: number,
  longitude: number,
  authToken?: string | null
): Promise<GeocodeResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch('/api/locations/reverse-geocode', {
    method: 'POST',
    headers,
    body: JSON.stringify({ latitude, longitude }),
  });
  const data = await res.json().catch(() => ({}));
  notifyQuotaExceededIfNeeded(res.status, data);
  if (!res.ok) {
    throw new Error(data.error || `Reverse geocoding failed (${res.status}).`);
  }
  return data as GeocodeResult;
}

export function buildDirectionsUrl(lat?: number | null, lng?: number | null, address?: string): string {
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;
  }
  if (address && address.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address.trim())}`;
  }
  return 'https://www.google.com/maps';
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function requestSingleGpsPosition(highAccuracy = false): Promise<{
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Device GPS geolocation is not supported by this browser. Use manual address entry instead.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracyMeters: Math.round(pos.coords.accuracy || 0),
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('GPS permission was denied. You can click directly on the map or enter the address manually.'));
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(new Error('Current GPS position is unavailable. Use map pin or manual address entry.'));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error('GPS request timed out. Try again or enter your address manually.'));
        } else {
          reject(new Error('Unable to read device GPS. Manual address entry is always available.'));
        }
      },
      {
        enableHighAccuracy: highAccuracy,
        maximumAge: highAccuracy ? 10000 : 30000,
        timeout: 10000,
      }
    );
  });
}
