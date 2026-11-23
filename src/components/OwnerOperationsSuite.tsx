import React, { useCallback, useEffect, useState } from 'react';
import {
  Building,
  Calendar,
  Check,
  CreditCard,
  Download,
  FileSpreadsheet,
  Globe,
  Plug,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { initiateCashfreePlatformCheckout } from '../lib/cashfreeClient';
import { PLUGIN_CATALOG } from '../data/content';
import {
  AppointmentRecord,
  CrmLeadRecord,
  FinanceRecordItem,
  PlatformPaymentRecord,
  PlatformPlanRecord,
  SellerPayoutAccountRecord,
  SellerTransferRecord,
  StaffAttendanceRecord,
  StaffMemberRecord,
  SupplierRecord,
  TenantPluginRecord,
  TenantRecord,
  WarehouseRecord,
} from '../types/platform';

export type OperationsTab = 'payments' | 'crm_bookings' | 'finance' | 'supply_hr' | 'plugins_dns';

interface OwnerOperationsSuiteProps {
  tenant: TenantRecord;
  staff: StaffMemberRecord[];
  activeSection: OperationsTab;
  onRefreshTenant: () => void;
  onNotify: (msg: string) => void;
}



export const OwnerOperationsSuite: React.FC<OwnerOperationsSuiteProps> = ({
  tenant,
  staff,
  activeSection,
  onRefreshTenant,
  onNotify,
}) => {
  const [loading, setLoading] = useState(false);

  // Payments & Settlements State
  const [cfStatus, setCfStatus] = useState<{
    configured: boolean;
    mode: string;
    message: string;
    webhookConfigured: boolean;
  } | null>(null);
  const [plans, setPlans] = useState<PlatformPlanRecord[]>([]);
  const [platformPayments, setPlatformPayments] = useState<PlatformPaymentRecord[]>([]);
  const [sellerAccount, setSellerAccount] = useState<SellerPayoutAccountRecord | null>(null);
  const [transfers, setTransfers] = useState<SellerTransferRecord[]>([]);
  const [codSummary, setCodSummary] = useState({ codCollectedInr: 0, codPendingInr: 0 });
  const [kycLegalName, setKycLegalName] = useState(tenant.name);
  const [kycPan, setKycPan] = useState('');
  const [kycGstin, setKycGstin] = useState('');
  const [kycHolder, setKycHolder] = useState('');
  const [kycLast4, setKycLast4] = useState('');
  const [kycIfsc, setKycIfsc] = useState('');

  // CRM & Bookings State (Module 11 & 15)
  const [leads, setLeads] = useState<CrmLeadRecord[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadSource, setLeadSource] = useState('whatsapp');
  const [leadConsent, setLeadConsent] = useState(true);
  const [leadFollowup, setLeadFollowup] = useState('');

  // Finance & GST State (Module 12)
  const [financeRecords, setFinanceRecords] = useState<FinanceRecordItem[]>([]);
  const [financeSummary, setFinanceSummary] = useState({
    grossSalesInr: 0,
    totalExpensesInr: 0,
    totalCreditNotesInr: 0,
    netProfitEstimateInr: 0,
    inputGstInr: 0,
    estimatedOutputGstInr: 0,
  });
  const [finType, setFinType] = useState<'expense' | 'quotation' | 'credit_note'>('expense');
  const [finParty, setFinParty] = useState('');
  const [finCat, setFinCat] = useState('Operations');
  const [finAmount, setFinAmount] = useState(2500);
  const [finGstRate, setFinGstRate] = useState(18);
  const [finNotes, setFinNotes] = useState('');

  // Supply Chain & HR State (Module 13 & 14)
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [attendance, setAttendance] = useState<StaffAttendanceRecord[]>([]);
  const [whName, setWhName] = useState('');
  const [whCity, setWhCity] = useState('Hyderabad');
  const [whCap, setWhCap] = useState(1000);
  const [supName, setSupName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supGstin, setSupGstin] = useState('');
  const [attStaffId, setAttStaffId] = useState<number>(staff[0]?.id || 0);
  const [attStatus, setAttStatus] = useState<'present' | 'absent' | 'leave' | 'half_day'>('present');
  const [attSalary, setAttSalary] = useState(0);

  // Plugins State (Module 21)
  const [installedPlugins, setInstalledPlugins] = useState<TenantPluginRecord[]>([]);
  const [pluginDraftConfig, setPluginDraftConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    if (staff[0] && !attStaffId) setAttStaffId(staff[0].id);
  }, [staff, attStaffId]);

  const loadSectionData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeSection === 'payments') {
        const [payoutRes, histRes, plansRes] = await Promise.all([
          apiFetch<{
            account: SellerPayoutAccountRecord | null;
            transfers: SellerTransferRecord[];
            codSummary: { codCollectedInr: number; codPendingInr: number };
            cashfree?: { configured: boolean; mode: string; message: string; webhookConfigured: boolean };
            razorpay?: { configured: boolean; mode: string; message: string; webhookConfigured: boolean };
          }>(`/api/owner/tenants/${tenant.id}/payout-account`),
          apiFetch<{ payments: PlatformPaymentRecord[] }>('/api/payments/platform/history'),
          apiFetch<{ plans: PlatformPlanRecord[] }>('/api/plans'),
        ]);
        setSellerAccount(payoutRes.account);
        setTransfers(payoutRes.transfers);
        setCodSummary(payoutRes.codSummary);
        setCfStatus(payoutRes.cashfree || payoutRes.razorpay || null);
        setPlatformPayments(histRes.payments);
        setPlans(plansRes.plans);
        if (payoutRes.account) {
          setKycLegalName(payoutRes.account.legalBusinessName);
          setKycPan(payoutRes.account.panNumber);
          setKycGstin(payoutRes.account.gstin);
          setKycHolder(payoutRes.account.bankAccountHolder);
          setKycLast4(payoutRes.account.bankAccountLast4);
          setKycIfsc(payoutRes.account.ifscCode);
        }
      } else if (activeSection === 'crm_bookings') {
        const [crmRes, apptRes] = await Promise.all([
          apiFetch<{ leads: CrmLeadRecord[] }>(`/api/owner/tenants/${tenant.id}/crm`),
          apiFetch<{ appointments: AppointmentRecord[] }>(`/api/owner/tenants/${tenant.id}/appointments`),
        ]);
        setLeads(crmRes.leads);
        setAppointments(apptRes.appointments);
      } else if (activeSection === 'finance') {
        const finRes = await apiFetch<{
          records: FinanceRecordItem[];
          summary: typeof financeSummary;
        }>(`/api/owner/tenants/${tenant.id}/finance`);
        setFinanceRecords(finRes.records);
        setFinanceSummary(finRes.summary);
      } else if (activeSection === 'supply_hr') {
        const supRes = await apiFetch<{
          warehouses: WarehouseRecord[];
          suppliers: SupplierRecord[];
          attendance: StaffAttendanceRecord[];
        }>(`/api/owner/tenants/${tenant.id}/supply-chain`);
        setWarehouses(supRes.warehouses);
        setSuppliers(supRes.suppliers);
        setAttendance(supRes.attendance);
      } else if (activeSection === 'plugins_dns') {
        const plugRes = await apiFetch<{ installed: TenantPluginRecord[] }>(
          `/api/owner/tenants/${tenant.id}/plugins`
        );
        setInstalledPlugins(plugRes.installed);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load operations module.');
    } finally {
      setLoading(false);
    }
  }, [activeSection, tenant.id, onNotify]);

  useEffect(() => {
    loadSectionData();
  }, [loadSectionData]);

  // Cashfree Checkout for Vijay Visuals Platform Packages
  const handleBuyPlatformPlan = async (plan: PlatformPlanRecord) => {
    try {
      await initiateCashfreePlatformCheckout({
        planCode: plan.code,
        planName: `${plan.name} (₹${plan.priceInr.toLocaleString('en-IN')})`,
        websiteId: String(tenant.id),
        publishWebsite: true,
        onSuccess: async () => {
          onNotify(`Payment verified! ${plan.name} license activated.`);
          onRefreshTenant();
          loadSectionData();
        },
        onError: (err) => {
          onNotify(err.message || 'Payment verification failed.');
        },
        onDismiss: () => {
          onNotify('Payment checkout was closed.');
        },
      });
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to initialize Cashfree checkout.');
    }
  };

  const handleSaveSellerKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/owner/tenants/${tenant.id}/payout-account`, {
        method: 'PUT',
        body: JSON.stringify({
          legalBusinessName: kycLegalName,
          panNumber: kycPan,
          gstin: kycGstin,
          bankAccountHolder: kycHolder,
          bankAccountLast4: kycLast4,
          ifscCode: kycIfsc,
        }),
      });
      onNotify('Seller bank details submitted for Cashfree Easy Split verification.');
      loadSectionData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to save KYC details.');
    }
  };

  const handleExportFinanceCsv = () => {
    const header = ['Reference', 'Type', 'Party', 'Category', 'Amount_INR', 'GST_Pct', 'GST_INR', 'Status', 'Date'];
    const rows = financeRecords.map((r) => [
      r.referenceNo,
      r.recordType,
      `"${r.partyName.replace(/"/g, '""')}"`,
      r.category,
      r.amountInr,
      r.gstRatePct,
      r.gstAmountInr,
      r.status,
      r.createdAt,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tenant.slug}-gst-finance-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Downloaded GST & Finance CSV report.');
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-8 text-center text-xs text-[#9E9EB2]">
        Loading {activeSection.replace('_', ' & ')} data from database...
      </div>
    );
  }

  // ==================== 1. PAYMENTS & CASHFREE SETTLEMENTS ====================
  if (activeSection === 'payments') {
    return (
      <div className="space-y-6">
        {/* Status Banner */}
        <div className="rounded-xl border border-[#2A2A38] bg-[#0D0D13] p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#ECC86A] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              <span>Cashfree Payment Architecture &amp; Settlement Management</span>
            </p>
            <p className="text-xs text-[#A3A3B5] mt-1">
              {cfStatus?.message || 'Checking server-side Cashfree configuration...'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`px-3 py-1 rounded border font-mono-tabular ${
                cfStatus?.configured
                  ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                  : 'border-amber-500/40 bg-amber-950/20 text-amber-300'
              }`}
            >
              Mode: {(cfStatus?.mode || 'sandbox').toUpperCase()}
            </span>
            <span className="px-3 py-1 rounded border border-[#2A2A38] text-[#B8B8C8]">
              Webhook: {cfStatus?.webhookConfigured ? 'Verified Secret Set' : 'Secret Pending'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* System A: Vijay Visuals Platform Packages */}
          <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#D4AF37]" />
                <span>System A · Vijay Visuals Platform Upgrades</span>
              </h3>
              <p className="text-[11px] text-[#8E8EA2] mt-1">
                Settled to Vijay Visuals merchant account via Cashfree PG. Licenses, PWA add-ons &amp; AI credits activate strictly after server-side HMAC signature verification.
              </p>
            </div>
            <div className="space-y-2.5">
              {plans.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-[#1F1F2D] bg-[#09090D] p-3.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-semibold text-white">{p.name}</p>
                    <p className="text-[11px] text-[#8E8EA2]">
                      ₹{p.priceInr.toLocaleString('en-IN')} · {p.billingCycle.replace('_', ' ')}
                      {p.includesPwa ? ' · Includes PWA' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBuyPlatformPlan(p)}
                    className="px-3 py-1.5 rounded bg-gold-gradient text-[#08080A] font-semibold shrink-0"
                  >
                    Pay via Cashfree
                  </button>
                </div>
              ))}
            </div>

            {platformPayments.length > 0 && (
              <div className="pt-3 border-t border-[#1E1E2B] space-y-2">
                <p className="text-xs font-semibold text-white">Verified Platform Receipts</p>
                {platformPayments.slice(0, 5).map((pp) => (
                  <div key={pp.id} className="flex justify-between text-[11px] text-[#B8B8C8]">
                    <span>
                      {pp.receiptNumber} · {pp.planName}
                    </span>
                    <span className="font-mono-tabular text-[#ECC86A]">
                      ₹{pp.amountInr.toLocaleString('en-IN')} ({pp.status})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* System B: Seller Payouts & Cashfree Easy Split */}
          <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-6 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#D4AF37]" />
                <span>System B · Seller Payouts &amp; Cashfree Easy Split</span>
              </h3>
              <p className="text-[11px] text-[#8E8EA2] mt-1">
                Storefront customer payments are processed via Cashfree PG. Automated vendor payouts are tracked in the database ledger. Live splits activate upon Cashfree Easy Split addendum execution.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="rounded-lg border border-[#1F1F2D] bg-[#09090D] p-3">
                <p className="text-[11px] text-[#8E8EA2]">Split Status</p>
                <p className="font-semibold text-amber-300 capitalize mt-0.5">
                  Pending Activation
                </p>
              </div>
              <div className="rounded-lg border border-[#1F1F2D] bg-[#09090D] p-3">
                <p className="text-[11px] text-[#8E8EA2]">COD Collected</p>
                <p className="font-semibold text-emerald-400 font-mono-tabular mt-0.5">
                  ₹{codSummary.codCollectedInr.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="rounded-lg border border-[#1F1F2D] bg-[#09090D] p-3">
                <p className="text-[11px] text-[#8E8EA2]">COD Pending</p>
                <p className="font-semibold text-amber-300 font-mono-tabular mt-0.5">
                  ₹{codSummary.codPendingInr.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveSellerKyc} className="space-y-2.5 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  value={kycLegalName}
                  onChange={(e) => setKycLegalName(e.target.value)}
                  placeholder="Legal Business Name"
                  className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                />
                <input
                  type="text"
                  value={kycPan}
                  onChange={(e) => setKycPan(e.target.value)}
                  placeholder="Business PAN (Required for Split)"
                  className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white uppercase"
                />
                <input
                  type="text"
                  value={kycGstin}
                  onChange={(e) => setKycGstin(e.target.value)}
                  placeholder="GSTIN (Optional)"
                  className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white uppercase"
                />
                <input
                  type="text"
                  required
                  value={kycHolder}
                  onChange={(e) => setKycHolder(e.target.value)}
                  placeholder="Bank Account Holder"
                  className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
                />
                <input
                  type="text"
                  required
                  maxLength={4}
                  value={kycLast4}
                  onChange={(e) => setKycLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="Account Last 4 Digits"
                  className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white font-mono-tabular"
                />
                <input
                  type="text"
                  required
                  value={kycIfsc}
                  onChange={(e) => setKycIfsc(e.target.value.toUpperCase())}
                  placeholder="IFSC Code (e.g. HDFC0001234)"
                  className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white font-mono-tabular"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-md bg-gold-gradient text-[#08080A] font-semibold"
              >
                Submit Bank Details for Cashfree Easy Split Settlement
              </button>
            </form>

            {transfers.length > 0 && (
              <div className="pt-3 border-t border-[#1E1E2B] space-y-1.5 text-[11px]">
                <p className="font-semibold text-white">Cashfree Settlement Ledger</p>
                {transfers.slice(0, 5).map((tr) => (
                  <div key={tr.id} className="flex justify-between text-[#B8B8C8]">
                    <span>
                      Gross ₹{tr.grossAmountInr} · Fee ₹{tr.platformCommissionInr}
                    </span>
                    <span className="text-emerald-300 font-mono-tabular">
                      Net ₹{tr.sellerNetAmountInr} ({tr.status})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== 2. CRM LEADS & SERVICE APPOINTMENTS ====================
  if (activeSection === 'crm_bookings') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CRM & Loyalty */}
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-6 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-[#D4AF37]" />
            <span>CRM Leads, Loyalty & Marketing Consent</span>
          </h3>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch(`/api/owner/tenants/${tenant.id}/crm`, {
                  method: 'POST',
                  body: JSON.stringify({
                    name: leadName,
                    phone: leadPhone,
                    email: leadEmail,
                    source: leadSource,
                    marketingConsent: leadConsent,
                    nextFollowupDate: leadFollowup,
                  }),
                });
                setLeadName('');
                setLeadPhone('');
                setLeadEmail('');
                onNotify('CRM lead added.');
                loadSectionData();
              } catch (err) {
                onNotify(err instanceof Error ? err.message : 'Unable to add lead.');
              }
            }}
            className="space-y-2.5 text-xs border-b border-[#1E1E2B] pb-4"
          >
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                placeholder="Customer / Lead Name"
                className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
              />
              <input
                type="text"
                required
                value={leadPhone}
                onChange={(e) => setLeadPhone(e.target.value)}
                placeholder="Phone Number"
                className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
              />
              <input
                type="email"
                value={leadEmail}
                onChange={(e) => setLeadEmail(e.target.value)}
                placeholder="Email (Optional)"
                className="rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
              />
              <select
                value={leadSource}
                onChange={(e) => setLeadSource(e.target.value)}
                className="rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-white"
              >
                <option value="website">Website Inquiry</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="referral">Referral Program</option>
                <option value="walk_in">Walk-in</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-[#CFCFDA] cursor-pointer">
                <input
                  type="checkbox"
                  checked={leadConsent}
                  onChange={(e) => setLeadConsent(e.target.checked)}
                  className="accent-[#D4AF37]"
                />
                <span>Explicit marketing consent obtained</span>
              </label>
              <input
                type="date"
                value={leadFollowup}
                onChange={(e) => setLeadFollowup(e.target.value)}
                className="rounded border border-[#2A2A38] bg-[#08080C] px-2 py-1 text-white"
              />
            </div>
            <button type="submit" className="px-4 py-2 rounded bg-gold-gradient text-[#08080A] font-semibold">
              Add CRM Lead
            </button>
          </form>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1 text-xs">
            {leads.length === 0 ? (
              <p className="text-[#8E8EA2]">No CRM leads yet. Add your first customer lead above.</p>
            ) : (
              leads.map((lead) => (
                <div key={lead.id} className="rounded-lg border border-[#1F1F2D] bg-[#09090D] p-3 space-y-2">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">{lead.name}</p>
                      <p className="text-[11px] text-[#8E8EA2]">
                        {lead.phone} · {lead.source} · Loyalty: {lead.loyaltyPoints} pts
                      </p>
                    </div>
                    <select
                      value={lead.stage}
                      onChange={async (e) => {
                        await apiFetch(`/api/owner/crm/${lead.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ stage: e.target.value }),
                        });
                        loadSectionData();
                      }}
                      className="rounded border border-[#2A2A38] bg-[#101018] px-2 py-1 text-[11px] text-[#ECC86A]"
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={lead.unsubscribed ? 'text-rose-300' : 'text-emerald-300'}>
                      {lead.unsubscribed ? 'Unsubscribed from marketing' : lead.marketingConsent ? 'Marketing consented' : 'Transactional only'}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/owner/crm/${lead.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ loyaltyPoints: lead.loyaltyPoints + 50 }),
                          });
                          loadSectionData();
                        }}
                        className="text-[#ECC86A] hover:underline"
                      >
                        +50 Pts
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/owner/crm/${lead.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ unsubscribed: !lead.unsubscribed }),
                          });
                          loadSectionData();
                        }}
                        className="text-[#A3A3B5] hover:text-white"
                      >
                        {lead.unsubscribed ? 'Re-enable' : 'Unsubscribe'}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Service Appointments & Calendar */}
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-6 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#D4AF37]" />
            <span>Appointments & Service Bookings ({appointments.length})</span>
          </h3>
          <p className="text-[11px] text-[#8E8EA2]">
            Customers can book consultations, salon slots, studio shoots, or hotel stays directly on your live storefront at /site/{tenant.slug}.
          </p>
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1 text-xs">
            {appointments.length === 0 ? (
              <p className="text-[#8E8EA2]">No appointments booked yet.</p>
            ) : (
              appointments.map((ap) => (
                <div key={ap.id} className="rounded-lg border border-[#1F1F2D] bg-[#09090D] p-3.5 space-y-2">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">{ap.serviceName}</p>
                      <p className="text-[11px] text-[#A3A3B5]">
                        {ap.customerName} ({ap.customerPhone}) · {ap.bookingDate} at {ap.timeSlot}
                      </p>
                    </div>
                    <select
                      value={ap.status}
                      onChange={async (e) => {
                        await apiFetch(`/api/owner/appointments/${ap.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ status: e.target.value }),
                        });
                        onNotify('Booking status updated.');
                        loadSectionData();
                      }}
                      className="rounded border border-[#2A2A38] bg-[#101018] px-2 py-1 text-[11px] text-[#ECC86A]"
                    >
                      <option value="confirmed">Confirmed</option>
                      <option value="rescheduled">Rescheduled</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  {ap.notes && <p className="text-[11px] text-[#8E8EA2]">{ap.notes}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== 3. FINANCE, GST, QUOTATIONS & P&L ====================
  if (activeSection === 'finance') {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-4">
            <p className="text-[#8E8EA2]">Gross Store Sales</p>
            <p className="text-lg font-bold text-white font-mono-tabular mt-1">
              ₹{financeSummary.grossSalesInr.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-4">
            <p className="text-[#8E8EA2]">Recorded Expenses</p>
            <p className="text-lg font-bold text-amber-300 font-mono-tabular mt-1">
              ₹{financeSummary.totalExpensesInr.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-4">
            <p className="text-[#8E8EA2]">Estimated Net Profit</p>
            <p className="text-lg font-bold text-emerald-400 font-mono-tabular mt-1">
              ₹{financeSummary.netProfitEstimateInr.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-4">
            <p className="text-[#8E8EA2]">GST Output / Input</p>
            <p className="text-sm font-bold text-[#ECC86A] font-mono-tabular mt-1">
              ₹{financeSummary.estimatedOutputGstInr.toLocaleString('en-IN')} / ₹{financeSummary.inputGstInr.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch(`/api/owner/tenants/${tenant.id}/finance`, {
                  method: 'POST',
                  body: JSON.stringify({
                    recordType: finType,
                    partyName: finParty,
                    category: finCat,
                    amountInr: Number(finAmount),
                    gstRatePct: Number(finGstRate),
                    notes: finNotes,
                  }),
                });
                setFinParty('');
                setFinNotes('');
                onNotify('GST finance entry saved.');
                loadSectionData();
              } catch (err) {
                onNotify(err instanceof Error ? err.message : 'Unable to save entry.');
              }
            }}
            className="lg:col-span-5 rounded-xl border border-[#222230] bg-[#0D0D13] p-6 space-y-3 text-xs"
          >
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#D4AF37]" />
              <span>Record Expense, Quotation or Credit Note</span>
            </h3>
            <select
              value={finType}
              onChange={(e) => setFinType(e.target.value as typeof finType)}
              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
            >
              <option value="expense">Business Expense (Input GST)</option>
              <option value="quotation">Customer Quotation</option>
              <option value="credit_note">Credit Note / Return Adjustment</option>
            </select>
            <input
              type="text"
              required
              value={finParty}
              onChange={(e) => setFinParty(e.target.value)}
              placeholder="Vendor or Customer Name"
              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={finCat}
                onChange={(e) => setFinCat(e.target.value)}
                placeholder="Category"
                className="rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-white"
              />
              <input
                type="number"
                required
                min={1}
                value={finAmount}
                onChange={(e) => setFinAmount(Number(e.target.value))}
                placeholder="Amount ₹"
                className="rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-white font-mono-tabular"
              />
              <select
                value={finGstRate}
                onChange={(e) => setFinGstRate(Number(e.target.value))}
                className="rounded border border-[#2A2A38] bg-[#08080C] px-2 py-2 text-white"
              >
                <option value={0}>0% GST</option>
                <option value={5}>5% GST</option>
                <option value={12}>12% GST</option>
                <option value={18}>18% GST</option>
                <option value={28}>28% GST</option>
              </select>
            </div>
            <input
              type="text"
              value={finNotes}
              onChange={(e) => setFinNotes(e.target.value)}
              placeholder="Invoice / HSN / Remarks"
              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
            />
            <button type="submit" className="w-full py-2.5 rounded bg-gold-gradient text-[#08080A] font-semibold">
              Save GST Record
            </button>
            <p className="text-[11px] text-[#88889C]">
              Statutory notice: Validate GST rates, HSN codes, and filings with your Chartered Accountant per applicable Indian GST law.
            </p>
          </form>

          <div className="lg:col-span-7 rounded-xl border border-[#222230] bg-[#0D0D13] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Financial Ledger ({financeRecords.length})</h3>
              <button
                type="button"
                onClick={handleExportFinanceCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#D4AF37]/40 text-xs text-[#ECC86A] hover:bg-[#19170E]"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1 text-xs">
              {financeRecords.length === 0 ? (
                <p className="text-[#8E8EA2]">No finance entries recorded yet.</p>
              ) : (
                financeRecords.map((r) => (
                  <div key={r.id} className="rounded-lg border border-[#1F1F2D] bg-[#09090D] p-3 flex justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">
                        {r.referenceNo} · {r.partyName}
                      </p>
                      <p className="text-[11px] text-[#8E8EA2] capitalize">
                        {r.recordType.replace('_', ' ')} · {r.category} · GST {r.gstRatePct}% (₹{r.gstAmountInr})
                      </p>
                    </div>
                    <p className="font-mono-tabular font-semibold text-[#ECC86A]">
                      ₹{r.amountInr.toLocaleString('en-IN')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== 4. WAREHOUSES, SUPPLIERS & STAFF HR ====================
  if (activeSection === 'supply_hr') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
        {/* Warehouses */}
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Building className="w-4 h-4 text-[#D4AF37]" />
            <span>Warehouses ({warehouses.length})</span>
          </h3>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiFetch(`/api/owner/tenants/${tenant.id}/warehouses`, {
                method: 'POST',
                body: JSON.stringify({ name: whName, city: whCity, capacityUnits: whCap }),
              });
              setWhName('');
              onNotify('Warehouse added.');
              loadSectionData();
            }}
            className="space-y-2"
          >
            <input
              type="text"
              required
              value={whName}
              onChange={(e) => setWhName(e.target.value)}
              placeholder="Warehouse Name"
              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={whCity}
                onChange={(e) => setWhCity(e.target.value)}
                placeholder="City"
                className="rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-white"
              />
              <input
                type="number"
                value={whCap}
                onChange={(e) => setWhCap(Number(e.target.value))}
                placeholder="Capacity"
                className="rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-white font-mono-tabular"
              />
            </div>
            <button type="submit" className="w-full py-2 rounded bg-gold-gradient text-[#08080A] font-semibold">
              Add Warehouse
            </button>
          </form>
          <div className="space-y-2">
            {warehouses.map((w) => (
              <div key={w.id} className="rounded border border-[#1F1F2D] bg-[#09090D] p-2.5">
                <p className="font-semibold text-white">{w.name}</p>
                <p className="text-[11px] text-[#8E8EA2]">
                  {w.city} · Capacity {w.capacityUnits} units
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Suppliers */}
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Suppliers ({suppliers.length})</h3>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiFetch(`/api/owner/tenants/${tenant.id}/suppliers`, {
                method: 'POST',
                body: JSON.stringify({ name: supName, contactPhone: supPhone, gstin: supGstin }),
              });
              setSupName('');
              setSupPhone('');
              setSupGstin('');
              onNotify('Supplier added.');
              loadSectionData();
            }}
            className="space-y-2"
          >
            <input
              type="text"
              required
              value={supName}
              onChange={(e) => setSupName(e.target.value)}
              placeholder="Supplier / Wholesaler Name"
              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
            />
            <input
              type="text"
              required
              value={supPhone}
              onChange={(e) => setSupPhone(e.target.value)}
              placeholder="Phone Number"
              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
            />
            <input
              type="text"
              value={supGstin}
              onChange={(e) => setSupGstin(e.target.value)}
              placeholder="GSTIN (Optional)"
              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white uppercase"
            />
            <button type="submit" className="w-full py-2 rounded bg-gold-gradient text-[#08080A] font-semibold">
              Add Supplier
            </button>
          </form>
          <div className="space-y-2">
            {suppliers.map((s) => (
              <div key={s.id} className="rounded border border-[#1F1F2D] bg-[#09090D] p-2.5">
                <p className="font-semibold text-white">{s.name}</p>
                <p className="text-[11px] text-[#8E8EA2]">
                  {s.contactPhone} {s.gstin ? `· ${s.gstin}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Staff Attendance & Salary */}
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Staff Attendance & Payroll</h3>
          {staff.length === 0 ? (
            <p className="text-[#8E8EA2]">Add staff members in the Team & Fleet tab first.</p>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch(`/api/owner/tenants/${tenant.id}/attendance`, {
                  method: 'POST',
                  body: JSON.stringify({
                    staffId: attStaffId,
                    status: attStatus,
                    salaryPaidInr: Number(attSalary) || 0,
                  }),
                });
                setAttSalary(0);
                onNotify('Staff attendance/salary recorded.');
                loadSectionData();
              }}
              className="space-y-2"
            >
              <select
                value={attStaffId}
                onChange={(e) => setAttStaffId(Number(e.target.value))}
                className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-white"
              >
                {staff.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.staffRole})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={attStatus}
                  onChange={(e) => setAttStatus(e.target.value as typeof attStatus)}
                  className="rounded border border-[#2A2A38] bg-[#08080C] px-2 py-2 text-white"
                >
                  <option value="present">Present</option>
                  <option value="half_day">Half Day</option>
                  <option value="leave">Leave</option>
                  <option value="absent">Absent</option>
                </select>
                <input
                  type="number"
                  min={0}
                  value={attSalary}
                  onChange={(e) => setAttSalary(Number(e.target.value))}
                  placeholder="Salary Paid ₹"
                  className="rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-white font-mono-tabular"
                />
              </div>
              <button type="submit" className="w-full py-2 rounded bg-gold-gradient text-[#08080A] font-semibold">
                Log Attendance / Payout
              </button>
            </form>
          )}
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {attendance.map((a) => {
              const member = staff.find((s) => s.id === a.staffId);
              return (
                <div key={a.id} className="rounded border border-[#1F1F2D] bg-[#09090D] p-2 flex justify-between">
                  <span className="text-white">
                    {member?.name || `Staff #${a.staffId}`} · {a.recordDate}
                  </span>
                  <span className="text-[#ECC86A] capitalize">
                    {a.status} {a.salaryPaidInr > 0 ? `· ₹${a.salaryPaidInr}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ==================== 5. PLUGIN MARKETPLACE & DOMAIN DNS ====================
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-xs">
      <div className="lg:col-span-7 rounded-xl border border-[#222230] bg-[#0D0D13] p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Plug className="w-4 h-4 text-[#D4AF37]" />
            <span>Verified Plugin & Integration Marketplace</span>
          </h3>
          <p className="text-[11px] text-[#8E8EA2] mt-1">
            Strict security architecture: plugins use scoped webhooks & declarative connectors only—untrusted third-party code execution is prohibited.
          </p>
        </div>

        <div className="space-y-3">
          {PLUGIN_CATALOG.map((plug) => {
            const installed = installedPlugins.find((p) => p.pluginCode === plug.code);
            return (
              <div key={plug.code} className="rounded-lg border border-[#1F1F2D] bg-[#09090D] p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{plug.name}</p>
                    <p className="text-[11px] text-[#8E8EA2] mt-0.5">{plug.description}</p>
                    <p className="text-[10px] font-mono-tabular text-[#D4AF37] mt-1">
                      Scope: {plug.permissionScope} · {plug.pricing}
                    </p>
                  </div>
                  {installed?.enabled && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-[10px] shrink-0">
                      <Check className="w-3 h-3" /> Active
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pluginDraftConfig[plug.code] ?? ''}
                    onChange={(e) =>
                      setPluginDraftConfig((prev) => ({ ...prev, [plug.code]: e.target.value }))
                    }
                    placeholder={
                      plug.code === 'google_analytics'
                        ? 'GA4 Measurement ID (e.g. G-XXXXXXXX)'
                        : 'Webhook Endpoint URL or Connector ID'
                    }
                    className="flex-1 rounded border border-[#2A2A38] bg-[#0D0D13] px-2.5 py-1.5 text-white"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/owner/tenants/${tenant.id}/plugins`, {
                        method: 'POST',
                        body: JSON.stringify({
                          pluginCode: plug.code,
                          trackingId: pluginDraftConfig[plug.code] || '',
                          endpointUrl: pluginDraftConfig[plug.code] || '',
                          enabled: true,
                        }),
                      });
                      onNotify(`${plug.name} saved.`);
                      loadSectionData();
                    }}
                    className="px-3 py-1.5 rounded bg-gold-gradient text-[#08080A] font-semibold"
                  >
                    {installed ? 'Update' : 'Install'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom Domain, DNS & SSL Setup Panel (Module 18) */}
      <div className="lg:col-span-5 rounded-xl border border-[#222230] bg-[#0D0D13] p-6 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Globe className="w-4 h-4 text-[#D4AF37]" />
          <span>Domain, DNS & Hosting Status</span>
        </h3>
        <div className="rounded-lg border border-[#1F1F2D] bg-[#09090D] p-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-[#8E8EA2]">Default Live URL</span>
            <span className="font-mono-tabular text-[#ECC86A]">/site/{tenant.slug}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8E8EA2]">Custom Domain</span>
            <span className="font-mono-tabular text-white">{tenant.customDomain || 'Not configured'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#8E8EA2]">SSL / Cloudflare Edge</span>
            <span className="text-amber-300">
              {tenant.customDomain ? 'Awaiting DNS CNAME Verification' : 'Platform SSL Active'}
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-[#1F1F2D] bg-[#09090D] p-4 space-y-2 text-[11px] text-[#B8B8C8]">
          <p className="font-semibold text-white">Cloudflare Pages Custom Domain DNS Steps:</p>
          <p>1. Set your custom domain in the Website Builder.</p>
          <p>2. In your domain registrar DNS panel, add a <code className="text-[#ECC86A]">CNAME</code> record pointing to <code className="text-[#ECC86A]">vijay-visuals-site.pages.dev</code>.</p>
          <p>3. Activate the Custom Hostname in Cloudflare for SaaS to auto-issue TLS/SSL certificates.</p>
        </div>
      </div>
    </div>
  );
};
