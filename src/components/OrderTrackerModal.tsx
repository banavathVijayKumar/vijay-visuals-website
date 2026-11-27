import React, { useCallback, useEffect, useState } from 'react';
import { APIProvider, AdvancedMarker, Map as GoogleMap, Pin } from '@vis.gl/react-google-maps';
import { ExternalLink, MapPin, Navigation, Package, Printer, RefreshCw, Search, Truck, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { buildDirectionsUrl, fetchMapsConfig, MapsClientConfig } from '../lib/mapsClient';
import { DeliveryLocationPingRecord, DeliveryPartnerRecord, OrderRecord } from '../types/platform';

interface OrderTrackerModalProps {
  open: boolean;
  onClose: () => void;
  onOpenInvoice?: (order: OrderRecord, tenantName: string) => void;
}

interface LiveLocationResponse {
  orderNumber: string;
  status: string;
  pollingAllowed: boolean;
  recommendedPollIntervalMs: number;
  mapsConfigured?: boolean;
  latestPing: DeliveryLocationPingRecord | null;
  lastKnownPing?: DeliveryLocationPingRecord | null;
  stale?: boolean;
  storeBranch: {
    branchName: string;
    fullAddress: string;
    latitude: number | null;
    longitude: number | null;
    directionsUrl: string;
  } | null;
  message: string;
}

const STEPS = ['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'];

export const OrderTrackerModal: React.FC<OrderTrackerModalProps> = ({
  open,
  onClose,
  onOpenInvoice,
}) => {
  const [orderNumber, setOrderNumber] = useState('');
  const [verification, setVerification] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    order: OrderRecord;
    tenantName: string;
    tenantPhone: string;
    deliveryPartner: DeliveryPartnerRecord | null;
  } | null>(null);
  const [liveLoc, setLiveLoc] = useState<LiveLocationResponse | null>(null);
  const [mapsConfig, setMapsConfig] = useState<MapsClientConfig | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchMapsConfig().then(setMapsConfig).catch(() => {});
  }, [open]);

  const verificationQuery = useCallback(() => {
    const value = verification.trim();
    if (!value) return '';
    const key = value.includes('@') ? 'email' : 'phone';
    return `?${key}=${encodeURIComponent(value)}`;
  }, [verification]);

  const fetchLiveLocation = useCallback(
    async (ordNum: string) => {
      try {
        const data = await apiFetch<LiveLocationResponse>(
          `/api/orders/${encodeURIComponent(ordNum)}/live-location${verificationQuery()}`
        );
        setLiveLoc(data);
      } catch {
        // Non-fatal: milestone tracker continues working
      }
    },
    [verificationQuery]
  );

  // Battery & bandwidth-friendly conditional polling:
  // Polls ONLY while modal is open, tab is visible, and order is in transit!
  useEffect(() => {
    if (!open || !result) return;
    const ordNum = result.order.orderNumber;
    const inTransit =
      result.order.status === 'ready_for_pickup' || result.order.status === 'out_for_delivery';

    fetchLiveLocation(ordNum);
    if (!inTransit) return;

    const intervalMs = liveLoc?.recommendedPollIntervalMs && liveLoc.recommendedPollIntervalMs >= 10000
      ? liveLoc.recommendedPollIntervalMs
      : 20000;

    const timer = window.setInterval(() => {
      if (!document.hidden) {
        fetchLiveLocation(ordNum);
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [open, result, fetchLiveLocation, liveLoc?.recommendedPollIntervalMs]);

  if (!open) return null;

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) return;
    setLoading(true);
    setError(null);
    setLiveLoc(null);
    try {
      const data = await apiFetch<{
        order: OrderRecord;
        tenantName: string;
        tenantPhone: string;
        deliveryPartner: DeliveryPartnerRecord | null;
      }>(`/api/orders/track/${encodeURIComponent(orderNumber.trim())}${verificationQuery()}`);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Unable to find order.');
    } finally {
      setLoading(false);
    }
  };

  const currentStepIdx = result ? STEPS.indexOf(result.order.status) : -1;
  const displayedPing = liveLoc?.latestPing ?? liveLoc?.lastKnownPing ?? null;
  const mapCenter = displayedPing
    ? { lat: displayedPing.latitude, lng: displayedPing.longitude }
    : liveLoc?.storeBranch?.latitude != null && liveLoc.storeBranch.longitude != null
      ? { lat: liveLoc.storeBranch.latitude, lng: liveLoc.storeBranch.longitude }
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl border border-[#282836] bg-[#0F0F15] p-6 text-[#E8E8ED] my-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#D4AF37]" />
            <h3 className="font-luxury text-lg font-semibold text-white">Live Order Tracking</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#8B8B9C] hover:text-white"
            aria-label="Close order tracker"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleTrack} className="flex flex-wrap gap-2 mb-5">
          <input
            type="text"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="Enter your Order ID"
            className="min-w-[160px] flex-1 rounded-md border border-[#2A2A38] bg-[#09090D] px-3.5 py-2.5 text-sm text-white placeholder-[#68687A] focus:border-[#D4AF37] focus:outline-none"
          />
          <input
            type="text"
            value={verification}
            onChange={(e) => setVerification(e.target.value)}
            placeholder="Phone or email used for this order"
            className="min-w-[220px] flex-1 rounded-md border border-[#2A2A38] bg-[#09090D] px-3.5 py-2.5 text-sm text-white placeholder-[#68687A] focus:border-[#D4AF37] focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold whitespace-nowrap shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            <span>{loading ? 'Searching...' : 'Track'}</span>
          </button>
        </form>
        <p className="text-[11px] text-[#78788E] -mt-3 mb-4">
          Use the phone number or email from your order to view verified details and live delivery location.
        </p>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-xs text-rose-200 mb-4">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4 border-t border-[#222230] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#A3A3B5]">
              <span>
                Store: <strong className="text-white">{result.tenantName}</strong>
              </span>
              <span className="font-mono-tabular text-[#ECC86A]">{result.order.orderNumber}</span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {STEPS.map((step, i) => {
                const completed = currentStepIdx >= i;
                return (
                  <div key={step} className="text-center">
                    <div
                      className={`h-1.5 rounded-full mb-1.5 ${
                        completed ? 'bg-[#D4AF37]' : 'bg-[#232330]'
                      }`}
                    />
                    <span className={`text-[11px] capitalize ${completed ? 'text-[#ECC86A]' : 'text-[#68687A]'}`}>
                      {step.replace(/_/g, ' ')}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-[#222230] bg-[#0A0A0F] p-4 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[#8E8EA0]">Customer</span>
                <span className="text-white">{result.order.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8E8EA0]">Total Amount</span>
                <span className="font-mono-tabular text-white">₹{result.order.total.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8E8EA0]">Payment</span>
                <span className="text-white capitalize">
                  {result.order.paymentMethod.replace('_', ' ')} · {result.order.paymentStatus.replace('_', ' ')}
                </span>
              </div>
              {result.deliveryPartner && (
                <div className="flex justify-between pt-2 border-t border-[#1D1D28]">
                  <span className="text-[#8E8EA0]">Assigned Delivery Partner</span>
                  <span className="text-[#ECC86A]">
                    {result.deliveryPartner.name} ({result.deliveryPartner.phone})
                  </span>
                </div>
              )}
            </div>

            {/* Secure Conditional Live Location Map (Active Only While In Transit) */}
            {liveLoc && (
              <div className="rounded-lg border border-[#242434] bg-[#0A0A0F] overflow-hidden text-xs">
                <div className="px-4 py-2.5 border-b border-[#1E1E2B] flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                    <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Delivery & Store Location</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {liveLoc.pollingAllowed && (
                      <button
                        type="button"
                        onClick={() => fetchLiveLocation(result.order.orderNumber)}
                        className="inline-flex items-center gap-1 text-[11px] text-[#ECC86A] hover:underline"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Refresh (auto 20s)</span>
                      </button>
                    )}
                    {liveLoc.storeBranch && (
                      <a
                        href={buildDirectionsUrl(
                          liveLoc.storeBranch.latitude,
                          liveLoc.storeBranch.longitude,
                          liveLoc.storeBranch.fullAddress
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:underline"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>Store Directions</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>

                {mapsConfig?.configured && mapsConfig.apiKey && mapCenter ? (
                  <div className="h-[220px] w-full">
                    <APIProvider apiKey={mapsConfig.apiKey} language="en" region="IN">
                      <GoogleMap
                        mapId="DEMO_MAP_ID"
                        defaultCenter={mapCenter}
                        center={mapCenter}
                        defaultZoom={14}
                        gestureHandling="cooperative"
                        style={{ width: '100%', height: '100%' }}
                      >
                        {liveLoc.storeBranch?.latitude != null && liveLoc.storeBranch.longitude != null && (
                          <AdvancedMarker
                            position={{
                              lat: liveLoc.storeBranch.latitude,
                              lng: liveLoc.storeBranch.longitude,
                            }}
                            title={`Store: ${liveLoc.storeBranch.branchName}`}
                          >
                            <Pin background="#D4AF37" glyphColor="#08080A" borderColor="#ffffff" />
                          </AdvancedMarker>
                        )}
                        {displayedPing && (
                          <AdvancedMarker
                            position={{
                              lat: displayedPing.latitude,
                              lng: displayedPing.longitude,
                            }}
                            title={liveLoc.stale ? 'Delivery Partner Last Known Position (stale)' : 'Delivery Partner Live Position'}
                          >
                            <Pin
                              background={liveLoc.stale ? '#B45309' : '#10B981'}
                              glyphColor="#ffffff"
                              borderColor={liveLoc.stale ? '#78350F' : '#064E3B'}
                            />
                          </AdvancedMarker>
                        )}
                      </GoogleMap>
                    </APIProvider>
                  </div>
                ) : null}

                <div className="px-4 py-2.5 text-[11px] text-[#9E9EB2] flex flex-wrap items-center justify-between gap-2">
                  <span className={liveLoc.stale ? 'text-amber-300' : undefined}>{liveLoc.message}</span>
                  {displayedPing && (
                    <span
                      className={`font-mono-tabular ${liveLoc.stale ? 'text-amber-300' : 'text-emerald-300'}`}
                    >
                      {liveLoc.stale ? 'Last update' : 'Updated'} {new Date(displayedPing.recordedAt).toLocaleTimeString()}
                      {!liveLoc.stale && ` (±${displayedPing.accuracyMeters}m)`}
                    </span>
                  )}
                </div>
              </div>
            )}

            {onOpenInvoice && (
              <button
                type="button"
                onClick={() => onOpenInvoice(result.order, result.tenantName)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#323244] text-xs font-medium text-[#E8E8ED] hover:border-[#D4AF37]"
              >
                <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>View Printable GST Invoice ({result.order.invoiceNumber})</span>
              </button>
            )}
          </div>
        )}

        {!result && !error && (
          <div className="flex items-center gap-3 text-xs text-[#88889A] bg-[#0B0B10] border border-[#1E1E28] rounded-lg p-4">
            <Package className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>Place an order on a supported storefront to receive a live tracking code and downloadable invoice immediately.</span>
          </div>
        )}
      </div>
    </div>
  );
};
