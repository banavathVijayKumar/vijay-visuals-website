// ============================================================================
// GET & POST /api/owner/tenants/:tenantId/domains
// Express dashboard parity on Cloudflare Pages D1: tenant-isolated domain
// list + Option A connection flow, translated to website_id / tenant_domains.
// ============================================================================

import { requireUser } from '../../../../_auth';
import {
  CloudflareEnv,
  PagesContext,
  checkRateLimit,
  errorJson,
  getCnameTarget,
  handleOptions,
  json,
  parseJsonBody,
  rateLimitResponse,
  sanitizeText,
  writeAuditLog,
} from '../../../../_shared';
import { requireTenantOwnerAccess } from '../../../../_tenantAccess';
import {
  TenantDomainRow,
  buildDnsInstructions,
  createDomainNotification,
  generateVerificationToken,
  normalizeAndValidateDomain,
  recordDomainEvent,
  runRenewalScanForDomains,
} from '../../../../domains/_helpers';

const MULTI_PART_TLDS = [
  '.co.in',
  '.com.au',
  '.co.uk',
  '.org.in',
  '.net.in',
  '.gov.in',
  '.ac.in',
  '.gen.in',
  '.firm.in',
  '.ind.in',
];

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

function domainKind(domainName: string): { extension: string; domainType: 'root' | 'subdomain' } {
  const lower = String(domainName || '').toLowerCase();
  const labels = lower.split('.').filter(Boolean);
  const multiTld = MULTI_PART_TLDS.find((ext) => lower.endsWith(ext));
  const extension = multiTld || (labels.length > 0 ? `.${labels[labels.length - 1]}` : '');
  const tldLabelCount = multiTld ? 2 : 1;
  return {
    extension,
    domainType: labels.length > tldLabelCount + 1 ? 'subdomain' : 'root',
  };
}

function connectionStatusFor(status: string): string {
  switch (String(status || '')) {
    case 'live':
      return 'live';
    case 'ssl_pending':
      return 'ssl_provisioning';
    case 'dns_verified':
      return 'ownership_verified';
    case 'dns_error':
    case 'ssl_error':
    case 'rejected':
      return 'error';
    case 'suspended':
      return 'suspended';
    case 'disconnected':
      return 'disconnected';
    case 'expiring_soon':
    case 'expired':
      return String(status);
    default:
      return 'dns_pending';
  }
}

function workflowStepFor(connectionStatus: string): number {
  if (connectionStatus === 'live') return 12;
  if (connectionStatus === 'ssl_provisioning') return 9;
  if (connectionStatus === 'ownership_verified') return 7;
  if (connectionStatus === 'error') return 6;
  return 4;
}

function healthStatusFromCheck(check: Record<string, any> | null | undefined): string {
  if (!check) return 'pending';
  const routing = Boolean(check.cname_matched || check.a_record_matched || check.www_matched);
  const dnsOk = Boolean(check.txt_matched && routing);
  const httpsOk = Boolean(check.https_reachable);
  if (dnsOk && httpsOk) return 'healthy';
  if (dnsOk || httpsOk) return 'degraded';
  return 'down';
}

export function mapHealthCheckRow(
  check: Record<string, any>,
  domainRow?: TenantDomainRow | null
): Record<string, any> {
  let observed: Record<string, any> = {};
  try {
    const parsed = check.observed_records_json ? JSON.parse(String(check.observed_records_json)) : {};
    if (parsed && typeof parsed === 'object') observed = parsed;
  } catch {
    observed = {};
  }
  const cnames = [
    ...(Array.isArray(observed.cnameRoot) ? observed.cnameRoot : []),
    ...(Array.isArray(observed.cnameWww) ? observed.cnameWww : []),
  ];
  return {
    ...check,
    domainId: Number(check.domain_id || 0),
    dnsHealthy: Boolean(
      check.txt_matched && (check.cname_matched || check.a_record_matched || check.www_matched)
    ),
    // No TLS certificate fields exist on domain_health_checks; a successful
    // HTTPS probe is the only honest live signal available here.
    sslHealthy: Boolean(check.https_reachable),
    httpsAvailable: Boolean(check.https_reachable),
    httpStatusCode: Number(check.http_status || 0),
    wwwRedirectHealthy: Boolean(check.www_matched),
    responseTimeMs: 0,
    resolvedIpsJson: JSON.stringify(Array.isArray(observed.aRoot) ? observed.aRoot : []),
    resolvedCnamesJson: JSON.stringify(cnames),
    sslIssuer: String(domainRow?.ssl_issuer || ''),
    sslValidTo: String(domainRow?.ssl_expires_at || ''),
    errorSummary: String(check.error_summary || ''),
    checkedAt: String(check.checked_at || ''),
  };
}

/**
 * Maps a D1 tenant_domains row into the camelCase dashboard record expected by
 * DomainManagementCenter / GrowthWorkspace (the Express API response shape).
 * Raw D1 columns are preserved alongside the aliases for Pages-native callers.
 */
export function deriveDomainFields(
  row: TenantDomainRow,
  tenantRowId: number,
  env: CloudflareEnv,
  latestHealthCheck?: Record<string, any> | null
): Record<string, any> {
  const { extension, domainType } = domainKind(row.domain_name);
  const connectionStatus = connectionStatusFor(row.status);
  const dnsStatus =
    row.dns_verification_status === 'verified'
      ? 'verified'
      : row.dns_verification_status === 'failed' || row.status === 'dns_error'
        ? 'dns_error'
        : 'pending';
  const sslStatus =
    row.ssl_status === 'failed'
      ? 'error'
      : row.ssl_status === 'active' || row.ssl_status === 'provisioning'
        ? row.ssl_status
        : 'pending';
  const baseInstructions = buildDnsInstructions(row.domain_name, row.verification_token, env);

  return {
    ...row,
    is_primary: Boolean(row.is_primary),
    auto_renew: Boolean(row.auto_renew),
    auto_renew_supported: Boolean(row.auto_renew_supported),
    tenantId: tenantRowId,
    domainName: row.domain_name,
    extension,
    domainType,
    isPrimary: Boolean(row.is_primary),
    wwwPreference: row.www_mode,
    wwwStatus: domainType === 'subdomain' ? 'not_applicable' : row.www_status,
    ownershipMode:
      row.domain_source === 'registrar_purchase' ? 'platform_registrar' : 'customer_external',
    registrarName: row.registrar_name || 'External Registrar (Customer Owned)',
    verificationToken: row.verification_token,
    connectionStatus,
    workflowStep: workflowStepFor(connectionStatus),
    approvalStatus: row.status === 'rejected' ? 'rejected' : 'auto',
    dnsStatus,
    sslStatus,
    sslIssuer: row.ssl_issuer || '',
    sslExpiresAt: row.ssl_expires_at || '',
    dnsErrorDetail: row.last_error || '',
    expiryDate: row.expiry_date || '',
    renewalDate: row.renewal_date || '',
    // renewal_reminder_date has no D1 column; Express defaults it to expiry date.
    renewalReminderDate: row.expiry_date || '',
    renewalStatus:
      row.status === 'expired' ? 'expired' : row.status === 'expiring_soon' ? 'expiring_soon' : 'active',
    renewalPaymentStatus:
      row.status === 'expired'
        ? 'overdue'
        : row.status === 'expiring_soon'
          ? 'pending_customer_consent'
          : 'not_due',
    assignedSupportStaff: '',
    lastHealthStatus: healthStatusFromCheck(latestHealthCheck),
    suspendedReason: row.status === 'suspended' ? row.last_error || '' : '',
    lastHealthCheckAt: latestHealthCheck?.checked_at || null,
    lastCheckedAt: row.last_checked_at || null,
    createdAt: row.created_at || '',
    dnsInstructions: {
      ...baseInstructions,
      domain: baseInstructions.domain,
      hostingTarget: baseInstructions.target,
      target: baseInstructions.target,
      records: baseInstructions.records.map((record) => ({
        ...record,
        altHost:
          record.shortHost === '@' ? row.domain_name : `${record.shortHost}.${row.domain_name}`,
        required: true,
      })),
      troubleshooting: baseInstructions.notes,
    },
    latestHealthCheck: latestHealthCheck ? mapHealthCheckRow(latestHealthCheck, row) : null,
  };
}

export function mapDomainEventRow(
  row: Record<string, any>,
  tenantRowId: number
): Record<string, any> {
  const eventType = String(row.event_type || '');
  let severity = 'info';
  if (/fail|error|blocked|problem/.test(eventType)) severity = 'error';
  else if (/verified|live|success|published|connected/.test(eventType)) severity = 'success';
  return {
    ...row,
    tenantId: tenantRowId,
    domainId: Number(row.domain_id || 0),
    actorEmail: String(row.actor_id || ''),
    actorRole: String(row.actor_role || 'system'),
    eventType,
    severity,
    title: String(row.reason || eventType.replace(/_/g, ' ')),
    details: String(row.details_json || ''),
    metadataJson: String(row.details_json || '{}'),
    createdAt: String(row.created_at || ''),
  };
}

export function mapDomainNotificationRow(
  row: Record<string, any>,
  tenantRowId: number
): Record<string, any> {
  return {
    ...row,
    tenantId: tenantRowId,
    domainId: Number(row.domain_id || 0),
    notificationType: String(row.notification_type || ''),
    milestoneKey: String(row.milestone_key || ''),
    channelStatusJson: String(row.channels_json || '{}'),
    isRead: Boolean(row.is_read),
    createdAt: String(row.created_at || ''),
  };
}

export function getDomainsCloudflareSaasStatus(env: CloudflareEnv) {
  const configured = Boolean(
    (env.CLOUDFLARE_API_TOKEN || '').trim() && (env.CLOUDFLARE_ZONE_ID || '').trim()
  );
  const saasFallbackOrigin = (env.CLOUDFLARE_SAAS_FALLBACK_ORIGIN || '').trim();
  return {
    configured,
    pagesProject: env.CLOUDFLARE_PAGES_PROJECT || 'vijay-visuals-site',
    cnameTarget: getCnameTarget(env),
    saasFallbackOrigin: saasFallbackOrigin || null,
    architectureNote: configured
      ? 'Cloudflare API credentials detected. Verify that Cloudflare for SaaS Custom Hostnames and Worker host routing are active on your zone.'
      : 'Current production hosting uses static Cloudflare Pages (wrangler.toml: vijay-visuals-site, up to 100 custom domains per Pages project). Scalable multi-tenant routing (>100 customer domains with automated per-hostname SSL) requires Cloudflare for SaaS Custom Hostnames + a Cloudflare Worker forwarding X-Forwarded-Host to tenant resolution.',
  };
}

export function getDomainsChannelStatus(env: CloudflareEnv) {
  return {
    in_app: 'delivered',
    email:
      (env.SMTP_HOST || '').trim() && (env.SMTP_USER || '').trim()
        ? 'configured_smtp'
        : 'not_configured_smtp',
    whatsapp:
      (env.WHATSAPP_CLOUD_API_TOKEN || '').trim() && (env.WHATSAPP_PHONE_NUMBER_ID || '').trim()
        ? 'configured_whatsapp_cloud'
        : 'not_configured_whatsapp',
  };
}

export async function getTenantDomainLimit(
  env: CloudflareEnv,
  websiteId: string,
  parsedWebsite: Record<string, any>
): Promise<number> {
  const tier = String(parsedWebsite?.planTier || '');
  const tierLimit = tier === 'enterprise_ai' ? 10 : tier === 'website_pwa' ? 3 : 1;
  if (!env.DB) return tierLimit;
  try {
    const row = await env.DB.prepare(
      `SELECT sp.max_custom_domains AS max_domains
       FROM tenant_subscriptions ts
       INNER JOIN subscription_plans sp ON sp.code = ts.plan_code
       WHERE ts.website_id = ? AND ts.status IN ('trial', 'active')
       ORDER BY ts.id DESC LIMIT 1`
    )
      .bind(websiteId)
      .first<{ max_domains: number }>();
    if (row && Number(row.max_domains) > 0) return Number(row.max_domains);
  } catch {
    // Optional subscription tables may not be migrated yet.
  }
  return tierLimit;
}

export async function refreshTenantRenewalReminders(
  env: CloudflareEnv,
  websiteId: string
): Promise<void> {
  if (!env.DB) return;
  const rows = await env.DB.prepare(
    `SELECT id FROM tenant_domains
     WHERE website_id = ? AND expiry_date IS NOT NULL AND expiry_date != ''`
  )
    .bind(websiteId)
    .all<{ id: number }>();
  for (const row of rows.results || []) {
    try {
      await runRenewalScanForDomains(env, Number(row.id));
    } catch (err) {
      console.error('Tenant domain renewal scan failed:', err);
    }
  }
}

export async function setPublicationCustomDomain(
  env: CloudflareEnv,
  websiteId: string,
  parsedWebsite: Record<string, any>,
  domainName: string
): Promise<void> {
  if (!env.DB) return;
  const next = { ...parsedWebsite, customDomain: domainName };
  await env.DB.prepare(
    `UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?`
  )
    .bind(JSON.stringify(next), websiteId)
    .run();
}

export async function onRequestGet(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  try {
    const auth = await requireUser(request, env);
    if (!auth.ok) return auth.response;

    const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
      'business_owner',
      'business_manager',
      'business_staff',
    ]);
    if (!access.ok) return access.response;
    if (!env.DB) return errorJson('Database binding is not configured.', 503);

    const websiteId = access.row.website_id;
    const tenantRowId = Number(access.row.rowid || 0);
    await refreshTenantRenewalReminders(env, websiteId);

    const [domainsRes, notifsRes, eventsRes, checksRes] = await Promise.all([
      env.DB.prepare(
        `SELECT * FROM tenant_domains WHERE website_id = ?
         ORDER BY is_primary DESC, created_at DESC`
      )
        .bind(websiteId)
        .all<TenantDomainRow>(),
      env.DB.prepare(
        `SELECT * FROM domain_notifications WHERE website_id = ? ORDER BY created_at DESC LIMIT 50`
      )
        .bind(websiteId)
        .all<Record<string, any>>(),
      env.DB.prepare(
        `SELECT * FROM domain_events WHERE website_id = ? ORDER BY created_at DESC LIMIT 60`
      )
        .bind(websiteId)
        .all<Record<string, any>>(),
      env.DB.prepare(
        `SELECT * FROM domain_health_checks WHERE website_id = ? ORDER BY checked_at DESC LIMIT 40`
      )
        .bind(websiteId)
        .all<Record<string, any>>(),
    ]);

    const healthChecks = checksRes.results || [];
    const domains = (domainsRes.results || [])
      .map((d) =>
        deriveDomainFields(
          d,
          tenantRowId,
          env,
          healthChecks.find((c) => Number(c.domain_id) === Number(d.id)) || null
        )
      );

    return json({
      domains,
      notifications: (notifsRes.results || []).map((n) => mapDomainNotificationRow(n, tenantRowId)),
      events: (eventsRes.results || []).map((e) => mapDomainEventRow(e, tenantRowId)),
      healthChecks: healthChecks.map((c) => mapHealthCheckRow(c)),
      previewUrl: `/site/${access.row.public_slug}`,
      dnsTarget: getCnameTarget(env),
      planDomainLimit: await getTenantDomainLimit(env, websiteId, access.parsed),
      cloudflareSaas: getDomainsCloudflareSaasStatus(env),
      channelStatus: getDomainsChannelStatus(env),
      registrarConfigured: Boolean((env.DOMAIN_REGISTRAR_API_KEY || '').trim()),
    });
  } catch (err) {
    console.error('GET tenant domains failed:', err);
    return errorJson('Failed to load tenant domains.', 500);
  }
}

export async function onRequestPost(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  try {
    const auth = await requireUser(request, env);
    if (!auth.ok) return auth.response;

    const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
      'business_owner',
      'business_manager',
      'business_staff',
    ]);
    if (!access.ok) return access.response;
    if (!env.DB) return errorJson('Database binding is not configured.', 503);

    const rl = await checkRateLimit(env, `domain_connect:${auth.user.id}`, 15, 3600);
    if (!rl.allowed) {
      return rateLimitResponse(
        rl,
        'Too many domain connection requests. Please try again shortly.'
      );
    }

    const body = await parseJsonBody<{
      domainName?: string;
      registrarName?: string;
      domainType?: string;
      isPrimary?: boolean;
      wwwPreference?: string;
      wwwMode?: string;
      expiryDate?: string;
      renewalDate?: string;
      renewalReminderDate?: string;
      ownershipConfirmed?: boolean;
    }>(request);
    if (!body) return errorJson('Invalid JSON payload.', 400);

    const rawDomain = sanitizeText(body.domainName || '', 253);
    if (rawDomain.length < 4) {
      return errorJson('Enter a valid domain name (e.g., myshop.in or shop.mybrand.com).', 400);
    }
    const parsed = normalizeAndValidateDomain(rawDomain, env);
    if (!parsed.valid) return errorJson(parsed.error, 400);

    const domain = parsed.domain;
    const registrarName =
      sanitizeText(body.registrarName || 'External Registrar (Customer Owned)', 100) ||
      'External Registrar (Customer Owned)';
    if (registrarName.length < 2) {
      return errorJson('Registrar name must be at least 2 characters.', 400);
    }

    const detectedType = domainKind(domain).domainType;
    const domainType =
      body.domainType === 'root' || body.domainType === 'subdomain'
        ? body.domainType
        : detectedType;
    const requestedMode = body.wwwPreference || body.wwwMode;
    const wwwMode =
      requestedMode === 'redirect_to_www' || requestedMode === 'redirect_to_root'
        ? requestedMode
        : domainType === 'subdomain'
          ? 'both'
          : 'redirect_to_root';
    const expiryDate = body.expiryDate ? sanitizeText(body.expiryDate, 20) : '';
    const renewalDate = body.renewalDate
      ? sanitizeText(body.renewalDate, 20)
      : body.renewalReminderDate
        ? sanitizeText(body.renewalReminderDate, 20)
        : expiryDate;

    const websiteId = access.row.website_id;
    const tenantRowId = Number(access.row.rowid || 0);

    // Global duplicate / takeover defense across all tenants.
    const duplicate = await env.DB.prepare(
      `SELECT id, website_id, status FROM tenant_domains WHERE domain_name = ? OR domain_name = ? LIMIT 1`
    )
      .bind(domain, `www.${domain}`)
      .first<{ id: number; website_id: string; status: string }>();

    if (duplicate) {
      await writeAuditLog(env, {
        actorId: auth.user.id,
        actorRole: access.effectiveRole,
        action: 'DOMAIN_DUPLICATE_BLOCKED',
        targetType: 'domain',
        targetId: String(duplicate.id || domain),
        details: { domain, assignedWebsiteId: duplicate.website_id },
      });
      const sameTenant = duplicate.website_id === websiteId;
      return errorJson(
        sameTenant
          ? `Domain "${domain}" is already connected to this business account.`
          : `Domain "${domain}" is already assigned to another business account. Duplicate assignment is blocked to prevent domain takeover.`,
        409
      );
    }

    const maxDomains = await getTenantDomainLimit(env, websiteId, access.parsed);
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM tenant_domains
       WHERE website_id = ? AND status NOT IN ('disconnected', 'rejected')`
    )
      .bind(websiteId)
      .first<{ cnt: number }>();

    const existingCount = Number(countRow?.cnt || 0);
    if (!auth.user.isSuperAdmin && existingCount >= maxDomains) {
      return errorJson(
        `Your current plan allows up to ${maxDomains} custom domain(s). Upgrade your plan or remove an unused domain first.`,
        403
      );
    }

    const shouldBePrimary = existingCount === 0 || body.isPrimary !== false;
    if (shouldBePrimary) {
      await env.DB.prepare('UPDATE tenant_domains SET is_primary = 0 WHERE website_id = ?')
        .bind(websiteId)
        .run();
    }

    const verificationToken = generateVerificationToken();
    const dnsTarget = getCnameTarget(env);
    const insertRes = await env.DB.prepare(
      `INSERT INTO tenant_domains
        (website_id, owner_id, domain_name, domain_source, registrar_name, status, is_primary,
         www_mode, www_status, dns_verification_status, verification_token, dns_target,
         ssl_status, expiry_date, renewal_date, created_at, updated_at)
       VALUES (?, ?, ?, 'external_owned', ?, 'pending_dns', ?, ?, ?, 'pending', ?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        websiteId,
        access.row.owner_id,
        domain,
        registrarName,
        shouldBePrimary ? 1 : 0,
        wwwMode,
        domainType === 'subdomain' ? 'not_configured' : 'pending',
        verificationToken,
        dnsTarget,
        expiryDate || null,
        renewalDate || null
      )
      .run();

    const created =
      (await env.DB.prepare('SELECT * FROM tenant_domains WHERE domain_name = ? LIMIT 1')
        .bind(domain)
        .first<TenantDomainRow>()) ||
      (await env.DB.prepare('SELECT * FROM tenant_domains WHERE id = ? LIMIT 1')
        .bind(Number(insertRes.meta?.last_row_id || 0))
        .first<TenantDomainRow>());

    if (shouldBePrimary) {
      await setPublicationCustomDomain(env, websiteId, access.parsed, domain);
    }

    const domainId = Number(created?.id || insertRes.meta?.last_row_id || 0);
    await recordDomainEvent(env, {
      domainId,
      websiteId,
      ownerId: access.row.owner_id,
      eventType: 'domain_added',
      actorRole: access.effectiveRole,
      actorId: auth.user.id,
      reason: `Domain ${domain} added — DNS configuration required`,
      details: { registrarName, domainType, wwwMode, dnsTarget },
    });
    await createDomainNotification(env, {
      domainId,
      websiteId,
      ownerId: access.row.owner_id,
      notificationType: 'dns_config_required',
      title: `DNS Configuration Required for ${domain}`,
      message: `Add TXT record "${verificationToken}" and routing CNAME -> ${dnsTarget} in your ${registrarName} DNS settings, then click Verify Live DNS.`,
      severity: 'warning',
    });
    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: access.effectiveRole,
      action: 'DOMAIN_ADDED',
      targetType: 'domain',
      targetId: String(domainId),
      details: { domain, domainType, isPrimary: shouldBePrimary },
    });

    if (expiryDate) await refreshTenantRenewalReminders(env, websiteId);

    return json(
      {
        domain: created ? deriveDomainFields(created, tenantRowId, env, null) : null,
        message:
          'Domain added. Configure the TXT ownership record and CNAME/A routing records at your registrar, then click Verify Live DNS.',
      },
      201
    );
  } catch (err) {
    console.error('POST tenant domain failed:', err);
    return errorJson('Failed to add custom domain.', 500);
  }
}
