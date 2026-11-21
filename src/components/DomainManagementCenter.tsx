import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Globe,
  History,
  Info,
  Lock,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Star,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { DOMAIN_I18N, DomainLang } from '../lib/domainI18n';
import { TenantRecord } from '../types/platform';

interface DnsRecordInstruction {
  purpose: string;
  type: string;
  host: string;
  altHost: string;
  value: string;
  ttl: string;
  required: boolean;
}

interface HealthCheckRecord {
  id: number;
  domainId: number;
  dnsHealthy: boolean;
  sslHealthy: boolean;
  httpsAvailable: boolean;
  httpStatusCode: number;
  wwwRedirectHealthy: boolean;
  responseTimeMs: number;
  resolvedIpsJson: string;
  resolvedCnamesJson: string;
  sslIssuer: string;
  sslValidTo: string;
  errorSummary: string;
  checkedAt: string;
}

interface ManagedDomainRecord {
  id: number;
  tenantId: number;
  domainName: string;
  extension: string;
  domainType: 'root' | 'subdomain';
  isPrimary: boolean;
  wwwPreference: 'redirect_to_root' | 'redirect_to_www' | 'both';
  wwwStatus: string;
  ownershipMode: string;
  registrarName: string;
  verificationToken: string;
  connectionStatus: string;
  workflowStep: number;
  approvalStatus: string;
  dnsStatus: string;
  sslStatus: string;
  sslIssuer: string;
  sslExpiresAt: string;
  dnsErrorDetail: string;
  expiryDate: string;
  renewalDate: string;
  renewalReminderDate: string;
  renewalStatus: string;
  renewalPaymentStatus: string;
  assignedSupportStaff: string;
  lastHealthStatus: string;
  suspendedReason: string;
  lastHealthCheckAt: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  dnsInstructions?: {
    hostingTarget: string;
    records: DnsRecordInstruction[];
    troubleshooting: string[];
  };
  latestHealthCheck?: HealthCheckRecord | null;
}

interface DomainNotificationItem {
  id: number;
  domainId: number;
  notificationType: string;
  milestoneKey: string;
  title: string;
  message: string;
  channelStatusJson: string;
  isRead: boolean;
  createdAt: string;
}

interface DomainEventItem {
  id: number;
  domainId: number;
  actorEmail: string;
  actorRole: string;
  eventType: string;
  severity: string;
  title: string;
  details: string;
  createdAt: string;
}

interface DomainSuggestionItem {
  domain: string;
  extension: string;
  availabilityStatus: string;
  availabilityLabel: string;
  isPromotional: boolean;
  promoNote: string;
  indicativeRegistrationInr: number;
  indicativeRenewalInr: number;
  indicativeTransferInr: number;
  gstPct: number;
  estimatedGstInr: number;
  estimatedTotalFirstYearInr: number;
  estimatedRenewalTotalInr: number;
  estimatedTransferTotalInr: number;
  ownershipPolicy: string;
  externalPurchaseLinks: {
    cloudflare: string;
    godaddy: string;
    namecheap: string;
    porkbun: string;
  };
}

interface PricingItem {
  extension: string;
  registrationFeeInr: number;
  renewalFeeInr: number;
  transferFeeInr: number;
  managementServiceFeeInr: number;
  hostingFeeInr: number;
  sslFeeInr: number;
  websiteDevFeeInr: number;
  gstPct: number;
  isPromotional: boolean;
  promoNote: string;
  domainGstInr: number;
  domainTotalFirstYearInr: number;
  renewalGstInr: number;
  renewalTotalInr: number;
  fullPackageSubtotalInr: number;
  fullPackageGstInr: number;
  fullPackageTotalInr: number;
}

interface DomainManagementCenterProps {
  tenant: TenantRecord;
  initialLang?: DomainLang;
  onNotify: (msg: string) => void;
  onRefreshTenant?: () => void;
}

export const DomainManagementCenter: React.FC<DomainManagementCenterProps> = ({
  tenant,
  initialLang = 'en',
  onNotify,
  onRefreshTenant,
}) => {
  const [lang, setLang] = useState<DomainLang>(initialLang);
  const t = DOMAIN_I18N[lang] || DOMAIN_I18N.en;

  const [subTab, setSubTab] = useState<'option_a' | 'option_b' | 'health' | 'notifications' | 'pricing'>('option_a');
  const [loading, setLoading] = useState(true);
  const [domains, setDomains] = useState<ManagedDomainRecord[]>([]);
  const [notifications, setNotifications] = useState<DomainNotificationItem[]>([]);
  const [events, setEvents] = useState<DomainEventItem[]>([]);
  const [selectedDomainId, setSelectedDomainId] = useState<number | null>(null);
  const [dnsTarget, setDnsTarget] = useState('vijay-visuals-site.pages.dev');
  const [planDomainLimit, setPlanDomainLimit] = useState(1);
  const [registrarConfigured, setRegistrarConfigured] = useState(false);
  const [cloudflareNote, setCloudflareNote] = useState('');
  const [channelStatus, setChannelStatus] = useState<{ in_app: string; email: string; whatsapp: string }>({
    in_app: 'delivered',
    email: 'not_configured_smtp',
    whatsapp: 'not_configured_whatsapp',
  });

  // Option A form
  const [newDomain, setNewDomain] = useState('');
  const [newRegistrar, setNewRegistrar] = useState('Cloudflare / GoDaddy / Namecheap (Customer Owned)');
  const [newDomainType, setNewDomainType] = useState<'root' | 'subdomain'>('root');
  const [newIsPrimary, setNewIsPrimary] = useState(true);
  const [newWwwPref, setNewWwwPref] = useState<'redirect_to_root' | 'redirect_to_www' | 'both'>('redirect_to_root');
  const [newExpiry, setNewExpiry] = useState('');
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(true);
  const [addingDomain, setAddingDomain] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [healthBusyId, setHealthBusyId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Option B search
  const [searchQuery, setSearchQuery] = useState(tenant.name);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchRes, setSearchRes] = useState<{
    registrarConfigured: boolean;
    registrarProvider: string;
    setupInstructions: string;
    honestNotice: string;
    ownershipGuarantee: string;
    suggestions: DomainSuggestionItem[];
  } | null>(null);

  // Pricing & portability
  const [pricingRows, setPricingRows] = useState<PricingItem[]>([]);
  const [selectedExt, setSelectedExt] = useState('.in');
  const [includeManagementFee, setIncludeManagementFee] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadDomainWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const [domRes, priceRes] = await Promise.all([
        apiFetch<{
          domains: ManagedDomainRecord[];
          notifications: DomainNotificationItem[];
          events: DomainEventItem[];
          dnsTarget: string;
          planDomainLimit: number;
          registrarConfigured: boolean;
          cloudflareSaas?: { architectureNote: string };
          channelStatus?: { in_app: string; email: string; whatsapp: string };
        }>(`/api/owner/tenants/${tenant.id}/domains`),
        apiFetch<{ pricing: PricingItem[] }>('/api/domains/pricing').catch(() => ({ pricing: [] })),
      ]);

      setDomains(domRes.domains || []);
      setNotifications(domRes.notifications || []);
      setEvents(domRes.events || []);
      setDnsTarget(domRes.dnsTarget || 'vijay-visuals-site.pages.dev');
      setPlanDomainLimit(domRes.planDomainLimit || 1);
      setRegistrarConfigured(Boolean(domRes.registrarConfigured));
      setCloudflareNote(domRes.cloudflareSaas?.architectureNote || '');
      if (domRes.channelStatus) setChannelStatus(domRes.channelStatus);
      setPricingRows(priceRes.pricing || []);

      if ((domRes.domains || []).length > 0) {
        setSelectedDomainId((prev) =>
          prev && domRes.domains.some((d) => d.id === prev) ? prev : domRes.domains[0].id
        );
      } else {
        setSelectedDomainId(null);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load domain management data.');
    } finally {
      setLoading(false);
    }
  }, [tenant.id, onNotify]);

  useEffect(() => {
    loadDomainWorkspace();
  }, [loadDomainWorkspace]);

  const activeDomain = domains.find((d) => d.id === selectedDomainId) || domains[0] || null;
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const copyText = async (key: string, text: string) => {
    let copied = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        copied = false;
      }
    }

    if (copied) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } else {
      onNotify('Copy failed — please select and copy the text manually.');
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newDomain.trim()) {
      setFormError('Enter your domain name (for example: myshop.in or shop.mybrand.com).');
      return;
    }
    if (!ownershipConfirmed) {
      const msg = 'Please confirm that you own or are authorized to connect this domain.';
      setFormError(msg);
      onNotify(msg);
      return;
    }
    setAddingDomain(true);
    try {
      const res = await apiFetch<{ domain: ManagedDomainRecord }>(`/api/owner/tenants/${tenant.id}/domains`, {
        method: 'POST',
        body: JSON.stringify({
          domainName: newDomain.trim(),
          registrarName: newRegistrar.trim(),
          domainType: newDomainType,
          isPrimary: newIsPrimary,
          wwwPreference: newWwwPref,
          expiryDate: newExpiry,
          ownershipConfirmed: true,
        }),
      });
      setFormError(null);
      setNewDomain('');
      setNewExpiry('');
      setSelectedDomainId(res.domain.id);
      onNotify(`Domain ${res.domain.domainName} saved! Configure the generated DNS TXT & CNAME records below.`);
      await loadDomainWorkspace();
      onRefreshTenant?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to add domain.';
      setFormError(msg);
      onNotify(msg);
    } finally {
      setAddingDomain(false);
    }
  };

  const handleVerifyDns = async (dom: ManagedDomainRecord) => {
    setVerifyingId(dom.id);
    try {
      const res = await apiFetch<{ domain: ManagedDomainRecord }>(
        `/api/owner/tenants/${tenant.id}/domains/${dom.id}/verify`,
        { method: 'POST' }
      );
      onNotify(
        res.domain.connectionStatus === 'live'
          ? `${dom.domainName} passed DNS, SSL, and HTTPS checks and is LIVE!`
          : `Live DNS/SSL check finished for ${dom.domainName} (Stage ${res.domain.workflowStep}/12). Review details below.`
      );
      await loadDomainWorkspace();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'DNS verification check failed.');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleRunHealthCheck = async (dom: ManagedDomainRecord) => {
    setHealthBusyId(dom.id);
    try {
      const res = await apiFetch<{ domain: ManagedDomainRecord }>(
        `/api/owner/tenants/${tenant.id}/domains/${dom.id}/health-check`,
        { method: 'POST' }
      );
      onNotify(`Health check completed for ${dom.domainName}: ${res.domain.lastHealthStatus.toUpperCase()}.`);
      await loadDomainWorkspace();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Domain health check failed.');
    } finally {
      setHealthBusyId(null);
    }
  };

  const handleSetPrimary = async (dom: ManagedDomainRecord) => {
    try {
      await apiFetch(`/api/owner/tenants/${tenant.id}/domains/${dom.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPrimary: true }),
      });
      onNotify(`${dom.domainName} set as your primary domain.`);
      await loadDomainWorkspace();
      onRefreshTenant?.();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to update primary domain.');
    }
  };

  const handleUpdateWwwPreference = async (
    dom: ManagedDomainRecord,
    wwwPreference: 'redirect_to_root' | 'redirect_to_www' | 'both'
  ) => {
    try {
      await apiFetch(`/api/owner/tenants/${tenant.id}/domains/${dom.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ wwwPreference }),
      });
      onNotify(`Updated WWW preference for ${dom.domainName}.`);
      await loadDomainWorkspace();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update WWW preference.');
    }
  };

  const handleDeleteDomain = async (dom: ManagedDomainRecord) => {
    try {
      await apiFetch(`/api/owner/tenants/${tenant.id}/domains/${dom.id}`, { method: 'DELETE' });
      onNotify(`Disconnected and removed ${dom.domainName}.`);
      await loadDomainWorkspace();
      onRefreshTenant?.();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to remove domain.');
    }
  };

  const handleSearchDomains = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchBusy(true);
    try {
      const res = await apiFetch<NonNullable<typeof searchRes>>('/api/domains/search', {
        method: 'POST',
        body: JSON.stringify({ businessName: searchQuery.trim(), category: tenant.category }),
      });
      setSearchRes(res);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Domain search failed.');
    } finally {
      setSearchBusy(false);
    }
  };

  const handleExportWebsiteData = async () => {
    setExporting(true);
    try {
      const data = await apiFetch<Record<string, unknown>>(`/api/owner/tenants/${tenant.id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tenant.slug}-full-website-migration-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onNotify('Full website & domain migration export downloaded.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const selectedPriceRow = pricingRows.find((r) => r.extension === selectedExt) || pricingRows[0] || null;

  return (
    <div className="space-y-6 text-xs">
      {/* Header + Trilingual Switcher */}
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <div className="flex items-center gap-2 text-[#ECC86A] font-semibold">
            <Globe className="w-4 h-4" />
            <span>{t.title} · {tenant.name}</span>
          </div>
          <p className="text-[#9E9EB2]">{t.subtitle}</p>
          <p className="text-[11px] text-emerald-300 flex items-center gap-1.5 pt-1">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>{t.noPasswordNotice}</span>
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="inline-flex rounded-md border border-[#2A2A38] bg-[#09090D] p-0.5">
            {([
              { id: 'en', label: 'EN' },
              { id: 'te', label: 'తెలుగు' },
              { id: 'hi', label: 'हिन्दी' },
            ] as Array<{ id: DomainLang; label: string }>).map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLang(l.id)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                  lang === l.id ? 'bg-[#D4AF37] text-[#08080A]' : 'text-[#A5A5B8] hover:text-white'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-[#8E8EA2] font-mono-tabular">
            Preview URL: <strong className="text-white">/site/{tenant.slug}</strong> · Plan Limit: {domains.length}/{planDomainLimit}
          </span>
        </div>
      </div>

      {/* Top Overview Cards for Active / Primary Domain */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-lg border border-[#20202E] bg-[#0D0D13] p-3.5">
          <p className="text-[10px] text-[#8E8EA2]">Connected Domain</p>
          <p className="font-mono-tabular text-sm font-bold text-white truncate mt-1">
            {activeDomain ? activeDomain.domainName : 'None Connected'}
          </p>
          <p className="text-[10px] text-[#9E9EB2] mt-0.5">
            {activeDomain?.isPrimary ? t.primaryBadge : 'Platform Preview Active'}
          </p>
        </div>

        <div className="rounded-lg border border-[#20202E] bg-[#0D0D13] p-3.5">
          <p className="text-[10px] text-[#8E8EA2]">Connection & DNS Status</p>
          <p
            className={`font-mono-tabular text-sm font-bold mt-1 uppercase ${
              activeDomain?.connectionStatus === 'live'
                ? 'text-emerald-400'
                : activeDomain?.connectionStatus === 'suspended' || activeDomain?.dnsStatus === 'dns_error'
                  ? 'text-rose-400'
                  : 'text-amber-300'
            }`}
          >
            {activeDomain ? activeDomain.connectionStatus.replace(/_/g, ' ') : 'NOT CONNECTED'}
          </p>
          <p className="text-[10px] text-[#9E9EB2] mt-0.5">
            DNS: {activeDomain ? activeDomain.dnsStatus.toUpperCase() : '—'}
          </p>
        </div>

        <div className="rounded-lg border border-[#20202E] bg-[#0D0D13] p-3.5">
          <p className="text-[10px] text-[#8E8EA2]">SSL / HTTPS & WWW</p>
          <p
            className={`font-mono-tabular text-sm font-bold mt-1 uppercase ${
              activeDomain?.sslStatus === 'active' ? 'text-emerald-400' : 'text-amber-300'
            }`}
          >
            SSL: {activeDomain ? activeDomain.sslStatus : 'PENDING'}
          </p>
          <p className="text-[10px] text-[#9E9EB2] mt-0.5">
            WWW: {activeDomain ? activeDomain.wwwStatus.replace(/_/g, ' ') : '—'}
          </p>
        </div>

        <div className="rounded-lg border border-[#20202E] bg-[#0D0D13] p-3.5">
          <p className="text-[10px] text-[#8E8EA2]">Registrar</p>
          <p className="text-xs font-semibold text-white truncate mt-1">
            {activeDomain ? activeDomain.registrarName : 'Customer Owned'}
          </p>
          <p className="text-[10px] text-[#9E9EB2] mt-0.5">
            {activeDomain?.domainType === 'subdomain' ? 'Subdomain' : 'Root Domain'}
          </p>
        </div>

        <div className="rounded-lg border border-[#20202E] bg-[#0D0D13] p-3.5">
          <p className="text-[10px] text-[#8E8EA2]">Expiry & Renewal Date</p>
          <p className="font-mono-tabular text-sm font-bold text-[#ECC86A] mt-1">
            {activeDomain?.expiryDate || 'Not Set'}
          </p>
          <p className="text-[10px] text-[#9E9EB2] mt-0.5 capitalize">
            {activeDomain ? `Status: ${activeDomain.renewalStatus.replace(/_/g, ' ')}` : 'Add expiry for alerts'}
          </p>
        </div>
      </div>

      {/* 12-Step Domain Connection Workflow Bar */}
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-white">{t.workflowTitle}</p>
          <span className="font-mono-tabular text-[11px] text-[#ECC86A]">
            {activeDomain
              ? `Current Stage: Step ${activeDomain.workflowStep} of 12 (${activeDomain.connectionStatus.replace(/_/g, ' ').toUpperCase()})`
              : 'Step 1 of 12 — Choose Option A or Option B below'}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {t.steps.map((label, idx) => {
            const stepNum = idx + 1;
            const current = activeDomain ? activeDomain.workflowStep : 1;
            const completed = activeDomain
              ? stepNum < current || (stepNum === 12 && activeDomain.connectionStatus === 'live')
              : false;
            const isCurrent = stepNum === current && !completed;
            const isError =
              isCurrent && (activeDomain?.connectionStatus === 'error' || activeDomain?.connectionStatus === 'suspended');

            return (
              <div
                key={stepNum}
                className={`rounded-md border px-2.5 py-2 text-[11px] flex items-center gap-1.5 ${
                  completed
                    ? 'border-emerald-500/40 bg-emerald-950/25 text-emerald-300'
                    : isError
                      ? 'border-rose-500/50 bg-rose-950/30 text-rose-200'
                      : isCurrent
                        ? 'border-[#D4AF37] bg-[#1A160D] text-[#ECC86A]'
                        : 'border-[#1E1E2C] bg-[#09090D] text-[#7D7D92]'
                }`}
              >
                <span className="font-mono-tabular font-bold shrink-0">{stepNum}.</span>
                <span className="truncate">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[#1E1E2B] pb-3">
        {[
          { id: 'option_a', label: t.optionA, icon: Globe },
          { id: 'option_b', label: t.optionB, icon: ShoppingCart },
          { id: 'health', label: t.healthTab, icon: Activity },
          { id: 'notifications', label: `${t.notificationsTab}${unreadCount > 0 ? ` (${unreadCount})` : ''}`, icon: Bell },
          { id: 'pricing', label: t.pricingTab, icon: ShieldCheck },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSubTab(item.id as typeof subTab)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium ${
                subTab === item.id
                  ? 'bg-[#D4AF37] text-[#08080A]'
                  : 'bg-[#12121A] text-[#A5A5B8] hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* ================= OPTION A: CONNECT EXISTING DOMAIN ================= */}
      {subTab === 'option_a' && (
        <div className="space-y-6">
          <form onSubmit={handleAddDomain} className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white">{t.optionA}</h3>
              <p className="text-[#9E9EB2] mt-0.5">{t.optionADesc}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-[#8E8EA2] mb-1">Domain Name *</label>
                <input
                  type="text"
                  required
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="e.g. srilakshmifashion.in or shop.mybrand.com"
                  className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#8E8EA2] mb-1">Registrar Name</label>
                <input
                  type="text"
                  value={newRegistrar}
                  onChange={(e) => setNewRegistrar(e.target.value)}
                  placeholder="Cloudflare / GoDaddy / Namecheap / BigRock"
                  className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#8E8EA2] mb-1">Domain Expiry Date (for 30/15/7/3/0d alerts)</label>
                <input
                  type="date"
                  value={newExpiry}
                  onChange={(e) => setNewExpiry(e.target.value)}
                  className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-[#8E8EA2] mb-1">Domain Type</label>
                <select
                  value={newDomainType}
                  onChange={(e) => setNewDomainType(e.target.value as 'root' | 'subdomain')}
                  className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                >
                  <option value="root">Root Domain (e.g. mybrand.in)</option>
                  <option value="subdomain">Subdomain (e.g. shop.mybrand.in)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[#8E8EA2] mb-1">WWW Redirection Preference</label>
                <select
                  value={newWwwPref}
                  disabled={newDomainType === 'subdomain'}
                  onChange={(e) => setNewWwwPref(e.target.value as typeof newWwwPref)}
                  className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white disabled:opacity-50"
                >
                  <option value="redirect_to_root">Redirect www → root (Recommended)</option>
                  <option value="redirect_to_www">Redirect root → www</option>
                  <option value="both">Serve both without forced redirect</option>
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-[#D4D4E0] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsPrimary}
                    onChange={(e) => setNewIsPrimary(e.target.checked)}
                    className="accent-[#D4AF37]"
                  />
                  <span>Set as Preferred Primary Domain</span>
                </label>
              </div>
            </div>

            <label className="flex items-start gap-2 text-[11px] text-[#A5A5B8] cursor-pointer">
              <input
                type="checkbox"
                checked={ownershipConfirmed}
                onChange={(e) => setOwnershipConfirmed(e.target.checked)}
                className="accent-[#D4AF37] mt-0.5"
              />
              <span>
                I confirm I own or have legal authorization to configure DNS for this domain. I retain 100% domain ownership in my own registrar account.
              </span>
            </label>

            {formError && (
              <div
                role="alert"
                className="rounded-lg border border-rose-500/45 bg-rose-950/30 px-3.5 py-2.5 text-[11px] text-rose-200 flex items-start gap-2"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={addingDomain}
              className="px-5 py-2.5 rounded-md bg-gold-gradient text-[#08080A] font-semibold"
            >
              {addingDomain ? 'Validating & Generating DNS...' : t.connectBtn}
            </button>
          </form>

          {/* Connected Domains & Customer-Specific DNS Records */}
          {loading ? (
            <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-8 text-center text-[#8E8EA2]">
              Loading connected domains...
            </div>
          ) : domains.length === 0 ? (
            <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-8 text-center text-[#8E8EA2]">
              No custom domain added yet. Add an existing domain above or switch to Option B to search & buy a new domain.
            </div>
          ) : (
            <div className="space-y-4">
              {domains.map((dom) => (
                <div
                  key={dom.id}
                  onClick={() => setSelectedDomainId(dom.id)}
                  className={`rounded-xl border p-5 space-y-4 transition ${
                    activeDomain?.id === dom.id
                      ? 'border-[#D4AF37]/60 bg-[#0F0F16]'
                      : 'border-[#222230] bg-[#0D0D13]'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono-tabular text-base font-bold text-white">{dom.domainName}</span>
                        {dom.isPrimary && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#D4AF37]/20 text-[#ECC86A] text-[10px] font-semibold">
                            <Star className="w-3 h-3" /> {t.primaryBadge}
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            dom.connectionStatus === 'live'
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                              : dom.connectionStatus === 'suspended' || dom.connectionStatus === 'error'
                                ? 'bg-rose-950/50 text-rose-300 border border-rose-500/40'
                                : 'bg-amber-950/50 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {dom.connectionStatus.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8E8EA2] mt-1">
                        Registrar: {dom.registrarName} · Type: {dom.domainType} · DNS: {dom.dnsStatus.toUpperCase()} · SSL: {dom.sslStatus.toUpperCase()}
                        {dom.expiryDate ? ` · Expires ${dom.expiryDate}` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {dom.domainType === 'root' && (
                        <select
                          value={dom.wwwPreference}
                          onChange={(e) =>
                            handleUpdateWwwPreference(dom, e.target.value as ManagedDomainRecord['wwwPreference'])
                          }
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border border-[#2A2A38] bg-[#09090D] px-2 py-1.5 text-[11px] text-white"
                        >
                          <option value="redirect_to_root">www → root</option>
                          <option value="redirect_to_www">root → www</option>
                          <option value="both">Both</option>
                        </select>
                      )}
                      {!dom.isPrimary && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetPrimary(dom);
                          }}
                          className="px-3 py-1.5 rounded border border-[#D4AF37]/40 text-[#ECC86A] hover:bg-[#19170E]"
                        >
                          {t.makePrimaryBtn}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={verifyingId === dom.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleVerifyDns(dom);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-gold-gradient text-[#08080A] font-semibold"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${verifyingId === dom.id ? 'animate-spin' : ''}`} />
                        <span>{verifyingId === dom.id ? 'Checking...' : t.verifyDnsBtn}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDomain(dom);
                        }}
                        className="p-1.5 rounded border border-rose-500/30 text-rose-400 hover:bg-rose-950/30"
                        aria-label={`Remove ${dom.domainName}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Customer-Specific DNS Records: Stacked Cards on Mobile, Clean Table on Tablet/Desktop */}
                  {dom.dnsInstructions && (
                    <>
                      <div className="md:hidden space-y-2.5">
                        {dom.dnsInstructions.records.map((rec, idx) => {
                          const valKey = `${dom.id}-mval-${idx}`;
                          const hostKey = `${dom.id}-mhost-${idx}`;
                          return (
                            <div
                              key={valKey}
                              className="rounded-lg border border-[#1E1E2B] bg-[#09090D] p-3 space-y-2 text-[11px]"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-[#C4C4D4] font-medium leading-snug">{rec.purpose}</p>
                                <span className="px-2 py-0.5 rounded bg-[#18160F] border border-[#D4AF37]/30 font-mono-tabular text-[#ECC86A] text-[10px] font-semibold shrink-0">
                                  {rec.type}
                                </span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] uppercase tracking-wider text-[#7D7D92]">Host / Name</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyText(hostKey, rec.host);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#2A2A38] text-[10px] text-[#D4D4E0]"
                                  >
                                    {copiedKey === hostKey ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    <span>{copiedKey === hostKey ? t.copiedBtn : t.copyBtn}</span>
                                  </button>
                                </div>
                                <p className="font-mono-tabular text-white bg-[#0C0C12] border border-[#1C1C28] rounded px-2.5 py-1.5 break-all">
                                  {rec.host}
                                </p>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] uppercase tracking-wider text-[#7D7D92]">Value / Target</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyText(valKey, rec.value);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#D4AF37]/40 text-[10px] text-[#ECC86A]"
                                  >
                                    {copiedKey === valKey ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    <span>{copiedKey === valKey ? t.copiedBtn : t.copyBtn}</span>
                                  </button>
                                </div>
                                <p className="font-mono-tabular text-emerald-300 bg-[#0C0C12] border border-[#1C1C28] rounded px-2.5 py-1.5 break-all">
                                  {rec.value}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="hidden md:block rounded-lg border border-[#1E1E2B] bg-[#09090D] overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead className="bg-[#0C0C12] text-[#8E8EA2] text-left">
                            <tr>
                              <th className="py-2 px-3">Purpose</th>
                              <th className="py-2 px-3 whitespace-nowrap">Type</th>
                              <th className="py-2 px-3">Host / Name</th>
                              <th className="py-2 px-3">Value / Target</th>
                              <th className="py-2 px-3 text-right">Copy</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#1A1A26]">
                            {dom.dnsInstructions.records.map((rec, idx) => {
                              const key = `${dom.id}-${idx}`;
                              return (
                                <tr key={key}>
                                  <td className="py-2.5 px-3 text-[#C4C4D4]">{rec.purpose}</td>
                                  <td className="py-2.5 px-3 font-mono-tabular text-[#ECC86A] font-semibold whitespace-nowrap">{rec.type}</td>
                                  <td className="py-2.5 px-3 font-mono-tabular text-white whitespace-nowrap">{rec.host}</td>
                                  <td className="py-2.5 px-3 font-mono-tabular text-emerald-300 whitespace-nowrap">{rec.value}</td>
                                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyText(key, rec.value);
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#2A2A38] text-[#D4D4E0] hover:border-[#D4AF37]"
                                    >
                                      {copiedKey === key ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                      <span>{copiedKey === key ? t.copiedBtn : t.copyBtn}</span>
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {/* Honest Error & Troubleshooting Panel */}
                  {dom.dnsErrorDetail && (
                    <div className="rounded-lg border border-amber-500/35 bg-amber-950/20 p-3.5 space-y-2 text-[11px]">
                      <p className="font-semibold text-amber-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Live DNS / SSL Diagnostics</span>
                      </p>
                      <p className="text-amber-100/90 leading-relaxed">{dom.dnsErrorDetail}</p>
                      {dom.dnsInstructions?.troubleshooting && (
                        <ul className="list-disc pl-4 space-y-1 text-[#C4C4D4]">
                          {dom.dnsInstructions.troubleshooting.map((tip, i) => (
                            <li key={i}>{tip}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Honest Cloudflare Pages & Multi-Tenant Architecture Disclosure */}
          <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4 space-y-1.5 text-[11px] text-sky-100">
            <p className="font-semibold text-sky-300 flex items-center gap-1.5">
              <Server className="w-4 h-4" />
              <span>Multi-Tenant Hosting & Cloudflare SSL Architecture Notice (Target: {dnsTarget})</span>
            </p>
            <p className="leading-relaxed">
              {cloudflareNote ||
                'Adding a domain in this dashboard verifies ownership and maps your hostname in Vijay Visuals D1 database. For live edge HTTPS on custom domains, bind the domain in Cloudflare Pages (up to 100 custom domains) or enable Cloudflare for SaaS Custom Hostnames + Worker host routing.'}
            </p>
          </div>
        </div>
      )}

      {/* ================= OPTION B: BUY A NEW DOMAIN ================= */}
      {subTab === 'option_b' && (
        <div className="space-y-5">
          {!registrarConfigured && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-950/25 p-4 space-y-2">
              <p className="font-semibold text-amber-300 flex items-center gap-2 text-sm">
                <ShieldAlert className="w-4 h-4" />
                <span>{t.registrarIntegrationRequired}</span>
              </p>
              <p className="text-amber-100/90 leading-relaxed">
                Live registrar API credentials (<code className="font-mono-tabular">DOMAIN_REGISTRAR_API_KEY</code> &{' '}
                <code className="font-mono-tabular">DOMAIN_REGISTRAR_PROVIDER</code>) are not configured on this server.
                Vijay Visuals never fabricates domain availability or invented registrar checkout prices. Use the search tool below to compare transparent reference rates (first-year promo vs annual renewal) and purchase directly in your own Cloudflare, GoDaddy India, Namecheap, or Porkbun account so you keep 100% domain ownership.
              </p>
            </div>
          )}

          <form onSubmit={handleSearchDomains} className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-[#7D7D92] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter business name or desired domain (e.g. Sri Lakshmi Fashion)"
                className="w-full pl-9 pr-3 py-2.5 rounded-md border border-[#2A2A38] bg-[#08080C] text-white"
              />
            </div>
            <button
              type="submit"
              disabled={searchBusy}
              className="px-5 py-2.5 rounded-md bg-gold-gradient text-[#08080A] font-semibold"
            >
              {searchBusy ? 'Searching...' : t.searchDomainsBtn}
            </button>
          </form>

          {searchRes && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#242434] bg-[#0B0B11] p-4 text-[11px] text-[#B8B8C8] space-y-1">
                <p className="text-white font-semibold">{searchRes.honestNotice}</p>
                <p className="text-emerald-300">{searchRes.ownershipGuarantee}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {searchRes.suggestions.map((sug) => (
                  <div key={sug.domain} className="rounded-xl border border-[#222230] bg-[#0D0D13] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono-tabular text-sm font-bold text-white">{sug.domain}</p>
                        <p className="text-[10px] text-amber-300 mt-0.5">{sug.availabilityLabel}</p>
                      </div>
                      {sug.isPromotional && (
                        <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/40 text-amber-200 text-[10px]">
                          1st Yr Promo
                        </span>
                      )}
                    </div>

                    <div className="rounded border border-[#1E1E2B] bg-[#09090D] p-3 space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-[#8E8EA2]">1st Year Indicative</span>
                        <span className="font-mono-tabular text-white">₹{sug.indicativeRegistrationInr}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#8E8EA2]">GST ({sug.gstPct}%)</span>
                        <span className="font-mono-tabular text-white">₹{sug.estimatedGstInr}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-[#ECC86A] border-t border-[#1D1D28] pt-1">
                        <span>Est. 1st Yr Total</span>
                        <span className="font-mono-tabular">₹{sug.estimatedTotalFirstYearInr}</span>
                      </div>
                      <div className="flex justify-between text-[#B4B4C6] pt-1">
                        <span>Annual Renewal (+GST)</span>
                        <span className="font-mono-tabular">₹{sug.indicativeRenewalInr} (₹{sug.estimatedRenewalTotalInr})</span>
                      </div>
                      <div className="flex justify-between text-[#8E8EA2]">
                        <span>Transfer Charge (+GST)</span>
                        <span className="font-mono-tabular">₹{sug.indicativeTransferInr} (₹{sug.estimatedTransferTotalInr})</span>
                      </div>
                    </div>

                    {sug.promoNote && <p className="text-[10px] text-[#9A9AAE]">{sug.promoNote}</p>}

                    <div className="space-y-1.5">
                      <p className="text-[10px] text-emerald-300">Buy directly in your own registrar account:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: 'Cloudflare', url: sug.externalPurchaseLinks.cloudflare },
                          { label: 'GoDaddy IN', url: sug.externalPurchaseLinks.godaddy },
                          { label: 'Namecheap', url: sug.externalPurchaseLinks.namecheap },
                          { label: 'Porkbun', url: sug.externalPurchaseLinks.porkbun },
                        ].map((link) => (
                          <a
                            key={link.label}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#2C2C3C] text-[11px] text-white hover:border-[#D4AF37]"
                          >
                            <span>{link.label}</span>
                            <ExternalLink className="w-2.5 h-2.5 text-[#D4AF37]" />
                          </a>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewDomain(sug.domain);
                          setSubTab('option_a');
                          onNotify(`Pre-filled ${sug.domain} in Option A. After purchasing in your registrar account, save it to generate DNS records.`);
                        }}
                        className="w-full mt-1 py-1.5 rounded border border-[#D4AF37]/40 text-[#ECC86A] hover:bg-[#19170E] text-[11px] font-medium"
                      >
                        Already Bought? Connect {sug.domain} →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= DOMAIN HEALTH MONITORING ================= */}
      {subTab === 'health' && (
        <div className="space-y-4">
          {domains.length === 0 ? (
            <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-8 text-center text-[#8E8EA2]">
              Connect a custom domain first to run live DNS, SSL/TLS, HTTPS, and WWW redirect health checks.
            </div>
          ) : (
            domains.map((dom) => {
              const hc = dom.latestHealthCheck;
              return (
                <div key={dom.id} className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono-tabular text-sm font-bold text-white flex items-center gap-2">
                        <span>{dom.domainName}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase ${
                            dom.lastHealthStatus === 'healthy'
                              ? 'bg-emerald-950/60 text-emerald-300'
                              : dom.lastHealthStatus === 'degraded'
                                ? 'bg-amber-950/60 text-amber-300'
                                : 'bg-rose-950/60 text-rose-300'
                          }`}
                        >
                          {dom.lastHealthStatus}
                        </span>
                      </p>
                      <p className="text-[11px] text-[#8E8EA2] mt-0.5">
                        Last health check: {dom.lastHealthCheckAt ? new Date(dom.lastHealthCheckAt).toLocaleString() : 'Never run yet'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={healthBusyId === dom.id}
                      onClick={() => handleRunHealthCheck(dom)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-gold-gradient text-[#08080A] font-semibold"
                    >
                      <Activity className={`w-3.5 h-3.5 ${healthBusyId === dom.id ? 'animate-spin' : ''}`} />
                      <span>{healthBusyId === dom.id ? 'Probing Live...' : t.runHealthBtn}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    {[
                      { label: 'DNS Health', ok: hc?.dnsHealthy ?? false, val: hc ? (hc.dnsHealthy ? 'PASS' : 'ISSUE') : 'UNCHECKED' },
                      { label: 'SSL / TLS Health', ok: hc?.sslHealthy ?? false, val: hc ? (hc.sslHealthy ? 'VALID' : 'PENDING/ERR') : 'UNCHECKED' },
                      { label: 'HTTPS Available', ok: hc?.httpsAvailable ?? false, val: hc ? (hc.httpsAvailable ? 'ONLINE' : 'OFFLINE') : 'UNCHECKED' },
                      { label: 'HTTP Response', ok: (hc?.httpStatusCode || 0) >= 200 && (hc?.httpStatusCode || 0) < 400, val: hc?.httpStatusCode ? `${hc.httpStatusCode} (${hc.responseTimeMs}ms)` : '—' },
                      { label: 'WWW Redirect', ok: hc?.wwwRedirectHealthy ?? false, val: dom.domainType === 'subdomain' ? 'N/A' : hc?.wwwRedirectHealthy ? 'OK' : 'PENDING' },
                      { label: 'Domain Expiry', ok: dom.renewalStatus === 'active' || dom.renewalStatus === 'renewed_confirmed', val: dom.expiryDate || 'Not Set' },
                    ].map((metric) => (
                      <div key={metric.label} className="rounded-lg border border-[#1E1E2B] bg-[#09090D] p-3">
                        <p className="text-[10px] text-[#8E8EA2]">{metric.label}</p>
                        <p className={`font-mono-tabular text-xs font-bold mt-1 ${metric.ok ? 'text-emerald-400' : 'text-amber-300'}`}>
                          {metric.val}
                        </p>
                      </div>
                    ))}
                  </div>

                  {hc?.sslIssuer && (
                    <p className="text-[11px] text-[#9E9EB2]">
                      Certificate Issuer: <strong className="text-white">{hc.sslIssuer}</strong>
                      {hc.sslValidTo ? ` · Valid Until: ${hc.sslValidTo}` : ''}
                    </p>
                  )}

                  {hc?.errorSummary && (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-[11px] text-rose-200">
                      <strong>Recent Health Alert:</strong> {hc.errorSummary}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ================= NOTIFICATIONS & CONNECTION HISTORY ================= */}
      {subTab === 'notifications' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#D4AF37]" />
                <span>Domain Alerts & Renewal Reminders ({notifications.length})</span>
              </h3>
            </div>
            <div className="rounded-lg border border-[#1E1E2B] bg-[#09090D] p-3 text-[11px] text-[#9E9EB2] space-y-1">
              <p className="text-white font-medium">Automated Renewal Schedule: 30d · 15d · 7d · 3d · Expiry Date</p>
              <p>
                Channels — In-App: <strong className="text-emerald-300">Delivered</strong> · Email:{' '}
                <strong className={channelStatus.email.startsWith('configured') ? 'text-emerald-300' : 'text-amber-300'}>
                  {channelStatus.email.startsWith('configured') ? 'SMTP Configured' : 'Setup Required (SMTP)'}
                </strong>{' '}
                · WhatsApp:{' '}
                <strong className={channelStatus.whatsapp.startsWith('configured') ? 'text-emerald-300' : 'text-amber-300'}>
                  {channelStatus.whatsapp.startsWith('configured') ? 'Cloud API Configured' : 'Setup Required'}
                </strong>
              </p>
            </div>
            {notifications.length === 0 ? (
              <p className="text-[#8E8EA2] py-4 text-center">No domain notifications yet.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-lg border p-3 space-y-1 ${
                      n.isRead ? 'border-[#1E1E2A] bg-[#09090D]' : 'border-[#D4AF37]/40 bg-[#17140C]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-white">{n.title}</p>
                      {!n.isRead && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/domains/notifications/${n.id}/read`, { method: 'PATCH' });
                            loadDomainWorkspace();
                          }}
                          className="text-[10px] text-[#ECC86A] underline shrink-0"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                    <p className="text-[#B4B4C6] leading-relaxed">{n.message}</p>
                    <p className="text-[10px] text-[#7D7D92]">
                      {n.notificationType.replace(/_/g, ' ')} · {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-[#D4AF37]" />
              <span>Domain Connection History ({events.length})</span>
            </h3>
            {events.length === 0 ? (
              <p className="text-[#8E8EA2] py-4 text-center">No domain activity logged yet.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {events.map((ev) => (
                  <div key={ev.id} className="rounded-lg border border-[#1E1E2B] bg-[#09090D] p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white">{ev.title}</span>
                      <span
                        className={`text-[10px] uppercase font-mono-tabular ${
                          ev.severity === 'success'
                            ? 'text-emerald-400'
                            : ev.severity === 'error'
                              ? 'text-rose-400'
                              : ev.severity === 'warning'
                                ? 'text-amber-300'
                                : 'text-[#8E8EA2]'
                        }`}
                      >
                        {ev.severity}
                      </span>
                    </div>
                    {ev.details && <p className="text-[#A5A5B8]">{ev.details}</p>}
                    <p className="text-[10px] text-[#7D7D92]">
                      {ev.actorEmail} ({ev.actorRole}) · {new Date(ev.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= CUSTOMER OWNERSHIP & TRANSPARENT PACKAGE PRICING ================= */}
      {subTab === 'pricing' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">Transparent Package & Domain Fee Breakdown</h3>
              <select
                value={selectedExt}
                onChange={(e) => setSelectedExt(e.target.value)}
                className="rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-1.5 text-white"
              >
                {pricingRows.map((r) => (
                  <option key={r.extension} value={r.extension}>
                    Extension: {r.extension}
                  </option>
                ))}
              </select>
            </div>

            {selectedPriceRow && (() => {
              const mgmtFee = includeManagementFee ? selectedPriceRow.managementServiceFeeInr : 0;
              const subtotal =
                selectedPriceRow.websiteDevFeeInr +
                selectedPriceRow.registrationFeeInr +
                selectedPriceRow.hostingFeeInr +
                selectedPriceRow.sslFeeInr +
                mgmtFee;
              const gst = Math.round((subtotal * selectedPriceRow.gstPct) / 100);
              const finalPayable = subtotal + gst;

              return (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-[#C4C4D4] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeManagementFee}
                      onChange={(e) => setIncludeManagementFee(e.target.checked)}
                      className="accent-[#D4AF37]"
                    />
                    <span>Include Optional Assisted DNS & Domain Management Service (+₹{selectedPriceRow.managementServiceFeeInr}/yr)</span>
                  </label>

                  <div className="rounded-lg border border-[#1E1E2B] bg-[#09090D] divide-y divide-[#1A1A26]">
                    {[
                      { label: 'Website Development Fee (One-Time)', val: `₹${selectedPriceRow.websiteDevFeeInr.toLocaleString('en-IN')}` },
                      { label: `Domain Registration Fee (${selectedPriceRow.extension}, 1st Yr Indicative — Paid to Registrar)`, val: `₹${selectedPriceRow.registrationFeeInr.toLocaleString('en-IN')}` },
                      { label: `Domain Renewal Fee (${selectedPriceRow.extension}, Recurring Annual — Shown Separately)`, val: `₹${selectedPriceRow.renewalFeeInr.toLocaleString('en-IN')}/yr` },
                      { label: 'Cloud Hosting Fee (Metered Tier — Monthly)', val: `₹${selectedPriceRow.hostingFeeInr.toLocaleString('en-IN')}/mo` },
                      { label: 'SSL / HTTPS Certificate Fee (Cloudflare Edge)', val: selectedPriceRow.sslFeeInr === 0 ? '₹0 (Included via Cloudflare SSL)' : `₹${selectedPriceRow.sslFeeInr}` },
                      { label: 'Optional Domain Management Service Fee', val: `₹${mgmtFee.toLocaleString('en-IN')}` },
                      { label: `Applicable Taxes (GST @ ${selectedPriceRow.gstPct}%)`, val: `₹${gst.toLocaleString('en-IN')}` },
                    ].map((row) => (
                      <div key={row.label} className="px-4 py-2.5 flex items-center justify-between gap-4">
                        <span className="text-[#A5A5B8]">{row.label}</span>
                        <span className="font-mono-tabular text-white font-semibold shrink-0">{row.val}</span>
                      </div>
                    ))}
                    <div className="px-4 py-3 flex items-center justify-between bg-[#14110A]">
                      <span className="font-semibold text-[#ECC86A]">Estimated Final Payable Amount (1st Cycle)</span>
                      <span className="font-mono-tabular text-base font-bold text-[#ECC86A]">
                        ₹{finalPayable.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#9E9EB2] flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-[#D4AF37] shrink-0 mt-0.5" />
                    <span>
                      No automatic billing: Vijay Visuals never charges your card or UPI without your explicit consent and order confirmation. We never promise lifetime domain ownership, free lifetime renewal, or unlimited hosting.
                    </span>
                  </p>
                </div>
              );
            })()}
          </div>

          <div className="lg:col-span-5 rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4 h-fit">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>{t.ownershipTitle}</span>
            </h3>
            <ul className="space-y-2 text-[#B8B8C8]">
              {[
                'Your domain stays in YOUR own registrar account & email.',
                'Full visibility into registrar renewal prices & transfer charges.',
                'Complete access to DNS records & troubleshooting steps.',
                'Export your complete website data JSON anytime with zero lock-in.',
                'Migrate to any other hosting provider whenever you choose by updating DNS.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={exporting}
              onClick={handleExportWebsiteData}
              className="w-full py-2.5 rounded-md border border-[#D4AF37]/50 text-[#ECC86A] font-semibold hover:bg-[#19170E] inline-flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>{exporting ? 'Preparing Full Export...' : 'Export Website Data for Migration (JSON)'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
