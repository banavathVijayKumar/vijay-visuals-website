// ============================================================================
// POST /api/platform-owner/provision — ONE-TIME PREVIEW OWNER BINDING
// Browser-only: the signed-in Owner candidate submits a high-entropy token.
// Only its SHA-256 hash lives in the Preview D1 registry. No password, OTP,
// email body, profile write, or account creation is performed by this endpoint.
// ============================================================================

import { requireUser } from '../_auth';
import { errorJson, handleOptions, jsonResponse, writeAuditLog } from '../_shared';
import {
  isAuthorizedPlatformOwnerRow,
  PLATFORM_OWNER_EMAIL,
  PLATFORM_OWNER_FULL_NAME,
  PLATFORM_OWNER_TITLE,
  PlatformOwnerRow,
} from '../_ownerRole';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

/** Fixed-work comparison avoids leaking the token through early character checks. */
function tokenMatches(candidate: string, expected: string): boolean {
  if (typeof candidate !== 'string' || typeof expected !== 'string') return false;
  if (candidate.length === 0 || expected.length === 0) return false;
  let difference = candidate.length ^ expected.length;
  const length = Math.max(candidate.length, expected.length);
  for (let i = 0; i < length; i += 1) {
    difference |= (candidate.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return difference === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function onRequestPost(context: {
  request: Request;
  env: { DB?: import('../_shared').D1Database; [key: string]: any };
}): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env as any);
  if (!auth.ok) return auth.response;

  const authenticatedEmail = String(auth.user.email || '').trim().toLowerCase();
  const ownerEmail = PLATFORM_OWNER_EMAIL.toLowerCase();
  if (authenticatedEmail !== ownerEmail) {
    return errorJson('Owner provisioning is restricted to the designated Owner email.', 403);
  }
  if (auth.user.emailVerified !== true) {
    return errorJson('A verified Owner email session is required.', 403);
  }
  if (!auth.user.authSubject) {
    return errorJson('Authenticated Owner subject is missing.', 401);
  }
  if (!env.DB) {
    return errorJson('Preview database is unavailable.', 503);
  }

  let existing: PlatformOwnerRow | null = null;
  try {
    existing = await env.DB.prepare(
      `SELECT singleton_id, user_id, email, full_name, status FROM platform_owner WHERE singleton_id = 1 LIMIT 1`
    ).first<PlatformOwnerRow>();
  } catch {
    return errorJson('Owner registry is unavailable. Apply the Preview Owner migration first.', 503);
  }

  if (existing) {
    if (isAuthorizedPlatformOwnerRow(existing, auth.user.authSubject, authenticatedEmail)) {
      return jsonResponse(
        { ok: true, provisioned: false, alreadyAuthorized: true },
        200,
        { 'Cache-Control': 'no-store' }
      );
    }
    return errorJson('The singleton Owner identity is already provisioned.', 409);
  }

  let tokenRow: { token_hash?: string; consumed_at?: string | null } | null = null;
  try {
    tokenRow = await env.DB.prepare(
      `SELECT token_hash, consumed_at FROM platform_owner_provision WHERE singleton_id = 1 LIMIT 1`
    ).first<{ token_hash?: string; consumed_at?: string | null }>();
  } catch {
    return errorJson(
      'Owner provisioning registry is unavailable. Apply the Preview Owner migration first.',
      503
    );
  }
  if (!tokenRow || tokenRow.consumed_at) {
    return errorJson('Owner provisioning is no longer active on this deployment.', 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorJson('A JSON body with a provisioning token is required.', 400);
  }
  if (!body || typeof body !== 'object') {
    return errorJson('A JSON body with a provisioning token is required.', 400);
  }
  if (
    Object.keys(body).some((key) =>
      /^(password|newpassword|passphrase|otp|code|resettoken|accesstoken)$/i.test(key)
    )
  ) {
    return errorJson(
      'Password, OTP, reset, and token-substitution fields are not accepted here.',
      400
    );
  }

  try {
    const submittedHash = await sha256Hex(String(body.token || ''));
    if (!tokenMatches(submittedHash, String(tokenRow.token_hash || ''))) {
      return errorJson('Invalid provisioning token.', 403);
    }
  } catch {
    return errorJson('Provisioning token verification is unavailable.', 503);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO platform_owner
        (singleton_id, user_id, email, full_name, title, status, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))`
    )
      .bind(auth.user.authSubject, PLATFORM_OWNER_EMAIL, PLATFORM_OWNER_FULL_NAME, PLATFORM_OWNER_TITLE)
      .run();

    await env.DB.prepare(
      `UPDATE platform_owner_provision SET consumed_at = datetime('now') WHERE singleton_id = 1`
    ).run();
  } catch {
    return errorJson('Owner registry is unavailable. Apply the Preview Owner migration first.', 503);
  }

  await writeAuditLog(env as any, {
    actorId: auth.user.authSubject,
    actorRole: 'platform_owner',
    action: 'platform_owner.provisioned',
    targetType: 'platform_owner',
    targetId: '1',
    details: {
      singletonId: 1,
      email: PLATFORM_OWNER_EMAIL,
      fullName: PLATFORM_OWNER_FULL_NAME,
      title: PLATFORM_OWNER_TITLE,
    },
  });

  return jsonResponse(
    {
      ok: true,
      provisioned: true,
      owner: {
        fullName: PLATFORM_OWNER_FULL_NAME,
        email: PLATFORM_OWNER_EMAIL,
        title: PLATFORM_OWNER_TITLE,
      },
    },
    201,
    { 'Cache-Control': 'no-store' }
  );
}
