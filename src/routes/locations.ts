import { Router, Request, Response } from 'express';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  auditLogs,
  businessLocations,
  deliveryLocationPings,
  deliveryPartners,
  orders,
  staffMembers,
  tenantSeoSettings,
  tenants,
} from '../db/schema.ts';
import { AuthRequest, optionalAuth, requireAuth } from '../middleware/auth.ts';
import { createApiRateLimiter } from '../middleware/rateLimit.ts';

export function resolveGoogleMapsApiKey(): string {
  const candidates = [
    process.env.GOOGLE_MAPS_API_KEY,
    process.env.VITE_GOOGLE_MAPS_API_KEY,
    process.env.MAPS_API_KEY,
  ];
  for (const val of candidates) {
    const trimmed = (val || '').trim();
    if (trimmed && trimmed !== 'MY_GOOGLE_MAPS_API_KEY' && trimmed !== 'YOUR_API_KEY') {
      return trimmed;
    }
  }
  return '';
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

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

function parseAddressComponents(components: AddressComponent[] = []) {
  const find = (type: string) => components.find((c) => c.types?.includes(type))?.long_name || '';
  return {
    city:
      find('locality') ||
      find('administrative_area_level_2') ||
      find('sublocality_level_1') ||
      '',
    state: find('administrative_area_level_1') || '',
    postalCode: find('postal_code') || '',
    country: find('country') || 'India',
  };
}

async function assertLocationTenantAccess(req: AuthRequest, tenantId: number) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return { ok: false as const, status: 404, error: 'Business not found.' };
  const dbUser = req.dbUser;
  if (!dbUser) return { ok: false as const, status: 401, error: 'Authentication required.' };
  if (dbUser.role === 'super_admin' || tenant.ownerUserId === dbUser.id) {
    return { ok: true as const, tenant };
  }
  const staff = await db
    .select()
    .from(staffMembers)
    .where(and(eq(staffMembers.tenantId, tenantId), eq(staffMembers.email, dbUser.email), eq(staffMembers.active, true)))
    .limit(1);
  if (staff.length > 0) return { ok: true as const, tenant };
  return {
    ok: false as const,
    status: 403,
    error: 'Tenant isolation enforced: you cannot manage locations for another business.',
  };
}

async function syncPrimaryBranchToTenant(
  tenantId: number,
  branch: { fullAddress: string; latitude: number | null; longitude: number | null }
) {
  const mapsUrl =
    typeof branch.latitude === 'number' && typeof branch.longitude === 'number'
      ? `https://www.google.com/maps/search/?api=1&query=${branch.latitude.toFixed(6)},${branch.longitude.toFixed(6)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.fullAddress)}`;

  await db
    .update(tenants)
    .set({ address: branch.fullAddress })
    .where(eq(tenants.id, tenantId));

  const [existingSeo] = await db
    .select()
    .from(tenantSeoSettings)
    .where(eq(tenantSeoSettings.tenantId, tenantId))
    .limit(1);

  if (existingSeo) {
    await db
      .update(tenantSeoSettings)
      .set({ googleMapsUrl: mapsUrl, updatedAt: new Date() })
      .where(eq(tenantSeoSettings.tenantId, tenantId));
  } else {
    await db.insert(tenantSeoSettings).values({
      tenantId,
      googleMapsUrl: mapsUrl,
    });
  }
}

const branchInputSchema = z
  .object({
    branchName: z.string().trim().min(2, 'Branch name must be at least 2 characters').max(120),
    fullAddress: z.string().trim().min(5, 'Please enter a complete street/area address').max(500),
    city: z.string().trim().max(120).optional().default(''),
    state: z.string().trim().max(120).optional().default(''),
    postalCode: z.string().trim().max(24).optional().default(''),
    country: z.string().trim().max(80).optional().default('India'),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    placeId: z.string().trim().max(240).optional().default(''),
    phone: z.string().trim().max(40).optional().default(''),
    openingHours: z.string().trim().max(200).optional().default('Mon–Sat: 9:30 AM – 8:30 PM'),
    locationSource: z.enum(['map_pin', 'gps_consent', 'geocoded', 'manual']).optional().default('manual'),
    isPrimary: z.boolean().optional().default(false),
    active: z.boolean().optional().default(true),
  })
  .refine(
    (data) =>
      (data.latitude == null && data.longitude == null) ||
      (typeof data.latitude === 'number' && typeof data.longitude === 'number'),
    { message: 'Provide both latitude and longitude together, or leave both empty for manual address entry.' }
  );

export function createLocationsRouter(): Router {
  const router = Router();
  const geocodeLimiter = createApiRateLimiter({ maxRequests: 30, windowMs: 60_000 });

  // 1. Public Safe Maps Configuration (no server secrets leaked; indicates Google Maps JS availability)
  router.get('/api/locations/config', (_req: Request, res: Response) => {
    const apiKey = resolveGoogleMapsApiKey();
    const mapboxConfigured = Boolean((process.env.MAPBOX_ACCESS_TOKEN || '').trim());
    res.json({
      configured: Boolean(apiKey),
      provider: apiKey ? 'google_maps' : 'manual_fallback',
      apiKey: apiKey || '',
      mapboxConfigured,
      geocodingProxyEnabled: Boolean(apiKey),
      manualFallbackAlwaysAvailable: true,
    });
  });

  // 2. Secure Server-Side Geocoding Proxy (never call maps.googleapis.com directly from browser)
  router.post('/api/locations/geocode', requireAuth, geocodeLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const apiKey = resolveGoogleMapsApiKey();
      if (!apiKey) {
        return res.status(503).json({
          error: 'Google Maps API key is not configured on this server. You can enter your address manually.',
          configured: false,
        });
      }

      const parsed = z
        .object({
          address: z.string().trim().min(3, 'Enter at least 3 characters to search an address').max(300),
          region: z.string().trim().max(10).optional().default('in'),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid address query.' });
      }

      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        parsed.data.address
      )}&region=${encodeURIComponent(parsed.data.region)}&language=en&key=${encodeURIComponent(apiKey)}`;

      const upstream = await fetch(url);
      if (upstream.status === 429) {
        return res.status(429).json({
          error: 'Google Maps API daily quota exceeded. Manual address entry remains fully available.',
          quotaExceeded: true,
        });
      }

      const data = (await upstream.json()) as {
        status: string;
        error_message?: string;
        results?: Array<{
          formatted_address: string;
          place_id: string;
          geometry?: { location?: { lat: number; lng: number } };
          address_components?: AddressComponent[];
        }>;
      };

      if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'OVER_DAILY_LIMIT') {
        return res.status(429).json({
          error: 'Google Maps API daily quota reached. You can continue using manual address entry.',
          quotaExceeded: true,
        });
      }

      if (data.status === 'REQUEST_DENIED') {
        return res.status(403).json({
          error: data.error_message || 'Geocoding API access denied for the configured key.',
        });
      }

      if (data.status === 'ZERO_RESULTS' || !data.results || data.results.length === 0) {
        return res.status(404).json({
          error: 'No exact match found. Try a nearby landmark, click directly on the map, or save manually.',
        });
      }

      const top = data.results[0];
      const lat = top.geometry?.location?.lat;
      const lng = top.geometry?.location?.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        return res.status(404).json({ error: 'Geocoding response did not contain coordinates.' });
      }

      const components = parseAddressComponents(top.address_components);
      res.json({
        latitude: lat,
        longitude: lng,
        formattedAddress: top.formatted_address,
        placeId: top.place_id || '',
        ...components,
      });
    } catch (error) {
      console.error('POST /api/locations/geocode failed:', error);
      res.status(502).json({ error: 'Unable to reach Google Geocoding service. Manual address entry still works.' });
    }
  });

  // 3. Secure Server-Side Reverse Geocoding Proxy (for map clicks & explicit-consent mobile GPS)
  router.post('/api/locations/reverse-geocode', optionalAuth, geocodeLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const apiKey = resolveGoogleMapsApiKey();
      if (!apiKey) {
        return res.status(503).json({
          error: 'Google Maps API key is not configured. Coordinates are preserved and you can type the address manually.',
          configured: false,
        });
      }

      const parsed = z
        .object({
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: 'Valid latitude (-90..90) and longitude (-180..180) are required.' });
      }

      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${parsed.data.latitude.toFixed(
        6
      )},${parsed.data.longitude.toFixed(6)}&language=en&key=${encodeURIComponent(apiKey)}`;

      const upstream = await fetch(url);
      if (upstream.status === 429) {
        return res.status(429).json({
          error: 'Google Maps API daily quota exceeded. Coordinates captured; please type the street address manually.',
          quotaExceeded: true,
        });
      }

      const data = (await upstream.json()) as {
        status: string;
        error_message?: string;
        results?: Array<{
          formatted_address: string;
          place_id: string;
          address_components?: AddressComponent[];
        }>;
      };

      if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'OVER_DAILY_LIMIT') {
        return res.status(429).json({
          error: 'Google Maps API daily quota reached. Coordinates captured; please type your address manually.',
          quotaExceeded: true,
        });
      }

      if (data.status === 'REQUEST_DENIED') {
        return res.status(403).json({
          error: data.error_message || 'Reverse geocoding request denied.',
        });
      }

      if (data.status === 'ZERO_RESULTS' || !data.results || data.results.length === 0) {
        return res.status(404).json({
          error: 'No street address found for these coordinates. Please enter the address manually.',
        });
      }

      const top = data.results[0];
      const components = parseAddressComponents(top.address_components);
      res.json({
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        formattedAddress: top.formatted_address,
        placeId: top.place_id || '',
        ...components,
      });
    } catch (error) {
      console.error('POST /api/locations/reverse-geocode failed:', error);
      res.status(502).json({ error: 'Unable to reach reverse geocoding service. You can enter the address manually.' });
    }
  });

  // 4. Public Storefront Multi-Branch Locations (for published customer website map preview & Get Directions)
  router.get('/api/public/tenants/:slug/locations', async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || '').trim().toLowerCase();
      const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
      if (!tenant) {
        return res.status(404).json({ error: 'Storefront not found.' });
      }

      const branches = await db
        .select()
        .from(businessLocations)
        .where(and(eq(businessLocations.tenantId, tenant.id), eq(businessLocations.active, true)))
        .orderBy(desc(businessLocations.isPrimary), asc(businessLocations.id));

      res.json({
        tenantId: tenant.id,
        tenantName: tenant.name,
        fallbackAddress: tenant.address,
        mapsConfigured: Boolean(resolveGoogleMapsApiKey()),
        locations: branches.map((b) => ({
          ...b,
          directionsUrl: buildDirectionsUrl(b.latitude, b.longitude, b.fullAddress),
        })),
      });
    } catch (error) {
      console.error('GET /api/public/tenants/:slug/locations failed:', error);
      res.status(500).json({ error: 'Unable to load business branch locations.' });
    }
  });

  // 5. Owner Multi-Branch Locations CRUD (Strictly Tenant-Isolated)
  router.get('/api/owner/tenants/:tenantId/locations', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertLocationTenantAccess(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const branches = await db
        .select()
        .from(businessLocations)
        .where(eq(businessLocations.tenantId, tenantId))
        .orderBy(desc(businessLocations.isPrimary), asc(businessLocations.id));

      res.json({
        locations: branches.map((b) => ({
          ...b,
          directionsUrl: buildDirectionsUrl(b.latitude, b.longitude, b.fullAddress),
        })),
        tenantAddress: access.tenant.address,
      });
    } catch (error) {
      console.error('GET owner locations failed:', error);
      res.status(500).json({ error: 'Unable to load business locations.' });
    }
  });

  router.post('/api/owner/tenants/:tenantId/locations', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertLocationTenantAccess(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const parsed = branchInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid branch details.' });
      }

      const existing = await db
        .select()
        .from(businessLocations)
        .where(eq(businessLocations.tenantId, tenantId));

      const shouldBePrimary = parsed.data.isPrimary || existing.length === 0;
      if (shouldBePrimary && existing.length > 0) {
        await db
          .update(businessLocations)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(eq(businessLocations.tenantId, tenantId));
      }

      const [created] = await db
        .insert(businessLocations)
        .values({
          tenantId,
          branchName: parsed.data.branchName,
          isPrimary: shouldBePrimary,
          fullAddress: parsed.data.fullAddress,
          city: parsed.data.city,
          state: parsed.data.state,
          postalCode: parsed.data.postalCode,
          country: parsed.data.country,
          latitude: parsed.data.latitude ?? null,
          longitude: parsed.data.longitude ?? null,
          placeId: parsed.data.placeId,
          phone: parsed.data.phone || access.tenant.phone || '',
          openingHours: parsed.data.openingHours,
          locationSource: parsed.data.locationSource,
          active: parsed.data.active,
        })
        .returning();

      if (shouldBePrimary) {
        await syncPrimaryBranchToTenant(tenantId, created);
      }

      await db.insert(auditLogs).values({
        actorEmail: req.dbUser!.email,
        actorRole: req.dbUser!.role,
        tenantId,
        action: 'BUSINESS_LOCATION_CREATED',
        details: `Added branch "${created.branchName}" (${created.locationSource})`,
      });

      res.status(201).json({
        location: {
          ...created,
          directionsUrl: buildDirectionsUrl(created.latitude, created.longitude, created.fullAddress),
        },
      });
    } catch (error) {
      console.error('POST owner location failed:', error);
      res.status(500).json({ error: 'Unable to save business branch location.' });
    }
  });

  router.patch(
    '/api/owner/tenants/:tenantId/locations/:locationId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const tenantId = Number(req.params.tenantId);
        const locationId = Number(req.params.locationId);
        const access = await assertLocationTenantAccess(req, tenantId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const [existing] = await db
          .select()
          .from(businessLocations)
          .where(and(eq(businessLocations.id, locationId), eq(businessLocations.tenantId, tenantId)))
          .limit(1);

        if (!existing) return res.status(404).json({ error: 'Branch location not found for this business.' });

        const patchSchema = z
          .object({
            branchName: z.string().trim().min(2).max(120).optional(),
            fullAddress: z.string().trim().min(5).max(500).optional(),
            city: z.string().trim().max(120).optional(),
            state: z.string().trim().max(120).optional(),
            postalCode: z.string().trim().max(24).optional(),
            country: z.string().trim().max(80).optional(),
            latitude: z.number().min(-90).max(90).nullable().optional(),
            longitude: z.number().min(-180).max(180).nullable().optional(),
            placeId: z.string().trim().max(240).optional(),
            phone: z.string().trim().max(40).optional(),
            openingHours: z.string().trim().max(200).optional(),
            locationSource: z.enum(['map_pin', 'gps_consent', 'geocoded', 'manual']).optional(),
            isPrimary: z.boolean().optional(),
            active: z.boolean().optional(),
          })
          .safeParse(req.body);

        if (!patchSchema.success) {
          return res.status(400).json({ error: patchSchema.error.issues[0]?.message || 'Invalid branch update.' });
        }

        const data = patchSchema.data;
        if (data.isPrimary === true) {
          await db
            .update(businessLocations)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(eq(businessLocations.tenantId, tenantId));
        }

        const [updated] = await db
          .update(businessLocations)
          .set({
            ...data,
            updatedAt: new Date(),
          })
          .where(and(eq(businessLocations.id, locationId), eq(businessLocations.tenantId, tenantId)))
          .returning();

        if (updated.isPrimary) {
          await syncPrimaryBranchToTenant(tenantId, updated);
        }

        res.json({
          location: {
            ...updated,
            directionsUrl: buildDirectionsUrl(updated.latitude, updated.longitude, updated.fullAddress),
          },
        });
      } catch (error) {
        console.error('PATCH owner location failed:', error);
        res.status(500).json({ error: 'Unable to update business location.' });
      }
    }
  );

  router.delete(
    '/api/owner/tenants/:tenantId/locations/:locationId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const tenantId = Number(req.params.tenantId);
        const locationId = Number(req.params.locationId);
        const access = await assertLocationTenantAccess(req, tenantId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const [existing] = await db
          .select()
          .from(businessLocations)
          .where(and(eq(businessLocations.id, locationId), eq(businessLocations.tenantId, tenantId)))
          .limit(1);

        if (!existing) return res.status(404).json({ error: 'Branch location not found.' });

        await db
          .delete(businessLocations)
          .where(and(eq(businessLocations.id, locationId), eq(businessLocations.tenantId, tenantId)));

        if (existing.isPrimary) {
          const [replacement] = await db
            .select()
            .from(businessLocations)
            .where(and(eq(businessLocations.tenantId, tenantId), eq(businessLocations.active, true)))
            .orderBy(asc(businessLocations.id))
            .limit(1);

          if (replacement) {
            await db
              .update(businessLocations)
              .set({ isPrimary: true, updatedAt: new Date() })
              .where(eq(businessLocations.id, replacement.id));
            await syncPrimaryBranchToTenant(tenantId, replacement);
          }
        }

        res.json({ deleted: true, id: locationId });
      } catch (error) {
        console.error('DELETE owner location failed:', error);
        res.status(500).json({ error: 'Unable to delete business location.' });
      }
    }
  );

  // 6. Consent-Gated, Battery-Efficient Delivery Partner Location Ping (active deliveries only)
  router.post('/api/delivery/orders/:id/location', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const orderId = Number(req.params.id);
      const [ord] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!ord) return res.status(404).json({ error: 'Order not found.' });

      const dbUser = req.dbUser!;
      let authorized = dbUser.role === 'super_admin';
      let partnerId: number | null = ord.deliveryPartnerId ?? null;

      if (!authorized) {
        const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ord.tenantId)).limit(1);
        if (tenant && tenant.ownerUserId === dbUser.id) {
          authorized = true;
        }
      }

      if (!authorized && ord.deliveryPartnerId) {
        const [partner] = await db
          .select()
          .from(deliveryPartners)
          .where(eq(deliveryPartners.id, ord.deliveryPartnerId))
          .limit(1);
        if (partner && (partner.userId === dbUser.id || (dbUser.phone && partner.phone === dbUser.phone))) {
          authorized = true;
          partnerId = partner.id;
        }
      }

      if (!authorized) {
        return res.status(403).json({
          error: 'Only the assigned delivery partner or business owner can update delivery location.',
        });
      }

      if (!['ready_for_pickup', 'out_for_delivery'].includes(ord.status)) {
        return res.status(409).json({
          error: `Location sharing is only active during pickup/transit. Current order status is "${ord.status}".`,
        });
      }

      const parsed = z
        .object({
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          accuracyMeters: z.number().min(0).max(25000).optional().default(0),
          batterySaverMode: z.boolean().optional().default(true),
          consentGranted: z.literal(true, {
            message: 'Explicit GPS location sharing consent is required.',
          }),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid location payload.' });
      }

      // Battery/network guard: skip redundant writes within 8s if movement < 25m
      const [lastPing] = await db
        .select()
        .from(deliveryLocationPings)
        .where(eq(deliveryLocationPings.orderId, orderId))
        .orderBy(desc(deliveryLocationPings.recordedAt))
        .limit(1);

      if (lastPing) {
        const ageMs = Date.now() - new Date(lastPing.recordedAt).getTime();
        const distMeters = haversineMeters(
          lastPing.latitude,
          lastPing.longitude,
          parsed.data.latitude,
          parsed.data.longitude
        );
        if (ageMs < 8000 && distMeters < 25) {
          return res.json({
            ping: lastPing,
            deduplicated: true,
            reason: 'Skipped redundant update (< 25m movement within 8s for battery efficiency).',
          });
        }
      }

      const [ping] = await db
        .insert(deliveryLocationPings)
        .values({
          orderId,
          tenantId: ord.tenantId,
          deliveryPartnerId: partnerId,
          latitude: parsed.data.latitude,
          longitude: parsed.data.longitude,
          accuracyMeters: Math.round(parsed.data.accuracyMeters),
          batterySaverMode: parsed.data.batterySaverMode,
          consentGranted: true,
        })
        .returning();

      res.status(201).json({ ping, deduplicated: false });
    } catch (error) {
      console.error('POST /api/delivery/orders/:id/location failed:', error);
      res.status(500).json({ error: 'Unable to record delivery location ping.' });
    }
  });

  // 7. Secure Conditional Polling Endpoint for Live Order Tracking (polls ONLY while in transit)
  router.get('/api/orders/:orderNumber/live-location', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const orderNumber = String(req.params.orderNumber || '').trim();
      const [ord] = await db
        .select()
        .from(orders)
        .where(eq(orders.orderNumber, orderNumber))
        .limit(1);

      if (!ord) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      const [primaryBranch] = await db
        .select()
        .from(businessLocations)
        .where(and(eq(businessLocations.tenantId, ord.tenantId), eq(businessLocations.active, true)))
        .orderBy(desc(businessLocations.isPrimary), asc(businessLocations.id))
        .limit(1);

      const inTransit = ['ready_for_pickup', 'out_for_delivery'].includes(ord.status);
      if (!inTransit) {
        return res.json({
          orderNumber: ord.orderNumber,
          status: ord.status,
          pollingAllowed: false,
          recommendedPollIntervalMs: 0,
          latestPing: null,
          storeBranch: primaryBranch
            ? {
                branchName: primaryBranch.branchName,
                fullAddress: primaryBranch.fullAddress,
                latitude: primaryBranch.latitude,
                longitude: primaryBranch.longitude,
                directionsUrl: buildDirectionsUrl(
                  primaryBranch.latitude,
                  primaryBranch.longitude,
                  primaryBranch.fullAddress
                ),
              }
            : null,
          message:
            ord.status === 'delivered'
              ? 'Order delivered — live GPS polling stopped automatically.'
              : 'Live GPS polling activates only when order is Ready for Pickup or Out for Delivery.',
        });
      }

      const [latestPing] = await db
        .select()
        .from(deliveryLocationPings)
        .where(eq(deliveryLocationPings.orderId, ord.id))
        .orderBy(desc(deliveryLocationPings.recordedAt))
        .limit(1);

      res.json({
        orderNumber: ord.orderNumber,
        status: ord.status,
        pollingAllowed: true,
        recommendedPollIntervalMs: 20000,
        mapsConfigured: Boolean(resolveGoogleMapsApiKey()),
        latestPing: latestPing || null,
        storeBranch: primaryBranch
          ? {
              branchName: primaryBranch.branchName,
              fullAddress: primaryBranch.fullAddress,
              latitude: primaryBranch.latitude,
              longitude: primaryBranch.longitude,
              directionsUrl: buildDirectionsUrl(
                primaryBranch.latitude,
                primaryBranch.longitude,
                primaryBranch.fullAddress
              ),
            }
          : null,
        message: latestPing
          ? 'Live rider coordinates updated with rider consent.'
          : 'Waiting for delivery partner to enable consent-based GPS sharing.',
      });
    } catch (error) {
      console.error('GET /api/orders/:orderNumber/live-location failed:', error);
      res.status(500).json({ error: 'Unable to fetch live delivery location.' });
    }
  });

  return router;
}
