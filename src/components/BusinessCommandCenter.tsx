import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  Circle,
  Download,
  Loader2,
  Package,
  RefreshCw,
  Send,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { TenantRecord } from '../types/platform';

interface CommandCenterMetrics {
  todaySalesInr: number;
  periodSalesInr: number;
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  pendingPaymentsInr: number;
  pendingPaymentsCount: number;
  recordedExpensesInr: number;
  purchaseCostsInr: number;
  estimatedProfitInr: number;
  hasCostOrExpenseData: boolean;
  profitDisclaimer: string;
  lowStockCount: number;
  newCustomersCount: number;
  newEnquiriesCount: number;
  pendingDeliveriesCount: number;
  upcomingAppointmentsCount: number;
  supplierOutstandingInr: number;
  staffAttendanceToday: {
    totalActiveStaff: number;
    present: number;
    halfDay: number;
    leave: number;
    absent: number;
  };
}

interface CommandCenterResponse {
  range: string;
  generatedAt: string;
  metrics: CommandCenterMetrics;
  lowStockProducts: Array<{ id: number; name: string; stock: number; lowStockThreshold: number; price: number }>;
  topProducts: Array<{ name: string; unitsSold: number; revenueInr: number }>;
  upcomingAppointments: Array<{
    id: number;
    customerName: string;
    serviceName: string;
    bookingDate: string;
    timeSlot: string;
    status: string;
  }>;
  alerts: Array<{ severity: 'high' | 'medium' | 'info'; title: string; detail: string; actionTab: string }>;
}

interface OnboardingStep {
  step: number;
  key: string;
  title: string;
  simpleGuide: string;
  autoCompleted: boolean;
  completed: boolean;
  targetAction: string;
}

interface BusinessCommandCenterProps {
  tenant: TenantRecord;
  mode: 'command_center' | 'onboarding';
  onJumpTab: (tab: string) => void;
  onGoBuilder: () => void;
  onOpenStorefront: (slug: string) => void;
  onNotify: (msg: string) => void;
}

const QUICK_AI_QUESTIONS = [
  'How much did I sell today?',
  'Which products are low in stock?',
  'Which products sell most?',
  'Which orders are delayed?',
  'Which customers need follow-up?',
  'What are my recorded expenses?',
  'What is my estimated profit?',
  'What should I improve in my website?',
];

export const BusinessCommandCenter: React.FC<BusinessCommandCenterProps> = ({
  tenant,
  mode,
  onJumpTab,
  onGoBuilder,
  onOpenStorefront,
  onNotify,
}) => {
  // Command Center state
  const [range, setRange] = useState<'today' | '7d' | '30d' | 'all' | 'custom'>('30d');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [ccData, setCcData] = useState<CommandCenterResponse | null>(null);
  const [loadingCc, setLoadingCc] = useState(false);

  // Grounded AI Assistant state
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLang, setAiLang] = useState<'en' | 'te' | 'hi'>('en');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  // Onboarding state
  const [onboarding, setOnboarding] = useState<{
    steps: OnboardingStep[];
    completedCount: number;
    totalSteps: number;
    progressPct: number;
    currentStep: number;
  } | null>(null);
  const [savingStep, setSavingStep] = useState(false);

  const loadCommandCenter = useCallback(async () => {
    setLoadingCc(true);
    try {
      const params = new URLSearchParams({ range });
      if (range === 'custom' && fromDate && toDate) {
        params.set('from', fromDate);
        params.set('to', toDate);
      }
      const res = await apiFetch<CommandCenterResponse>(
        `/api/owner/tenants/${tenant.id}/command-center?${params.toString()}`
      );
      setCcData(res);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load Command Center.');
    } finally {
      setLoadingCc(false);
    }
  }, [tenant.id, range, fromDate, toDate, onNotify]);

  const loadOnboarding = useCallback(async () => {
    try {
      const res = await apiFetch<{
        steps: OnboardingStep[];
        completedCount: number;
        totalSteps: number;
        progressPct: number;
        currentStep: number;
      }>(`/api/owner/tenants/${tenant.id}/onboarding`);
      setOnboarding(res);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load setup wizard.');
    }
  }, [tenant.id, onNotify]);

  useEffect(() => {
    if (mode === 'command_center') loadCommandCenter();
    if (mode === 'onboarding') loadOnboarding();
  }, [mode, loadCommandCenter, loadOnboarding]);

  const askAssistant = async (questionText: string) => {
    const q = questionText.trim();
    if (!q) return;
    setAiQuestion(q);
    setAiBusy(true);
    setAiAnswer('');
    try {
      const res = await apiFetch<{ answer: string; creditsUsed: number }>(
        `/api/owner/tenants/${tenant.id}/ai-assistant`,
        {
          method: 'POST',
          body: JSON.stringify({ question: q, language: aiLang }),
        }
      );
      setAiAnswer(res.answer);
      onNotify('AI Business Assistant answered using live database records.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI Business Assistant failed.';
      setAiAnswer(`Error: ${msg}`);
      onNotify(msg);
    } finally {
      setAiBusy(false);
    }
  };

  const downloadCsvReport = () => {
    if (!ccData) return;
    const m = ccData.metrics;
    const rows: Array<[string, string | number]> = [
      ['Business Name', tenant.name],
      ['Report Period', ccData.range],
      ['Generated At', ccData.generatedAt],
      ['Today Sales (INR)', m.todaySalesInr],
      ['Period Sales (INR)', m.periodSalesInr],
      ['Total Orders', m.totalOrders],
      ['Pending Orders', m.pendingOrders],
      ['Completed Orders', m.completedOrders],
      ['Cancelled/Return Orders', m.cancelledOrders],
      ['Pending Payments (INR)', m.pendingPaymentsInr],
      ['Recorded Business Expenses (INR)', m.recordedExpensesInr],
      ['Supplier Purchase Order Costs (INR)', m.purchaseCostsInr],
      ['Estimated Operational Profit (INR - Not Accountant Verified)', m.estimatedProfitInr],
      ['Supplier Outstanding Balance (INR)', m.supplierOutstandingInr],
      ['Low Stock Products Count', m.lowStockCount],
      ['New Customers Count', m.newCustomersCount],
      ['New Enquiries Count', m.newEnquiriesCount],
      ['Pending Deliveries', m.pendingDeliveriesCount],
      ['Upcoming Appointments', m.upcomingAppointmentsCount],
      ['Staff Present Today', m.staffAttendanceToday.present],
      ['Disclaimer', m.profitDisclaimer],
    ];
    const csv = ['Metric,Value', ...rows.map(([k, v]) => `"${k}","${String(v).replace(/"/g, '""')}"`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tenant.slug}-command-center-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Daily Business Command Center CSV report downloaded.');
  };

  const downloadFullBackupJson = async () => {
    try {
      const data = await apiFetch<Record<string, unknown>>(`/api/owner/tenants/${tenant.id}/full-export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tenant.slug}-full-business-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onNotify('Full Business OS backup JSON downloaded with SHA-256 checksum.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  const handleToggleOnboardingStep = async (stepNum: number) => {
    if (!onboarding) return;
    setSavingStep(true);
    try {
      const currentDone = onboarding.steps.filter((s) => s.completed).map((s) => s.step);
      const nextDone = currentDone.includes(stepNum)
        ? currentDone.filter((n) => n !== stepNum)
        : [...currentDone, stepNum];
      await apiFetch(`/api/owner/tenants/${tenant.id}/onboarding`, {
        method: 'PUT',
        body: JSON.stringify({
          completedSteps: nextDone,
          currentStep: Math.min(12, stepNum + 1),
          dismissed: false,
        }),
      });
      await loadOnboarding();
      onNotify(`Setup step ${stepNum} updated.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to save step progress.');
    } finally {
      setSavingStep(false);
    }
  };

  const handleStepAction = (action: string) => {
    if (action === 'builder') return onGoBuilder();
    if (action === 'storefront') return onOpenStorefront(tenant.slug);
    if (action === 'profile') return onJumpTab('help_center');
    onJumpTab(action);
  };

  // ================= MODULE 1: 12-STEP GUIDED ONBOARDING WIZARD =================
  if (mode === 'onboarding') {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-[#D4AF37]/30 bg-[#100F0C] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-[#D4AF37]">Module 1 · Simple Guided Business Setup</p>
              <h2 className="font-luxury text-xl font-bold text-white mt-1">
                12-Step Business Launch Checklist for {tenant.name}
              </h2>
              <p className="text-xs text-[#A5A5B8] mt-1">
                Follow these plain-language steps in order. Completed steps are detected automatically from your live account.
              </p>
            </div>
            {onboarding && (
              <div className="text-right">
                <p className="font-mono-tabular text-2xl font-bold text-[#ECC86A]">{onboarding.progressPct}%</p>
                <p className="text-[11px] text-[#9A9AAE]">
                  {onboarding.completedCount} of {onboarding.totalSteps} steps ready
                </p>
              </div>
            )}
          </div>

          {onboarding && (
            <div className="mt-4 h-2.5 w-full rounded-full bg-[#1C1C26] overflow-hidden">
              <div
                className="h-full bg-gold-gradient transition-all duration-300"
                style={{ width: `${onboarding.progressPct}%` }}
              />
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {(onboarding?.steps || []).map((step) => (
            <div
              key={step.step}
              className={`rounded-xl border p-4 flex flex-col justify-between gap-3 ${
                step.completed
                  ? 'border-emerald-500/30 bg-emerald-950/10'
                  : 'border-[#232332] bg-[#0D0D13]'
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  disabled={savingStep}
                  onClick={() => handleToggleOnboardingStep(step.step)}
                  className="mt-0.5 shrink-0 text-emerald-400 hover:opacity-80"
                  title="Toggle step completion"
                >
                  {step.completed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Circle className="w-5 h-5 text-[#66667A]" />
                  )}
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-[#181822] text-[#ECC86A]">
                      Step {step.step}
                    </span>
                    <h3 className="text-sm font-semibold text-white">{step.title}</h3>
                  </div>
                  <p className="text-xs text-[#9D9DB2] mt-1.5 leading-relaxed">{step.simpleGuide}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#1C1C28]">
                <span className={`text-[11px] font-medium ${step.completed ? 'text-emerald-400' : 'text-amber-300'}`}>
                  {step.autoCompleted ? 'Verified from live data' : step.completed ? 'Marked complete' : 'Action recommended'}
                </span>
                <button
                  type="button"
                  onClick={() => handleStepAction(step.targetAction)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#ECC86A] hover:underline"
                >
                  <span>Open Step</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ================= MODULE 2 & 9: DAILY BUSINESS COMMAND CENTER =================
  const m = ccData?.metrics;

  return (
    <div className="space-y-6">
      {/* Date Filter & Export Controls */}
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {([
            { id: 'today', label: 'Today' },
            { id: '7d', label: 'Last 7 Days' },
            { id: '30d', label: 'Last 30 Days' },
            { id: 'all', label: 'All Time' },
            { id: 'custom', label: 'Custom' },
          ] as const).map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setRange(btn.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                range === btn.id
                  ? 'bg-[#D4AF37] text-[#08080A]'
                  : 'bg-[#151520] text-[#A8A8BC] hover:text-white'
              }`}
            >
              {btn.label}
            </button>
          ))}

          {range === 'custom' && (
            <div className="flex items-center gap-2 ml-1">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded border border-[#2B2B3B] bg-[#08080C] px-2 py-1 text-xs text-white"
              />
              <span className="text-xs text-[#8E8EA2]">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded border border-[#2B2B3B] bg-[#08080C] px-2 py-1 text-xs text-white"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadCommandCenter}
            disabled={loadingCc}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#2B2B3C] text-xs text-[#D5D5E4] hover:border-[#D4AF37]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingCc ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={downloadCsvReport}
            disabled={!ccData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#D4AF37]/50 text-xs text-[#ECC86A] hover:bg-[#19160E]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV Report</span>
          </button>
          <button
            type="button"
            onClick={downloadFullBackupJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#161622] border border-[#2E2E40] text-xs text-white hover:border-[#D4AF37]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Full Backup JSON</span>
          </button>
        </div>
      </div>

      {/* 15 Live Operational KPIs (Mobile-First Grid) */}
      {m ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="rounded-lg border border-[#D4AF37]/30 bg-[#12100A] p-3.5">
              <p className="text-[11px] text-[#D8C690]">Today’s Sales</p>
              <p className="font-mono-tabular text-lg font-bold text-[#ECC86A] mt-1">
                ₹{m.todaySalesInr.toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-[#8E8EA2] mt-0.5">
                {ccData?.range}: ₹{m.periodSalesInr.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3.5">
              <p className="text-[11px] text-[#8E8EA2]">Total Orders</p>
              <p className="font-mono-tabular text-lg font-bold text-white mt-1">{m.totalOrders}</p>
              <p className="text-[10px] text-emerald-400 mt-0.5">{m.completedOrders} completed</p>
            </div>
            <div className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3.5">
              <p className="text-[11px] text-[#8E8EA2]">Pending / Cancelled</p>
              <p className="font-mono-tabular text-lg font-bold text-amber-300 mt-1">{m.pendingOrders}</p>
              <p className="text-[10px] text-rose-300 mt-0.5">{m.cancelledOrders} cancelled/returns</p>
            </div>
            <div className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3.5">
              <p className="text-[11px] text-[#8E8EA2]">Pending Payments</p>
              <p className="font-mono-tabular text-lg font-bold text-amber-300 mt-1">
                ₹{m.pendingPaymentsInr.toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-[#8E8EA2] mt-0.5">{m.pendingPaymentsCount} unpaid/COD/UPI</p>
            </div>
            <div className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3.5">
              <p className="text-[11px] text-[#8E8EA2]">Recorded Expenses</p>
              <p className="font-mono-tabular text-lg font-bold text-rose-300 mt-1">
                ₹{(m.recordedExpensesInr + m.purchaseCostsInr).toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-[#8E8EA2] mt-0.5">
                Exp ₹{m.recordedExpensesInr.toLocaleString('en-IN')} · PO ₹{m.purchaseCostsInr.toLocaleString('en-IN')}
              </p>
            </div>

            <div className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3.5">
              <p className="text-[11px] text-[#8E8EA2]">Estimated Profit*</p>
              <p
                className={`font-mono-tabular text-lg font-bold mt-1 ${
                  m.estimatedProfitInr >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                ₹{m.estimatedProfitInr.toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-amber-300/90 mt-0.5">
                {m.hasCostOrExpenseData ? 'Operational estimate' : 'Add costs/expenses'}
              </p>
            </div>
            <div className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3.5">
              <p className="text-[11px] text-[#8E8EA2]">Low-Stock Products</p>
              <p className="font-mono-tabular text-lg font-bold text-amber-400 mt-1">{m.lowStockCount}</p>
              <button
                type="button"
                onClick={() => onJumpTab('inventory_po')}
                className="text-[10px] text-[#ECC86A] hover:underline mt-0.5"
              >
                Restock via PO →
              </button>
            </div>
            <div className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3.5">
              <p className="text-[11px] text-[#8E8EA2]">Customers & Enquiries</p>
              <p className="font-mono-tabular text-lg font-bold text-white mt-1">{m.newCustomersCount}</p>
              <p className="text-[10px] text-sky-300 mt-0.5">{m.newEnquiriesCount} new CRM enquiries</p>
            </div>
            <div className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3.5">
              <p className="text-[11px] text-[#8E8EA2]">Deliveries & Bookings</p>
              <p className="font-mono-tabular text-lg font-bold text-white mt-1">{m.pendingDeliveriesCount}</p>
              <p className="text-[10px] text-[#ECC86A] mt-0.5">{m.upcomingAppointmentsCount} upcoming appointments</p>
            </div>
            <div className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3.5">
              <p className="text-[11px] text-[#8E8EA2]">Staff Attendance Today</p>
              <p className="font-mono-tabular text-lg font-bold text-white mt-1">
                {m.staffAttendanceToday.present}/{m.staffAttendanceToday.totalActiveStaff}
              </p>
              <p className="text-[10px] text-[#8E8EA2] mt-0.5">
                Leave: {m.staffAttendanceToday.leave} · Absent: {m.staffAttendanceToday.absent}
              </p>
            </div>
          </div>

          {/* Mandatory Non-Accountant Profit Disclaimer */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/15 px-4 py-2.5 text-[11px] text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>*Estimated Operational Profit Disclosure:</strong> {m.profitDisclaimer}
            </span>
          </div>

          {/* Alerts + Top Products + Low Stock + Upcoming Bookings */}
          <div className="grid lg:grid-cols-2 gap-5">
            {/* Important Alerts */}
            <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#D4AF37]" />
                  <span>Important Business Alerts</span>
                </h3>
                <span className="text-[11px] text-[#8E8EA2]">{ccData.alerts.length} active</span>
              </div>
              {ccData.alerts.length === 0 ? (
                <p className="text-xs text-emerald-300">All operational checks look healthy right now.</p>
              ) : (
                <div className="space-y-2.5">
                  {ccData.alerts.map((al, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg border p-3 flex items-start justify-between gap-3 text-xs ${
                        al.severity === 'high'
                          ? 'border-rose-500/35 bg-rose-950/20'
                          : al.severity === 'medium'
                            ? 'border-amber-500/35 bg-amber-950/15'
                            : 'border-[#272738] bg-[#12121A]'
                      }`}
                    >
                      <div>
                        <p className="font-semibold text-white">{al.title}</p>
                        <p className="text-[11px] text-[#A4A4B8] mt-0.5">{al.detail}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onJumpTab(al.actionTab)}
                        className="text-[11px] font-semibold text-[#ECC86A] shrink-0 hover:underline"
                      >
                        Resolve →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Products & Upcoming Appointments */}
            <div className="space-y-5">
              <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#D4AF37]" />
                  <span>Top-Selling Products ({ccData.range})</span>
                </h3>
                {ccData.topProducts.length === 0 ? (
                  <p className="text-xs text-[#8E8EA2]">No completed product sales recorded in this date range yet.</p>
                ) : (
                  <div className="space-y-2">
                    {ccData.topProducts.map((tp) => (
                      <div
                        key={tp.name}
                        className="flex items-center justify-between text-xs border-b border-[#1C1C28] pb-2 last:border-0"
                      >
                        <span className="text-white truncate pr-2">{tp.name}</span>
                        <span className="font-mono-tabular text-[#ECC86A] shrink-0">
                          {tp.unitsSold} sold · ₹{tp.revenueInr.toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#D4AF37]" />
                    <span>Upcoming Appointments</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => onJumpTab('crm_bookings')}
                    className="text-[11px] text-[#ECC86A] hover:underline"
                  >
                    Manage →
                  </button>
                </div>
                {ccData.upcomingAppointments.length === 0 ? (
                  <p className="text-xs text-[#8E8EA2]">No upcoming appointments scheduled.</p>
                ) : (
                  <div className="space-y-2">
                    {ccData.upcomingAppointments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between text-xs">
                        <div>
                          <p className="text-white font-medium">{a.customerName} — {a.serviceName}</p>
                          <p className="text-[11px] text-[#8E8EA2]">{a.bookingDate} at {a.timeSlot}</p>
                        </div>
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-[#181822] text-[#ECC86A]">
                          {a.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* MODULE 9: GROUNDED AI BUSINESS ASSISTANT */}
          <div className="rounded-xl border border-[#D4AF37]/35 bg-[#0F0E0B] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-[#D4AF37] flex items-center gap-1.5">
                  <Bot className="w-4 h-4" />
                  <span>Module 9 · Grounded AI Business Assistant (Live Store Data Only)</span>
                </p>
                <h3 className="text-base font-semibold text-white mt-0.5">
                  Ask Anything About Your Daily Sales, Stock, Expenses & Customers
                </h3>
              </div>
              <select
                value={aiLang}
                onChange={(e) => setAiLang(e.target.value as 'en' | 'te' | 'hi')}
                className="rounded-md border border-[#2B2B3C] bg-[#08080C] px-2.5 py-1.5 text-xs text-white"
              >
                <option value="en">English</option>
                <option value="te">తెలుగు (Telugu)</option>
                <option value="hi">हिन्दी (Hindi)</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              {QUICK_AI_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={aiBusy}
                  onClick={() => askAssistant(q)}
                  className="px-2.5 py-1.5 rounded-md border border-[#2A2618] bg-[#16140E] text-[11px] text-[#F2DFAA] hover:border-[#D4AF37] transition-colors text-left"
                >
                  {q}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                askAssistant(aiQuestion);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                placeholder="Ask e.g. Which products are low in stock or what is my estimated profit?"
                className="flex-1 rounded-md border border-[#2C2C3C] bg-[#08080C] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
              />
              <button
                type="submit"
                disabled={aiBusy || !aiQuestion.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold disabled:opacity-50"
              >
                {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Ask AI</span>
              </button>
            </form>

            {aiAnswer && (
              <div className="rounded-lg border border-[#2A271B] bg-[#0A0A0E] p-4 text-xs text-[#E7E7F0] whitespace-pre-wrap leading-relaxed">
                <div className="flex items-center gap-1.5 text-[11px] text-[#ECC86A] mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Grounded Answer (1 AI credit used · Sensitive actions always require manual confirmation)</span>
                </div>
                {aiAnswer}
              </div>
            )}
          </div>

          {/* Quick Jump Summary Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => onJumpTab('onboarding')}
              className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3 text-left hover:border-[#D4AF37]"
            >
              <p className="text-xs font-semibold text-white">12-Step Setup Wizard</p>
              <p className="text-[11px] text-[#8E8EA2] mt-0.5">Check website launch readiness</p>
            </button>
            <button
              type="button"
              onClick={() => onJumpTab('inventory_po')}
              className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3 text-left hover:border-[#D4AF37]"
            >
              <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Purchase Orders & Stock</span>
              </p>
              <p className="text-[11px] text-[#8E8EA2] mt-0.5">
                Supplier dues: ₹{m.supplierOutstandingInr.toLocaleString('en-IN')}
              </p>
            </button>
            <button
              type="button"
              onClick={() => onJumpTab('hr_tasks')}
              className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3 text-left hover:border-[#D4AF37]"
            >
              <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Staff Tasks & Backup</span>
              </p>
              <p className="text-[11px] text-[#8E8EA2] mt-0.5">Assign work & test snapshots</p>
            </button>
            <button
              type="button"
              onClick={() => onJumpTab('help_center')}
              className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3 text-left hover:border-[#D4AF37]"
            >
              <p className="text-xs font-semibold text-white">Help Centre & Costs</p>
              <p className="text-[11px] text-[#8E8EA2] mt-0.5">Tutorials, status & transparent fees</p>
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-8 text-center text-xs text-[#9B9BAE]">
          {loadingCc ? 'Loading live Daily Business Command Center...' : 'Select a date range to view daily business metrics.'}
        </div>
      )}
    </div>
  );
};
