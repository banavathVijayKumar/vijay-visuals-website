// ============================================================================
// POST /api/payments/platform/verify
// Flow 1: Platform Payment Verification & Automatic Subscription Provisioning
// Forwards directly to official Cashfree verification engine
// ============================================================================

import { PagesContext } from '../../_shared';
import { onRequestPost as verifyCashfreePlatformOrder } from '../cashfree/verify';

export async function onRequestPost(context: PagesContext): Promise<Response> {
  return verifyCashfreePlatformOrder(context);
}
