import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Globe,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { DomainLang } from '../lib/domainI18n';
import { TenantRecord } from '../types/platform';
import { DomainManagementCenter } from './DomainManagementCenter';
import { ProposalManager } from './ProposalManager';

export type GrowthTab = 'domains_dns' | 'seo_growth' | 'proposals_quotes' | 'subscription_policy';

interface GrowthWorkspaceProps {
  tenant: TenantRecord;
  activeTab: GrowthTab;
  lang?: DomainLang;
  onNotify: (msg: string) => void;
}

interface DomainSuggestion {
  domain: string;
  extension: string;
  availabilityStatus: string;
  indicativeRegistrationInr: number;
  indicativeRenewalInr: number;
  estimatedGstInr: number;
  estimatedTotalFirstYearInr: number;
  ownershipPolicy: string;
  externalPurchaseLinks: { cloudflare: string; godaddy: string; namecheap: string };
}

interface TenantDomainRecord {
  id: number;
  tenantId: number;
  domainName: string;
  extension: string;
  ownershipMode: string;
  registrarName: string;
  verificationToken: string;
  dnsStatus: string;
  sslStatus: string;
  dnsErrorDetail: string;
  expiryDate: string;
  renewalReminderDate: string;
  lastCheckedAt: string | null;
}

interface SeoChecklistItem {
  id: string;
  label: string;
  category: string;
  passed: boolean;
  weight: number;
  recommendation: string;
}

interface ProposalRecord {
  id: number;
  proposalNumber: string;
  customerName: string;
  customerEmail: string;
  businessName: string;
  billingPeriod: string;
  itemsJson: string;
  oneTimeSubtotalInr: number;
  recurringSubtotalInr: number;
  gstInr: number;
  grandTotalInr: number;
  status: string;
  lockedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

interface SubscriberRecord {
  id: number;
  email: string;
  name: string;
  source: string;
  consentGiven: boolean;
  createdAt: string;
}

export const GrowthWorkspace: React.FC<GrowthWorkspaceProps> = ({ tenant, activeTab, lang = 'en', onNotify }) => {
  // --- MODULE 1: DOMAINS & LIVE DNS STATE ---
  const [searchQuery, setSearchQuery] = useState(tenant.name);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    registrarConfigured: boolean;
    honestNotice: string;
    ownershipGuarantee: string;
    suggestions: DomainSuggestion[];
  } | null>(null);
  const [domains, setDomains] = useState<TenantDomainRecord[]>([]);
  const [dnsTarget, setDnsTarget] = useState('vijay-visuals-site.pages.dev');
  const [newDomain, setNewDomain] = useState('');
  const [newRegistrar, setNewRegistrar] = useState('Cloudflare / GoDaddy / Namecheap (Customer Owned)');
  const [newExpiry, setNewExpiry] = useState('');
  const [newReminder, setNewReminder] = useState('');
  const [verifyingId, setVerifyingId] = useState<number | null>(null);

  // --- MODULE 4: SEO DASHBOARD STATE ---
  const [seoSettings, setSeoSettings] = useState({
    canonicalUrl: '',
    robotsDirectives: 'index, follow',
    googleSiteVerification: '',
    ga4MeasurementId: '',
    cityAreaKeywords: '',
    googleMapsUrl: '',
    gbpProfileUrl: '',
    localBusinessType: 'LocalBusiness',
  });
  const [seoAudit, setSeoAudit] = useState<{
    score: number;
    checklist: SeoChecklistItem[];
    duplicateProductNames: string[];
    honestDisclosure: string;
  } | null>(null);
  const [sitemapUrl, setSitemapUrl] = useState('/sitemap.xml');
  const [robotsUrl, setRobotsUrl] = useState('/robots.txt');
  const [gscNotice, setGscNotice] = useState('');
  const [savingSeo, setSavingSeo] = useState(false);

  // AI SEO Assistant
  const [aiSeoTask, setAiSeoTask] = useState<'keywords' | 'meta_copy' | 'content_ideas' | 'audit_fixes'>('keywords');
  const [aiSeoCity, setAiSeoCity] = useState('Hyderabad');
  const [aiSeoBusy, setAiSeoBusy] = useState(false);
  const [aiSeoOutput, setAiSeoOutput] = useState('');

  // --- MODULES 5 & 11: PROPOSALS & SUBSCRIBERS ---
  const [proposalsList, setProposalsList] = useState<ProposalRecord[]>([]);
  const [subscribers, setSubscribers] = useState<SubscriberRecord[]>([]);
  const [exporting, setExporting] = useState(false);

  const loadDomains = useCallback(async () => {
    try {
      const res = await apiFetch<{ domains: TenantDomainRecord[]; dnsTarget: string }>(
        `/api/owner/tenants/${tenant.id}/domains`
      );
      setDomains(res.domains);
      setDnsTarget(res.dnsTarget || 'vijay-visuals-site.pages.dev');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load domain settings.');
    }
  }, [tenant.id, onNotify]);

  const loadSeo = useCallback(async () => {
    try {
      const res = await apiFetch<{
        seo: typeof seoSettings & { lastAuditScore: number };
        audit: NonNullable<typeof seoAudit>;
        sitemapUrl: string;
        robotsUrl: string;
        gscHonestNotice: string;
      }>(`/api/owner/tenants/${tenant.id}/seo`);
      setSeoSettings({
        canonicalUrl: res.seo.canonicalUrl || '',
        robotsDirectives: res.seo.robotsDirectives || 'index, follow',
        googleSiteVerification: res.seo.googleSiteVerification || '',
        ga4MeasurementId: res.seo.ga4MeasurementId || '',
        cityAreaKeywords: res.seo.cityAreaKeywords || '',
        googleMapsUrl: res.seo.googleMapsUrl || '',
        gbpProfileUrl: res.seo.gbpProfileUrl || '',
        localBusinessType: res.seo.localBusinessType || 'LocalBusiness',
      });
      setSeoAudit(res.audit);
      setSitemapUrl(res.sitemapUrl);
      setRobotsUrl(res.robotsUrl);
      setGscNotice(res.gscHonestNotice);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load SEO dashboard.');
    }
  }, [tenant.id, onNotify]);

  const loadProposalsAndSubscribers = useCallback(async () => {
    try {
      const [propRes, subRes] = await Promise.all([
        apiFetch<{ proposals: ProposalRecord[] }>('/api/proposals'),
        apiFetch<{ subscribers: SubscriberRecord[] }>(`/api/owner/tenants/${tenant.id}/subscribers`),
      ]);
      setProposalsList(propRes.proposals || []);
      setSubscribers(subRes.subscribers || []);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load proposals and subscribers.');
    }
  }, [tenant.id, onNotify]);

  useEffect(() => {
    if (activeTab === 'seo_growth') loadSeo();
    if (activeTab === 'proposals_quotes') loadProposalsAndSubscribers();
  }, [activeTab, loadSeo, loadProposalsAndSubscribers]);

  const handleDomainSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchBusy(true);
    try {
      const res = await apiFetch<NonNullable<typeof searchResult>>('/api/domains/search', {
        method: 'POST',
        body: JSON.stringify({ businessName: searchQuery.trim(), category: tenant.category }),
      });
      setSearchResult(res);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Domain search failed.');
    } finally {
      setSearchBusy(false);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    try {
      await apiFetch(`/api/owner/tenants/${tenant.id}/domains`, {
        method: 'POST',
        body: JSON.stringify({
          domainName: newDomain.trim(),
          registrarName: newRegistrar.trim(),
          expiryDate: newExpiry,
          renewalReminderDate: newReminder,
        }),
      });
      setNewDomain('');
      setNewExpiry('');
      setNewReminder('');
      onNotify('Custom domain added. Configure the CNAME or TXT record below and click Verify Live DNS.');
      loadDomains();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not add custom domain.');
    }
  };

  const handleVerifyDns = async (domainId: number) => {
    setVerifyingId(domainId);
    try {
      const res = await apiFetch<{ domain: TenantDomainRecord }>(
        `/api/owner/tenants/${tenant.id}/domains/${domainId}/verify`,
        { method: 'POST' }
      );
      onNotify(
        res.domain.dnsStatus === 'verified'
          ? `DNS verified for ${res.domain.domainName}! SSL/HTTPS ready.`
          : `DNS check completed for ${res.domain.domainName}: records not propagated yet.`
      );
      loadDomains();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Live DNS verification failed.');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleSaveSeo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSeo(true);
    try {
      const res = await apiFetch<{ audit: NonNullable<typeof seoAudit> }>(`/api/owner/tenants/${tenant.id}/seo`, {
        method: 'PUT',
        body: JSON.stringify(seoSettings),
      });
      setSeoAudit(res.audit);
      onNotify(`SEO settings saved! Updated SEO readiness score: ${res.audit.score}/100.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save SEO settings.');
    } finally {
      setSavingSeo(false);
    }
  };

  const handleRunAiSeo = async () => {
    setAiSeoBusy(true);
    try {
      const res = await apiFetch<{ output: string }>('/api/ai/seo-assistant', {
        method: 'POST',
        body: JSON.stringify({ tenantId: tenant.id, task: aiSeoTask, targetCity: aiSeoCity }),
      });
      setAiSeoOutput(res.output);
      onNotify('Gemini AI SEO recommendations generated.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'AI SEO assistant unavailable.');
    } finally {
      setAiSeoBusy(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const data = await apiFetch<Record<string, unknown>>(`/api/owner/tenants/${tenant.id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tenant.slug}-vijay-visuals-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onNotify('Full tenant business backup JSON downloaded.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  // ================= TAB 1: COMPLETE DOMAIN MANAGEMENT CENTER =================
  if (activeTab === 'domains_dns') {
    return <DomainManagementCenter tenant={tenant} initialLang={lang} onNotify={onNotify} />;
  }

  // ================= TAB 2: GOOGLE SEO & SEARCH VISIBILITY =================
  if (activeTab === 'seo_growth') {
    return (
      <div className="space-y-6 text-xs">
        {/* Live SEO Readiness Score & Technical Links */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 rounded-xl border border-[#222230] bg-[#0D0D13] p-5 flex flex-col justify-between space-y-4">
            <div>
              <p className="text-[#ECC86A] font-semibold">Live On-Page & Technical SEO Score</p>
              <p className="font-mono-tabular text-4xl font-bold text-white mt-2">
                {seoAudit?.score ?? 0}
                <span className="text-base text-[#8E8EA2]">/100</span>
              </p>
              <p className="text-[11px] text-[#9A9AAE] mt-2 leading-relaxed">
                {seoAudit?.honestDisclosure}
              </p>
            </div>
            <div className="space-y-1.5 pt-3 border-t border-[#1D1D28] font-mono-tabular text-[11px]">
              <a href={sitemapUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between text-[#ECC86A] hover:underline">
                <span>Live XML Sitemap (/sitemap.xml)</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a href={robotsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between text-[#B8B8C8] hover:text-white">
                <span>Live Robots Directives (/robots.txt)</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="lg:col-span-8 rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Actionable Google SEO Checklist</h3>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {(seoAudit?.checklist || []).map((item) => (
                <div key={item.id} className="rounded-lg border border-[#1E1E2B] bg-[#09090D] p-3 flex items-start gap-2.5">
                  {item.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-white">{item.label}</p>
                      <span className="font-mono-tabular text-[10px] text-[#8E8EA2]">+{item.weight} pts</span>
                    </div>
                    <p className="text-[11px] text-[#9E9EB2] mt-0.5">{item.recommendation}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Technical SEO, Local SEO & Google Tools Configuration */}
        <form onSubmit={handleSaveSeo} className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Technical SEO, Local SEO (NAP & Maps) & Google Verification Tags</h3>
            <span className="text-[11px] text-[#ECC86A]">Auto-injects LocalBusiness + Product JSON-LD</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#9A9AAE] mb-1">Canonical URL</label>
              <input
                type="text"
                value={seoSettings.canonicalUrl}
                onChange={(e) => setSeoSettings((s) => ({ ...s, canonicalUrl: e.target.value }))}
                placeholder={`https://vijay-visuals-site.pages.dev/site/${tenant.slug}`}
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#9A9AAE] mb-1">Search Engine Indexing Control</label>
              <select
                value={seoSettings.robotsDirectives}
                onChange={(e) => setSeoSettings((s) => ({ ...s, robotsDirectives: e.target.value }))}
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
              >
                <option value="index, follow">index, follow (Public Searchable)</option>
                <option value="noindex, follow">noindex, follow (Hide Page from Google)</option>
                <option value="noindex, nofollow">noindex, nofollow (Private Draft)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#9A9AAE] mb-1">Google Analytics 4 (GA4 Measurement ID)</label>
              <input
                type="text"
                value={seoSettings.ga4MeasurementId}
                onChange={(e) => setSeoSettings((s) => ({ ...s, ga4MeasurementId: e.target.value }))}
                placeholder="G-XXXXXXXXXX"
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#9A9AAE] mb-1">Google Search Console Verification Code</label>
              <input
                type="text"
                value={seoSettings.googleSiteVerification}
                onChange={(e) => setSeoSettings((s) => ({ ...s, googleSiteVerification: e.target.value }))}
                placeholder="google-site-verification meta content value"
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#9A9AAE] mb-1">Target City & Local Area Keywords</label>
              <input
                type="text"
                value={seoSettings.cityAreaKeywords}
                onChange={(e) => setSeoSettings((s) => ({ ...s, cityAreaKeywords: e.target.value }))}
                placeholder="Banjara Hills, Jubilee Hills, Hyderabad, Telangana"
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#9A9AAE] mb-1">Schema.org Local Business Type</label>
              <select
                value={seoSettings.localBusinessType}
                onChange={(e) => setSeoSettings((s) => ({ ...s, localBusinessType: e.target.value }))}
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
              >
                <option value="LocalBusiness">LocalBusiness</option>
                <option value="Store">Store / Retail</option>
                <option value="ClothingStore">ClothingStore</option>
                <option value="ElectronicsStore">ElectronicsStore</option>
                <option value="GroceryStore">GroceryStore</option>
                <option value="Restaurant">Restaurant</option>
                <option value="Hotel">Hotel</option>
                <option value="BeautySalon">BeautySalon</option>
                <option value="HealthClub">Gym / HealthClub</option>
                <option value="ProfessionalService">ProfessionalService</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#9A9AAE] mb-1">Google Maps Location URL</label>
              <input
                type="url"
                value={seoSettings.googleMapsUrl}
                onChange={(e) => setSeoSettings((s) => ({ ...s, googleMapsUrl: e.target.value }))}
                placeholder="https://maps.google.com/?q=..."
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#9A9AAE] mb-1">Google Business Profile Link</label>
              <input
                type="url"
                value={seoSettings.gbpProfileUrl}
                onChange={(e) => setSeoSettings((s) => ({ ...s, gbpProfileUrl: e.target.value }))}
                placeholder="https://g.page/r/..."
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
              />
            </div>
          </div>

          {gscNotice && (
            <p className="text-[11px] text-[#8E8EA2] bg-[#09090D] border border-[#1E1E2B] rounded p-3">
              <strong>Google Search Console API Disclosure:</strong> {gscNotice}
            </p>
          )}

          <button
            type="submit"
            disabled={savingSeo}
            className="px-5 py-2 rounded bg-gold-gradient text-[#08080A] font-semibold"
          >
            {savingSeo ? 'Saving & Recalculating Score...' : 'Save SEO & Local Schema Settings'}
          </button>
        </form>

        {/* Live Gemini AI SEO Assistant */}
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D4AF37]" />
            <span>Live Gemini AI SEO Assistant</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            <select
              value={aiSeoTask}
              onChange={(e) => setAiSeoTask(e.target.value as typeof aiSeoTask)}
              className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
            >
              <option value="keywords">Local SEO Keyword Ideas</option>
              <option value="meta_copy">Original Page & Product Meta Descriptions</option>
              <option value="content_ideas">Helpful Local Content & FAQ Ideas</option>
              <option value="audit_fixes">Detect & Fix On-Page SEO Weaknesses</option>
            </select>
            <input
              type="text"
              value={aiSeoCity}
              onChange={(e) => setAiSeoCity(e.target.value)}
              placeholder="Target City / Area"
              className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
            />
            <button
              type="button"
              disabled={aiSeoBusy}
              onClick={handleRunAiSeo}
              className="px-4 py-2 rounded bg-gold-gradient text-[#08080A] font-semibold"
            >
              {aiSeoBusy ? 'Analyzing with Gemini...' : 'Generate Ethical SEO Plan'}
            </button>
          </div>
          {aiSeoOutput && (
            <pre className="whitespace-pre-wrap font-sans text-xs text-[#D5D5E2] rounded-lg border border-[#1E1E2B] bg-[#09090D] p-4 leading-relaxed">
              {aiSeoOutput}
            </pre>
          )}
        </div>
      </div>
    );
  }

  // ================= TAB 3: LOCKED PROPOSALS & NEWSLETTER SUBSCRIBERS =================
  if (activeTab === 'proposals_quotes') {
    return (
      <div className="space-y-6 text-xs">
        {/* Full-featured Luxury Proposal & Future Preview Engine */}
        <ProposalManager
          onNotify={onNotify}
          onOpenCustomerView={(token) => {
            window.history.pushState({}, '', `/proposal/${token}`);
            window.location.reload();
          }}
        />

        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#D4AF37]" />
              <span>Legacy Pricing Cart Quotations ({proposalsList.length})</span>
            </h3>
            <span className="text-[11px] text-[#8E8EA2]">
              Accepted quotations lock all line-item prices & 18% GST permanently.
            </span>
          </div>

          {proposalsList.length === 0 ? (
            <p className="text-[#8E8EA2]">
              No quotations saved yet. Build a package in the Pricing Cart on the Vijay Visuals homepage to generate a server-validated locked quotation.
            </p>
          ) : (
            <div className="space-y-3">
              {proposalsList.map((prop) => {
                let items: Array<{ name: string; lineTotalInr: number; cycleLabel: string }> = [];
                try {
                  items = JSON.parse(prop.itemsJson || '[]');
                } catch {}
                return (
                  <div key={prop.id} className="rounded-lg border border-[#1F1F2D] bg-[#09090D] p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono-tabular font-semibold text-[#ECC86A]">
                          {prop.proposalNumber} · {prop.businessName}
                        </p>
                        <p className="text-[11px] text-[#9A9AAE]">
                          {prop.customerName} ({prop.customerEmail}) · Billing: {prop.billingPeriod} · Status:{' '}
                          <span className="uppercase font-semibold text-white">{prop.status}</span>
                        </p>
                      </div>
                      <div className="text-right font-mono-tabular">
                        <p className="text-sm font-bold text-white">₹{prop.grandTotalInr.toLocaleString('en-IN')}</p>
                        <p className="text-[10px] text-[#8E8EA2]">
                          One-Time ₹{prop.oneTimeSubtotalInr.toLocaleString('en-IN')} + Recurring ₹
                          {prop.recurringSubtotalInr.toLocaleString('en-IN')} + 18% GST ₹
                          {prop.gstInr.toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                    <div className="divide-y divide-[#1A1A26] border-t border-[#1A1A26] pt-2">
                      {items.map((it, idx) => (
                        <div key={idx} className="py-1 flex justify-between text-[11px]">
                          <span className="text-[#C8C8D8]">
                            {it.name} <span className="text-[#7E7E92]">({it.cycleLabel})</span>
                          </span>
                          <span className="font-mono-tabular text-white">₹{it.lineTotalInr.toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {prop.status !== 'accepted' && prop.status !== 'converted' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/proposals/${prop.id}/status`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: 'accepted' }),
                            });
                            onNotify(`Proposal ${prop.proposalNumber} accepted & price-locked.`);
                            loadProposalsAndSubscribers();
                          }}
                          className="px-3 py-1.5 rounded bg-emerald-600 text-white font-semibold"
                        >
                          Accept & Lock Quotation
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="px-3 py-1.5 rounded border border-[#2A2A38] text-[#D5D5E2] hover:border-[#D4AF37]"
                      >
                        Print / Save PDF
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">
            Consent-Verified Newsletter Subscribers ({subscribers.length})
          </h3>
          {subscribers.length === 0 ? (
            <p className="text-[#8E8EA2]">No newsletter subscribers yet. Customers can opt in on your live storefront footer.</p>
          ) : (
            <div className="divide-y divide-[#1D1D28]">
              {subscribers.map((s) => (
                <div key={s.id} className="py-2 flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">{s.email}</p>
                    <p className="text-[11px] text-[#8E8EA2]">
                      {s.name || 'Subscriber'} · Source: {s.source} · Explicit Consent: {s.consentGiven ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <span className="text-[11px] text-[#8E8EA2]">{new Date(s.createdAt).toLocaleDateString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ================= TAB 4: SUBSCRIPTION, TRANSPARENT COSTS & DATA EXPORT =================
  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
              <span>Transparent Third-Party Costs, Renewal & Subscription Expiry Policy</span>
            </h3>
            <p className="text-[11px] text-[#9A9AAE] mt-1">
              Full data ownership with zero hidden lock-in. Export your entire business database at any time.
            </p>
          </div>
          <button
            type="button"
            disabled={exporting}
            onClick={handleExportData}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-gold-gradient text-[#08080A] font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exporting ? 'Preparing Backup...' : 'Export Full Business Data (JSON)'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-[#1E1E2B] bg-[#09090D] p-4 space-y-2">
            <p className="font-semibold text-[#ECC86A]">Clear Separation of Platform vs. Pass-Through Costs</p>
            <ul className="space-y-1.5 text-[#B8B8C8]">
              <li>• <strong>Domain Registration & Annual Renewal:</strong> Paid directly to your registrar (Cloudflare, GoDaddy, Namecheap) in your own ownership.</li>
              <li>• <strong>Hosting & SSL/HTTPS:</strong> Cloudflare Pages edge hosting & SSL; enterprise custom server hosting billed per actual usage.</li>
              <li>• <strong>Payment Gateway MDR:</strong> Standard Cashfree / UPI / Card transaction charges deducted directly by the gateway.</li>
              <li>• <strong>AI Credits, Storage & Messaging:</strong> Gemini AI credit top-ups, extra R2 storage, and Meta WhatsApp Business API / SMS charges are metered transparently.</li>
            </ul>
          </div>
          <div className="rounded-lg border border-[#1E1E2B] bg-[#09090D] p-4 space-y-2">
            <p className="font-semibold text-[#ECC86A]">Subscription Expiry & Data Retention Policy</p>
            <ul className="space-y-1.5 text-[#B8B8C8]">
              <li>• <strong>30-Day Grace Period:</strong> If an optional recurring add-on expires, your core storefront data is never deleted immediately.</li>
              <li>• <strong>Read-Only Export Access:</strong> Business owners can always export products, orders, CRM leads, invoices, and domain records in JSON/CSV.</li>
              <li>• <strong>Your Domain Stays Yours:</strong> Because domains are registered in your own registrar account, you can repoint DNS anytime without restriction.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
