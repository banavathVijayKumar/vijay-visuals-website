// ============================================================================
// Delivery pickup verification: native camera/manual scan, batch progress,
// wrong-product warnings, local QR/Code-39 labels, and conservative auto-sync.
// No server mutation is queued or replayed by this component.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import {
  applyPickupScan,
  buildLabelPayload,
  buildPickupProgress,
  code39Svg,
  enqueueScan,
  normalizeScanCode,
  parseOrderItems,
  pickupComplete,
  qrSvg,
  reconcileScanQueue,
  scanDedupeKey,
  scanFromCamera,
  type DeliveryProductLookup,
  type PickupProgressItem,
  type PickupScanStatus,
} from '../lib/deliveryScanner';

interface Props {
  orderId: number;
  itemsJson: string;
  tenantId: string;
  onNotify: (message: string) => void;
}

const WARNING_TEXT: Record<Exclude<PickupScanStatus, 'ok'>, string> = {
  wrong_product: 'Wrong product scanned — this item is not in this order.',
  over_scan: 'All units of this item were already scanned. Do not pick extra units.',
  unknown_product: 'Unrecognised code. Use the product SKU/barcode listed below.',
};

export function DeliveryPickupScanner({ orderId, itemsJson, tenantId, onNotify }: Props) {
  const [products, setProducts] = useState<DeliveryProductLookup[]>([]);
  const [progress, setProgress] = useState<PickupProgressItem[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [labelProductId, setLabelProductId] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const items = useMemo(() => parseOrderItems(itemsJson), [itemsJson]);

  const handleScan = useCallback(
    (rawCode: string) => {
      const code = normalizeScanCode(rawCode);
      if (!code) return;
      const now = Date.now();
      if (lastScanRef.current.code === code && now - lastScanRef.current.at < 1500) return;
      lastScanRef.current = { code, at: now };

      const result = applyPickupScan(progress, code, tenantId);
      setProgress(result.progress);
      const createdAt = new Date(now).toISOString();
      enqueueScan({
        dedupeKey: scanDedupeKey(tenantId, orderId, code, createdAt),
        tenantId,
        orderId,
        productId: result.productId,
        code,
        status: result.status,
        createdAt,
      });

      if (result.status === 'ok') {
        onNotify(`Pickup verified: ${code}`);
      } else {
        onNotify(WARNING_TEXT[result.status]);
      }
    },
    [onNotify, orderId, progress, tenantId]
  );

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ products: DeliveryProductLookup[] }>(`/api/delivery/orders/${orderId}/products`)
      .then((data) => {
        if (cancelled) return;
        const loaded = Array.isArray(data?.products) ? data.products : [];
        setProducts(loaded);
        setProgress(buildPickupProgress(items, loaded));
      })
      .catch(() => {
        if (!cancelled) setCameraError('Pickup catalog unavailable. Manual SKU checks still work.');
      });
    return () => {
      cancelled = true;
    };
  }, [items, orderId]);

  // Reconcile queued scan events with a read-only server lookup. It never
  // replays delivery status/POD mutations after reconnect.
  useEffect(() => {
    const reconcile = async () => {
      await reconcileScanQueue(async (event) => {
        const data = await apiFetch<{ products: DeliveryProductLookup[] }>(
          `/api/delivery/orders/${event.orderId}/products`
        );
        return (data?.products || []).some(
          (product) =>
            Number(product.id) === Number(event.productId) ||
            normalizeScanCode(product.sku) === normalizeScanCode(event.code) ||
            normalizeScanCode(product.barcode) === normalizeScanCode(event.code)
        );
      });
    };
    const onOnline = () => {
      void reconcile();
    };
    if (typeof window !== 'undefined' && navigator.onLine) void reconcile();
    window.addEventListener?.('online', onOnline);
    return () => window.removeEventListener?.('online', onOnline);
  }, []);

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is unavailable on this device. Use manual entry.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      timerRef.current = window.setInterval(async () => {
        if (!videoRef.current) return;
        const result = await scanFromCamera(videoRef.current);
        if (!result.supported) {
          setCameraError(result.error || 'Native barcode scanning is unavailable.');
          stopCamera();
          return;
        }
        if (result.code) handleScan(result.code);
      }, 600);
    } catch {
      setCameraError('Camera permission was denied. Use manual entry.');
    }
  }, [handleScan, stopCamera]);

  const complete = pickupComplete(progress);
  const labelProduct = products.find((p) => p.id === labelProductId) || null;
  const safeQr = labelProduct ? qrSvg(buildLabelPayload(tenantId, labelProduct.id)) : '';
  const labelCode = labelProduct?.sku || labelProduct?.barcode || '';
  const safeBarcode = code39Svg(labelCode);

  return (
    <div className="w-full rounded-lg border border-[#242433] bg-[#0A0A0F] p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-[#C8C8D8]">
          Batch pickup scan · {progress.filter((p) => p.picked >= p.expected).length}/{progress.length} items verified
        </p>
        <span className={`text-[11px] font-semibold ${complete ? 'text-emerald-400' : 'text-amber-400'}`}>
          {complete ? 'All items matched' : 'Verification incomplete'}
        </span>
      </div>

      {progress.length > 0 && (
        <div className="space-y-1">
          {progress.map((item) => (
            <div key={item.productId} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-white">
                {item.name} <span className="text-[#8E8EA2]">· {item.sku || item.barcode || `#${item.productId}`}</span>
              </span>
              <span className={item.picked >= item.expected ? 'text-emerald-400' : 'text-[#ECC86A]'}>
                {item.picked}/{item.expected}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleScan(manualCode);
              setManualCode('');
            }
          }}
          placeholder="Enter SKU or barcode"
          className="flex-1 min-w-[180px] rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-1.5 text-[11px] text-white"
        />
        <button
          type="button"
          onClick={() => {
            handleScan(manualCode);
            setManualCode('');
          }}
          className="px-3 py-1.5 rounded border border-[#D4AF37]/40 text-[11px] text-[#ECC86A]"
        >
          Verify
        </button>
        {cameraActive ? (
          <button
            type="button"
            onClick={stopCamera}
            className="px-3 py-1.5 rounded border border-rose-500/40 text-[11px] text-rose-300"
          >
            Stop camera
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startCamera()}
            className="px-3 py-1.5 rounded border border-emerald-500/40 text-[11px] text-emerald-300"
          >
            Scan with camera
          </button>
        )}
      </div>
      {cameraActive && <video ref={videoRef} muted playsInline className="w-full h-40 rounded bg-black object-cover" />}
      {cameraError && <p className="text-[11px] text-amber-400">{cameraError}</p>}

      {products.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {products
            .filter((product) => items.some((item) => item.productId === product.id))
            .map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => setLabelProductId(product.id === labelProductId ? null : product.id)}
                className="px-2 py-1 rounded border border-[#2B2B3B] text-[10px] text-[#B4B4C6]"
              >
                Label: {product.sku || product.barcode || `#${product.id}`}
              </button>
            ))}
        </div>
      )}

      {labelProduct && (
        <div className="rounded border border-[#242433] bg-[#08080C] p-2 space-y-2 text-[10px] text-[#9D9DB0]">
          <p>QR label payload: {buildLabelPayload(tenantId, labelProduct.id)}</p>
          <div className="h-24 w-24 bg-white" dangerouslySetInnerHTML={{ __html: safeQr }} />
          {safeBarcode ? (
            <div className="h-12 w-full bg-white" dangerouslySetInnerHTML={{ __html: safeBarcode }} />
          ) : (
            <p>Linear label unavailable for this SKU; use the QR label above.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default DeliveryPickupScanner;
