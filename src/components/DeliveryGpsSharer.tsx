import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BatteryCharging, Navigation, PauseCircle, Square } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { haversineMeters } from '../lib/mapsClient';

interface DeliveryGpsSharerProps {
  orderId: number;
  orderNumber: string;
  orderStatus: string;
  onNotify: (msg: string) => void;
}

export const DeliveryGpsSharer: React.FC<DeliveryGpsSharerProps> = ({
  orderId,
  orderNumber,
  orderStatus,
  onNotify,
}) => {
  const [consentChecked, setConsentChecked] = useState(false);
  const [highAccuracy, setHighAccuracy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pausedByBackground, setPausedByBackground] = useState(false);
  const [lastSent, setLastSent] = useState<{ lat: number; lng: number; time: string } | null>(null);
  const [statusNote, setStatusNote] = useState('');

  const watchIdRef = useRef<number | null>(null);
  const lastCoordsRef = useRef<{ lat: number; lng: number; sentAt: number } | null>(null);
  const sharingRef = useRef(false);

  const inTransit =
    orderStatus === 'ready_for_pickup' ||
    orderStatus === 'packed' ||
    orderStatus === 'out_for_delivery';

  useEffect(() => {
    sharingRef.current = sharing;
  }, [sharing]);

  const clearWatcher = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Clearing server-side coordinates is what actually stops customer visibility.
  // The local watcher alone is not sufficient.
  const clearServerLocation = useCallback(() => {
    void apiFetch(`/api/delivery/orders/${orderId}/location`, {
      method: 'POST',
      body: JSON.stringify({ sharingEnabled: false }),
    }).catch(() => {});
  }, [orderId]);

  const stopSharing = useCallback(
    (reason?: string) => {
      clearWatcher();
      clearServerLocation();
      lastCoordsRef.current = null;
      setSharing(false);
      setPausedByBackground(false);
      setLastSent(null);
      if (reason) setStatusNote(reason);
    },
    [clearWatcher, clearServerLocation]
  );

  // Automatically stop GPS tracking when order is no longer in transit
  useEffect(() => {
    if (!inTransit && sharing) {
      stopSharing('Tracking stopped automatically because delivery is completed or inactive.');
    }
  }, [inTransit, sharing, stopSharing]);

  // Clean up on unmount. Stopping the local watcher is not enough: the server
  // row must also be cleared or the customer may keep seeing stale live GPS.
  useEffect(() => {
    return () => {
      clearWatcher();
      if (sharingRef.current) clearServerLocation();
    };
  }, [clearWatcher, clearServerLocation]);

  const startWatch = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onNotify('Device GPS geolocation is unavailable on this browser.');
      setSharing(false);
      return;
    }
    clearWatcher();
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const accuracyMeters = Math.round(pos.coords.accuracy || 0);
        const now = Date.now();

        // Battery & bandwidth filter: upload only if moved >= 25m OR 45s elapsed since last ping
        const prev = lastCoordsRef.current;
        if (prev) {
          const moved = haversineMeters(prev.lat, prev.lng, lat, lng);
          const elapsed = now - prev.sentAt;
          if (moved < 25 && elapsed < 45_000) {
            setStatusNote(`Battery saver: skipped ping (moved ${Math.round(moved)}m < 25m threshold).`);
            return;
          }
        }

        try {
          await apiFetch(`/api/delivery/orders/${orderId}/location`, {
            method: 'POST',
            body: JSON.stringify({
              latitude: lat,
              longitude: lng,
              accuracyMeters,
              batterySaverMode: !highAccuracy,
              consentGranted: true,
            }),
          });
          lastCoordsRef.current = { lat, lng, sentAt: now };
          setLastSent({ lat, lng, time: new Date().toLocaleTimeString() });
          setStatusNote(`Location shared (±${accuracyMeters}m, ${highAccuracy ? 'High Accuracy' : 'Battery Saver'}).`);
        } catch (err) {
          setStatusNote(err instanceof Error ? err.message : 'Unable to upload GPS update.');
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          stopSharing('GPS permission denied by device. Milestone buttons still work normally.');
          onNotify('GPS permission denied. Continue updating delivery milestones manually.');
        } else {
          setStatusNote(`GPS temporary warning: ${err.message}`);
        }
      },
      {
        enableHighAccuracy: highAccuracy,
        maximumAge: highAccuracy ? 10_000 : 30_000,
        timeout: 12_000,
      }
    );
  }, [clearWatcher, highAccuracy, onNotify, orderId, stopSharing]);

  // Page Visibility API: pause GPS watch while tab/app is hidden to save battery
  useEffect(() => {
    if (!sharing) return;
    startWatch();

    const onVisibility = () => {
      if (document.hidden) {
        clearWatcher();
        // Background pause must also clear server coordinates, otherwise the
        // customer can keep seeing the last ping after the watcher has stopped.
        clearServerLocation();
        setPausedByBackground(true);
        setStatusNote('Paused GPS automatically while app is in background (battery protection).');
      } else {
        setPausedByBackground(false);
        startWatch();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearWatcher();
      if (sharingRef.current) clearServerLocation();
    };
  }, [sharing, startWatch, clearWatcher, clearServerLocation]);

  if (!inTransit) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-[#252534] bg-[#09090D] p-3 space-y-2 text-[11px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-semibold text-white">
          <Navigation className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>Optional Live GPS Sharing ({orderNumber})</span>
        </span>
        <span className="inline-flex items-center gap-1 text-emerald-300">
          <BatteryCharging className="w-3.5 h-3.5" />
          <span>25m movement filter · Auto-pauses in background</span>
        </span>
      </div>

      {!sharing ? (
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-[#B4B4C6] cursor-pointer">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="accent-[#D4AF37] mt-0.5"
            />
            <span>
              I explicitly consent to share my current GPS location for this active delivery. Tracking stops automatically upon delivery or when I tap Stop.
            </span>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[#8E8EA2] cursor-pointer">
              <input
                type="checkbox"
                checked={highAccuracy}
                onChange={(e) => setHighAccuracy(e.target.checked)}
                className="accent-[#D4AF37]"
              />
              <span>High-accuracy GPS (off = Battery Saver coarse mode)</span>
            </label>
            <button
              type="button"
              disabled={!consentChecked}
              onClick={() => {
                setSharing(true);
                onNotify(`Battery-efficient GPS sharing started for ${orderNumber}.`);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#D4AF37] text-[#08080A] font-semibold disabled:opacity-40"
            >
              <Navigation className="w-3 h-3" />
              <span>Start Sharing Location</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-emerald-300 font-medium flex items-center gap-1.5">
              {pausedByBackground ? (
                <>
                  <PauseCircle className="w-3.5 h-3.5 text-amber-300" />
                  <span className="text-amber-300">Paused in background</span>
                </>
              ) : (
                <span>Live Sharing Active</span>
              )}
            </p>
            {lastSent && (
              <p className="font-mono-tabular text-[#A5A5B8]">
                Last ping: {lastSent.lat.toFixed(4)}, {lastSent.lng.toFixed(4)} at {lastSent.time}
              </p>
            )}
            {statusNote && <p className="text-[#8E8EA2]">{statusNote}</p>}
          </div>
          <button
            type="button"
            onClick={() => {
              stopSharing('Stopped sharing location.');
              onNotify('Stopped live GPS sharing.');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-rose-500/40 bg-rose-950/30 text-rose-200 font-semibold"
          >
            <Square className="w-3 h-3" />
            <span>Stop Sharing</span>
          </button>
        </div>
      )}
    </div>
  );
};
