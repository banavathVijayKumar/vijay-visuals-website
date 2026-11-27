// ============================================================================
// PATCH /api/delivery/orders/:id/pod — RETIRED LEGACY POD ENDPOINT
//
// This route previously accepted client-supplied `status`, `otpVerified`,
// `podCode`, and `photoDataUrl` as proof of delivery. That bypass is closed.
// Delivery completion is available only through /secure-pod, which verifies a
// one-time customer code, assignment, paid state, photo, and conditional write.
// ============================================================================

import { handleOptions, jsonResponse } from '../../../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPatch(): Promise<Response> {
  return jsonResponse(
    {
      error:
        'Legacy proof-of-delivery recording is disabled. Use /api/delivery/orders/:id/secure-pod with a verified customer code and delivery photo.',
      code: 'SECURE_POD_REQUIRED',
      replacement: '/api/delivery/orders/:id/secure-pod',
    },
    410
  );
}
