// ============================================================================
// VIJAY VISUALS — EDGE DOMAIN MANAGEMENT HELPERS (CLOUDFLARE DoH + HTTPS)
// Zero Node.js sockets (NO dns/promises, NO tls.connect). 100% Web Fetch API.
// ============================================================================

import {
  CloudflareEnv,
  getCnameTarget,
  getNotificationChannelStatus,
  isPlatformHostname,
  randomHex,
} from '../_shared';

export interface TenantDomainRow {
  id: number;
  website_id: string;
  owner_id: string;
  domain_name: string;
  domain_source: string;
  registrar_name: string;
  status: string;
  is_primary: number;
  www_mode: 'redirect_to_root' | 'redirect_to_www' | 'both';
  www_status: string;
  dns_verification_status: string;
  dns_verified_at: string | null;
  verification_token: string;
  dns_target: string;
  ssl_status: string;
  ssl_issuer: string;
  ssl_expires_at: string | null;
  purchase_status: string;
  registrar_order_id: string;
  expiry_date: string | null;
  renewal_date: string | null;
  auto_renew: number;
  auto_renew_supported: number;
  last_checked_at: string | null;
  last_error: string;
  admin_notes: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

const RESERVED_DOMAINS = new Set([
  'localhost',
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'invalid',
  'vijay-visuals-site.pages.dev',
]);

export function normalizeAndValidateDomain(
  rawInput: string,
  env?: CloudflareEnv
): { valid: true; domain: string } | { valid: false; error: string } {
  let cleaned = String(rawInput || '')
    .trim()
    .toLowerCase();

  cleaned = cleaned.replace(/^https?:\/\//, '');
  cleaned = cleaned.split('/')[0].split('?')[0].split('#')[0];
  cleaned = cleaned.replace(/:\d+$/, '').replace(/\.$/, '');
  if (cleaned.startsWith('www.')) {
    cleaned = cleaned.slice(4);
  }

  if (!cleaned) {
    return { valid: false, error: 'Please enter a domain name (for example, srilakshmifashion.in).' };
  }
  if (cleaned.length > 253) {
    return { valid: false, error: 'Domain name exceeds maximum length of 253 characters.' };
  }
  if (cleaned.includes('..') || !cleaned.includes('.')) {
    return { valid: false, error: 'Please enter a valid domain including its extension (such as .com or .in).' };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(cleaned)) {
    return { valid: false, error: 'IP addresses are not supported. Please enter a registered domain name.' };
  }
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(cleaned)) {
    return {
      valid: false,
      error: 'Domain contains invalid characters. Use only lowercase letters, numbers, hyphens, and dots.',
    };
  }
  if (RESERVED_DOMAINS.has(cleaned) || isPlatformHostname(cleaned, env)) {
    return { valid: false, error: 'This platform or reserved hostname cannot be attached as a customer domain.' };
  }

  return { valid: true, domain: cleaned };
}

export function generateVerificationToken(): string {
  return `vv-verify-${randomHex(12)}`;
}

export function buildDnsInstructions(domain: string, token: string, env: CloudflareEnv) {
  const target = getCnameTarget(env);
  return {
    domain,
    target,
    records: [
      {
        purpose: 'Domain Ownership Verification (Required)',
        type: 'TXT',
        host: `_vijayvisuals.${domain}`,
        shortHost: '_vijayvisuals',
        value: token,
        ttl: 'Auto / 300',
      },
      {
        purpose: 'Root Domain Routing (Cloudflare / CNAME Flattening Registrars)',
        type: 'CNAME',
        host: domain,
        shortHost: '@',
        value: target,
        ttl: 'Auto / 300',
      },
      {
        purpose: 'WWW Subdomain Routing',
        type: 'CNAME',
        host: `www.${domain}`,
        shortHost: 'www',
        value: target,
        ttl: 'Auto / 300',
      },
    ],
    notes: [
      'Most registrars (GoDaddy, Namecheap, Hostinger, BigRock) do not support root (@) CNAME records natively. Either point your domain nameservers to Cloudflare Free DNS (recommended, supports CNAME flattening + free SSL) or configure www CNAME + root URL redirect at your registrar.',
      'DNS propagation typically takes 5 minutes to 24 hours. Never mark a domain live until DNS TXT verification and HTTPS both pass.',
    ],
  };
}

interface DohAnswer {
  name?: string;
  type?: number;
  TTL?: number;
  data?: string;
}

interface DohResponse {
  Status?: number;
  Answer?: DohAnswer[];
}

export async function queryCloudflareDoh(
  hostname: string,
  recordType: 'TXT' | 'CNAME' | 'A'
): Promise<string[]> {
  const endpoint = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${recordType}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/dns-json' },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const payload = (await res.json()) as DohResponse;
    if (!Array.isArray(payload.Answer)) return [];
    return payload.Answer.map((ans) =>
      String(ans.data || '')
        .replace(/^"+|"+$/g, '')
        .replace(/\.$/, '')
        .trim()
    ).filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeHttpsEndpoint(hostname: string): Promise<{
  reachable: boolean;
  httpStatus: number | null;
  error: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://${hostname}/`, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
    });
    return {
      reachable: res.status >= 200 && res.status < 500,
      httpStatus: res.status,
      error: '',
    };
  } catch (err) {
    return {
      reachable: false,
      httpStatus: null,
      error: err instanceof Error ? err.message : 'HTTPS connection failed or SSL certificate not active yet.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkCloudflarePagesCustomDomain(
  hostname: string,
  env: CloudflareEnv
): Promise<{ checked: boolean; status: string; sslStatus: string; detail: string }> {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    return {
      checked: false,
      status: 'not_configured',
      sslStatus: 'not_checked',
      detail: 'Cloudflare API credentials not configured; relying on live DoH + HTTPS probes.',
    };
  }
  const project = env.CLOUDFLARE_PAGES_PROJECT || 'vijay-visuals-site';
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
    env.CLOUDFLARE_ACCOUNT_ID
  )}/pages/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(hostname)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      return {
        checked: true,
        status: 'not_attached_in_cloudflare_pages',
        sslStatus: 'pending',
        detail: `Cloudflare Pages domain lookup returned HTTP ${res.status}. Add this domain in Cloudflare Pages -> Custom Domains.`,
      };
    }
    const data = (await res.json()) as {
      result?: { status?: string; validation_data?: { status?: string } };
    };
    const cfStatus = data.result?.status || 'pending';
    return {
      checked: true,
      status: cfStatus,
      sslStatus: cfStatus === 'active' ? 'active' : 'provisioning',
      detail: `Cloudflare Pages status: ${cfStatus}`,
    };
  } catch (err) {
    return {
      checked: false,
      status: 'api_error',
      sslStatus: 'not_checked',
      detail: err instanceof Error ? err.message : 'Cloudflare API request failed.',
    };
  }
}

export async function runLiveDomainVerification(
  domainRow: TenantDomainRow,
  env: CloudflareEnv
) {
  const target = (domainRow.dns_target || getCnameTarget(env)).toLowerCase();
  const domain = domainRow.domain_name.toLowerCase();

  const [txtSub, txtRoot, cnameRoot, aRoot, cnameWww] = await Promise.all([
    queryCloudflareDoh(`_vijayvisuals.${domain}`, 'TXT'),
    queryCloudflareDoh(domain, 'TXT'),
    queryCloudflareDoh(domain, 'CNAME'),
    queryCloudflareDoh(domain, 'A'),
    queryCloudflareDoh(`www.${domain}`, 'CNAME'),
  ]);

  const allTxt = [...txtSub, ...txtRoot];
  const txtMatched = allTxt.some((v) => v.includes(domainRow.verification_token));
  const cnameMatched = cnameRoot.some((v) => v.toLowerCase() === target);
  const wwwMatched = cnameWww.some((v) => v.toLowerCase() === target || v.toLowerCase() === domain);
  const aRecordMatched = aRoot.length > 0;

  const dnsRoutingReady = cnameMatched || wwwMatched || aRecordMatched;
  const dnsVerified = txtMatched && dnsRoutingReady;

  const httpsProbe = dnsVerified
    ? await probeHttpsEndpoint(domain)
    : {
        reachable: false,
        httpStatus: null,
        error: 'Skipped HTTPS probe until TXT ownership verification and DNS routing are configured.',
      };

  const cfPagesCheck = await checkCloudflarePagesCustomDomain(domain, env);

  const sslActive =
    dnsVerified &&
    httpsProbe.reachable &&
    (!cfPagesCheck.checked || cfPagesCheck.sslStatus === 'active');

  let nextStatus = domainRow.status;
  let nextDnsStatus: 'pending' | 'verified' | 'failed' = 'pending';
  let nextSslStatus: 'pending' | 'provisioning' | 'active' | 'failed' = 'pending';
  const errors: string[] = [];

  if (!txtMatched) {
    errors.push(`TXT record _vijayvisuals.${domain} with token "${domainRow.verification_token}" not found yet.`);
  }
  if (!dnsRoutingReady) {
    errors.push(`CNAME/A record pointing ${domain} (or www.${domain}) to ${target} not detected yet.`);
  }

  if (dnsVerified) {
    nextDnsStatus = 'verified';
    if (sslActive) {
      nextSslStatus = 'active';
      nextStatus = 'live';
    } else {
      nextSslStatus = 'provisioning';
      nextStatus = 'ssl_pending';
      errors.push(
        httpsProbe.error ||
          'DNS verified, but HTTPS/SSL certificate is not active yet. Add this hostname in Cloudflare Pages Custom Domains and wait for SSL issuance.'
      );
    }
  } else {
    nextDnsStatus = 'failed';
    nextSslStatus = 'pending';
    nextStatus = 'dns_error';
  }

  return {
    txtMatched,
    cnameMatched,
    aRecordMatched,
    wwwMatched,
    dnsVerified,
    httpsReachable: httpsProbe.reachable,
    httpStatus: httpsProbe.httpStatus,
    sslActive,
    cfPagesCheck,
    nextStatus,
    nextDnsStatus,
    nextWwwStatus: wwwMatched ? 'verified' : cnameWww.length > 0 ? 'mismatch' : 'not_configured',
    nextSslStatus,
    errorSummary: errors.join(' '),
    observedRecords: {
      txt: allTxt,
      cnameRoot,
      aRoot,
      cnameWww,
    },
  };
}

export async function recordDomainEvent(
  env: CloudflareEnv,
  params: {
    domainId: number;
    websiteId: string;
    ownerId: string;
    eventType: string;
    actorRole: string;
    actorId: string;
    reason?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT INTO domain_events (domain_id, website_id, owner_id, event_type, actor_role, actor_id, reason, details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      params.domainId,
      params.websiteId,
      params.ownerId,
      params.eventType,
      params.actorRole,
      params.actorId,
      params.reason || '',
      JSON.stringify(params.details || {})
    )
    .run();
}

export async function createDomainNotification(
  env: CloudflareEnv,
  params: {
    domainId: number;
    websiteId: string;
    ownerId: string;
    notificationType: string;
    milestoneKey?: string | null;
    title: string;
    message: string;
    severity?: 'info' | 'warning' | 'critical';
  }
): Promise<{ created: boolean }> {
  if (!env.DB) return { created: false };
  const channels = getNotificationChannelStatus(env);
  try {
    const res = await env.DB.prepare(
      `INSERT OR IGNORE INTO domain_notifications
        (domain_id, website_id, owner_id, notification_type, milestone_key, title, message, severity, channels_json, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`
    )
      .bind(
        params.domainId,
        params.websiteId,
        params.ownerId,
        params.notificationType,
        params.milestoneKey ?? null,
        params.title,
        params.message,
        params.severity || 'info',
        JSON.stringify(channels)
      )
      .run();
    return { created: (res.meta?.changes ?? 0) > 0 };
  } catch {
    return { created: false };
  }
}

export function getRenewalMilestone(daysRemaining: number): {
  key: string;
  severity: 'info' | 'warning' | 'critical';
  label: string;
} | null {
  if (daysRemaining <= 0) {
    return { key: 'expired_0d', severity: 'critical', label: 'Domain Expired' };
  }
  if (daysRemaining <= 3) {
    return { key: 'expiry_3d', severity: 'critical', label: 'Expires Within 3 Days' };
  }
  if (daysRemaining <= 7) {
    return { key: 'expiry_7d', severity: 'warning', label: 'Expires Within 7 Days' };
  }
  if (daysRemaining <= 15) {
    return { key: 'expiry_15d', severity: 'warning', label: 'Expires Within 15 Days' };
  }
  if (daysRemaining <= 30) {
    return { key: 'expiry_30d', severity: 'info', label: 'Expires Within 30 Days' };
  }
  return null;
}

export async function runRenewalScanForDomains(
  env: CloudflareEnv,
  onlyDomainId?: number
): Promise<{
  scanned: number;
  notificationsCreated: number;
  expiringSoonCount: number;
  expiredCount: number;
}> {
  if (!env.DB) {
    return { scanned: 0, notificationsCreated: 0, expiringSoonCount: 0, expiredCount: 0 };
  }

  const sql = onlyDomainId
    ? `SELECT * FROM tenant_domains WHERE id = ? AND expiry_date IS NOT NULL AND expiry_date != '' AND status NOT IN ('disconnected', 'rejected')`
    : `SELECT * FROM tenant_domains WHERE expiry_date IS NOT NULL AND expiry_date != '' AND status NOT IN ('disconnected', 'rejected')`;

  const stmt = onlyDomainId ? env.DB.prepare(sql).bind(onlyDomainId) : env.DB.prepare(sql);
  const rows = (await stmt.all<TenantDomainRow>()).results || [];

  const nowMs = Date.now();
  let notificationsCreated = 0;
  let expiringSoonCount = 0;
  let expiredCount = 0;

  for (const row of rows) {
    if (!row.expiry_date) continue;
    const expiryMs = Date.parse(row.expiry_date);
    if (!Number.isFinite(expiryMs)) continue;

    const daysRemaining = Math.ceil((expiryMs - nowMs) / (1000 * 60 * 60 * 24));
    const milestone = getRenewalMilestone(daysRemaining);
    if (!milestone) continue;

    if (daysRemaining <= 0) {
      expiredCount++;
      if (row.status !== 'expired') {
        await env.DB.prepare(
          `UPDATE tenant_domains SET status = 'expired', updated_at = datetime('now') WHERE id = ?`
        )
          .bind(row.id)
          .run();
      }
    } else if (daysRemaining <= 30) {
      expiringSoonCount++;
      if (row.status === 'live') {
        await env.DB.prepare(
          `UPDATE tenant_domains SET status = 'expiring_soon', updated_at = datetime('now') WHERE id = ?`
        )
          .bind(row.id)
          .run();
      }
    }

    const expiryYear = new Date(expiryMs).toISOString().slice(0, 10);
    const milestoneKey = `${milestone.key}:${expiryYear}`;
    const notif = await createDomainNotification(env, {
      domainId: row.id,
      websiteId: row.website_id,
      ownerId: row.owner_id,
      notificationType: 'renewal_reminder',
      milestoneKey,
      title: `${milestone.label}: ${row.domain_name}`,
      message:
        daysRemaining <= 0
          ? `${row.domain_name} expired on ${expiryYear}. Renew it immediately at ${row.registrar_name || 'your domain registrar'} to restore website traffic.`
          : `${row.domain_name} expires in ${daysRemaining} day(s) on ${expiryYear}. Renew it at ${row.registrar_name || 'your domain registrar'} to prevent downtime.`,
      severity: milestone.severity,
    });

    if (notif.created) {
      notificationsCreated++;
      await recordDomainEvent(env, {
        domainId: row.id,
        websiteId: row.website_id,
        ownerId: row.owner_id,
        eventType: 'renewal_reminder_sent',
        actorRole: 'system',
        actorId: 'renewal_scanner',
        reason: `Automatic ${milestone.key} reminder`,
        details: { daysRemaining, expiryDate: expiryYear, milestoneKey },
      });
    }
  }

  return {
    scanned: rows.length,
    notificationsCreated,
    expiringSoonCount,
    expiredCount,
  };
}
