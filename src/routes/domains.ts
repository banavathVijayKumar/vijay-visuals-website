import crypto from 'crypto';
import dns from 'dns/promises';
import tls from 'tls';
import express, { Request, Response } from 'express';
import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  auditLogs,
  domainEvents,
  domainHealthChecks,
  domainNotifications,
  domainPricingConfig,
  tenantDomains,
  tenants,
  users,
} from '../db/schema.ts';
import { AuthRequest, optionalAuth, requireAuth } from '../middleware/auth.ts';
import { createApiRateLimiter } from '../middleware/rateLimit.ts';

const MULTI_PART_TLDS = ['.co.in', '.org.in', '.net.in', '.firm.in', '.gen.in', '.ind.in', '.ac.in', '.edu.in', '.gov.in', '.co.uk', '.com.au'];

const PLATFORM_RESERVED_HOSTS = [
  'localhost',
  '127.0.0.1',
  'vijay-visuals-site.pages.dev',
];

const DEFAULT_PRICING_ROWS = [
  {
    extension: '.com',
    registrationFeeInr: 949,
    renewalFeeInr: 1149,
    transferFeeInr: 999,
    managementServiceFeeInr: 499,
    hostingFeeInr: 299,
    sslFeeInr: 0,
    websiteDevFeeInr: 4999,
    gstPct: 18,
    isPromotional: true,
    promoNote: 'First-year indicative registrar promo rate; renewal charged annually at standard registrar rate.',
  },
  {
    extension: '.in',
    registrationFeeInr: 549,
    renewalFeeInr: 699,
    transferFeeInr: 649,
    managementServiceFeeInr: 499,
    hostingFeeInr: 299,
    sslFeeInr: 0,
    websiteDevFeeInr: 4999,
    gstPct: 18,
    isPromotional: true,
    promoNote: 'NIXI .in first-year indicative rate; renewal billed at standard annual rate.',
  },
  {
    extension: '.co.in',
    registrationFeeInr: 499,
    renewalFeeInr: 649,
    transferFeeInr: 599,
    managementServiceFeeInr: 499,
    hostingFeeInr: 299,
    sslFeeInr: 0,
    websiteDevFeeInr: 4999,
    gstPct: 18,
    isPromotional: true,
    promoNote: 'Indian commercial .co.in first-year indicative rate; renewal billed annually.',
  },
  {
    extension: '.org',
    registrationFeeInr: 999,
    renewalFeeInr: 1299,
    transferFeeInr: 1099,
    managementServiceFeeInr: 499,
    hostingFeeInr: 299,
    sslFeeInr: 0,
    websiteDevFeeInr: 4999,
    gstPct: 18,
    isPromotional: false,
    promoNote: 'Standard indicative registrar pricing (non-promotional).',
  },
  {
    extension: '.net',
    registrationFeeInr: 1099,
    renewalFeeInr: 1349,
    transferFeeInr: 1149,
    managementServiceFeeInr: 499,
    hostingFeeInr: 299,
    sslFeeInr: 0,
    websiteDevFeeInr: 4999,
    gstPct: 18,
    isPromotional: false,
    promoNote: 'Standard indicative registrar pricing.',
  },
  {
    extension: '.shop',
    registrationFeeInr: 349,
    renewalFeeInr: 2899,
    transferFeeInr: 2699,
    managementServiceFeeInr: 499,
    hostingFeeInr: 299,
    sslFeeInr: 0,
    websiteDevFeeInr: 4999,
    gstPct: 18,
    isPromotional: true,
    promoNote: 'Heavy first-year promo discount — note higher standard annual renewal rate before buying.',
  },
];

let pricingSeeded = false;
async function ensureDomainPricingSeeded() {
  if (pricingSeeded) return;
  try {
    const existing = await db.select().from(domainPricingConfig).limit(1);
    if (existing.length === 0) {
      await db.insert(domainPricingConfig).values(DEFAULT_PRICING_ROWS).onConflictDoNothing();
    }
    pricingSeeded = true;
  } catch (err) {
    console.error('ensureDomainPricingSeeded error:', err);
  }
}

export function getHostingDnsTarget(): string {
  return (process.env.CUSTOM_DOMAIN_CNAME_TARGET || 'vijay-visuals-site.pages.dev').trim().toLowerCase();
}

export function getCloudflareSaasStatus() {
  const apiToken = Boolean((process.env.CLOUDFLARE_API_TOKEN || '').trim());
  const zoneId = Boolean((process.env.CLOUDFLARE_ZONE_ID || '').trim());
  const saasFallbackOrigin = (process.env.CLOUDFLARE_SAAS_FALLBACK_ORIGIN || '').trim();
  const pagesProject = 'vijay-visuals-site';
  const configured = apiToken && zoneId;

  return {
    configured,
    pagesProject,
    cnameTarget: getHostingDnsTarget(),
    saasFallbackOrigin: saasFallbackOrigin || null,
    architectureNote: configured
      ? 'Cloudflare API credentials detected. Verify that Cloudflare for SaaS Custom Hostnames and Worker host routing are active on your zone.'
      : 'Current production hosting uses static Cloudflare Pages (wrangler.toml: vijay-visuals-site, up to 100 custom domains per Pages project). Scalable multi-tenant routing (>100 customer domains with automated per-hostname SSL) requires Cloudflare for SaaS Custom Hostnames (free up to 100 hostnames, $0.10/hostname/month beyond 100) + a Cloudflare Worker forwarding X-Forwarded-Host to tenant resolution.',
  };
}

export function getChannelIntegrationStatus() {
  return {
    in_app: 'delivered',
    email: process.env.SMTP_HOST && process.env.SMTP_USER ? 'configured_smtp' : 'not_configured_smtp',
    whatsapp:
      process.env.WHATSAPP_CLOUD_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
        ? 'configured_whatsapp_cloud'
        : 'not_configured_whatsapp',
  };
}

export function getPlanDomainLimit(planTier: string): number {
  if (planTier === 'enterprise_ai') return 10;
  if (planTier === 'website_pwa') return 3;
  return 1;
}

export function normalizeAndValidateHostname(rawInput: string): {
  valid: boolean;
  normalized: string;
  extension: string;
  domainType: 'root' | 'subdomain';
  rootApex: string;
  error?: string;
} {
  let cleaned = String(rawInput || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.+$/, '');

  // Strip leading www. for root normalization if user typed www.example.com
  const hadWww = cleaned.startsWith('www.');
  if (hadWww) {
    cleaned = cleaned.slice(4);
  }

  if (!cleaned || cleaned.length < 4 || cleaned.length > 253) {
    return {
      valid: false,
      normalized: '',
      extension: '',
      domainType: 'root',
      rootApex: '',
      error: 'Enter a valid domain name (e.g., myshop.in or shop.mybrand.com).',
    };
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(cleaned)) {
    return {
      valid: false,
      normalized: '',
      extension: '',
      domainType: 'root',
      rootApex: '',
      error: 'IP addresses are not allowed. Enter a registered domain name.',
    };
  }

  if (
    PLATFORM_RESERVED_HOSTS.includes(cleaned) ||
    cleaned.endsWith('.pages.dev') ||
    cleaned.endsWith('.run.app') ||
    cleaned.endsWith('.localhost')
  ) {
    return {
      valid: false,
      normalized: '',
      extension: '',
      domainType: 'root',
      rootApex: '',
      error: 'Platform preview hostnames cannot be connected as customer-owned custom domains.',
    };
  }

  const labels = cleaned.split('.');
  if (labels.length < 2) {
    return {
      valid: false,
      normalized: '',
      extension: '',
      domainType: 'root',
      rootApex: '',
      error: 'Domain must include a valid extension such as .com, .in, or .co.in.',
    };
  }

  for (const label of labels) {
    if (!label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
      return {
        valid: false,
        normalized: '',
        extension: '',
        domainType: 'root',
        rootApex: '',
        error: `Invalid domain label "${label}". Use only lowercase letters (a-z), numbers (0-9), and hyphens.`,
      };
    }
  }

  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,24}$/.test(tld)) {
    return {
      valid: false,
      normalized: '',
      extension: '',
      domainType: 'root',
      rootApex: '',
      error: 'Top-level domain extension must contain only letters (e.g., .com, .in).',
    };
  }

  const multiTld = MULTI_PART_TLDS.find((ext) => cleaned.endsWith(ext));
  const extension = multiTld || `.${tld}`;
  const tldLabelCount = multiTld ? 2 : 1;
  const domainType: 'root' | 'subdomain' = labels.length > tldLabelCount + 1 ? 'subdomain' : 'root';
  const rootApex = labels.slice(-(tldLabelCount + 1)).join('.');

  return {
    valid: true,
    normalized: cleaned,
    extension,
    domainType,
    rootApex,
  };
}

export function buildDnsInstructions(domain: typeof tenantDomains.$inferSelect) {
  const target = getHostingDnsTarget();
  const isSubdomain = domain.domainType === 'subdomain';
  const hostPrefix = isSubdomain ? domain.domainName.replace(new RegExp(`\\.${domain.extension.replace('.', '\\.')}$`), '').split('.')[0] : '@';
  const txtHost = `_vijayvisuals-verify.${domain.domainName}`;

  const records = [
    {
      purpose: '1. Domain Ownership Verification (Required First)',
      type: 'TXT',
      host: txtHost,
      altHost: isSubdomain ? domain.domainName : '@',
      value: domain.verificationToken,
      ttl: 'Auto / 300',
      required: true,
    },
    isSubdomain
      ? {
          purpose: '2. Subdomain Routing to Vijay Visuals Hosting',
          type: 'CNAME',
          host: hostPrefix,
          altHost: domain.domainName,
          value: target,
          ttl: 'Auto / 300',
          required: true,
        }
      : {
          purpose: '2. Root Domain Routing (Use CNAME Flattening / ALIAS at Cloudflare, or A Record if registrar does not support root CNAME)',
          type: 'CNAME / ALIAS',
          host: '@',
          altHost: domain.domainName,
          value: target,
          ttl: 'Auto / 300',
          required: true,
        },
  ];

  if (!isSubdomain) {
    records.push({
      purpose:
        domain.wwwPreference === 'redirect_to_www'
          ? '3. Primary WWW Hostname (Root redirects to www)'
          : '3. WWW Redirection Record (www redirects to root domain)',
      type: 'CNAME',
      host: 'www',
      altHost: `www.${domain.domainName}`,
      value: target,
      ttl: 'Auto / 300',
      required: true,
    });
  }

  return {
    hostingTarget: target,
    records,
    troubleshooting: [
      'Never share your registrar password or OTP with anyone. Only add the DNS records above inside your own registrar DNS panel.',
      'If your registrar (e.g., GoDaddy or Namecheap) does not allow a CNAME on "@" (root domain), either move DNS to free Cloudflare DNS (recommended, supports CNAME flattening + free SSL) or point "www" via CNAME and enable registrar 301 forwarding from root to www.',
      'DNS changes typically propagate within 5–30 minutes, though some registrars take up to 24 hours.',
      'Remove conflicting old A or AAAA records pointing to parking pages before verifying.',
    ],
  };
}

async function probeTlsCertificate(hostname: string): Promise<{
  connected: boolean;
  authorized: boolean;
  issuer: string;
  validTo: string;
  error: string;
}> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (res: { connected: boolean; authorized: boolean; issuer: string; validTo: string; error: string }) => {
      if (!settled) {
        settled = true;
        resolve(res);
      }
    };

    try {
      const socket = tls.connect(
        {
          host: hostname,
          port: 443,
          servername: hostname,
          rejectUnauthorized: false,
          timeout: 4500,
        },
        () => {
          try {
            const cert = socket.getPeerCertificate();
            const authorized = socket.authorized;
            const authErr = socket.authorizationError ? String(socket.authorizationError) : '';
            const issuer =
              cert && cert.issuer
                ? String(cert.issuer.O || cert.issuer.CN || '')
                : '';
            const validTo = cert && cert.valid_to ? String(cert.valid_to) : '';
            socket.end();
            finish({
              connected: true,
              authorized: Boolean(authorized),
              issuer,
              validTo,
              error: authorized ? '' : authErr || 'Certificate not trusted for this hostname.',
            });
          } catch (e: unknown) {
            socket.destroy();
            finish({
              connected: false,
              authorized: false,
              issuer: '',
              validTo: '',
              error: e instanceof Error ? e.message : 'TLS inspection error.',
            });
          }
        }
      );

      socket.on('timeout', () => {
        socket.destroy();
        finish({
          connected: false,
          authorized: false,
          issuer: '',
          validTo: '',
          error: 'TLS handshake timed out on port 443.',
        });
      });

      socket.on('error', (err: NodeJS.ErrnoException) => {
        socket.destroy();
        finish({
          connected: false,
          authorized: false,
          issuer: '',
          validTo: '',
          error: err.code || err.message || 'TLS connection failed.',
        });
      });
    } catch (err: unknown) {
      finish({
        connected: false,
        authorized: false,
        issuer: '',
        validTo: '',
        error: err instanceof Error ? err.message : 'Unable to initiate TLS probe.',
      });
    }
  });
}

async function probeHttpsEndpoint(url: string): Promise<{
  reachable: boolean;
  statusCode: number;
  locationHeader: string;
  responseTimeMs: number;
  error: string;
}> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return {
      reachable: res.status >= 200 && res.status < 400,
      statusCode: res.status,
      locationHeader: res.headers.get('location') || '',
      responseTimeMs: Date.now() - started,
      error: res.status >= 400 ? `HTTP ${res.status}` : '',
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    return {
      reachable: false,
      statusCode: 0,
      locationHeader: '',
      responseTimeMs: Date.now() - started,
      error: err instanceof Error ? err.message : 'HTTPS request failed',
    };
  }
}

async function recordDomainEvent(params: {
  domainId: number;
  tenantId: number;
  actorEmail: string;
  actorRole: string;
  eventType: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  title: string;
  details: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(domainEvents).values({
      domainId: params.domainId,
      tenantId: params.tenantId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      eventType: params.eventType,
      severity: params.severity,
      title: params.title,
      details: params.details,
      metadataJson: JSON.stringify(params.metadata || {}),
    });
  } catch (err) {
    console.error('recordDomainEvent failed:', err);
  }
}

async function createDomainNotification(params: {
  domainId: number;
  tenantId: number;
  userId?: number | null;
  notificationType: string;
  milestoneKey?: string;
  title: string;
  message: string;
}) {
  try {
    if (params.milestoneKey) {
      const existing = await db
        .select()
        .from(domainNotifications)
        .where(
          and(
            eq(domainNotifications.domainId, params.domainId),
            eq(domainNotifications.milestoneKey, params.milestoneKey)
          )
        )
        .limit(1);
      if (existing.length > 0) return null;
    }

    const [created] = await db
      .insert(domainNotifications)
      .values({
        domainId: params.domainId,
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        notificationType: params.notificationType,
        milestoneKey: params.milestoneKey || '',
        title: params.title,
        message: params.message,
        channelStatusJson: JSON.stringify(getChannelIntegrationStatus()),
      })
      .returning();
    return created;
  } catch (err) {
    console.error('createDomainNotification failed:', err);
    return null;
  }
}

export async function evaluateDomainRenewalReminders(filterTenantId?: number) {
  const rows = filterTenantId
    ? await db.select().from(tenantDomains).where(eq(tenantDomains.tenantId, filterTenantId))
    : await db.select().from(tenantDomains);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let remindersCreated = 0;

  for (const dom of rows) {
    if (!dom.expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(dom.expiryDate)) continue;
    if (dom.renewalStatus === 'renewed_confirmed') continue;

    const exp = new Date(`${dom.expiryDate}T00:00:00`);
    if (Number.isNaN(exp.getTime())) continue;
    const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / 86_400_000);

    let nextRenewalStatus = dom.renewalStatus;
    let nextPaymentStatus = dom.renewalPaymentStatus;
    let milestoneKey = '';
    let notifType = '';
    let title = '';
    let message = '';

    if (daysLeft <= 0) {
      nextRenewalStatus = 'expired';
      nextPaymentStatus = 'overdue';
      milestoneKey = `expiry_0d_${dom.expiryDate}`;
      notifType = 'domain_expired';
      title = `Domain Expired: ${dom.domainName}`;
      message = `${dom.domainName} reached its expiry date (${dom.expiryDate}) at ${dom.registrarName}. Renew directly in your registrar account to avoid website downtime. Vijay Visuals will not mark it renewed until registrar confirmation.`;
    } else if (daysLeft <= 3) {
      nextRenewalStatus = 'renewal_due';
      nextPaymentStatus = 'pending_customer_consent';
      milestoneKey = `expiry_3d_${dom.expiryDate}`;
      notifType = 'renewal_payment_pending';
      title = `Urgent: ${dom.domainName} expires in ${daysLeft} day(s)`;
      message = `3-day renewal reminder: ${dom.domainName} expires on ${dom.expiryDate}. Complete renewal payment directly with ${dom.registrarName} (no automatic charge is taken without your consent).`;
    } else if (daysLeft <= 7) {
      nextRenewalStatus = 'renewal_due';
      nextPaymentStatus = 'pending_customer_consent';
      milestoneKey = `expiry_7d_${dom.expiryDate}`;
      notifType = 'expiry_approaching';
      title = `7-Day Renewal Alert: ${dom.domainName}`;
      message = `${dom.domainName} expires in ${daysLeft} days (${dom.expiryDate}). Review your registrar renewal invoice early.`;
    } else if (daysLeft <= 15) {
      nextRenewalStatus = 'expiring_soon';
      milestoneKey = `expiry_15d_${dom.expiryDate}`;
      notifType = 'expiry_approaching';
      title = `15-Day Renewal Reminder: ${dom.domainName}`;
      message = `${dom.domainName} expires in ${daysLeft} days (${dom.expiryDate}) at ${dom.registrarName}.`;
    } else if (daysLeft <= 30) {
      nextRenewalStatus = 'expiring_soon';
      milestoneKey = `expiry_30d_${dom.expiryDate}`;
      notifType = 'expiry_approaching';
      title = `30-Day Renewal Notice: ${dom.domainName}`;
      message = `${dom.domainName} will expire on ${dom.expiryDate} (${daysLeft} days remaining). Renewal reminders are sent at 30, 15, 7, 3 days and on expiry date.`;
    }

    if (nextRenewalStatus !== dom.renewalStatus || nextPaymentStatus !== dom.renewalPaymentStatus) {
      await db
        .update(tenantDomains)
        .set({
          renewalStatus: nextRenewalStatus,
          renewalPaymentStatus: nextPaymentStatus,
          updatedAt: new Date(),
        })
        .where(eq(tenantDomains.id, dom.id));
    }

    if (milestoneKey) {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, dom.tenantId)).limit(1);
      const created = await createDomainNotification({
        domainId: dom.id,
        tenantId: dom.tenantId,
        userId: tenant?.ownerUserId ?? null,
        notificationType: notifType,
        milestoneKey,
        title,
        message,
      });
      if (created) {
        remindersCreated++;
        await recordDomainEvent({
          domainId: dom.id,
          tenantId: dom.tenantId,
          actorEmail: 'renewal-scheduler',
          actorRole: 'system',
          eventType: 'renewal_reminder',
          severity: daysLeft <= 3 ? 'error' : 'warning',
          title,
          details: message,
          metadata: { daysLeft, milestoneKey, channels: getChannelIntegrationStatus() },
        });
      }
    }
  }

  return { scannedCount: rows.length, remindersCreated };
}

async function assertTenantDomainAccess(req: AuthRequest, tenantId: number) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return { ok: false as const, status: 404, error: 'Business account not found.' };
  const dbUser = req.dbUser;
  if (!dbUser) return { ok: false as const, status: 401, error: 'Authentication required.' };
  if (dbUser.role === 'super_admin' || tenant.ownerUserId === dbUser.id) {
    return { ok: true as const, tenant };
  }
  // DNS/domain changes are owner/admin-only. Staff membership never granted
  // domain control in the Cloudflare implementation either.
  return {
    ok: false as const,
    status: 403,
    error: 'Business Owner or Super Admin access required to manage domains.',
  };
}

function assertSuperAdmin(req: AuthRequest, res: Response): boolean {
  if (!req.dbUser || req.dbUser.role !== 'super_admin') {
    res.status(403).json({ error: 'Super Admin role required for platform domain governance.' });
    return false;
  }
  return true;
}

async function runLiveDnsAndHealthInspection(domainRow: typeof tenantDomains.$inferSelect, includeHttpsProbe: boolean) {
  const target = getHostingDnsTarget();
  let cnameRecords: string[] = [];
  let txtRecords: string[] = [];
  let verifySubTxtRecords: string[] = [];
  let aRecords: string[] = [];
  let wwwCnameRecords: string[] = [];
  let wwwARecords: string[] = [];
  const lookupErrors: string[] = [];

  try {
    cnameRecords = await dns.resolveCname(domainRow.domainName);
  } catch (err: any) {
    lookupErrors.push(`CNAME(${domainRow.domainName}): ${err?.code || 'NONE'}`);
  }

  try {
    const raw = await dns.resolveTxt(domainRow.domainName);
    txtRecords = raw.map((parts) => parts.join(''));
  } catch (err: any) {
    lookupErrors.push(`TXT(${domainRow.domainName}): ${err?.code || 'NONE'}`);
  }

  try {
    const rawSub = await dns.resolveTxt(`_vijayvisuals-verify.${domainRow.domainName}`);
    verifySubTxtRecords = rawSub.map((parts) => parts.join(''));
  } catch (err: any) {
    lookupErrors.push(`TXT(_vijayvisuals-verify): ${err?.code || 'NONE'}`);
  }

  try {
    aRecords = await dns.resolve4(domainRow.domainName);
  } catch {
    // optional when CNAME is used
  }

  if (domainRow.domainType === 'root') {
    try {
      wwwCnameRecords = await dns.resolveCname(`www.${domainRow.domainName}`);
    } catch {
      // optional
    }
    try {
      wwwARecords = await dns.resolve4(`www.${domainRow.domainName}`);
    } catch {
      // optional
    }
  }

  const allTxt = [...txtRecords, ...verifySubTxtRecords];
  const ownershipVerified = allTxt.some((t) => t.includes(domainRow.verificationToken));
  const cnameMatchesTarget = cnameRecords.some((c) => c.toLowerCase().replace(/\.$/, '').includes(target));
  const wwwMatchesTarget = wwwCnameRecords.some((c) => c.toLowerCase().replace(/\.$/, '').includes(target));
  const routingConfigured = cnameMatchesTarget || wwwMatchesTarget;
  const dnsHealthy = ownershipVerified && routingConfigured;

  // Real TLS/SSL & HTTPS probes (NEVER fake SSL active!)
  let tlsProbe = { connected: false, authorized: false, issuer: '', validTo: '', error: 'Not probed yet' };
  let httpsProbe = { reachable: false, statusCode: 0, locationHeader: '', responseTimeMs: 0, error: 'Not probed yet' };
  let wwwRedirectHealthy = false;

  if (includeHttpsProbe || dnsHealthy || aRecords.length > 0 || cnameRecords.length > 0) {
    tlsProbe = await probeTlsCertificate(domainRow.domainName);
    if (tlsProbe.connected) {
      httpsProbe = await probeHttpsEndpoint(`https://${domainRow.domainName}/`);
    }
    if (domainRow.domainType === 'root' && (wwwCnameRecords.length > 0 || wwwARecords.length > 0)) {
      const wwwProbe = await probeHttpsEndpoint(`https://www.${domainRow.domainName}/`);
      if (domainRow.wwwPreference === 'redirect_to_root') {
        wwwRedirectHealthy =
          [301, 302, 307, 308].includes(wwwProbe.statusCode) &&
          wwwProbe.locationHeader.toLowerCase().includes(`://${domainRow.domainName}`);
      } else if (domainRow.wwwPreference === 'redirect_to_www') {
        wwwRedirectHealthy =
          [301, 302, 307, 308].includes(httpsProbe.statusCode) &&
          httpsProbe.locationHeader.toLowerCase().includes(`://www.${domainRow.domainName}`);
      } else {
        wwwRedirectHealthy = wwwProbe.reachable;
      }
    }
  }

  const sslHealthy = tlsProbe.connected && tlsProbe.authorized;
  const sslStatus = sslHealthy
    ? 'active'
    : routingConfigured
      ? 'provisioning'
      : tlsProbe.connected && !tlsProbe.authorized
        ? 'error'
        : 'pending';

  const wwwStatus =
    domainRow.domainType === 'subdomain'
      ? 'not_applicable'
      : wwwMatchesTarget && wwwRedirectHealthy
        ? 'configured'
        : wwwCnameRecords.length > 0 || wwwARecords.length > 0
          ? 'mismatch'
          : 'pending';

  const dnsStatus = dnsHealthy ? 'verified' : ownershipVerified ? 'pending' : 'dns_error';

  // Compute exact honest 12-step progress & connection status
  // Step 12 (LIVE) is ONLY granted when ownership TXT, DNS routing, valid SSL/TLS, AND HTTPS all verify!
  let workflowStep = 5;
  let connectionStatus = 'dns_pending';

  if (domainRow.connectionStatus === 'suspended' || domainRow.connectionStatus === 'disconnected') {
    connectionStatus = domainRow.connectionStatus;
    workflowStep = domainRow.workflowStep;
  } else if (ownershipVerified && routingConfigured && sslHealthy && httpsProbe.reachable) {
    workflowStep = 12;
    connectionStatus = 'live';
  } else if (ownershipVerified && routingConfigured && !sslHealthy) {
    workflowStep = 9;
    connectionStatus = 'ssl_provisioning';
  } else if (ownershipVerified && !routingConfigured) {
    workflowStep = 7;
    connectionStatus = 'ownership_verified';
  } else {
    workflowStep = 6;
    connectionStatus = 'error';
  }

  const issues: string[] = [];
  if (!ownershipVerified) {
    issues.push(`Ownership TXT record "${domainRow.verificationToken}" not found at _vijayvisuals-verify.${domainRow.domainName} or ${domainRow.domainName}.`);
  }
  if (!routingConfigured) {
    issues.push(`Routing record does not point to ${target} yet (found CNAME=[${cnameRecords.join(', ') || 'none'}], A=[${aRecords.join(', ') || 'none'}]).`);
  }
  if (!sslHealthy) {
    issues.push(`SSL/HTTPS not active yet: ${tlsProbe.error || 'Waiting for valid TLS certificate after DNS propagation and Cloudflare edge binding.'}`);
  }
  if (domainRow.domainType === 'root' && !wwwRedirectHealthy) {
    issues.push(`WWW redirection (${domainRow.wwwPreference.replace(/_/g, ' ')}) not confirmed live yet.`);
  }

  const lastHealthStatus =
    dnsHealthy && sslHealthy && httpsProbe.reachable
      ? 'healthy'
      : ownershipVerified || httpsProbe.reachable
        ? 'degraded'
        : 'down';

  return {
    ownershipVerified,
    routingConfigured,
    dnsHealthy,
    sslHealthy,
    httpsAvailable: httpsProbe.reachable,
    httpStatusCode: httpsProbe.statusCode,
    wwwRedirectHealthy,
    responseTimeMs: httpsProbe.responseTimeMs,
    dnsStatus,
    sslStatus,
    wwwStatus,
    connectionStatus,
    workflowStep,
    lastHealthStatus,
    sslIssuer: tlsProbe.issuer,
    sslValidTo: tlsProbe.validTo,
    cnameRecords,
    txtRecords: allTxt,
    aRecords,
    wwwCnameRecords,
    errorSummary: issues.join(' '),
    lookupErrors,
  };
}

export function createDomainsRouter() {
  const router = express.Router();
  const domainRateLimit = createApiRateLimiter({ maxRequests: 45, windowMs: 60_000 });

  // =========================================================================
  // 1. PUBLIC PRICING MATRIX & MULTI-TENANT HOSTNAME RESOLVER
  // =========================================================================
  router.get('/api/domains/pricing', async (_req: Request, res: Response) => {
    try {
      await ensureDomainPricingSeeded();
      const rows = await db.select().from(domainPricingConfig).orderBy(asc(domainPricingConfig.id));
      const registrarConfigured = Boolean((process.env.DOMAIN_REGISTRAR_API_KEY || '').trim());

      res.json({
        registrarConfigured,
        registrarProvider: (process.env.DOMAIN_REGISTRAR_PROVIDER || '').trim() || 'Not Configured',
        cloudflareSaas: getCloudflareSaasStatus(),
        autoChargePolicy: 'Vijay Visuals never charges domain registration, renewal, or management fees automatically without explicit customer consent and payment authorization.',
        ownershipPolicy: 'Domains are registered directly under the customer’s own registrar account and email address. Vijay Visuals never claims ownership of customer domains.',
        pricing: rows.map((r) => {
          const domainSubtotal = r.registrationFeeInr;
          const fullPackageSubtotal =
            r.websiteDevFeeInr + r.registrationFeeInr + r.hostingFeeInr + r.sslFeeInr + r.managementServiceFeeInr;
          const domainGstInr = Math.round((domainSubtotal * r.gstPct) / 100);
          const fullPackageGstInr = Math.round((fullPackageSubtotal * r.gstPct) / 100);
          return {
            ...r,
            domainGstInr,
            domainTotalFirstYearInr: domainSubtotal + domainGstInr,
            renewalGstInr: Math.round((r.renewalFeeInr * r.gstPct) / 100),
            renewalTotalInr: r.renewalFeeInr + Math.round((r.renewalFeeInr * r.gstPct) / 100),
            fullPackageSubtotalInr: fullPackageSubtotal,
            fullPackageGstInr,
            fullPackageTotalInr: fullPackageSubtotal + fullPackageGstInr,
          };
        }),
      });
    } catch (error) {
      console.error('GET /api/domains/pricing failed:', error);
      res.status(500).json({ error: 'Unable to load domain pricing matrix.' });
    }
  });

  // Multi-Tenant Custom Hostname Resolver (used by Express/Cloudflare Worker/SPA on custom domain visits)
  router.get('/api/domains/resolve', async (req: Request, res: Response) => {
    try {
      const rawHost = String(
        req.query.host || req.headers['x-forwarded-host'] || req.headers.host || ''
      )
        .split(',')[0]
        .trim()
        .toLowerCase()
        .replace(/:\d+$/, '');

      if (!rawHost) {
        return res.status(400).json({ matched: false, reason: 'No hostname provided.' });
      }

      const isWwwVisit = rawHost.startsWith('www.');
      const bareHost = isWwwVisit ? rawHost.slice(4) : rawHost;

      const [dom] = await db
        .select()
        .from(tenantDomains)
        .where(or(eq(tenantDomains.domainName, rawHost), eq(tenantDomains.domainName, bareHost)))
        .limit(1);

      if (!dom) {
        return res.json({ matched: false, host: rawHost, reason: 'Hostname is not registered to any tenant.' });
      }

      if (dom.connectionStatus === 'suspended' || dom.connectionStatus === 'disconnected') {
        return res.status(403).json({
          matched: false,
          host: rawHost,
          reason: `Domain is currently ${dom.connectionStatus}.`,
        });
      }

      if (dom.connectionStatus !== 'live' && dom.dnsStatus !== 'verified') {
        return res.status(403).json({
          matched: false,
          host: rawHost,
          reason: 'Domain ownership & DNS verification must complete before routing traffic (domain takeover protection).',
        });
      }

      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, dom.tenantId)).limit(1);
      if (!tenant || !tenant.published) {
        return res.status(404).json({
          matched: false,
          host: rawHost,
          reason: 'Associated storefront is unpublished or unavailable.',
        });
      }

      // Determine canonical primary domain & WWW redirection target
      const tenantAllDomains = await db
        .select()
        .from(tenantDomains)
        .where(eq(tenantDomains.tenantId, tenant.id));
      const primaryDomain = tenantAllDomains.find((d) => d.isPrimary && d.connectionStatus === 'live') || dom;

      let redirectUrl: string | null = null;
      if (primaryDomain.id !== dom.id) {
        const targetHost =
          primaryDomain.wwwPreference === 'redirect_to_www' && primaryDomain.domainType === 'root'
            ? `www.${primaryDomain.domainName}`
            : primaryDomain.domainName;
        redirectUrl = `https://${targetHost}`;
      } else if (dom.domainType === 'root') {
        if (dom.wwwPreference === 'redirect_to_root' && isWwwVisit) {
          redirectUrl = `https://${dom.domainName}`;
        } else if (dom.wwwPreference === 'redirect_to_www' && !isWwwVisit) {
          redirectUrl = `https://www.${dom.domainName}`;
        }
      }

      res.json({
        matched: true,
        host: rawHost,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        domainId: dom.id,
        primaryDomain: primaryDomain.domainName,
        wwwPreference: dom.wwwPreference,
        redirectUrl,
      });
    } catch (error) {
      console.error('GET /api/domains/resolve failed:', error);
      res.status(500).json({ matched: false, error: 'Hostname resolution failed.' });
    }
  });

  // =========================================================================
  // 2. OPTION B: DOMAIN SEARCH (HONEST REGISTRAR INTEGRATION CHECK)
  // =========================================================================
  router.post('/api/domains/search', domainRateLimit, async (req: Request, res: Response) => {
    try {
      await ensureDomainPricingSeeded();
      const schema = z.object({
        businessName: z.string().min(2).max(100),
        category: z.string().optional().default('business'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Enter a business name or domain keyword (minimum 2 characters).' });
      }

      const raw = parsed.data.businessName
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\.(com|in|co\.in|org|net|shop)$/i, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim();

      const compact = raw.replace(/[\s-]+/g, '').slice(0, 26) || 'mybusiness';
      const hyphenated = raw.replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 26) || 'my-business';
      const catSuffix = parsed.data.category.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10);

      const registrarConfigured = Boolean((process.env.DOMAIN_REGISTRAR_API_KEY || '').trim());
      const registrarProvider = (process.env.DOMAIN_REGISTRAR_PROVIDER || '').trim() || 'Not Configured';

      const pricingRows = await db.select().from(domainPricingConfig).orderBy(asc(domainPricingConfig.id));

      const bases = Array.from(
        new Set(
          [
            compact,
            hyphenated,
            catSuffix && !compact.includes(catSuffix) ? `${compact}${catSuffix}` : `${compact}store`,
          ].filter((b) => b.length >= 3)
        )
      ).slice(0, 3);

      const suggestions = [];
      for (const base of bases) {
        for (const p of pricingRows) {
          const domain = `${base}${p.extension}`;
          const gstFirstYear = Math.round((p.registrationFeeInr * p.gstPct) / 100);
          const gstRenewal = Math.round((p.renewalFeeInr * p.gstPct) / 100);
          const gstTransfer = Math.round((p.transferFeeInr * p.gstPct) / 100);
          suggestions.push({
            domain,
            extension: p.extension,
            availabilityStatus: registrarConfigured ? 'registrar_api_ready' : 'registrar_integration_required',
            availabilityLabel: registrarConfigured
              ? `Check Live at ${registrarProvider}`
              : 'Domain Registrar Integration Required (Verify at Registrar)',
            isPromotional: p.isPromotional,
            promoNote: p.promoNote,
            indicativeRegistrationInr: p.registrationFeeInr,
            indicativeRenewalInr: p.renewalFeeInr,
            indicativeTransferInr: p.transferFeeInr,
            gstPct: p.gstPct,
            estimatedGstInr: gstFirstYear,
            estimatedTotalFirstYearInr: p.registrationFeeInr + gstFirstYear,
            estimatedRenewalTotalInr: p.renewalFeeInr + gstRenewal,
            estimatedTransferTotalInr: p.transferFeeInr + gstTransfer,
            ownershipPolicy: 'Registered directly in customer’s own registrar account & email',
            externalPurchaseLinks: {
              cloudflare: `https://domains.cloudflare.com/`,
              godaddy: `https://www.godaddy.com/en-in/domainsearch/find?domainToCheck=${encodeURIComponent(domain)}`,
              namecheap: `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(domain)}`,
              porkbun: `https://porkbun.com/checkout/search?q=${encodeURIComponent(domain)}`,
            },
          });
        }
      }

      res.json({
        registrarConfigured,
        registrarProvider,
        setupInstructions: registrarConfigured
          ? `Connected to ${registrarProvider}. All domain purchases require explicit customer confirmation and payment authorization.`
          : 'To enable live in-app domain availability and checkout, configure DOMAIN_REGISTRAR_PROVIDER (e.g., resellerclub, namecheap, godaddy, or cloudflare) and DOMAIN_REGISTRAR_API_KEY in server Secrets. Until configured, no availability is fabricated — customers can purchase directly at Cloudflare Registrar, GoDaddy India, Namecheap, or Porkbun under their own account and connect via Option A.',
        honestNotice: registrarConfigured
          ? `Connected to ${registrarProvider}. Domains are registered in customer’s own account.`
          : 'Domain Registrar Integration Required: Live availability & registrar checkout API is not configured. Figures shown are transparent reference rates configured by Super Admin (promotional first-year vs standard renewal clearly separated) — check exact live availability directly at the registrar links below.',
        ownershipGuarantee:
          'Vijay Visuals never registers a customer’s domain under Vijay Visuals ownership and never auto-charges without explicit customer confirmation.',
        suggestions,
      });
    } catch (error) {
      console.error('POST /api/domains/search failed:', error);
      res.status(500).json({ error: 'Domain search failed.' });
    }
  });

  // =========================================================================
  // 3. CUSTOMER & OWNER DOMAIN DASHBOARD ENDPOINTS
  // =========================================================================
  router.get('/api/customer/domains', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      await ensureDomainPricingSeeded();
      const dbUser = req.dbUser!;

      const userTenants =
        dbUser.role === 'super_admin'
          ? await db.select().from(tenants).orderBy(desc(tenants.createdAt))
          : await db.select().from(tenants).where(eq(tenants.ownerUserId, dbUser.id)).orderBy(desc(tenants.createdAt));

      const tenantIds = userTenants.map((t) => t.id);
      if (tenantIds.length === 0) {
        return res.json({
          tenants: [],
          domains: [],
          notifications: [],
          events: [],
          healthChecks: [],
          cloudflareSaas: getCloudflareSaasStatus(),
          channelStatus: getChannelIntegrationStatus(),
          registrarConfigured: Boolean((process.env.DOMAIN_REGISTRAR_API_KEY || '').trim()),
        });
      }

      // Run renewal check for this user's tenants
      for (const tid of tenantIds) {
        await evaluateDomainRenewalReminders(tid);
      }

      const allDomains = await db.select().from(tenantDomains).orderBy(desc(tenantDomains.isPrimary), desc(tenantDomains.createdAt));
      const myDomains = allDomains.filter((d) => tenantIds.includes(d.tenantId));

      const allNotifs = await db.select().from(domainNotifications).orderBy(desc(domainNotifications.createdAt)).limit(100);
      const myNotifs = allNotifs.filter((n) => tenantIds.includes(n.tenantId));

      const allEvents = await db.select().from(domainEvents).orderBy(desc(domainEvents.createdAt)).limit(100);
      const myEvents = allEvents.filter((e) => tenantIds.includes(e.tenantId));

      const allChecks = await db.select().from(domainHealthChecks).orderBy(desc(domainHealthChecks.checkedAt)).limit(100);
      const myChecks = allChecks.filter((c) => tenantIds.includes(c.tenantId));

      res.json({
        tenants: userTenants,
        domains: myDomains.map((d) => ({
          ...d,
          dnsInstructions: buildDnsInstructions(d),
          latestHealthCheck: myChecks.find((c) => c.domainId === d.id) || null,
        })),
        notifications: myNotifs,
        events: myEvents,
        healthChecks: myChecks,
        cloudflareSaas: getCloudflareSaasStatus(),
        channelStatus: getChannelIntegrationStatus(),
        registrarConfigured: Boolean((process.env.DOMAIN_REGISTRAR_API_KEY || '').trim()),
      });
    } catch (error) {
      console.error('GET /api/customer/domains failed:', error);
      res.status(500).json({ error: 'Unable to load customer domain dashboard.' });
    }
  });

  router.get('/api/owner/tenants/:tenantId/domains', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const check = await assertTenantDomainAccess(req, tenantId);
      if (!check.ok) return res.status(check.status).json({ error: check.error });

      await evaluateDomainRenewalReminders(tenantId);

      const [rows, notifs, events, healthChecks] = await Promise.all([
        db
          .select()
          .from(tenantDomains)
          .where(eq(tenantDomains.tenantId, tenantId))
          .orderBy(desc(tenantDomains.isPrimary), desc(tenantDomains.createdAt)),
        db
          .select()
          .from(domainNotifications)
          .where(eq(domainNotifications.tenantId, tenantId))
          .orderBy(desc(domainNotifications.createdAt))
          .limit(50),
        db
          .select()
          .from(domainEvents)
          .where(eq(domainEvents.tenantId, tenantId))
          .orderBy(desc(domainEvents.createdAt))
          .limit(60),
        db
          .select()
          .from(domainHealthChecks)
          .where(eq(domainHealthChecks.tenantId, tenantId))
          .orderBy(desc(domainHealthChecks.checkedAt))
          .limit(40),
      ]);

      res.json({
        domains: rows.map((d) => ({
          ...d,
          dnsInstructions: buildDnsInstructions(d),
          latestHealthCheck: healthChecks.find((c) => c.domainId === d.id) || null,
        })),
        notifications: notifs,
        events,
        healthChecks,
        previewUrl: `/site/${check.tenant.slug}`,
        dnsTarget: getHostingDnsTarget(),
        planDomainLimit: getPlanDomainLimit(check.tenant.planTier),
        cloudflareSaas: getCloudflareSaasStatus(),
        channelStatus: getChannelIntegrationStatus(),
        registrarConfigured: Boolean((process.env.DOMAIN_REGISTRAR_API_KEY || '').trim()),
      });
    } catch (error) {
      console.error('GET tenant domains failed:', error);
      res.status(500).json({ error: 'Failed to load tenant domains.' });
    }
  });

  // OPTION A: Connect Existing Domain (with Duplicate Prevention, Takeover Protection & Plan Limit)
  router.post('/api/owner/tenants/:tenantId/domains', requireAuth, domainRateLimit, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const check = await assertTenantDomainAccess(req, tenantId);
      if (!check.ok) return res.status(check.status).json({ error: check.error });

      const schema = z.object({
        domainName: z.string().min(4).max(253),
        registrarName: z.string().trim().min(2).max(100).optional().default('External Registrar (Customer Owned)'),
        domainType: z.enum(['root', 'subdomain']).optional(),
        isPrimary: z.boolean().optional().default(true),
        wwwPreference: z.enum(['redirect_to_root', 'redirect_to_www', 'both']).optional().default('redirect_to_root'),
        expiryDate: z.string().max(20).optional().default(''),
        renewalDate: z.string().max(20).optional().default(''),
        renewalReminderDate: z.string().max(20).optional().default(''),
        ownershipConfirmed: z.boolean().optional().default(true),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid domain configuration.' });
      }

      const hostCheck = normalizeAndValidateHostname(parsed.data.domainName);
      if (!hostCheck.valid) {
        return res.status(400).json({ error: hostCheck.error });
      }

      // 1. GLOBAL DUPLICATE & TAKEOVER PREVENTION across ALL tenants
      const [duplicate] = await db
        .select()
        .from(tenantDomains)
        .where(
          or(
            eq(tenantDomains.domainName, hostCheck.normalized),
            eq(tenantDomains.domainName, `www.${hostCheck.normalized}`)
          )
        )
        .limit(1);

      if (duplicate) {
        const sameTenant = duplicate.tenantId === tenantId;
        await db.insert(auditLogs).values({
          actorEmail: req.dbUser!.email,
          actorRole: req.dbUser!.role,
          tenantId,
          action: 'DOMAIN_DUPLICATE_BLOCKED',
          details: `Blocked duplicate/takeover attempt for ${hostCheck.normalized} (already assigned to tenant #${duplicate.tenantId})`,
        });
        return res.status(409).json({
          error: sameTenant
            ? `Domain "${hostCheck.normalized}" is already connected to this business account.`
            : `Domain "${hostCheck.normalized}" is already assigned to another business account. Duplicate assignment is blocked to prevent domain takeover.`,
        });
      }

      // 2. PACKAGE DOMAIN LIMIT CHECK
      const existingTenantDomains = await db
        .select()
        .from(tenantDomains)
        .where(eq(tenantDomains.tenantId, tenantId));

      const domainLimit = getPlanDomainLimit(check.tenant.planTier);
      if (existingTenantDomains.length >= domainLimit && req.dbUser!.role !== 'super_admin') {
        return res.status(403).json({
          error: `Your current plan (${check.tenant.planTier}) allows up to ${domainLimit} custom domain(s). Upgrade your plan or remove an unused domain first.`,
        });
      }

      const finalType = parsed.data.domainType || hostCheck.domainType;
      const shouldBePrimary = existingTenantDomains.length === 0 || parsed.data.isPrimary;
      if (shouldBePrimary && existingTenantDomains.length > 0) {
        await db
          .update(tenantDomains)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(eq(tenantDomains.tenantId, tenantId));
      }

      const token = `vv-verify-${crypto.randomBytes(10).toString('hex')}`;
      const renewalDate = parsed.data.renewalDate || parsed.data.expiryDate || '';

      const [created] = await db
        .insert(tenantDomains)
        .values({
          tenantId,
          domainName: hostCheck.normalized,
          extension: hostCheck.extension,
          domainType: finalType,
          isPrimary: shouldBePrimary,
          wwwPreference: finalType === 'subdomain' ? 'both' : parsed.data.wwwPreference,
          wwwStatus: finalType === 'subdomain' ? 'not_applicable' : 'pending',
          ownershipMode: 'customer_external',
          registrarName: parsed.data.registrarName,
          verificationToken: token,
          connectionStatus: 'dns_pending',
          workflowStep: 4,
          approvalStatus: 'auto',
          dnsStatus: 'pending',
          sslStatus: 'pending',
          expiryDate: parsed.data.expiryDate,
          renewalDate,
          renewalReminderDate: parsed.data.renewalReminderDate || parsed.data.expiryDate,
          renewalStatus: 'active',
          renewalPaymentStatus: 'not_due',
        })
        .returning();

      if (shouldBePrimary) {
        await db.update(tenants).set({ customDomain: hostCheck.normalized }).where(eq(tenants.id, tenantId));
      }

      await recordDomainEvent({
        domainId: created.id,
        tenantId,
        actorEmail: req.dbUser!.email,
        actorRole: req.dbUser!.role,
        eventType: 'domain_added',
        severity: 'info',
        title: `Domain ${created.domainName} added — DNS configuration required`,
        details: `Registrar: ${created.registrarName}, Type: ${created.domainType}, WWW: ${created.wwwPreference}`,
      });

      await createDomainNotification({
        domainId: created.id,
        tenantId,
        userId: check.tenant.ownerUserId,
        notificationType: 'dns_config_required',
        title: `DNS Configuration Required for ${created.domainName}`,
        message: `Add TXT record "${created.verificationToken}" and routing CNAME -> ${getHostingDnsTarget()} in your ${created.registrarName} DNS settings, then click Verify Live DNS.`,
      });

      await db.insert(auditLogs).values({
        actorEmail: req.dbUser!.email,
        actorRole: req.dbUser!.role,
        tenantId,
        action: 'DOMAIN_ADDED',
        details: `Added custom domain ${created.domainName} (${created.domainType}, primary=${created.isPrimary})`,
      });

      if (created.expiryDate) {
        await evaluateDomainRenewalReminders(tenantId);
      }

      res.status(201).json({
        domain: {
          ...created,
          dnsInstructions: buildDnsInstructions(created),
        },
      });
    } catch (error) {
      console.error('POST tenant domain failed:', error);
      res.status(500).json({ error: 'Failed to add custom domain.' });
    }
  });

  // Update Primary Domain, WWW Preference, Registrar, or Expiry Dates
  router.patch('/api/owner/tenants/:tenantId/domains/:domainId', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const domainId = Number(req.params.domainId);
      const check = await assertTenantDomainAccess(req, tenantId);
      if (!check.ok) return res.status(check.status).json({ error: check.error });

      const [existing] = await db
        .select()
        .from(tenantDomains)
        .where(and(eq(tenantDomains.id, domainId), eq(tenantDomains.tenantId, tenantId)))
        .limit(1);
      if (!existing) return res.status(404).json({ error: 'Domain not found for this business.' });

      const parsed = z
        .object({
          isPrimary: z.boolean().optional(),
          wwwPreference: z.enum(['redirect_to_root', 'redirect_to_www', 'both']).optional(),
          registrarName: z.string().trim().min(2).max(100).optional(),
          expiryDate: z.string().max(20).optional(),
          renewalDate: z.string().max(20).optional(),
          renewalReminderDate: z.string().max(20).optional(),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid domain update payload.' });
      }

      if (parsed.data.isPrimary === true) {
        await db
          .update(tenantDomains)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(eq(tenantDomains.tenantId, tenantId));
      }

      const [updated] = await db
        .update(tenantDomains)
        .set({
          ...parsed.data,
          updatedAt: new Date(),
        })
        .where(and(eq(tenantDomains.id, domainId), eq(tenantDomains.tenantId, tenantId)))
        .returning();

      if (updated.isPrimary) {
        await db.update(tenants).set({ customDomain: updated.domainName }).where(eq(tenants.id, tenantId));
      }

      await recordDomainEvent({
        domainId: updated.id,
        tenantId,
        actorEmail: req.dbUser!.email,
        actorRole: req.dbUser!.role,
        eventType: 'primary_changed',
        severity: 'info',
        title: `Updated settings for ${updated.domainName}`,
        details: `Primary: ${updated.isPrimary}, WWW: ${updated.wwwPreference}, Expiry: ${updated.expiryDate || 'Not set'}`,
      });

      if (parsed.data.expiryDate) {
        await evaluateDomainRenewalReminders(tenantId);
      }

      res.json({
        domain: {
          ...updated,
          dnsInstructions: buildDnsInstructions(updated),
        },
      });
    } catch (error) {
      console.error('PATCH tenant domain failed:', error);
      res.status(500).json({ error: 'Failed to update domain settings.' });
    }
  });

  // Live DNS Ownership + Routing + TLS/SSL Verification
  router.post(
    '/api/owner/tenants/:tenantId/domains/:domainId/verify',
    requireAuth,
    domainRateLimit,
    async (req: AuthRequest, res: Response) => {
      try {
        const tenantId = Number(req.params.tenantId);
        const domainId = Number(req.params.domainId);
        const check = await assertTenantDomainAccess(req, tenantId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        const [domainRow] = await db
          .select()
          .from(tenantDomains)
          .where(and(eq(tenantDomains.id, domainId), eq(tenantDomains.tenantId, tenantId)))
          .limit(1);
        if (!domainRow) return res.status(404).json({ error: 'Domain record not found.' });

        const result = await runLiveDnsAndHealthInspection(domainRow, true);
        const now = new Date();

        const [updated] = await db
          .update(tenantDomains)
          .set({
            dnsStatus: result.dnsStatus,
            sslStatus: result.sslStatus,
            wwwStatus: result.wwwStatus,
            connectionStatus: result.connectionStatus,
            workflowStep: result.workflowStep,
            sslIssuer: result.sslIssuer,
            sslExpiresAt: result.sslValidTo,
            dnsErrorDetail: result.errorSummary,
            lastHealthStatus: result.lastHealthStatus,
            ownershipVerifiedAt: result.ownershipVerified ? domainRow.ownershipVerifiedAt || now : null,
            sslCheckedAt: now,
            lastHealthCheckAt: now,
            lastCheckedAt: now,
            updatedAt: now,
          })
          .where(eq(tenantDomains.id, domainId))
          .returning();

        const [healthSnapshot] = await db
          .insert(domainHealthChecks)
          .values({
            domainId,
            tenantId,
            dnsHealthy: result.dnsHealthy,
            sslHealthy: result.sslHealthy,
            httpsAvailable: result.httpsAvailable,
            httpStatusCode: result.httpStatusCode,
            wwwRedirectHealthy: result.wwwRedirectHealthy,
            responseTimeMs: result.responseTimeMs,
            resolvedIpsJson: JSON.stringify(result.aRecords),
            resolvedCnamesJson: JSON.stringify(result.cnameRecords),
            sslIssuer: result.sslIssuer,
            sslValidTo: result.sslValidTo,
            errorSummary: result.errorSummary,
          })
          .returning();

        await recordDomainEvent({
          domainId,
          tenantId,
          actorEmail: req.dbUser!.email,
          actorRole: req.dbUser!.role,
          eventType: result.connectionStatus === 'live' ? 'ownership_verified' : 'dns_check',
          severity: result.connectionStatus === 'live' ? 'success' : result.ownershipVerified ? 'warning' : 'error',
          title:
            result.connectionStatus === 'live'
              ? `${domainRow.domainName} verified LIVE (DNS + SSL + HTTPS)`
              : `DNS & SSL verification checked for ${domainRow.domainName} (Stage ${result.workflowStep}/12)`,
          details: result.errorSummary || 'All DNS, SSL/TLS, and HTTPS checks passed.',
          metadata: {
            ownershipVerified: result.ownershipVerified,
            routingConfigured: result.routingConfigured,
            sslHealthy: result.sslHealthy,
            httpStatusCode: result.httpStatusCode,
          },
        });

        // Dispatch honest customer notifications matching real verification result
        if (result.connectionStatus === 'live') {
          await createDomainNotification({
            domainId,
            tenantId,
            userId: check.tenant.ownerUserId,
            notificationType: 'domain_published',
            title: `Website Domain Live: ${domainRow.domainName}`,
            message: `${domainRow.domainName} passed DNS ownership, routing, SSL/TLS (${result.sslIssuer || 'Trusted CA'}), and HTTPS health checks.`,
          });
        } else if (result.ownershipVerified && result.routingConfigured && !result.sslHealthy) {
          await createDomainNotification({
            domainId,
            tenantId,
            userId: check.tenant.ownerUserId,
            notificationType: 'ssl_pending',
            title: `SSL Certificate Pending for ${domainRow.domainName}`,
            message: `Ownership and DNS routing verified. Waiting for SSL/TLS certificate provisioning at hosting edge (Cloudflare Pages / Cloudflare for SaaS).`,
          });
        } else {
          await createDomainNotification({
            domainId,
            tenantId,
            userId: check.tenant.ownerUserId,
            notificationType: 'dns_verification_failed',
            title: `DNS Verification Incomplete: ${domainRow.domainName}`,
            message: result.errorSummary || 'Required DNS TXT or CNAME records were not detected yet.',
          });
        }

        res.json({
          domain: {
            ...updated,
            dnsInstructions: buildDnsInstructions(updated),
            latestHealthCheck: healthSnapshot,
          },
          liveLookup: {
            ownershipVerified: result.ownershipVerified,
            routingConfigured: result.routingConfigured,
            cnameRecords: result.cnameRecords,
            txtRecords: result.txtRecords,
            aRecords: result.aRecords,
            wwwCnameRecords: result.wwwCnameRecords,
            sslHealthy: result.sslHealthy,
            sslIssuer: result.sslIssuer,
            sslValidTo: result.sslValidTo,
            httpsAvailable: result.httpsAvailable,
            httpStatusCode: result.httpStatusCode,
            wwwRedirectHealthy: result.wwwRedirectHealthy,
            responseTimeMs: result.responseTimeMs,
          },
        });
      } catch (error) {
        console.error('POST verify domain failed:', error);
        res.status(500).json({ error: 'Live DNS & SSL verification failed.' });
      }
    }
  );

  // Dedicated Live Domain Health Check Endpoint
  router.post(
    '/api/owner/tenants/:tenantId/domains/:domainId/health-check',
    requireAuth,
    domainRateLimit,
    async (req: AuthRequest, res: Response) => {
      try {
        const tenantId = Number(req.params.tenantId);
        const domainId = Number(req.params.domainId);
        const check = await assertTenantDomainAccess(req, tenantId);
        if (!check.ok) return res.status(check.status).json({ error: check.error });

        const [domainRow] = await db
          .select()
          .from(tenantDomains)
          .where(and(eq(tenantDomains.id, domainId), eq(tenantDomains.tenantId, tenantId)))
          .limit(1);
        if (!domainRow) return res.status(404).json({ error: 'Domain not found.' });

        const result = await runLiveDnsAndHealthInspection(domainRow, true);
        const now = new Date();

        const [healthSnapshot] = await db
          .insert(domainHealthChecks)
          .values({
            domainId,
            tenantId,
            dnsHealthy: result.dnsHealthy,
            sslHealthy: result.sslHealthy,
            httpsAvailable: result.httpsAvailable,
            httpStatusCode: result.httpStatusCode,
            wwwRedirectHealthy: result.wwwRedirectHealthy,
            responseTimeMs: result.responseTimeMs,
            resolvedIpsJson: JSON.stringify(result.aRecords),
            resolvedCnamesJson: JSON.stringify(result.cnameRecords),
            sslIssuer: result.sslIssuer,
            sslValidTo: result.sslValidTo,
            errorSummary: result.errorSummary,
          })
          .returning();

        const [updated] = await db
          .update(tenantDomains)
          .set({
            lastHealthStatus: result.lastHealthStatus,
            lastHealthCheckAt: now,
            sslStatus: result.sslStatus,
            sslIssuer: result.sslIssuer,
            sslExpiresAt: result.sslValidTo,
            sslCheckedAt: now,
            wwwStatus: result.wwwStatus,
            dnsErrorDetail: result.errorSummary,
            updatedAt: now,
          })
          .where(eq(tenantDomains.id, domainId))
          .returning();

        await recordDomainEvent({
          domainId,
          tenantId,
          actorEmail: req.dbUser!.email,
          actorRole: req.dbUser!.role,
          eventType: 'health_check',
          severity: result.lastHealthStatus === 'healthy' ? 'success' : 'warning',
          title: `Health Check: ${domainRow.domainName} is ${result.lastHealthStatus.toUpperCase()}`,
          details:
            result.errorSummary ||
            `DNS OK, SSL OK (${result.sslIssuer}), HTTP ${result.httpStatusCode} (${result.responseTimeMs}ms)`,
        });

        if (result.lastHealthStatus === 'down' && domainRow.connectionStatus === 'live') {
          await createDomainNotification({
            domainId,
            tenantId,
            userId: check.tenant.ownerUserId,
            notificationType: 'domain_connection_problem',
            title: `Domain Alert: ${domainRow.domainName} is Unreachable`,
            message: `Live health check detected a problem: ${result.errorSummary}`,
          });
        }

        res.json({ domain: updated, healthCheck: healthSnapshot });
      } catch (error) {
        console.error('POST domain health-check failed:', error);
        res.status(500).json({ error: 'Domain health check failed.' });
      }
    }
  );

  router.delete('/api/owner/tenants/:tenantId/domains/:domainId', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const domainId = Number(req.params.domainId);
      const check = await assertTenantDomainAccess(req, tenantId);
      if (!check.ok) return res.status(check.status).json({ error: check.error });

      const [existing] = await db
        .select()
        .from(tenantDomains)
        .where(and(eq(tenantDomains.id, domainId), eq(tenantDomains.tenantId, tenantId)))
        .limit(1);
      if (!existing) return res.status(404).json({ error: 'Domain not found.' });

      await db
        .delete(tenantDomains)
        .where(and(eq(tenantDomains.id, domainId), eq(tenantDomains.tenantId, tenantId)));

      // Promote next domain or clear tenant.customDomain if primary removed
      if (existing.isPrimary) {
        const [replacement] = await db
          .select()
          .from(tenantDomains)
          .where(eq(tenantDomains.tenantId, tenantId))
          .orderBy(desc(tenantDomains.createdAt))
          .limit(1);
        if (replacement) {
          await db.update(tenantDomains).set({ isPrimary: true }).where(eq(tenantDomains.id, replacement.id));
          await db.update(tenants).set({ customDomain: replacement.domainName }).where(eq(tenants.id, tenantId));
        } else {
          await db.update(tenants).set({ customDomain: '' }).where(eq(tenants.id, tenantId));
        }
      }

      await db.insert(auditLogs).values({
        actorEmail: req.dbUser!.email,
        actorRole: req.dbUser!.role,
        tenantId,
        action: 'DOMAIN_DELETED',
        details: `Removed custom domain ${existing.domainName}`,
      });

      res.json({ deleted: true, domainName: existing.domainName });
    } catch (error) {
      console.error('DELETE tenant domain failed:', error);
      res.status(500).json({ error: 'Failed to delete domain.' });
    }
  });

  router.patch('/api/domains/notifications/:id/read', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const notifId = Number(req.params.id);
      const [notif] = await db
        .select()
        .from(domainNotifications)
        .where(eq(domainNotifications.id, notifId))
        .limit(1);
      if (!notif) return res.status(404).json({ error: 'Notification not found.' });

      const access = await assertTenantDomainAccess(req, notif.tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const [updated] = await db
        .update(domainNotifications)
        .set({ isRead: true })
        .where(eq(domainNotifications.id, notifId))
        .returning();

      res.json({ notification: updated });
    } catch (error) {
      console.error('PATCH domain notification failed:', error);
      res.status(500).json({ error: 'Unable to mark notification read.' });
    }
  });

  // =========================================================================
  // 4. SUPER ADMIN DOMAIN MANAGEMENT CONSOLE
  // =========================================================================
  router.get('/api/admin/domains', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!assertSuperAdmin(req, res)) return;
      await ensureDomainPricingSeeded();

      const q = String(req.query.q || '').trim().toLowerCase();
      const statusFilter = String(req.query.status || 'all').trim();

      const [allDomains, allTenants, allUsers, allChecks, allEvents, pricing] = await Promise.all([
        db.select().from(tenantDomains).orderBy(desc(tenantDomains.createdAt)),
        db.select().from(tenants),
        db.select().from(users),
        db.select().from(domainHealthChecks).orderBy(desc(domainHealthChecks.checkedAt)).limit(200),
        db.select().from(domainEvents).orderBy(desc(domainEvents.createdAt)).limit(200),
        db.select().from(domainPricingConfig).orderBy(asc(domainPricingConfig.id)),
      ]);

      const tenantMap = new Map(allTenants.map((t) => [t.id, t]));
      const userMap = new Map(allUsers.map((u) => [u.id, u]));

      let enriched = allDomains.map((d) => {
        const tenant = tenantMap.get(d.tenantId);
        const owner = tenant?.ownerUserId ? userMap.get(tenant.ownerUserId) : undefined;
        const latestHealthCheck = allChecks.find((c) => c.domainId === d.id) || null;
        const recentErrors = allEvents
          .filter((e) => e.domainId === d.id && (e.severity === 'error' || e.eventType === 'error'))
          .slice(0, 5);

        return {
          ...d,
          tenantName: tenant?.name || `Tenant #${d.tenantId}`,
          tenantSlug: tenant?.slug || '',
          ownerName: owner?.name || 'Business Owner',
          ownerEmail: owner?.email || '',
          latestHealthCheck,
          recentErrors,
        };
      });

      if (q) {
        enriched = enriched.filter(
          (d) =>
            d.domainName.toLowerCase().includes(q) ||
            d.tenantName.toLowerCase().includes(q) ||
            d.ownerEmail.toLowerCase().includes(q) ||
            d.registrarName.toLowerCase().includes(q)
        );
      }

      if (statusFilter !== 'all') {
        enriched = enriched.filter((d) => d.connectionStatus === statusFilter || d.renewalStatus === statusFilter);
      }

      res.json({
        domains: enriched,
        pricing,
        summary: {
          total: allDomains.length,
          live: allDomains.filter((d) => d.connectionStatus === 'live').length,
          pendingDns: allDomains.filter((d) => d.dnsStatus !== 'verified').length,
          sslActive: allDomains.filter((d) => d.sslStatus === 'active').length,
          expiringSoon: allDomains.filter((d) => ['expiring_soon', 'renewal_due', 'expired'].includes(d.renewalStatus)).length,
          suspended: allDomains.filter((d) => d.connectionStatus === 'suspended').length,
        },
        cloudflareSaas: getCloudflareSaasStatus(),
        channelStatus: getChannelIntegrationStatus(),
        ownershipGuardrail:
          'Super Admin Governance Rule: Super Admin can support, approve, verify, remind, suspend, or disconnect domains with full audit history, but can NEVER transfer customer domain ownership to Vijay Visuals.',
      });
    } catch (error) {
      console.error('GET /api/admin/domains failed:', error);
      res.status(500).json({ error: 'Unable to load Super Admin domain management.' });
    }
  });

  router.get('/api/admin/domains/:domainId/activity', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!assertSuperAdmin(req, res)) return;
      const domainId = Number(req.params.domainId);
      const [events, healthChecks, notifications] = await Promise.all([
        db.select().from(domainEvents).where(eq(domainEvents.domainId, domainId)).orderBy(desc(domainEvents.createdAt)).limit(60),
        db.select().from(domainHealthChecks).where(eq(domainHealthChecks.domainId, domainId)).orderBy(desc(domainHealthChecks.checkedAt)).limit(25),
        db.select().from(domainNotifications).where(eq(domainNotifications.domainId, domainId)).orderBy(desc(domainNotifications.createdAt)).limit(40),
      ]);
      res.json({ events, healthChecks, notifications });
    } catch (error) {
      console.error('GET admin domain activity failed:', error);
      res.status(500).json({ error: 'Failed to load domain activity logs.' });
    }
  });

  router.patch('/api/admin/domains/:domainId/action', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!assertSuperAdmin(req, res)) return;
      const domainId = Number(req.params.domainId);

      const [existing] = await db.select().from(tenantDomains).where(eq(tenantDomains.id, domainId)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Domain not found.' });

      const schema = z.object({
        action: z.enum([
          'approve_manual',
          'reject_manual',
          'suspend',
          'disconnect',
          'reactivate',
          'assign_staff',
          'send_renewal_reminder',
          'send_dns_instructions',
          'confirm_registrar_renewal',
        ]),
        reason: z.string().trim().max(300).optional().default(''),
        staffEmail: z.string().trim().max(120).optional().default(''),
        newExpiryDate: z.string().trim().max(20).optional().default(''),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid Super Admin domain action.' });
      }

      const { action, reason, staffEmail, newExpiryDate } = parsed.data;
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, existing.tenantId)).limit(1);
      const actorEmail = req.dbUser!.email;
      let patch: Partial<typeof tenantDomains.$inferInsert> = { updatedAt: new Date() };
      let eventTitle = '';
      let eventDetails = reason || '';
      let severity: 'info' | 'success' | 'warning' | 'error' = 'info';

      if (action === 'approve_manual') {
        patch.approvalStatus = 'approved';
        if (existing.dnsStatus === 'verified' && existing.sslStatus === 'active') {
          patch.connectionStatus = 'live';
          patch.workflowStep = 12;
        }
        eventTitle = `Super Admin approved connection request for ${existing.domainName}`;
        severity = 'success';
      } else if (action === 'reject_manual') {
        if (!reason) return res.status(400).json({ error: 'A clear reason is required when rejecting a domain request.' });
        patch.approvalStatus = 'rejected';
        patch.connectionStatus = 'error';
        patch.dnsErrorDetail = `Rejected by Super Admin: ${reason}`;
        eventTitle = `Manual domain request rejected for ${existing.domainName}`;
        severity = 'error';
        await createDomainNotification({
          domainId,
          tenantId: existing.tenantId,
          userId: tenant?.ownerUserId,
          notificationType: 'domain_connection_problem',
          title: `Domain Request Needs Attention: ${existing.domainName}`,
          message: `Super Admin note: ${reason}`,
        });
      } else if (action === 'suspend') {
        if (!reason) return res.status(400).json({ error: 'A documented authorization reason is required to suspend a domain.' });
        patch.connectionStatus = 'suspended';
        patch.suspendedReason = reason;
        eventTitle = `Domain ${existing.domainName} suspended by Super Admin`;
        severity = 'error';
        await createDomainNotification({
          domainId,
          tenantId: existing.tenantId,
          userId: tenant?.ownerUserId,
          notificationType: 'domain_connection_problem',
          title: `Domain Suspended: ${existing.domainName}`,
          message: `Your custom domain routing was suspended by Vijay Visuals Support. Reason: ${reason}`,
        });
      } else if (action === 'disconnect') {
        if (!reason) return res.status(400).json({ error: 'A documented reason is required to disconnect a domain.' });
        patch.connectionStatus = 'disconnected';
        patch.isPrimary = false;
        patch.suspendedReason = reason;
        eventTitle = `Domain ${existing.domainName} disconnected`;
        severity = 'warning';
      } else if (action === 'reactivate') {
        patch.connectionStatus = existing.dnsStatus === 'verified' && existing.sslStatus === 'active' ? 'live' : 'dns_pending';
        patch.suspendedReason = '';
        eventTitle = `Domain ${existing.domainName} reactivated`;
        severity = 'success';
      } else if (action === 'assign_staff') {
        patch.assignedSupportStaff = staffEmail;
        eventTitle = `Assigned support staff ${staffEmail || 'Unassigned'} to ${existing.domainName}`;
      } else if (action === 'send_renewal_reminder') {
        eventTitle = `Super Admin sent renewal reminder for ${existing.domainName}`;
        severity = 'warning';
        await createDomainNotification({
          domainId,
          tenantId: existing.tenantId,
          userId: tenant?.ownerUserId,
          notificationType: 'expiry_approaching',
          title: `Domain Renewal Reminder: ${existing.domainName}`,
          message: `Expiry date: ${existing.expiryDate || 'Please update in dashboard'}. Renew directly at ${existing.registrarName} to avoid interruption. ${reason ? `Note: ${reason}` : ''}`,
        });
      } else if (action === 'send_dns_instructions') {
        const instr = buildDnsInstructions(existing);
        eventTitle = `Sent customer-specific DNS instructions for ${existing.domainName}`;
        await createDomainNotification({
          domainId,
          tenantId: existing.tenantId,
          userId: tenant?.ownerUserId,
          notificationType: 'dns_config_required',
          title: `DNS Setup Instructions for ${existing.domainName}`,
          message: `TXT (_vijayvisuals-verify.${existing.domainName}): ${existing.verificationToken} | CNAME target: ${instr.hostingTarget}. ${reason ? `Support note: ${reason}` : ''}`,
        });
      } else if (action === 'confirm_registrar_renewal') {
        if (!newExpiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(newExpiryDate)) {
          return res.status(400).json({ error: 'Provide the registrar-confirmed new expiry date (YYYY-MM-DD).' });
        }
        patch.expiryDate = newExpiryDate;
        patch.renewalDate = newExpiryDate;
        patch.renewalStatus = 'renewed_confirmed';
        patch.renewalPaymentStatus = 'paid_external_registrar';
        eventTitle = `Registrar-confirmed renewal recorded for ${existing.domainName} (New expiry: ${newExpiryDate})`;
        severity = 'success';
      }

      const [updated] = await db.update(tenantDomains).set(patch).where(eq(tenantDomains.id, domainId)).returning();

      await recordDomainEvent({
        domainId,
        tenantId: existing.tenantId,
        actorEmail,
        actorRole: 'super_admin',
        eventType: 'admin_action',
        severity,
        title: eventTitle,
        details: eventDetails,
        metadata: { action, staffEmail, newExpiryDate },
      });

      await db.insert(auditLogs).values({
        actorEmail,
        actorRole: 'super_admin',
        tenantId: existing.tenantId,
        action: `ADMIN_DOMAIN_${action.toUpperCase()}`,
        details: `${existing.domainName}: ${eventTitle} ${eventDetails}`.trim(),
      });

      res.json({ domain: updated });
    } catch (error) {
      console.error('PATCH admin domain action failed:', error);
      res.status(500).json({ error: 'Unable to execute Super Admin domain action.' });
    }
  });

  router.post('/api/admin/domains/run-renewal-scan', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!assertSuperAdmin(req, res)) return;
      const summary = await evaluateDomainRenewalReminders();
      res.json({ ok: true, ...summary, channels: getChannelIntegrationStatus() });
    } catch (error) {
      console.error('POST run-renewal-scan failed:', error);
      res.status(500).json({ error: 'Renewal reminder scan failed.' });
    }
  });

  router.get('/api/admin/domains/export', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!assertSuperAdmin(req, res)) return;
      const format = String(req.query.format || 'csv').toLowerCase();
      const [allDomains, allTenants] = await Promise.all([
        db.select().from(tenantDomains).orderBy(desc(tenantDomains.createdAt)),
        db.select().from(tenants),
      ]);
      const tenantMap = new Map(allTenants.map((t) => [t.id, t]));

      if (format === 'json') {
        res.setHeader('Content-Disposition', 'attachment; filename="vijay-visuals-domains.json"');
        return res.json({ exportedAt: new Date().toISOString(), domains: allDomains });
      }

      const headers = [
        'ID',
        'Domain',
        'Tenant',
        'Type',
        'Primary',
        'ConnectionStatus',
        'WorkflowStep',
        'DNSStatus',
        'SSLStatus',
        'WWWPreference',
        'WWWStatus',
        'Registrar',
        'ExpiryDate',
        'RenewalStatus',
        'HealthStatus',
        'AssignedStaff',
      ];
      const csvRows = [
        headers.join(','),
        ...allDomains.map((d) =>
          [
            d.id,
            d.domainName,
            `"${(tenantMap.get(d.tenantId)?.name || '').replace(/"/g, '""')}"`,
            d.domainType,
            d.isPrimary,
            d.connectionStatus,
            d.workflowStep,
            d.dnsStatus,
            d.sslStatus,
            d.wwwPreference,
            d.wwwStatus,
            `"${d.registrarName.replace(/"/g, '""')}"`,
            d.expiryDate,
            d.renewalStatus,
            d.lastHealthStatus,
            `"${d.assignedSupportStaff.replace(/"/g, '""')}"`,
          ].join(',')
        ),
      ];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="vijay-visuals-domains.csv"');
      res.send(csvRows.join('\n'));
    } catch (error) {
      console.error('GET admin domains export failed:', error);
      res.status(500).json({ error: 'Domain export failed.' });
    }
  });

  // Super Admin Configurable Domain & Package Pricing Matrix
  router.put('/api/admin/domains/pricing/:extension', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!assertSuperAdmin(req, res)) return;
      await ensureDomainPricingSeeded();
      const rawExt = String(req.params.extension || '').trim().toLowerCase();
      const extension = rawExt.startsWith('.') ? rawExt : `.${rawExt}`;

      const schema = z.object({
        registrationFeeInr: z.number().int().min(0).max(500000),
        renewalFeeInr: z.number().int().min(0).max(500000),
        transferFeeInr: z.number().int().min(0).max(500000),
        managementServiceFeeInr: z.number().int().min(0).max(500000),
        hostingFeeInr: z.number().int().min(0).max(500000),
        sslFeeInr: z.number().int().min(0).max(500000),
        websiteDevFeeInr: z.number().int().min(0).max(1000000),
        gstPct: z.number().int().min(0).max(28).default(18),
        isPromotional: z.boolean().default(false),
        promoNote: z.string().max(240).optional().default(''),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid pricing figures.' });
      }

      const [existing] = await db
        .select()
        .from(domainPricingConfig)
        .where(eq(domainPricingConfig.extension, extension))
        .limit(1);

      let saved;
      if (existing) {
        [saved] = await db
          .update(domainPricingConfig)
          .set({ ...parsed.data, updatedBy: req.dbUser!.email, updatedAt: new Date() })
          .where(eq(domainPricingConfig.extension, extension))
          .returning();
      } else {
        [saved] = await db
          .insert(domainPricingConfig)
          .values({ extension, ...parsed.data, updatedBy: req.dbUser!.email })
          .returning();
      }

      await db.insert(auditLogs).values({
        actorEmail: req.dbUser!.email,
        actorRole: 'super_admin',
        action: 'DOMAIN_PRICING_UPDATED',
        details: `Updated pricing for ${extension}: Reg ₹${saved.registrationFeeInr}, Renewal ₹${saved.renewalFeeInr}, Hosting ₹${saved.hostingFeeInr}`,
      });

      res.json({ pricing: saved });
    } catch (error) {
      console.error('PUT admin domain pricing failed:', error);
      res.status(500).json({ error: 'Unable to save domain pricing.' });
    }
  });

  return router;
}
