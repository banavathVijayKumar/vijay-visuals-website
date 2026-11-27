// ============================================================================
// P0-1 customer registration offline regression suite.
// Uses synthetic credentials and injected fake admin clients only. No real
// Supabase user, email, payment, or Production resource is touched.
// ============================================================================

import { readFileSync } from 'node:fs';
import {
  getSupabaseAdminConfig,
  probeSupabaseAdminClient,
  provisionVerifiedCustomer,
} from '../functions/api/auth/_supabaseAdmin';
import { onRequestGet } from '../functions/api/auth/config';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.error(`FAIL ${name}`);
  }
}

// Clearly synthetic. It resembles the supported secret-key prefix only so the
// format detector can be exercised; it is not a credential and is never sent.
const SYNTHETIC_KEY = `sb_secret_${'x'.repeat(60)}`;
const env = {
  VITE_SUPABASE_URL: 'https://synthetic-preview.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'synthetic-anon-key-for-offline-tests',
  SUPABASE_SERVICE_ROLE_KEY: SYNTHETIC_KEY,
} as any;

const input = {
  email: 'preview.test@example.invalid',
  password: 'SyntheticPass123!',
  fullName: 'Preview Test Customer',
  phone: '+910000000000',
};

interface FakeClientOptions {
  users?: Array<{ id?: string; email?: string }>;
  listError?: { message?: string; status?: number } | null;
  createUser?: (attributes: Record<string, unknown>) => Promise<any>;
  updateUser?: (id: string, attributes: Record<string, unknown>) => Promise<any>;
}

function makeFakeClient(options: FakeClientOptions = {}) {
  const calls = {
    listUsers: 0,
    createUser: 0,
    updateUserById: [] as Array<{ id: string; attributes: Record<string, unknown> }>,
  };
  const client = {
    auth: {
      admin: {
        async listUsers() {
          calls.listUsers++;
          if (options.listError) return { data: { users: [] }, error: options.listError };
          return { data: { users: options.users || [] }, error: null };
        },
        async createUser(attributes: Record<string, unknown>) {
          calls.createUser++;
          if (options.createUser) return options.createUser(attributes);
          return { data: { user: { id: 'new-synthetic-uid' } }, error: null };
        },
        async updateUserById(id: string, attributes: Record<string, unknown>) {
          calls.updateUserById.push({ id, attributes });
          if (options.updateUser) return options.updateUser(id, attributes);
          return { data: { user: { id } }, error: null };
        },
      },
    },
  } as any;
  return { client, calls };
}

const config = getSupabaseAdminConfig(env);
check('P0-1 server admin config is detected from Preview secret name', Boolean(config));
check('P0-1 configured secret-key format is recognized', config?.keyFormat === 'secret_text');

const success = makeFakeClient();
const successResult = await provisionVerifiedCustomer(env, input, { client: success.client });
check(
  'P0-1 successful registration creates a confirmed Supabase identity',
  successResult.ok && successResult.created && successResult.userId === 'new-synthetic-uid'
);
check(
  'P0-1 successful registration sends no browser signUp confirmation email',
  success.calls.createUser === 1 && success.calls.updateUserById.length === 0
);

const duplicate = makeFakeClient({
  users: [{ id: 'existing-synthetic-uid', email: input.email.toUpperCase() }],
});
const duplicateResult = await provisionVerifiedCustomer(env, input, { client: duplicate.client });
check(
  'P0-1 duplicate email is completed idempotently',
  duplicateResult.ok && !duplicateResult.created && duplicateResult.userId === 'existing-synthetic-uid'
);
check(
  'P0-1 duplicate email updates password and confirmed metadata',
  duplicate.calls.createUser === 0 &&
    duplicate.calls.updateUserById.length === 1 &&
    duplicate.calls.updateUserById[0].attributes.email_confirm === true &&
    duplicate.calls.updateUserById[0].attributes.password === input.password
);

const raceDuplicate = makeFakeClient({
  createUser: async () => ({
    data: { user: null },
    error: { message: 'A user with this email address has already been registered', status: 422 },
  }),
});
let raceListCall = 0;
raceDuplicate.client.auth.admin.listUsers = async () => {
  raceListCall++;
  if (raceListCall === 1) return { data: { users: [] }, error: null };
  return { data: { users: [{ id: 'race-existing-uid', email: input.email }] }, error: null };
};
const raceResult = await provisionVerifiedCustomer(env, input, { client: raceDuplicate.client });
check(
  'P0-1 create/update race resolves to the existing identity',
  raceResult.ok && !raceResult.created && raceResult.userId === 'race-existing-uid'
);

const emailFailure = makeFakeClient({
  createUser: async () => ({
    data: { user: null },
    error: { message: 'email rate limit exceeded', status: 429 },
  }),
});
const emailFailureResult = await provisionVerifiedCustomer(env, input, {
  client: emailFailure.client,
});
check(
  'P0-1 Supabase email failure is surfaced as a safe retryable code',
  !emailFailureResult.ok &&
    emailFailureResult.code === 'SUPABASE_RATE_LIMITED' &&
    emailFailureResult.status === 429
);

const provisioningFailure = makeFakeClient({
  createUser: async () => ({
    data: { user: null },
    error: { message: 'upstream provisioning failed', status: 500 },
  }),
});
const provisioningFailureResult = await provisionVerifiedCustomer(env, input, {
  client: provisioningFailure.client,
});
check(
  'P0-1 generic provisioning failure is fail-closed',
  !provisioningFailureResult.ok &&
    provisioningFailureResult.code === 'PROVISIONING_FAILED' &&
    provisioningFailureResult.status === 502
);

const missingCredentialResult = await provisionVerifiedCustomer({}, input, {
  client: makeFakeClient().client,
});
check(
  'P0-1 missing admin credential never attempts provisioning',
  !missingCredentialResult.ok &&
    missingCredentialResult.code === 'ADMIN_CREDENTIAL_MISSING' &&
    missingCredentialResult.status === 503
);

const accepted = makeFakeClient();
const acceptedProbe = await probeSupabaseAdminClient(env, { client: accepted.client });
check(
  'P0-1 existing Supabase Admin client accepts the recognized key format',
  acceptedProbe.ok && acceptedProbe.keyFormat === 'secret_text'
);

const rejected = makeFakeClient({ listError: { message: 'invalid key', status: 401 } });
const rejectedProbe = await probeSupabaseAdminClient(env, { client: rejected.client });
check(
  'P0-1 rejected admin client is reported without leaking provider text',
  !rejectedProbe.ok &&
    rejectedProbe.code === 'ADMIN_CLIENT_REJECTED' &&
    !JSON.stringify(rejectedProbe).includes('invalid key')
);

const configResponse = await onRequestGet({
  request: new Request('https://preview.example.test/api/auth/config'),
  env,
} as any);
const configBody = await configResponse.text();
let configPayload: Record<string, unknown> = {};
try {
  configPayload = JSON.parse(configBody);
} catch {}
check(
  'P0-1 browser config exposes only boolean admin diagnostics',
  configPayload.hasServerAdminCredential === true &&
    configPayload.serverAdminKeyFormat === 'secret_text' &&
    !configBody.includes(SYNTHETIC_KEY) &&
    !configBody.includes('SUPABASE_SERVICE_ROLE_KEY')
);

const authModal = readFileSync('src/components/auth/AuthModal.tsx', 'utf8');
const verifySource = readFileSync('functions/api/auth/otp/verify.ts', 'utf8');
check(
  'P0-1 browser registration never calls auth.signUp',
  !authModal.includes('auth.signUp')
);
check(
  'P0-1 registration sends the password only after OTP verification',
  /purpose:\s*'registration',\r?\n\s*password,/.test(authModal)
);
check(
  'P0-1 server verifies password and provisions only in the registration OTP path',
  verifySource.includes("const purpose = 'registration' as const") &&
    verifySource.includes('password.length < 6 || password.length > 128') &&
    verifySource.includes("if (purpose === 'registration')") &&
    verifySource.includes('provisionVerifiedCustomer(env, {')
);

console.log(`\nTOTAL passed=${passed} failed=${failed}`);
if (failed) process.exit(1);
