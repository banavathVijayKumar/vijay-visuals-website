// ============================================================================
// GET & POST /api/platform/global
// Global Expansion Configuration:
// - Supported Countries (India primary + USA, UK, UAE, EU, Singapore, Australia, Canada)
// - Live Multi-Currency Exchange Rates (INR base -> USD, GBP, EUR, AED) via open.er-api.com
//   with D1 6-hour caching (NEVER fabricates rates if upstream fails!)
// - Per-Tenant Global Settings (currency, 12 languages, timezone, address format,
//   country tax disclosure, regional shipping, Google Search Console & GBP metadata)
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../_auth';
import { PagesContext, errorJson, json, parseJsonBody, sanitizeText } from '../_shared';

export const SUPPORTED_COUNTRIES = [
  {
    code: 'IN',
    name: 'India',
    currency: 'INR',
    symbol: '₹',
    timezone: 'Asia/Kolkata',
    addressFormat: 'IN_PINCODE',
    postalLabel: 'PIN Code (6 digits)',
    postalRegex: '^[1-9][0-9]{5}$',
    taxLabel: 'GST',
    defaultTaxPercent: 18,
    supportedPaymentProviders: ['Cashfree (UPI, Cards, NetBanking)', 'Cash on Delivery (COD)'],
    taxDisclosure: 'Operational GST calculation helper; statutory GSTR filing remains with your CA.',
  },
  {
    code: 'US',
    name: 'United States',
    currency: 'USD',
    symbol: '$',
    timezone: 'America/New_York',
    addressFormat: 'US_ZIP',
    postalLabel: 'ZIP Code (5 digits)',
    postalRegex: '^[0-9]{5}(-[0-9]{4})?$',
    taxLabel: 'Sales Tax',
    defaultTaxPercent: 0,
    supportedPaymentProviders: ['International Cards via Cashfree (subject to approval)', 'Manual Invoice'],
    taxDisclosure: 'US state/county sales tax requires configuring an external tax provider before automated charging.',
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    currency: 'GBP',
    symbol: '£',
    timezone: 'Europe/London',
    addressFormat: 'UK_POSTCODE',
    postalLabel: 'Postcode',
    postalRegex: '^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$',
    taxLabel: 'VAT',
    defaultTaxPercent: 20,
    supportedPaymentProviders: ['International Cards via approved gateway', 'Manual Invoice'],
    taxDisclosure: 'UK VAT charging applies only if your business is VAT-registered and verified.',
  },
  {
    code: 'EU',
    name: 'European Union',
    currency: 'EUR',
    symbol: '€',
    timezone: 'Europe/Berlin',
    addressFormat: 'EU_POSTAL',
    postalLabel: 'Postal Code',
    postalRegex: '^[A-Z0-9 -]{3,10}$',
    taxLabel: 'VAT',
    defaultTaxPercent: 19,
    supportedPaymentProviders: ['International Cards via approved gateway', 'Manual Invoice'],
    taxDisclosure: 'EU VAT/OSS rules vary by member state; verify registration before enabling automated VAT.',
  },
  {
    code: 'AE',
    name: 'United Arab Emirates',
    currency: 'AED',
    symbol: 'AED',
    timezone: 'Asia/Dubai',
    addressFormat: 'AE_EMIRATE',
    postalLabel: 'Emirate / PO Box',
    postalRegex: '^[A-Za-z0-9 -]{2,20}$',
    taxLabel: 'VAT',
    defaultTaxPercent: 5,
    supportedPaymentProviders: ['International Cards via approved gateway', 'Cash on Delivery'],
    taxDisclosure: 'UAE 5% VAT applies to TRN-registered businesses.',
  },
  {
    code: 'SG',
    name: 'Singapore',
    currency: 'USD',
    symbol: '$',
    timezone: 'Asia/Singapore',
    addressFormat: 'SG_POSTAL',
    postalLabel: 'Postal Code (6 digits)',
    postalRegex: '^[0-9]{6}$',
    taxLabel: 'GST',
    defaultTaxPercent: 9,
    supportedPaymentProviders: ['International Cards via approved gateway', 'Manual Invoice'],
    taxDisclosure: 'Singapore GST applies only to GST-registered entities.',
  },
  {
    code: 'AU',
    name: 'Australia',
    currency: 'USD',
    symbol: '$',
    timezone: 'Australia/Sydney',
    addressFormat: 'AU_POSTCODE',
    postalLabel: 'Postcode (4 digits)',
    postalRegex: '^[0-9]{4}$',
    taxLabel: 'GST',
    defaultTaxPercent: 10,
    supportedPaymentProviders: ['International Cards via approved gateway', 'Manual Invoice'],
    taxDisclosure: 'Australian GST applies to ABN/GST-registered sellers.',
  },
  {
    code: 'CA',
    name: 'Canada',
    currency: 'USD',
    symbol: '$',
    timezone: 'America/Toronto',
    addressFormat: 'CA_POSTAL',
    postalLabel: 'Postal Code',
    postalRegex: '^[A-Z][0-9][A-Z] ?[0-9][A-Z][0-9]$',
    taxLabel: 'GST/HST',
    defaultTaxPercent: 5,
    supportedPaymentProviders: ['International Cards via approved gateway', 'Manual Invoice'],
    taxDisclosure: 'Canadian provincial GST/HST/PST rates require provincial registration verification.',
  },
] as const;

const ALLOWED_CURRENCIES = ['INR', 'USD', 'GBP', 'EUR', 'AED'] as const;
const ALLOWED_LANGUAGES = ['en', 'te', 'hi', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa', 'or', 'ur'] as const;

async function fetchOrReadCachedRates(env: PagesContext['env']): Promise<{
  available: boolean;
  base: 'INR';
  rates: Record<string, number> | null;
  providerSource: string;
  fetchedAt: string | null;
  staleCache?: boolean;
  notice?: string;
}> {
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  let cached: { rates_json: string; provider_source: string; fetched_at: string } | null = null;

  if (env.DB) {
    try {
      cached = await env.DB.prepare(
        `SELECT rates_json, provider_source, fetched_at FROM exchange_rates_cache WHERE base_currency = 'INR' LIMIT 1`
      ).first<{ rates_json: string; provider_source: string; fetched_at: string }>();

      if (cached) {
        const ageMs = Date.now() - Date.parse(cached.fetched_at + (cached.fetched_at.endsWith('Z') ? '' : 'Z'));
        if (Number.isFinite(ageMs) && ageMs < SIX_HOURS_MS) {
          return {
            available: true,
            base: 'INR',
            rates: JSON.parse(cached.rates_json) as Record<string, number>,
            providerSource: cached.provider_source,
            fetchedAt: cached.fetched_at,
          };
        }
      }
    } catch {
      // Cache table optional before 0006 migration
    }
  }

  // Fetch real live exchange rates from reliable public open.er-api.com (no API key needed)
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/INR', {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
      if (data.result === 'success' && data.rates) {
        const filtered: Record<string, number> = {
          INR: 1,
          USD: Number(data.rates.USD || 0),
          GBP: Number(data.rates.GBP || 0),
          EUR: Number(data.rates.EUR || 0),
          AED: Number(data.rates.AED || 0),
        };
        if (filtered.USD > 0 && filtered.GBP > 0 && filtered.EUR > 0 && filtered.AED > 0) {
          const nowIso = new Date().toISOString();
          if (env.DB) {
            await env.DB.prepare(
              `INSERT INTO exchange_rates_cache (base_currency, rates_json, provider_source, fetched_at)
               VALUES ('INR', ?, 'open.er-api.com', ?)
               ON CONFLICT(base_currency) DO UPDATE SET
                 rates_json = excluded.rates_json,
                 provider_source = excluded.provider_source,
                 fetched_at = excluded.fetched_at`
            )
              .bind(JSON.stringify(filtered), nowIso)
              .run()
              .catch(() => {});
          }
          return {
            available: true,
            base: 'INR',
            rates: filtered,
            providerSource: 'open.er-api.com',
            fetchedAt: nowIso,
          };
        }
      }
    }
  } catch {
    // Fall back to last real cached rate if present; NEVER fabricate fake rates
  }

  if (cached) {
    return {
      available: true,
      base: 'INR',
      rates: JSON.parse(cached.rates_json) as Record<string, number>,
      providerSource: cached.provider_source,
      fetchedAt: cached.fetched_at,
      staleCache: true,
      notice: 'Using last verified cached exchange rates because live FX feed was temporarily unreachable.',
    };
  }

  return {
    available: false,
    base: 'INR',
    rates: null,
    providerSource: 'unavailable',
    fetchedAt: null,
    notice: 'Live exchange rate feed is currently unreachable. Displaying authoritative INR pricing without fabricated conversion rates.',
  };
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const scope = (url.searchParams.get('scope') || '').toLowerCase();
  const websiteId = sanitizeText(url.searchParams.get('websiteId') || '', 120);

  if (scope === 'countries') {
    return json({
      primaryCurrency: 'INR',
      supportedCurrencies: ALLOWED_CURRENCIES,
      supportedLanguages: ALLOWED_LANGUAGES,
      countries: SUPPORTED_COUNTRIES,
    });
  }

  if (scope === 'rates') {
    const fx = await fetchOrReadCachedRates(env);
    return json(fx, fx.available ? 200 : 503);
  }

  if (!websiteId) {
    return json({
      countries: SUPPORTED_COUNTRIES,
      supportedCurrencies: ALLOWED_CURRENCIES,
      supportedLanguages: ALLOWED_LANGUAGES,
    });
  }

  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const settings = await env.DB.prepare('SELECT * FROM tenant_global_settings WHERE website_id = ? LIMIT 1')
    .bind(websiteId)
    .first();

  return json({
    websiteId,
    settings: settings || {
      website_id: websiteId,
      country_code: 'IN',
      primary_currency: 'INR',
      default_language: 'en',
      enabled_languages_json: '["en","te","hi"]',
      timezone: 'Asia/Kolkata',
      address_format: 'IN_PINCODE',
      tax_label: 'GST',
      tax_rate_percent: 18,
      tax_provider_verified: 0,
    },
    countries: SUPPORTED_COUNTRIES,
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<Record<string, unknown>>(request);
  if (!body || !body.websiteId) return errorJson('websiteId is required.', 400);
  const websiteId = sanitizeText(body.websiteId, 120);

  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  const countryCode = sanitizeText(body.countryCode || 'IN', 4).toUpperCase();
  const countryMeta = SUPPORTED_COUNTRIES.find((c) => c.code === countryCode) || SUPPORTED_COUNTRIES[0];

  const primaryCurrency = ALLOWED_CURRENCIES.includes(String(body.primaryCurrency || countryMeta.currency) as (typeof ALLOWED_CURRENCIES)[number])
    ? String(body.primaryCurrency || countryMeta.currency)
    : countryMeta.currency;

  const defaultLanguage = ALLOWED_LANGUAGES.includes(String(body.defaultLanguage || 'en') as (typeof ALLOWED_LANGUAGES)[number])
    ? String(body.defaultLanguage || 'en')
    : 'en';

  const rawLangs = Array.isArray(body.enabledLanguages) ? body.enabledLanguages : [defaultLanguage, 'en'];
  const enabledLanguages = Array.from(
    new Set(
      rawLangs
        .map((l) => String(l).toLowerCase())
        .filter((l) => ALLOWED_LANGUAGES.includes(l as (typeof ALLOWED_LANGUAGES)[number]))
    )
  );
  if (enabledLanguages.length === 0) enabledLanguages.push('en');

  const timezone = sanitizeText(body.timezone || countryMeta.timezone, 64);
  const taxLabel = sanitizeText(body.taxLabel || countryMeta.taxLabel, 24);
  const taxRatePercent = Math.max(0, Math.min(50, Number(body.taxRatePercent ?? countryMeta.defaultTaxPercent)));
  const taxRegistrationId = sanitizeText(body.taxRegistrationId || '', 40).toUpperCase();

  // SECURITY / HONESTY: Non-India automated tax calculation requires verified tax registration / provider confirmation
  const taxProviderVerified =
    countryCode === 'IN' && taxRegistrationId.length >= 15
      ? 1
      : body.taxProviderVerified === true && taxRegistrationId.length >= 6
        ? 1
        : 0;

  await env.DB.prepare(
    `INSERT INTO tenant_global_settings
      (website_id, owner_id, country_code, primary_currency, default_language, enabled_languages_json,
       timezone, address_format, tax_label, tax_rate_percent, tax_registration_id, tax_provider_verified,
       regional_shipping_json, gsc_site_url, gsc_verification_token, gbp_place_id, gbp_profile_url,
       business_hours_json, seo_meta_by_lang_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(website_id) DO UPDATE SET
       country_code = excluded.country_code,
       primary_currency = excluded.primary_currency,
       default_language = excluded.default_language,
       enabled_languages_json = excluded.enabled_languages_json,
       timezone = excluded.timezone,
       address_format = excluded.address_format,
       tax_label = excluded.tax_label,
       tax_rate_percent = excluded.tax_rate_percent,
       tax_registration_id = excluded.tax_registration_id,
       tax_provider_verified = excluded.tax_provider_verified,
       regional_shipping_json = excluded.regional_shipping_json,
       gsc_site_url = excluded.gsc_site_url,
       gsc_verification_token = excluded.gsc_verification_token,
       gbp_place_id = excluded.gbp_place_id,
       gbp_profile_url = excluded.gbp_profile_url,
       business_hours_json = excluded.business_hours_json,
       seo_meta_by_lang_json = excluded.seo_meta_by_lang_json,
       updated_at = datetime('now')`
  )
    .bind(
      websiteId,
      access.website.owner_id,
      countryMeta.code,
      primaryCurrency,
      defaultLanguage,
      JSON.stringify(enabledLanguages),
      timezone,
      countryMeta.addressFormat,
      taxLabel,
      taxRatePercent,
      taxRegistrationId,
      taxProviderVerified,
      JSON.stringify(Array.isArray(body.regionalShipping) ? body.regionalShipping : []),
      sanitizeText(body.gscSiteUrl || '', 240),
      sanitizeText(body.gscVerificationToken || '', 120),
      sanitizeText(body.gbpPlaceId || '', 120),
      sanitizeText(body.gbpProfileUrl || '', 240),
      JSON.stringify(body.businessHours && typeof body.businessHours === 'object' ? body.businessHours : {}),
      JSON.stringify(body.seoMetaByLang && typeof body.seoMetaByLang === 'object' ? body.seoMetaByLang : {})
    )
    .run();

  const saved = await env.DB.prepare('SELECT * FROM tenant_global_settings WHERE website_id = ? LIMIT 1')
    .bind(websiteId)
    .first();

  return json({
    saved: true,
    settings: saved,
    taxDisclosure: countryMeta.taxDisclosure,
  });
}
