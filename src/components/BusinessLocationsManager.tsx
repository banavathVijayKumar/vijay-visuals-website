import React, { useCallback, useEffect, useState } from 'react';
import { APIProvider, AdvancedMarker, InfoWindow, Map as GoogleMap, Pin } from '@vis.gl/react-google-maps';
import {
  BatteryCharging,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { apiFetch, getAuthAccessToken } from '../lib/api';
import {
  buildDirectionsUrl,
  fetchMapsConfig,
  geocodeAddressViaProxy,
  MapsClientConfig,
  requestSingleGpsPosition,
  reverseGeocodeViaProxy,
} from '../lib/mapsClient';
import { BusinessLocationRecord, TenantRecord } from '../types/platform';

interface BusinessLocationsManagerProps {
  tenant: TenantRecord;
  onRefreshTenant: () => void;
  onNotify: (msg: string) => void;
}

const DEFAULT_CENTER = { lat: 17.385, lng: 78.4867 }; // Hyderabad, India default map viewport

export const BusinessLocationsManager: React.FC<BusinessLocationsManagerProps> = ({
  tenant,
  onRefreshTenant,
  onNotify,
}) => {
  const [mapsConfig, setMapsConfig] = useState<MapsClientConfig | null>(null);
  const [locations, setLocations] = useState<BusinessLocationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Branch Form State (Supports Map Pin, Consent GPS, Geocoded, and Pure Manual Fallback)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [branchName, setBranchName] = useState('Main Store');
  const [fullAddress, setFullAddress] = useState(tenant.address || '');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('India');
  const [phone, setPhone] = useState(tenant.phone || '');
  const [openingHours, setOpeningHours] = useState('Mon–Sat: 9:30 AM – 8:30 PM');
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [placeId, setPlaceId] = useState('');
  const [locationSource, setLocationSource] = useState<'map_pin' | 'gps_consent' | 'geocoded' | 'manual'>('manual');
  const [isPrimary, setIsPrimary] = useState(true);

  // Map & GPS Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [gpsConsent, setGpsConsent] = useState(false);
  const [highAccuracyGps, setHighAccuracyGps] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>(DEFAULT_CENTER);
  const [activeInfoId, setActiveInfoId] = useState<number | null>(null);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, data] = await Promise.all([
        fetchMapsConfig(),
        apiFetch<{ locations: BusinessLocationRecord[] }>(`/api/owner/tenants/${tenant.id}/locations`),
      ]);
      setMapsConfig(cfg);
      setLocations(data.locations || []);

      const firstWithCoords = (data.locations || []).find(
        (b) => typeof b.latitude === 'number' && typeof b.longitude === 'number'
      );
      if (firstWithCoords && firstWithCoords.latitude != null && firstWithCoords.longitude != null) {
        setMapCenter({ lat: firstWithCoords.latitude, lng: firstWithCoords.longitude });
      }
      if ((data.locations || []).length > 0) {
        setIsPrimary(false);
        setBranchName(`Branch ${(data.locations || []).length + 1}`);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load business locations.');
    } finally {
      setLoading(false);
    }
  }, [tenant.id, onNotify]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const parsedLat = latitude.trim() !== '' && Number.isFinite(Number(latitude)) ? Number(latitude) : null;
  const parsedLng = longitude.trim() !== '' && Number.isFinite(Number(longitude)) ? Number(longitude) : null;
  const hasDraftPin = parsedLat !== null && parsedLng !== null;

  const resetForm = (branchCount: number) => {
    setEditingId(null);
    setBranchName(branchCount === 0 ? 'Main Store' : `Branch ${branchCount + 1}`);
    setFullAddress('');
    setCity('');
    setStateName('');
    setPostalCode('');
    setCountry('India');
    setPhone(tenant.phone || '');
    setOpeningHours('Mon–Sat: 9:30 AM – 8:30 PM');
    setLatitude('');
    setLongitude('');
    setPlaceId('');
    setLocationSource('manual');
    setIsPrimary(branchCount === 0);
  };

  const applyReverseGeocode = async (lat: number, lng: number, source: 'map_pin' | 'gps_consent') => {
    setLatitude(lat.toFixed(6));
    setLongitude(lng.toFixed(6));
    setMapCenter({ lat, lng });
    setLocationSource(source);

    if (!mapsConfig?.geocodingProxyEnabled) {
      onNotify('Coordinates pinned. Enter or refine the full street address manually.');
      return;
    }

    try {
      const token = await getAuthAccessToken();
      const geo = await reverseGeocodeViaProxy(lat, lng, token);
      if (geo.formattedAddress) setFullAddress(geo.formattedAddress);
      if (geo.city) setCity(geo.city);
      if (geo.state) setStateName(geo.state);
      if (geo.postalCode) setPostalCode(geo.postalCode);
      if (geo.country) setCountry(geo.country);
      if (geo.placeId) setPlaceId(geo.placeId);
      onNotify('Address auto-filled from pinned coordinates. You can edit any field before saving.');
    } catch (err) {
      onNotify(
        err instanceof Error
          ? `${err.message} Coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)}) are still pinned.`
          : 'Coordinates pinned. Please enter the street address manually.'
      );
    }
  };

  const handleGeocodeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchingAddress(true);
    try {
      const token = await getAuthAccessToken();
      const geo = await geocodeAddressViaProxy(searchQuery.trim(), token);
      setLatitude(geo.latitude.toFixed(6));
      setLongitude(geo.longitude.toFixed(6));
      setFullAddress(geo.formattedAddress);
      setCity(geo.city);
      setStateName(geo.state);
      setPostalCode(geo.postalCode);
      setCountry(geo.country || 'India');
      setPlaceId(geo.placeId || '');
      setLocationSource('geocoded');
      setMapCenter({ lat: geo.latitude, lng: geo.longitude });
      onNotify('Location found and pinned on the map.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to find address. Use manual entry or click the map.');
    } finally {
      setSearchingAddress(false);
    }
  };

  const handleUseMyGps = async () => {
    if (!gpsConsent) {
      onNotify('Please check the explicit GPS consent box first.');
      return;
    }
    setLocatingGps(true);
    try {
      const pos = await requestSingleGpsPosition(highAccuracyGps);
      await applyReverseGeocode(pos.latitude, pos.longitude, 'gps_consent');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'GPS unavailable. Enter address manually.');
    } finally {
      setLocatingGps(false);
    }
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim() || !fullAddress.trim()) {
      onNotify('Branch name and full address are required.');
      return;
    }
    if ((parsedLat === null) !== (parsedLng === null)) {
      onNotify('Provide both Latitude and Longitude, or clear both for manual address-only saving.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        branchName: branchName.trim(),
        fullAddress: fullAddress.trim(),
        city: city.trim(),
        state: stateName.trim(),
        postalCode: postalCode.trim(),
        country: country.trim() || 'India',
        latitude: parsedLat,
        longitude: parsedLng,
        placeId: placeId.trim(),
        phone: phone.trim(),
        openingHours: openingHours.trim(),
        locationSource: hasDraftPin ? locationSource : 'manual',
        isPrimary,
      };

      if (editingId) {
        await apiFetch(`/api/owner/tenants/${tenant.id}/locations/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        onNotify(`Updated branch "${branchName.trim()}".`);
      } else {
        await apiFetch(`/api/owner/tenants/${tenant.id}/locations`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onNotify(`Saved branch "${branchName.trim()}" to ${tenant.name}.`);
      }

      await loadLocations();
      onRefreshTenant();
      resetForm(editingId ? locations.length : locations.length + 1);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save branch location.');
    } finally {
      setSaving(false);
    }
  };

  const startEditBranch = (loc: BusinessLocationRecord) => {
    setEditingId(loc.id);
    setBranchName(loc.branchName);
    setFullAddress(loc.fullAddress);
    setCity(loc.city || '');
    setStateName(loc.state || '');
    setPostalCode(loc.postalCode || '');
    setCountry(loc.country || 'India');
    setPhone(loc.phone || '');
    setOpeningHours(loc.openingHours || '');
    setLatitude(loc.latitude != null ? String(loc.latitude) : '');
    setLongitude(loc.longitude != null ? String(loc.longitude) : '');
    setPlaceId(loc.placeId || '');
    setLocationSource(
      (['map_pin', 'gps_consent', 'geocoded', 'manual'].includes(loc.locationSource)
        ? loc.locationSource
        : 'manual') as typeof locationSource
    );
    setIsPrimary(loc.isPrimary);
    if (loc.latitude != null && loc.longitude != null) {
      setMapCenter({ lat: loc.latitude, lng: loc.longitude });
    }
  };

  const handleSetPrimary = async (loc: BusinessLocationRecord) => {
    try {
      await apiFetch(`/api/owner/tenants/${tenant.id}/locations/${loc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPrimary: true }),
      });
      await loadLocations();
      onRefreshTenant();
      onNotify(`"${loc.branchName}" is now your primary storefront branch.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to set primary branch.');
    }
  };

  const handleDeleteBranch = async (loc: BusinessLocationRecord) => {
    try {
      await apiFetch(`/api/owner/tenants/${tenant.id}/locations/${loc.id}`, {
        method: 'DELETE',
      });
      await loadLocations();
      onRefreshTenant();
      onNotify(`Removed branch "${loc.branchName}".`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to delete branch.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Provider Status */}
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-[#D4AF37] font-medium">Multi-Branch Store Locations & Interactive Maps</p>
          <h2 className="font-luxury text-lg font-bold text-white mt-0.5">
            {tenant.name} — Branches, Map Pin & Directions
          </h2>
          <p className="text-xs text-[#9E9EB2] mt-1">
            Click directly on the map, search an address, use one-time mobile GPS with consent, or enter any address manually. All active branches appear on your live storefront with a Get Directions button.
          </p>
        </div>
        <div className="text-right text-xs">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md border ${
              mapsConfig?.configured
                ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                : 'border-amber-500/40 bg-amber-950/30 text-amber-300'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>
              {mapsConfig?.configured
                ? 'Google Maps Platform Connected'
                : 'Manual Address Mode (Maps Key Pending)'}
            </span>
          </span>
        </div>
      </div>

      {/* Interactive Map + Address Search + Consent GPS */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 space-y-4">
          {/* Server-Proxied Address Search */}
          <form onSubmit={handleGeocodeSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#7F7F95] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search shop area, landmark, city, or pincode (e.g. Banjara Hills, Hyderabad 500034)"
                className="w-full pl-9 pr-3 py-2.5 rounded-md border border-[#2A2A38] bg-[#0A0A0F] text-xs text-white placeholder-[#6D6D80] focus:border-[#D4AF37] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={searchingAddress || !mapsConfig?.configured}
              className="px-4 py-2.5 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold whitespace-nowrap disabled:opacity-50"
            >
              {searchingAddress ? 'Finding...' : 'Find on Map'}
            </button>
          </form>

          {/* Interactive Google Map Canvas */}
          <div className="rounded-xl border border-[#222230] bg-[#0A0A0F] overflow-hidden">
            {mapsConfig?.configured && mapsConfig.apiKey ? (
              <div className="h-[360px] w-full relative">
                <APIProvider apiKey={mapsConfig.apiKey} language="en" region="IN">
                  <GoogleMap
                    mapId="DEMO_MAP_ID"
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    defaultCenter={mapCenter}
                    center={mapCenter}
                    defaultZoom={13}
                    gestureHandling="greedy"
                    disableDefaultUI={false}
                    onCameraChanged={(ev) => {
                      if (ev.detail?.center) {
                        setMapCenter(ev.detail.center);
                      }
                    }}
                    onClick={(ev) => {
                      const latLng = ev.detail?.latLng;
                      if (latLng) {
                        applyReverseGeocode(latLng.lat, latLng.lng, 'map_pin');
                      }
                    }}
                    style={{ width: '100%', height: '100%' }}
                  >
                    {/* Existing Saved Branches */}
                    {locations
                      .filter((loc) => typeof loc.latitude === 'number' && typeof loc.longitude === 'number')
                      .map((loc) => (
                        <React.Fragment key={loc.id}>
                          <AdvancedMarker
                            position={{ lat: loc.latitude!, lng: loc.longitude! }}
                            title={loc.branchName}
                            onClick={() => setActiveInfoId(loc.id)}
                          >
                            <Pin
                              background={loc.isPrimary ? '#D4AF37' : '#3B82F6'}
                              glyphColor="#08080A"
                              borderColor="#ffffff"
                            />
                          </AdvancedMarker>
                          {activeInfoId === loc.id && (
                            <InfoWindow
                              position={{ lat: loc.latitude!, lng: loc.longitude! }}
                              onCloseClick={() => setActiveInfoId(null)}
                            >
                              <div className="text-xs text-[#111] max-w-[220px] space-y-1 p-1">
                                <p className="font-bold">{loc.branchName}</p>
                                <p className="text-[11px] text-gray-700">{loc.fullAddress}</p>
                                <a
                                  href={buildDirectionsUrl(loc.latitude, loc.longitude, loc.fullAddress)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block text-[11px] font-semibold text-blue-700 underline"
                                >
                                  Get Directions
                                </a>
                              </div>
                            </InfoWindow>
                          )}
                        </React.Fragment>
                      ))}

                    {/* Draft Marker Being Placed / Dragged */}
                    {hasDraftPin && (
                      <AdvancedMarker
                        position={{ lat: parsedLat!, lng: parsedLng! }}
                        draggable
                        title="Selected Branch Pin (Drag to adjust)"
                        onDragEnd={(ev) => {
                          const pos = ev.latLng;
                          if (pos) {
                            applyReverseGeocode(pos.lat(), pos.lng(), 'map_pin');
                          }
                        }}
                      >
                        <Pin background="#10B981" glyphColor="#ffffff" borderColor="#064E3B" />
                      </AdvancedMarker>
                    )}
                  </GoogleMap>
                </APIProvider>
              </div>
            ) : (
              <div className="h-[260px] w-full flex flex-col items-center justify-center p-6 text-center space-y-2 bg-[#0B0B11]">
                <Compass className="w-8 h-8 text-[#D4AF37]" />
                <p className="text-sm font-semibold text-white">Interactive Map Unavailable — Manual Mode Active</p>
                <p className="text-xs text-[#8E8EA2] max-w-md">
                  You can still enter your complete street address (and optional latitude/longitude) on the right. Customers will still receive a working Get Directions link on your published storefront.
                </p>
              </div>
            )}
            <div className="px-4 py-2.5 border-t border-[#1D1D28] bg-[#0D0D13] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#9E9EB2]">
              <span>Tip: Click anywhere on the map or drag the green pin to set exact shop entrance coordinates.</span>
              {hasDraftPin && (
                <span className="font-mono-tabular text-emerald-300">
                  Pin: {parsedLat!.toFixed(5)}, {parsedLng!.toFixed(5)}
                </span>
              )}
            </div>
          </div>

          {/* Mobile GPS Permission Box with Explicit Consent & Battery-Efficient Defaults */}
          <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-white">
                <Navigation className="w-4 h-4 text-[#D4AF37]" />
                <span>Mobile GPS Quick-Pin (Explicit Consent & Battery-Friendly)</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
                <BatteryCharging className="w-3.5 h-3.5" />
                <span>One-shot read (no background drain)</span>
              </span>
            </div>

            <label className="flex items-start gap-2 text-[#B8B8C8] cursor-pointer">
              <input
                type="checkbox"
                checked={gpsConsent}
                onChange={(e) => setGpsConsent(e.target.checked)}
                className="accent-[#D4AF37] mt-0.5"
              />
              <span>
                I explicitly consent to allow my browser/mobile device to read my current GPS location once to pin this business branch. I can edit or clear coordinates anytime.
              </span>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-[11px] text-[#9A9AAE] cursor-pointer">
                <input
                  type="checkbox"
                  checked={highAccuracyGps}
                  onChange={(e) => setHighAccuracyGps(e.target.checked)}
                  className="accent-[#D4AF37]"
                />
                <span>Use High-Accuracy GPS (uses more battery; leave unchecked for balanced coarse accuracy)</span>
              </label>
              <button
                type="button"
                onClick={handleUseMyGps}
                disabled={!gpsConsent || locatingGps}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[#D4AF37]/50 text-[#ECC86A] font-semibold hover:bg-[#19170E] disabled:opacity-45"
              >
                {locatingGps ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
                <span>{locatingGps ? 'Reading GPS...' : 'Pin My Current Location'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Branch Details & Manual Address Entry Fallback Form */}
        <form
          onSubmit={handleSaveBranch}
          className="xl:col-span-5 rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-3 text-xs h-fit"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              {editingId ? 'Edit Business Branch' : 'Add Business Branch (Map or Manual Fallback)'}
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={() => resetForm(locations.length)}
                className="text-[11px] text-[#9E9EB2] hover:text-white underline"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-[#8E8EA2] mb-1">Branch Name *</label>
              <input
                type="text"
                required
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="e.g. Banjara Hills Flagship"
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#8E8EA2] mb-1">Branch Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#8E8EA2] mb-1">Full Street Address (Manual Fallback Supported) *</label>
            <textarea
              rows={2}
              required
              value={fullAddress}
              onChange={(e) => setFullAddress(e.target.value)}
              placeholder="Shop No, Building, Street, Landmark, Area, Pincode"
              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] text-[#8E8EA2] mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Hyderabad"
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#8E8EA2] mb-1">State</label>
              <input
                type="text"
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
                placeholder="Telangana"
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#8E8EA2] mb-1">Pincode</label>
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="500034"
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#8E8EA2] mb-1">Opening Hours</label>
            <input
              type="text"
              value={openingHours}
              onChange={(e) => setOpeningHours(e.target.value)}
              placeholder="Mon–Sat: 9:30 AM – 8:30 PM"
              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-[#8E8EA2] mb-1">Latitude (Optional)</label>
              <input
                type="text"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="e.g. 17.4126"
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 font-mono-tabular text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#8E8EA2] mb-1">Longitude (Optional)</label>
              <input
                type="text"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="e.g. 78.4398"
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 font-mono-tabular text-white"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-[#C8C8D8] cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="accent-[#D4AF37]"
            />
            <span>Set as Primary Storefront Branch (syncs main storefront address & Google Maps SEO link)</span>
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-md bg-gold-gradient text-[#08080A] font-semibold flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{saving ? 'Saving Branch...' : editingId ? 'Update Branch Location' : 'Save Branch Location'}</span>
          </button>
        </form>
      </div>

      {/* Saved Multi-Branch Directory */}
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#1E1E2B] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">
            Saved Business Branches ({locations.length})
          </h3>
          <span className="text-[11px] text-[#8E8EA2]">
            Displayed live on /site/{tenant.slug}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-[#8E8EA2]">Loading saved branches...</div>
        ) : locations.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#8E8EA2]">
            No branch pins saved yet. Add your main store above using the map pin, GPS, or manual address entry.
          </div>
        ) : (
          <div className="divide-y divide-[#1D1D28]">
            {locations.map((loc) => (
              <div key={loc.id} className="p-4 flex flex-wrap items-start justify-between gap-4 text-xs">
                <div className="space-y-1 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white">{loc.branchName}</span>
                    {loc.isPrimary && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#D4AF37]/20 text-[#ECC86A] text-[10px] font-semibold">
                        <Star className="w-3 h-3" /> Primary
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded border border-[#2A2A38] text-[10px] text-[#A5A5B8] capitalize">
                      Source: {loc.locationSource.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-[#C8C8D6]">{loc.fullAddress}</p>
                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#8E8EA2]">
                    {loc.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3 h-3 text-[#D4AF37]" /> {loc.phone}
                      </span>
                    )}
                    {loc.openingHours && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#D4AF37]" /> {loc.openingHours}
                      </span>
                    )}
                    {loc.latitude != null && loc.longitude != null ? (
                      <span className="font-mono-tabular text-emerald-400">
                        <CheckCircle2 className="w-3 h-3 inline mr-1" />
                        {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                      </span>
                    ) : (
                      <span className="text-amber-300">Manual Address Only (No Pin)</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <a
                    href={buildDirectionsUrl(loc.latitude, loc.longitude, loc.fullAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/30"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Get Directions</span>
                  </a>
                  {!loc.isPrimary && (
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(loc)}
                      className="px-3 py-1.5 rounded border border-[#D4AF37]/40 text-[#ECC86A] hover:bg-[#19170E]"
                    >
                      Make Primary
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startEditBranch(loc)}
                    className="px-3 py-1.5 rounded border border-[#2C2C3C] text-white hover:border-[#D4AF37]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBranch(loc)}
                    className="p-1.5 rounded border border-rose-500/30 text-rose-400 hover:bg-rose-950/30"
                    aria-label={`Delete ${loc.branchName}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
