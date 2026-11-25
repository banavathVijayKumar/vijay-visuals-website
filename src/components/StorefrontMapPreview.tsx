import React, { useEffect, useMemo, useState } from 'react';
import { APIProvider, AdvancedMarker, InfoWindow, Map as GoogleMap, Pin } from '@vis.gl/react-google-maps';
import { Clock, ExternalLink, MapPin, Navigation, Phone, Star } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { buildDirectionsUrl, fetchMapsConfig, MapsClientConfig } from '../lib/mapsClient';
import { BusinessLocationRecord } from '../types/platform';

interface StorefrontMapPreviewProps {
  slug: string;
  tenantName: string;
  fallbackAddress: string;
  accentColor?: string;
}

export const StorefrontMapPreview: React.FC<StorefrontMapPreviewProps> = ({
  slug,
  tenantName,
  fallbackAddress,
  accentColor = '#D4AF37',
}) => {
  const [mapsConfig, setMapsConfig] = useState<MapsClientConfig | null>(null);
  const [locations, setLocations] = useState<BusinessLocationRecord[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchMapsConfig(),
      apiFetch<{ locations: BusinessLocationRecord[] }>(
        `/api/public/tenants/${encodeURIComponent(slug)}/locations`
      ).catch(() => ({ locations: [] })),
    ]).then(([cfg, locRes]) => {
      if (!active) return;
      setMapsConfig(cfg);
      const list = locRes.locations || [];
      setLocations(list);
      if (list.length > 0) setSelectedId(list[0].id);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [slug]);

  const pinnedBranches = useMemo(
    () => locations.filter((b) => typeof b.latitude === 'number' && typeof b.longitude === 'number'),
    [locations]
  );

  const selectedBranch = useMemo(
    () => locations.find((b) => b.id === selectedId) || locations[0] || null,
    [locations, selectedId]
  );

  const mapCenter = useMemo(() => {
    if (selectedBranch && selectedBranch.latitude != null && selectedBranch.longitude != null) {
      return { lat: selectedBranch.latitude, lng: selectedBranch.longitude };
    }
    if (pinnedBranches.length > 0) {
      return { lat: pinnedBranches[0].latitude!, lng: pinnedBranches[0].longitude! };
    }
    return null;
  }, [selectedBranch, pinnedBranches]);

  if (loading) {
    return null;
  }

  // If no saved branches AND no fallback address, render nothing
  if (locations.length === 0 && !fallbackAddress.trim()) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[#222230] bg-[#0D0D13] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#1E1E2B] flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold" style={{ color: accentColor }}>
            Visit {tenantName}
          </p>
          <h3 className="font-luxury text-lg font-bold text-white">
            {locations.length > 1 ? `Our ${locations.length} Store Locations` : 'Store Location & Directions'}
          </h3>
        </div>
        <a
          href={buildDirectionsUrl(
            selectedBranch?.latitude,
            selectedBranch?.longitude,
            selectedBranch?.fullAddress || fallbackAddress
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>Get Directions</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Branch Switcher / Address Details */}
        <div className="lg:col-span-5 p-5 space-y-3 border-b lg:border-b-0 lg:border-r border-[#1E1E2B]">
          {locations.length === 0 ? (
            <div className="rounded-lg border border-[#242434] bg-[#09090D] p-4 space-y-2 text-xs">
              <p className="font-semibold text-white flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#D4AF37]" />
                <span>Primary Business Address</span>
              </p>
              <p className="text-[#B4B4C6] leading-relaxed">{fallbackAddress}</p>
              <a
                href={buildDirectionsUrl(null, null, fallbackAddress)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[#ECC86A] hover:underline pt-1"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Open in Google Maps</span>
              </a>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {locations.map((branch) => {
                const isSelected = selectedBranch?.id === branch.id;
                return (
                  <div
                    key={branch.id}
                    onClick={() => setSelectedId(branch.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedId(branch.id);
                    }}
                    className={`rounded-lg border p-3.5 text-xs transition cursor-pointer space-y-1.5 ${
                      isSelected
                        ? 'border-[#D4AF37] bg-[#18150D]'
                        : 'border-[#20202E] bg-[#09090D] hover:border-[#323246]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white">{branch.branchName}</span>
                      {branch.isPrimary && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[#ECC86A]">
                          <Star className="w-3 h-3" /> Main
                        </span>
                      )}
                    </div>
                    <p className="text-[#B4B4C6] leading-relaxed">{branch.fullAddress}</p>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#8E8EA2]">
                      {branch.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3 h-3 text-[#D4AF37]" /> {branch.phone}
                        </span>
                      )}
                      {branch.openingHours && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#D4AF37]" /> {branch.openingHours}
                        </span>
                      )}
                    </div>
                    <div className="pt-1">
                      <a
                        href={buildDirectionsUrl(branch.latitude, branch.longitude, branch.fullAddress)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 hover:underline"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>Get Directions to {branch.branchName}</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Map Preview */}
        <div className="lg:col-span-7 bg-[#09090D]">
          {mapsConfig?.configured && mapsConfig.apiKey && mapCenter ? (
            <div className="h-[320px] w-full">
              <APIProvider apiKey={mapsConfig.apiKey} language="en" region="IN">
                <GoogleMap
                  mapId="DEMO_MAP_ID"
                  defaultCenter={mapCenter}
                  center={mapCenter}
                  defaultZoom={14}
                  gestureHandling="cooperative"
                  style={{ width: '100%', height: '100%' }}
                >
                  {pinnedBranches.map((branch) => (
                    <React.Fragment key={branch.id}>
                      <AdvancedMarker
                        position={{ lat: branch.latitude!, lng: branch.longitude! }}
                        title={branch.branchName}
                        onClick={() => setSelectedId(branch.id)}
                      >
                        <Pin
                          background={selectedBranch?.id === branch.id ? '#D4AF37' : '#2563EB'}
                          glyphColor="#08080A"
                          borderColor="#ffffff"
                        />
                      </AdvancedMarker>
                      {selectedBranch?.id === branch.id && (
                        <InfoWindow
                          position={{ lat: branch.latitude!, lng: branch.longitude! }}
                          onCloseClick={() => setSelectedId(null)}
                        >
                          <div className="text-xs text-[#111] max-w-[220px] space-y-1 p-1">
                            <p className="font-bold">{branch.branchName}</p>
                            <p className="text-[11px] text-gray-700">{branch.fullAddress}</p>
                            <a
                              href={buildDirectionsUrl(branch.latitude, branch.longitude, branch.fullAddress)}
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
                </GoogleMap>
              </APIProvider>
            </div>
          ) : (
            <div className="h-[260px] lg:h-full min-h-[240px] flex flex-col items-center justify-center p-6 text-center space-y-3">
              <MapPin className="w-8 h-8 text-[#D4AF37]" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">
                  {selectedBranch?.branchName || tenantName}
                </p>
                <p className="text-xs text-[#9E9EB2] max-w-sm">
                  {selectedBranch?.fullAddress || fallbackAddress}
                </p>
              </div>
              <a
                href={buildDirectionsUrl(
                  selectedBranch?.latitude,
                  selectedBranch?.longitude,
                  selectedBranch?.fullAddress || fallbackAddress
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-[#D4AF37]/50 text-[#ECC86A] text-xs font-semibold hover:bg-[#19170E]"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Open Directions in Google Maps</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
