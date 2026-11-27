// ============================================================================
// Secure POD capture: customer OTP + optimized delivery photo.
// Server verifies the one-time code and validates the inline image before the
// existing delivery write path is allowed to complete.
// ============================================================================

import React, { useState } from 'react';
import { apiFetch } from '../lib/api';
import { readAndOptimizeImageFile } from '../lib/imageUpload';

interface Props {
  orderId: number;
  orderNumber: string;
  recipientName: string;
  codCollected: boolean;
  onComplete: () => void | Promise<void>;
  onNotify: (message: string) => void;
}

export function DeliverySecurePod({
  orderId,
  orderNumber,
  recipientName,
  codCollected,
  onComplete,
  onNotify,
}: Props) {
  const [otp, setOtp] = useState('');
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!/^\d{6}$/.test(otp)) {
      onNotify('Enter the 6-digit code shared by the customer.');
      return;
    }
    if (!photo.startsWith('data:image/')) {
      onNotify('Attach a PNG, JPG, or WebP delivery photo.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/delivery/orders/${orderId}/secure-pod`, {
        method: 'PATCH',
        body: JSON.stringify({
          recipientName,
          podCode: `SECURE-POD-${orderNumber.slice(-6)}`,
          codCollected,
          customerOtp: otp,
          photoDataUrl: photo,
        }),
      });
      setOtp('');
      setPhoto('');
      await onComplete();
      onNotify('OTP-verified delivery proof with photo recorded.');
    } catch (err: any) {
      onNotify(err?.message || 'Secure POD could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full rounded-lg border border-emerald-500/25 bg-[#08100D] p-3 space-y-2 text-[11px]">
      <p className="font-semibold text-emerald-300">Secure POD (customer OTP + photo)</p>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="Customer 6-digit code"
          className="flex-1 min-w-[150px] rounded border border-[#2A3B33] bg-[#050A08] px-2.5 py-1.5 text-white"
        />
        <label className="px-3 py-1.5 rounded border border-emerald-500/40 text-emerald-300 cursor-pointer">
          {photo ? 'Photo attached' : 'Attach photo'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                setPhoto(await readAndOptimizeImageFile(file, 960));
              } catch (err: any) {
                onNotify(err?.message || 'Photo could not be attached.');
              }
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="px-3 py-1.5 rounded bg-emerald-600/90 text-white font-semibold disabled:opacity-50"
        >
          {busy ? 'Recording…' : 'Record Secure POD'}
        </button>
      </div>
    </div>
  );
}

export default DeliverySecurePod;
