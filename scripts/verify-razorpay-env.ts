import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

import { getRazorpayStatus } from '../src/lib/razorpay';
import { getEdgeRazorpayStatus } from '../functions/api/payments/_razorpay';

console.log('--- VERIFYING RAZORPAY ENVIRONMENT VARIABLES (SAFE CHECK) ---');

const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
const secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
const liveApproved = (process.env.RAZORPAY_LIVE_APPROVED || '').trim().toLowerCase() === 'true';

console.log('RAZORPAY_KEY_ID details:');
console.log(' - raw length:', (process.env.RAZORPAY_KEY_ID || '').length);
console.log(' - trimmed length:', keyId.length);
console.log(' - has quotes:', keyId.startsWith('"') || keyId.startsWith("'"));
console.log(' - value (public):', keyId);

console.log('\nRAZORPAY_KEY_SECRET details:');
console.log(' - raw length:', (process.env.RAZORPAY_KEY_SECRET || '').length);
console.log(' - trimmed length:', secret.length);
console.log(' - has quotes:', secret.startsWith('"') || secret.startsWith("'"));
console.log(' - starts with alphanumeric:', /^[a-zA-Z0-9]/.test(secret));
console.log(' - ends with alphanumeric:', /[a-zA-Z0-9]$/.test(secret));

// Let's test what api.razorpay.com/v1/orders returns with HTTP status code and full JSON body
const authHeader = 'Basic ' + Buffer.from(`${keyId}:${secret}`).toString('base64');
console.log('\nTesting raw HTTP call to Razorpay API...');
try {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: 100,
      currency: 'INR',
      receipt: 'test_probe',
    }),
  });
  console.log('HTTP Status:', res.status, res.statusText);
  const data = await res.json().catch(() => ({}));
  console.log('Response Body:', JSON.stringify(data, null, 2));
} catch (err: any) {
  console.log('Probe error:', err.message);
}

console.log('\n--- TESTING getRazorpayStatus() (from src/lib/razorpay.ts) ---');
const localStatus = getRazorpayStatus();
console.log('Configured:', localStatus.configured);
console.log('Mode:', localStatus.mode);
console.log('Public Key ID:', localStatus.keyIdPublic);
console.log('Live Approved:', localStatus.liveApproved);
console.log('Message:', localStatus.message);

console.log('\n--- TESTING getEdgeRazorpayStatus() (from functions/api/payments/_razorpay.ts) ---');
const edgeStatus = getEdgeRazorpayStatus(process.env as any);
console.log('Configured:', edgeStatus.configured);
console.log('Mode:', edgeStatus.mode);
console.log('Message:', edgeStatus.message);
