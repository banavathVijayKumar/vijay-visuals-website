import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  Check,
  Download,
  Globe,
  History,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { apiFetch, getAuthAccessToken } from '../lib/api';

interface AdminDomainRow {
  id: number;
  tenantId: number;
  tenantName: string;
  tenantSlug: string;
  ownerName: string;
  ownerEmail: string;
  domainName: string;
  extension: string;
  domainType: string;
  isPrimary: boolean;
  wwwPreference: string;
  wwwStatus: string;
  registrarName: string;
  connectionStatus: string;
  workflowStep: number;
  approvalStatus: string;
  dnsStatus: string;
  sslStatus: string;
  expiryDate: string;
  renewalDate: string;
  renewalStatus: string;
  renewalPaymentStatus: string;
  assignedSupportStaff: string;
  lastHealthStatus: string;
  dnsErrorDetail: string;
  suspendedReason: string;
  recentErrors: Array<{ id: number; title: string; details: string; createdAt: string }>;
}

interface PricingConfigRow {
  id: number;
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
}

interface AdminDomainManagementProps {
  onNotify: (msg: string) => void;
}

export const AdminDomainManagement: React.FC<AdminDomainManagementProps> = ({ onNotify }) => {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [domains, setDomains] = useState<AdminDomainRow[]>([]);
  const [pricing, setPricing] = useState<PricingConfigRow[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    live: 0,
    pendingDns: 0,
    sslActive: 0,
    expiringSoon: 0,
    suspended: 0,
  });
  const [guardrail, setGuardrail] = useState('');
  const [scanning, setScanning] = useState(false);

  // Selected domain for activity drawer & action inputs
  const [activityDomain, setActivityDomain] = useState<AdminDomainRow | null>(null);
  const [activityLogs, setActivityLogs] = useState<{
    events: Array<{ id: number; actorEmail: string; severity: string; title: string; details: string; createdAt: string }>;
    notifications: Array<{ id: number; title: string; message: string; createdAt: string }>;
  } | null>(null);
  const [staffDrafts, setStaffDrafts] = useState<Record<number, string>>({});
  const [reasonDrafts, setReasonDrafts] = useState<Record<number, string>>({});
  const [renewalDateDrafts, setRenewalDateDrafts] = useState<Record<number, string>>({});

  // Pricing editor drafts
  const [pricingDrafts, setPricingDrafts] = useState<Record<string, PricingConfigRow>>({});
  const [savingExt, setSavingExt] = useState<string | null>(null);

  const loadAdminDomains = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('q', search.trim());
      if (statusFilter !== 'all') qs.set('status', statusFilter);

      const res = await apiFetch<{
        domains: AdminDomainRow[];
        pricing: PricingConfigRow[];
        summary: typeof summary;
        ownershipGuardrail: string;
      }>(`/api/admin/domains?${qs.toString()}`);

      setDomains(res.domains || []);
      setPricing(res.pricing || []);
      if (res.summary) setSummary(res.summary);
      setGuardrail(res.ownershipGuardrail || '');

      const sMap: Record<number, string> = {};
      (res.domains || []).forEach((d) => {
        sMap[d.id] = d.assignedSupportStaff || '';
      });
      setStaffDrafts(sMap);

      const pMap: Record<string, PricingConfigRow> = {};
      (res.pricing || []).forEach((p) => {
        pMap[p.extension] = { ...p };
      });
      setPricingDrafts(pMap);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load Super Admin domain records.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, onNotify]);

  useEffect(() => {
    loadAdminDomains();
  }, [loadAdminDomains]);

  const runAction = async (
    dom: AdminDomainRow,
    action: string,
    extra: Record<string, string> = {}
  ) => {
    try {
      await apiFetch(`/api/admin/domains/${dom.id}/action`, {
        method: 'PATCH',
        body: JSON.stringify({
          action,
          reason: reasonDrafts[dom.id] || '',
          ...extra,
        }),
      });
      onNotify(`Action "${action.replace(/_/g, ' ')}" completed for ${dom.domainName}.`);
      await loadAdminDomains();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Super Admin domain action failed.');
    }
  };

  const openActivity = async (dom: AdminDomainRow) => {
    setActivityDomain(dom);
    try {
      const res = await apiFetch<{
        events: NonNullable<typeof activityLogs>['events'];
        notifications: NonNullable<typeof activityLogs>['notifications'];
      }>(`/api/admin/domains/${dom.id}/activity`);
      setActivityLogs(res);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load domain activity.');
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const token = await getAuthAccessToken();
      const res = await fetch(`/api/admin/domains/export?format=${format}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vijay-visuals-domains.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onNotify(`Exported all domain records as ${format.toUpperCase()}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to export domain records.');
    }
  };

  return (
    <div className="space-y-6 text-xs">
      {/* Governance Guardrail Banner */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 max-w-3xl">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-emerald-100 leading-relaxed">
            {guardrail ||
              'Super Admin Governance Rule: Super Admin can monitor, approve, send reminders/DNS instructions, assign support staff, or suspend/disconnect with full audit trail, and can NEVER take ownership of a customer’s domain.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={scanning}
            onClick={async () => {
              setScanning(true);
              try {
                const res = await apiFetch<{ scannedCount: number; remindersCreated: number }>(
                  '/api/admin/domains/run-renewal-scan',
                  { method: 'POST' }
                );
                onNotify(`Scanned ${res.scannedCount} domain(s); created ${res.remindersCreated} renewal reminder(s).`);
                loadAdminDomains();
              } catch (err) {
                onNotify(err instanceof Error ? err.message : 'Renewal scan failed.');
              } finally {
                setScanning(false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#D4AF37]/50 text-[#ECC86A] hover:bg-[#19170E]"
          >
            <Bell className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>Run 30/15/7/3/0d Renewal Scan</span>
          </button>
          <button
            type="button"
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#2C2C3C] text-white hover:border-[#D4AF37]"
          >
            <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => handleExport('json')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#2C2C3C] text-white hover:border-[#D4AF37]"
          >
            <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Domains', val: summary.total, color: 'text-white' },
          { label: 'Verified Live', val: summary.live, color: 'text-emerald-400' },
          { label: 'Pending / Error DNS', val: summary.pendingDns, color: 'text-amber-300' },
          { label: 'SSL Active', val: summary.sslActive, color: 'text-emerald-300' },
          { label: 'Expiring / Expired', val: summary.expiringSoon, color: 'text-rose-300' },
          { label: 'Suspended', val: summary.suspended, color: 'text-rose-400' },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border border-[#20202E] bg-[#0D0D13] p-3.5">
            <p className="text-[10px] text-[#8E8EA2]">{k.label}</p>
            <p className={`font-mono-tabular text-lg font-bold mt-1 ${k.color}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-[#7C7C92] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by domain, business name, customer email, or registrar..."
            className="w-full pl-9 pr-3 py-2 rounded-md border border-[#2A2A38] bg-[#09090D] text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-[#2A2A38] bg-[#09090D] px-3 py-2 text-white"
        >
          <option value="all">All Statuses</option>
          <option value="live">Live</option>
          <option value="dns_pending">DNS Pending</option>
          <option value="error">DNS / SSL Error</option>
          <option value="expiring_soon">Expiring Soon</option>
          <option value="expired">Expired</option>
          <option value="suspended">Suspended</option>
        </select>
        <button
          type="button"
          onClick={loadAdminDomains}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#2A2A38] text-[#D4D4E0] hover:border-[#D4AF37]"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Customer Domains Table / Cards */}
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#1E1E2B] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#D4AF37]" />
            <span>All Customer Domains ({domains.length})</span>
          </h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[#8E8EA2]">Loading all customer domains...</div>
        ) : domains.length === 0 ? (
          <div className="p-8 text-center text-[#8E8EA2]">No customer domains match your filter.</div>
        ) : (
          <div className="divide-y divide-[#1D1D28]">
            {domains.map((dom) => (
              <div key={dom.id} className="p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-tabular text-sm font-bold text-white">{dom.domainName}</span>
                      <span className="px-2 py-0.5 rounded bg-[#181822] text-[#ECC86A] text-[10px]">
                        {dom.tenantName} (/site/{dom.tenantSlug})
                      </span>
                      <span className="text-[10px] uppercase font-mono-tabular text-sky-300">
                        {dom.connectionStatus.replace(/_/g, ' ')} (Step {dom.workflowStep}/12)
                      </span>
                    </div>
                    <p className="text-[11px] text-[#9E9EB2]">
                      Owner: {dom.ownerName} ({dom.ownerEmail || 'Unlinked'}) · Registrar: {dom.registrarName}
                    </p>
                    <div className="flex flex-wrap gap-3 text-[11px] font-mono-tabular">
                      <span className={dom.dnsStatus === 'verified' ? 'text-emerald-400' : 'text-amber-300'}>
                        DNS: {dom.dnsStatus.toUpperCase()}
                      </span>
                      <span className={dom.sslStatus === 'active' ? 'text-emerald-400' : 'text-amber-300'}>
                        SSL: {dom.sslStatus.toUpperCase()}
                      </span>
                      <span className={dom.lastHealthStatus === 'healthy' ? 'text-emerald-400' : 'text-[#A5A5B8]'}>
                        Health: {dom.lastHealthStatus.toUpperCase()}
                      </span>
                      <span className="text-[#C4C4D4]">
                        Expiry: {dom.expiryDate || 'Not set'} ({dom.renewalStatus.replace(/_/g, ' ')})
                      </span>
                    </div>
                    {dom.dnsErrorDetail && (
                      <p className="text-[11px] text-amber-300 flex items-start gap-1 pt-0.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{dom.dnsErrorDetail}</span>
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => openActivity(dom)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#2C2C3C] text-white hover:border-[#D4AF37]"
                  >
                    <History className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Logs & History ({dom.recentErrors.length} err)</span>
                  </button>
                </div>

                {/* Support Staff Assignment, Reason Input & Admin Governance Controls */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={staffDrafts[dom.id] ?? ''}
                      onChange={(e) => setStaffDrafts((p) => ({ ...p, [dom.id]: e.target.value }))}
                      placeholder="Assign support staff email..."
                      className="flex-1 rounded border border-[#262634] bg-[#08080C] px-2.5 py-1.5 text-[11px] text-white"
                    />
                    <button
                      type="button"
                      onClick={() => runAction(dom, 'assign_staff', { staffEmail: staffDrafts[dom.id] || '' })}
                      className="px-2.5 py-1.5 rounded border border-[#2C2C3C] text-[#ECC86A] hover:border-[#D4AF37]"
                      title="Assign support staff"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={reasonDrafts[dom.id] ?? ''}
                    onChange={(e) => setReasonDrafts((p) => ({ ...p, [dom.id]: e.target.value }))}
                    placeholder="Audit reason / support note (required for reject/suspend)..."
                    className="rounded border border-[#262634] bg-[#08080C] px-2.5 py-1.5 text-[11px] text-white"
                  />

                  <div className="flex gap-1.5">
                    <input
                      type="date"
                      value={renewalDateDrafts[dom.id] ?? dom.expiryDate}
                      onChange={(e) => setRenewalDateDrafts((p) => ({ ...p, [dom.id]: e.target.value }))}
                      className="flex-1 rounded border border-[#262634] bg-[#08080C] px-2 py-1.5 text-[11px] text-white"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        runAction(dom, 'confirm_registrar_renewal', {
                          newExpiryDate: renewalDateDrafts[dom.id] || dom.expiryDate,
                        })
                      }
                      className="px-2.5 py-1.5 rounded border border-emerald-500/40 text-emerald-300 text-[11px] whitespace-nowrap"
                    >
                      Confirm Renewal
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => runAction(dom, 'approve_manual')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-emerald-500/40 text-emerald-300 text-[11px]"
                  >
                    <Check className="w-3 h-3" /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => runAction(dom, 'reject_manual')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-rose-500/40 text-rose-300 text-[11px]"
                  >
                    <XCircle className="w-3 h-3" /> Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => runAction(dom, 'send_dns_instructions')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#2C2C3C] text-white text-[11px] hover:border-[#D4AF37]"
                  >
                    <Send className="w-3 h-3 text-[#D4AF37]" /> Send DNS Instructions
                  </button>
                  <button
                    type="button"
                    onClick={() => runAction(dom, 'send_renewal_reminder')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-amber-500/40 text-amber-300 text-[11px]"
                  >
                    <Bell className="w-3 h-3" /> Send Renewal Reminder
                  </button>
                  {dom.connectionStatus === 'suspended' || dom.connectionStatus === 'disconnected' ? (
                    <button
                      type="button"
                      onClick={() => runAction(dom, 'reactivate')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-emerald-500/40 text-emerald-300 text-[11px]"
                    >
                      Reactivate
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => runAction(dom, 'suspend')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-rose-500/40 text-rose-300 text-[11px]"
                      >
                        <ShieldAlert className="w-3 h-3" /> Suspend
                      </button>
                      <button
                        type="button"
                        onClick={() => runAction(dom, 'disconnect')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#3A2830] text-rose-200 text-[11px]"
                      >
                        Disconnect
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity & Error Logs Modal */}
      {activityDomain && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-xl border border-[#2A2A38] bg-[#0F0F16] p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white font-mono-tabular">{activityDomain.domainName}</h3>
                <p className="text-[11px] text-[#8E8EA2]">Immutable Domain Activity History & Error Logs</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActivityDomain(null);
                  setActivityLogs(null);
                }}
                className="px-3 py-1 rounded border border-[#2C2C3C] text-[#A5A5B8] hover:text-white"
              >
                Close
              </button>
            </div>
            {!activityLogs ? (
              <p className="text-[#8E8EA2]">Loading activity...</p>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {activityLogs.events.map((ev) => (
                  <div key={ev.id} className="rounded-lg border border-[#1E1E2B] bg-[#09090D] p-3 space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-white">{ev.title}</span>
                      <span className="text-[10px] uppercase text-[#ECC86A]">{ev.severity}</span>
                    </div>
                    {ev.details && <p className="text-[#B4B4C6]">{ev.details}</p>}
                    <p className="text-[10px] text-[#7D7D92]">
                      {ev.actorEmail} · {new Date(ev.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Super Admin Configurable Domain & Package Pricing Matrix */}
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#D4AF37]" />
            <span>Super Admin Domain, Hosting & Management Fee Configuration</span>
          </h3>
          <p className="text-[11px] text-[#9E9EB2] mt-0.5">
            All fees are itemized separately for customers with GST%. Changes take effect immediately across Customer & Business Owner Domain Centers.
          </p>
        </div>

        {/* Mobile & Tablet Stacked Pricing Cards (< lg) */}
        <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pricing.map((row) => {
            const draft = pricingDrafts[row.extension] || row;
            const updateField = (field: keyof PricingConfigRow, val: number) => {
              setPricingDrafts((prev) => ({
                ...prev,
                [row.extension]: { ...draft, [field]: val },
              }));
            };
            const saveRow = async () => {
              setSavingExt(row.extension);
              try {
                await apiFetch(`/api/admin/domains/pricing/${encodeURIComponent(row.extension)}`, {
                  method: 'PUT',
                  body: JSON.stringify({
                    registrationFeeInr: draft.registrationFeeInr,
                    renewalFeeInr: draft.renewalFeeInr,
                    transferFeeInr: draft.transferFeeInr,
                    managementServiceFeeInr: draft.managementServiceFeeInr,
                    hostingFeeInr: draft.hostingFeeInr,
                    sslFeeInr: draft.sslFeeInr,
                    websiteDevFeeInr: draft.websiteDevFeeInr,
                    gstPct: draft.gstPct,
                    isPromotional: draft.isPromotional,
                    promoNote: draft.promoNote,
                  }),
                });
                onNotify(`Saved updated pricing for ${row.extension}.`);
                await loadAdminDomains();
              } catch (err) {
                onNotify(err instanceof Error ? err.message : 'Unable to save pricing.');
              } finally {
                setSavingExt(null);
              }
            };
            return (
              <div
                key={`card-${row.extension}`}
                className="rounded-lg border border-[#222230] bg-[#0A0A0F] p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono-tabular text-sm font-bold text-[#ECC86A]">{row.extension}</span>
                  <button
                    type="button"
                    disabled={savingExt === row.extension}
                    onClick={saveRow}
                    className="px-3 py-1 rounded bg-gold-gradient text-[#08080A] text-[11px] font-semibold"
                  >
                    {savingExt === row.extension ? 'Saving...' : `Save ${row.extension}`}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {(
                    [
                      ['registrationFeeInr', '1st Yr (₹)'],
                      ['renewalFeeInr', 'Renewal (₹)'],
                      ['transferFeeInr', 'Transfer (₹)'],
                      ['hostingFeeInr', 'Hosting/mo (₹)'],
                      ['managementServiceFeeInr', 'Mgmt/yr (₹)'],
                      ['websiteDevFeeInr', 'Web Dev (₹)'],
                      ['gstPct', 'GST %'],
                    ] as Array<[keyof PricingConfigRow, string]>
                  ).map(([field, label]) => (
                    <label key={field} className="space-y-1">
                      <span className="block text-[10px] text-[#8E8EA2]">{label}</span>
                      <input
                        type="number"
                        value={Number(draft[field])}
                        onChange={(e) => updateField(field, Number(e.target.value))}
                        className="w-full rounded border border-[#262634] bg-[#08080C] px-2 py-1 font-mono-tabular text-white"
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Matrix (>= lg) */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-[#0A0A0F] text-[#8E8EA2] text-left">
              <tr>
                <th className="py-2 px-2">TLD</th>
                <th className="py-2 px-2">1st Yr (₹)</th>
                <th className="py-2 px-2">Renewal (₹)</th>
                <th className="py-2 px-2">Transfer (₹)</th>
                <th className="py-2 px-2">Hosting/mo (₹)</th>
                <th className="py-2 px-2">Mgmt/yr (₹)</th>
                <th className="py-2 px-2">Web Dev (₹)</th>
                <th className="py-2 px-2">GST%</th>
                <th className="py-2 px-2 text-right">Save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C1C28]">
              {pricing.map((row) => {
                const draft = pricingDrafts[row.extension] || row;
                const updateField = (field: keyof PricingConfigRow, val: number) => {
                  setPricingDrafts((prev) => ({
                    ...prev,
                    [row.extension]: { ...draft, [field]: val },
                  }));
                };
                return (
                  <tr key={row.extension}>
                    <td className="py-2 px-2 font-mono-tabular font-bold text-[#ECC86A]">{row.extension}</td>
                    {(
                      [
                        'registrationFeeInr',
                        'renewalFeeInr',
                        'transferFeeInr',
                        'hostingFeeInr',
                        'managementServiceFeeInr',
                        'websiteDevFeeInr',
                        'gstPct',
                      ] as Array<keyof PricingConfigRow>
                    ).map((field) => (
                      <td key={field} className="py-2 px-1.5">
                        <input
                          type="number"
                          value={Number(draft[field])}
                          onChange={(e) => updateField(field, Number(e.target.value))}
                          className="w-20 rounded border border-[#262634] bg-[#08080C] px-2 py-1 font-mono-tabular text-white"
                        />
                      </td>
                    ))}
                    <td className="py-2 px-2 text-right">
                      <button
                        type="button"
                        disabled={savingExt === row.extension}
                        onClick={async () => {
                          setSavingExt(row.extension);
                          try {
                            await apiFetch(`/api/admin/domains/pricing/${encodeURIComponent(row.extension)}`, {
                              method: 'PUT',
                              body: JSON.stringify({
                                registrationFeeInr: draft.registrationFeeInr,
                                renewalFeeInr: draft.renewalFeeInr,
                                transferFeeInr: draft.transferFeeInr,
                                managementServiceFeeInr: draft.managementServiceFeeInr,
                                hostingFeeInr: draft.hostingFeeInr,
                                sslFeeInr: draft.sslFeeInr,
                                websiteDevFeeInr: draft.websiteDevFeeInr,
                                gstPct: draft.gstPct,
                                isPromotional: draft.isPromotional,
                                promoNote: draft.promoNote,
                              }),
                            });
                            onNotify(`Saved updated pricing for ${row.extension}.`);
                            await loadAdminDomains();
                          } catch (err) {
                            onNotify(err instanceof Error ? err.message : 'Unable to save pricing.');
                          } finally {
                            setSavingExt(null);
                          }
                        }}
                        className="px-2.5 py-1 rounded bg-gold-gradient text-[#08080A] font-semibold"
                      >
                        {savingExt === row.extension ? '...' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
