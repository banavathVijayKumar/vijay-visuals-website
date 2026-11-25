# Password reset security boundary

## What this repository enforces

`POST /api/auth/password/reset-request` is the only first-party reset entry point:

- Identity keying uses a SHA-256 hash of the normalized email; no raw email or token is stored in D1.
- Consumption is a single conditional D1 UPSERT, so concurrent requests cannot both use the same 60-second cooldown or hourly allowance.
- The callback origin is selected from `PASSWORD_RESET_ALLOWED_ORIGINS` only and must be an exact HTTPS origin (loopback HTTP is accepted for local development only). Every client-provided `redirectTo` value is ignored and never forwarded to Supabase.
- Invalid allowlist configuration, missing Supabase configuration, missing D1 binding, or a missing rate-limit table fails closed and consumes no quota.
- Responses are generic to prevent account enumeration.

## What this repository does **not** enforce

Supabase Auth remains the identity provider, and its anon URL/key are necessarily public browser values. A caller can bypass the first-party endpoint by calling Supabase GoTrue `/auth/v1/recover` directly.

Therefore the D1 gate **must not** be described as blocking direct GoTrue recovery calls. Provider-side protection is still required:

1. Configure the Supabase project's external redirect/Site URL allowlist to contain only the same exact origins as `PASSWORD_RESET_ALLOWED_ORIGINS`.
2. Enable/verify Supabase Auth rate limiting (or an equivalent edge/WAF control) for the recover endpoint.
3. Keep the anon key free of service-role privileges.

These are external Supabase dashboard settings. They are not changed by local code and are not verifiable from this repository.

## Operational note

Apply `cloudflare/d1/migrations/0018_password_reset_rate_limits.sql` to the intended environment before enabling the endpoint. If the table is absent, the endpoint returns a generic `503` and sends no recovery request.
