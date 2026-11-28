// ============================================================================
// VIJAY VISUALS — BUSINESS OWNER DASHBOARD
// Separate platform-owner workspace. The server is the authority: this page
// only renders after useAuth receives the server-verified Owner flag.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Building2,
  CircleDollarSign,
  ClipboardList,
  Coins,
  CreditCard,
  Globe2,
  LockKeyhole,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
  WalletCards,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { canAccessBusinessOwnerDashboard } from '../lib/dashboardAccess';
import { useAuth } from '../hooks/useAuth';
import { VijayVisualsLogo } from './VijayVisualsLogo';

const OWNER_EMAIL = 'vk66278@gmail.com';

interface OwnerDashboardData {
  ok: boolean;
  owner: { fullName: string; email: string; title: string };
  overview: {
    totalCustomers: number;
    websiteCustomers: number;
    ecommerceCustomers: number;
    totalWebsites: number;
    publishedWebsites: number;
    unpublishedWebsites: number;
    allStores: number;
    activeSubscriptions: number;
    lifetimeEntitlements: number;
    totalRevenue: number;
    pendingPayments: number;
    monthlyGrowthPercent: number;
    currentMonthUsers: number;
    previousMonthUsers: number;
  };
  finance: {
    cashfree: {
      successful: number;
      failed: number;
      refunded: number;
      pending: number;
      totalRevenue: number;
    };
    settlements: { settledAmount: number; pendingAmount: number };
    refunds: { count: number; amount: number };
    expenses: { count: number; amount: number };
    profitAndLoss: { revenue: number; expenses: number; netProfit: number };
    monthlyRevenue: Array<{ month: string; amount: number }>;
    recentPayments: Array<{
      id: number;
      entityType: string;
      amount: number;
      currency: string;
      status: string;
      createdAt: string;
    }>;
  };
  customers: {
    total: number;
    websiteCustomers: number;
    ecommerceCustomers: number;
    statusCounts: Record<string, number>;
    openSupportTickets: number;
  };
  websites: {
    total: number;
    statusCounts: Record<string, number>;
    websiteRequests: number;
  };
  ecommerce: { stores: number; totalOrders: number; paidOrders: number };
  team: {
    superAdmins: number;
    platformStaff: number;
    rolePermissions: Record<string, number>;
    activityLogs: Array<{ id: string; action: string; entityType: string; createdAt: string }>;
  };
  settings: {
    plans: { total: number; active: number };
    offers: number;
    requestsByStatus: Record<string, number>;
  };
  security: {
    ownerProfile: { fullName: string; email: string; title: string; emailVerified: boolean };
    loginSecurity: { mfaStatus: string; passwordHandling: string };
    auditLogSample: number;
    auditLogTotal: number;
    backupStatus: Record<string, number>;
    criticalSettings: Record<string, boolean>;
  };
}

type ModuleKey =
  | 'overview'
  | 'finance'
  | 'customers'
  | 'websites'
  | 'ecommerce'
  | 'team'
  | 'settings'
  | 'security';

const MODULES: Array<{ key: ModuleKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'overview', label: 'Business Overview', icon: BarChart3 },
  { key: 'finance', label: 'Financial Management', icon: WalletCards },
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'websites', label: 'Websites', icon: Globe2 },
  { key: 'ecommerce', label: 'E-Commerce', icon: ShoppingBag },
  { key: 'team', label: 'Team & Staff', icon: BadgeCheck },
  { key: 'settings', label: 'Pricing & Offers', icon: ClipboardList },
  { key: 'security', label: 'Security', icon: ShieldCheck },
];

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function formatMoney(value: number | undefined): string {
  return inr.format(Number(value || 0));
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#242433] bg-[#0D0D14]/95 p-4 sm:p-6 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
      <div className="mb-4">
        <h3 className="font-luxury text-lg sm:text-xl text-[#F5E2AC]">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs sm:text-sm text-[#8E8EA2]">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent
          ? 'border-[#D4AF37]/40 bg-gradient-to-br from-[#D4AF37]/12 to-[#0D0D14]'
          : 'border-[#242433] bg-[#101019]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <Icon className={`h-5 w-5 ${accent ? 'text-[#ECC86A]' : 'text-[#9E9EB2]'}`} />
        <span className="text-[10px] uppercase tracking-[0.16em] text-[#77778A]">{label}</span>
      </div>
      <p className="font-mono-tabular mt-3 text-xl sm:text-2xl font-semibold text-white">{value}</p>
      {detail ? <p className="mt-1 text-[11px] text-[#8E8EA2]">{detail}</p> : null}
    </div>
  );
}

function CountGrid({ values }: { values: Record<string, number> }) {
  const entries = Object.entries(values || {});
  if (entries.length === 0) return <p className="text-sm text-[#8E8EA2]">No records yet.</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-lg border border-[#242433] bg-[#101019] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-[#77778A]">{key.replaceAll('_', ' ')}</p>
          <p className="font-mono-tabular mt-1 text-lg text-white">{value}</p>
        </div>
      ))}
    </div>
  );
}

interface BusinessOwnerDashboardProps {
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
  onGoDashboards: () => void;
}

export const BusinessOwnerDashboard: React.FC<BusinessOwnerDashboardProps> = ({
  onNotify,
  onGoDashboards,
}) => {
  const { profile, isPlatformOwner, loading, refreshProfile, openAuthModal } = useAuth();
  const hasAccess = !loading && canAccessBusinessOwnerDashboard(isPlatformOwner);
  const [data, setData] = useState<OwnerDashboardData | null>(null);
  const [module, setModule] = useState<ModuleKey>('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provisionToken, setProvisionToken] = useState('');
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const signedInAsOwner =
    String(profile?.email || '').trim().toLowerCase() === OWNER_EMAIL.toLowerCase();

  const load = useCallback(async () => {
    if (!hasAccess) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch<OwnerDashboardData>('/api/platform-owner/dashboard');
      setData(response);
    } catch (err: any) {
      const message = String(err?.message || 'Unable to load the Owner dashboard.');
      setError(message);
      onNotify(message, 'error');
    } finally {
      setBusy(false);
    }
  }, [hasAccess, onNotify]);

  useEffect(() => {
    void load();
  }, [load]);

  const provisionOwner = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!signedInAsOwner || !provisionToken.trim()) return;
      setProvisioning(true);
      setProvisionError(null);
      try {
        const result = await apiFetch<{ ok: boolean; provisioned: boolean }>(
          '/api/platform-owner/provision',
          { method: 'POST', body: { token: provisionToken } }
        );
        setProvisionToken('');
        onNotify(
          result.provisioned
            ? 'Business Owner identity provisioned successfully.'
            : 'Business Owner identity was already authorized.',
          'success'
        );
        await refreshProfile();
      } catch (err: any) {
        const message = String(err?.message || 'Owner provisioning failed.');
        setProvisionError(message);
        onNotify(message, 'error');
      } finally {
        setProvisioning(false);
      }
    },
    [signedInAsOwner, provisionToken, onNotify, refreshProfile]
  );

  const revenueChart = useMemo(() => {
    const series = data?.finance.monthlyRevenue || [];
    const max = Math.max(...series.map((item) => item.amount), 1);
    return series.map((item) => ({
      ...item,
      width: `${Math.max((item.amount / max) * 100, 2)}%`,
    }));
  }, [data]);

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center text-[#9E9EB2]">
        Verifying Owner access…
      </main>
    );
  }

  if (!hasAccess) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <div className="rounded-2xl border border-rose-400/30 bg-[#120C12] p-8 text-center">
          <LockKeyhole className="mx-auto h-10 w-10 text-rose-300" />
          <h1 className="font-luxury mt-4 text-2xl text-white">Owner access required</h1>
          <p className="mt-3 text-sm text-[#A5A5B8]">
            This workspace is restricted to the verified Business Owner account. Super Admin and
            customer sessions cannot access it.
          </p>
          {signedInAsOwner ? (
            <form onSubmit={provisionOwner} className="mt-7 space-y-3 text-left">
              <label htmlFor="owner-provision-token" className="block text-xs text-[#D4AF37]">
                One-time Owner provisioning token
              </label>
              <input
                id="owner-provision-token"
                type="password"
                autoComplete="off"
                value={provisionToken}
                onChange={(event) => setProvisionToken(event.target.value)}
                placeholder="Enter the Preview provisioning token"
                className="w-full rounded-lg border border-[#303044] bg-[#0B0B11] px-3 py-2 text-sm text-white outline-none focus:border-[#D4AF37]"
              />
              <p className="text-[11px] text-[#77778A]">
                No password, OTP, or email body is handled here. Your signed-in{' '}
                {OWNER_EMAIL} session is bound to the singleton Owner record.
              </p>
              {provisionError ? (
                <p className="text-xs text-rose-300">{provisionError}</p>
              ) : null}
              <button
                type="submit"
                disabled={provisioning || !provisionToken.trim()}
                className="w-full rounded-full bg-gold-gradient px-5 py-2.5 text-sm font-semibold text-[#08080A] disabled:opacity-60"
              >
                {provisioning ? 'Verifying…' : 'Activate Owner Access'}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal('signin')}
              className="mt-6 rounded-full bg-gold-gradient px-5 py-2.5 text-sm font-semibold text-[#08080A]"
            >
              Sign in as {OWNER_EMAIL}
            </button>
          )}
          <button
            type="button"
            onClick={onGoDashboards}
            className="mt-3 block w-full text-sm text-[#9E9EB2] hover:text-white"
          >
            Back to Workspaces
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-8 sm:py-12">
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <VijayVisualsLogo variant="compact" size="sm" mode="dark" />
          <p className="mt-4 text-[11px] uppercase tracking-[0.28em] text-[#D4AF37]">
            Exclusive Founder Workspace
          </p>
          <h1 className="font-luxury mt-2 text-3xl sm:text-4xl text-white">Business Owner Dashboard</h1>
          <p className="mt-2 text-sm text-[#9E9EB2]">
            {data?.owner.fullName || 'Vijay Kumar'} · {data?.owner.title || 'Founder & Creative Director'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 self-start rounded-full border border-[#D4AF37]/40 px-4 py-2 text-sm font-medium text-[#F5E2AC] hover:bg-[#D4AF37]/10 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {error ? (
        <div className="mb-6 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {!data ? (
        <div className="rounded-2xl border border-[#242433] bg-[#0D0D14] p-10 text-center text-[#9E9EB2]">
          {busy ? 'Loading verified business intelligence…' : 'No business data available.'}
        </div>
      ) : (
        <>
          <nav className="no-scrollbar mb-6 flex gap-2 overflow-x-auto rounded-xl border border-[#20202E] bg-[#0B0B11] p-2">
            {MODULES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setModule(key)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  module === key
                    ? 'bg-gold-gradient text-[#08080A]'
                    : 'text-[#9E9EB2] hover:bg-[#171722] hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>

          {module === 'overview' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <StatCard label="Customers" value={data.overview.totalCustomers} icon={Users} accent />
                <StatCard label="Websites" value={data.overview.totalWebsites} icon={Globe2} />
                <StatCard label="Stores" value={data.overview.allStores} icon={Store} />
                <StatCard label="Active Subs" value={data.overview.activeSubscriptions} icon={BadgeCheck} />
                <StatCard label="Revenue" value={formatMoney(data.overview.totalRevenue)} icon={CircleDollarSign} accent />
                <StatCard label="Pending" value={data.overview.pendingPayments} icon={CreditCard} />
                <StatCard label="Growth" value={`${data.overview.monthlyGrowthPercent}%`} icon={BarChart3} />
                <StatCard label="Published" value={data.overview.publishedWebsites} icon={Globe2} />
              </div>
              <Panel title="Revenue trajectory" subtitle="Cashfree successful payments by month">
                <div className="space-y-3">
                  {revenueChart.length === 0 ? (
                    <p className="text-sm text-[#8E8EA2]">No successful payments recorded yet.</p>
                  ) : (
                    revenueChart.map((item) => (
                      <div key={item.month} className="grid grid-cols-[64px_1fr_100px] items-center gap-3">
                        <span className="text-xs text-[#8E8EA2]">{item.month}</span>
                        <div className="h-2 rounded-full bg-[#1A1A26]">
                          <div className="h-2 rounded-full bg-gold-gradient" style={{ width: item.width }} />
                        </div>
                        <span className="font-mono-tabular text-right text-xs text-white">
                          {formatMoney(item.amount)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            </div>
          ) : null}

          {module === 'finance' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <StatCard label="Cashfree paid" value={data.finance.cashfree.successful} icon={CreditCard} accent />
                <StatCard label="Failed" value={data.finance.cashfree.failed} icon={Activity} />
                <StatCard label="Refunds" value={data.finance.refunds.count} icon={Coins} />
                <StatCard label="Net profit" value={formatMoney(data.finance.profitAndLoss.netProfit)} icon={CircleDollarSign} accent />
                <StatCard label="Expenses" value={formatMoney(data.finance.expenses.amount)} icon={WalletCards} />
                <StatCard label="Settled" value={formatMoney(data.finance.settlements.settledAmount)} icon={BadgeCheck} />
                <StatCard label="Pending settle" value={formatMoney(data.finance.settlements.pendingAmount)} icon={CreditCard} />
                <StatCard label="Refund value" value={formatMoney(data.finance.refunds.amount)} icon={Coins} />
              </div>
              <Panel title="Cashfree records" subtitle="Aggregate-safe fields only; no customer or bank details">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="text-[#77778A]">
                      <tr>
                        <th className="py-2">Order</th>
                        <th className="py-2">Type</th>
                        <th className="py-2">Amount</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1D1D28] text-[#D7D7E2]">
                      {data.finance.recentPayments.length === 0 ? (
                        <tr><td colSpan={5} className="py-4 text-[#8E8EA2]">No payment records yet.</td></tr>
                      ) : (
                        data.finance.recentPayments.map((payment) => (
                          <tr key={payment.id}>
                            <td className="py-2 font-mono-tabular">#{payment.id}</td>
                            <td className="py-2">{payment.entityType.replaceAll('_', ' ')}</td>
                            <td className="py-2 font-mono-tabular">{formatMoney(payment.amount)}</td>
                            <td className="py-2">{payment.status}</td>
                            <td className="py-2 text-[#8E8EA2]">{payment.createdAt}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          ) : null}

          {module === 'customers' ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Customer portfolio" subtitle="Strictly aggregate counts">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Total" value={data.customers.total} icon={Users} accent />
                  <StatCard label="Website" value={data.customers.websiteCustomers} icon={Globe2} />
                  <StatCard label="Store" value={data.customers.ecommerceCustomers} icon={ShoppingBag} />
                  <StatCard label="Open support" value={data.customers.openSupportTickets} icon={Activity} />
                </div>
              </Panel>
              <Panel title="Customer status" subtitle="Account state distribution">
                <CountGrid values={data.customers.statusCounts} />
              </Panel>
            </div>
          ) : null}

          {module === 'websites' ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Website portfolio" subtitle="Published and unpublished customer websites">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Total" value={data.websites.total} icon={Globe2} accent />
                  <StatCard label="Published" value={data.overview.publishedWebsites} icon={BadgeCheck} />
                  <StatCard label="Unpublished" value={data.overview.unpublishedWebsites} icon={Building2} />
                  <StatCard label="Requests" value={data.websites.websiteRequests} icon={ClipboardList} />
                </div>
              </Panel>
              <Panel title="Website status" subtitle="Publication state distribution">
                <CountGrid values={data.websites.statusCounts} />
              </Panel>
            </div>
          ) : null}

          {module === 'ecommerce' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard label="Stores" value={data.ecommerce.stores} icon={Store} accent />
                <StatCard label="Orders" value={data.ecommerce.totalOrders} icon={Package} />
                <StatCard label="Paid orders" value={data.ecommerce.paidOrders} icon={BadgeCheck} />
              </div>
              <Panel title="Store operations" subtitle="Orders overview without customer PII">
                <p className="text-sm text-[#A5A5B8]">
                  {data.ecommerce.paidOrders} of {data.ecommerce.totalOrders} orders are paid. Store
                  status and subscription data remain tenant-scoped in the existing owner workspace.
                </p>
              </Panel>
            </div>
          ) : null}

          {module === 'team' ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Super Admin & staff" subtitle="No Owner privilege is granted by these roles">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Super Admins" value={data.team.superAdmins} icon={ShieldCheck} accent />
                  <StatCard label="Staff" value={data.team.platformStaff} icon={Users} />
                </div>
                <div className="mt-5">
                  <CountGrid values={data.team.rolePermissions} />
                </div>
              </Panel>
              <Panel title="Activity logs" subtitle="Recent safe audit metadata">
                <div className="space-y-2">
                  {data.team.activityLogs.length === 0 ? (
                    <p className="text-sm text-[#8E8EA2]">No activity recorded yet.</p>
                  ) : (
                    data.team.activityLogs.map((log) => (
                      <div key={log.id} className="rounded-lg border border-[#20202E] bg-[#101019] px-3 py-2 text-xs">
                        <span className="text-white">{log.action}</span>
                        <span className="text-[#77778A]"> · {log.entityType}</span>
                        <span className="float-right text-[#77778A]">{log.createdAt}</span>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            </div>
          ) : null}

          {module === 'settings' ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Packages & subscriptions" subtitle="Active catalog and lifetime entitlements">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Plans" value={data.settings.plans.total} icon={ClipboardList} accent />
                  <StatCard label="Active plans" value={data.settings.plans.active} icon={BadgeCheck} />
                  <StatCard label="Offers" value={data.settings.offers} icon={Coins} />
                  <StatCard label="Lifetime" value={data.overview.lifetimeEntitlements} icon={BadgeCheck} />
                </div>
              </Panel>
              <Panel title="Requests by status" subtitle="Proposal and offer workflow">
                <CountGrid values={data.settings.requestsByStatus} />
              </Panel>
            </div>
          ) : null}

          {module === 'security' ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Owner profile & login security" subtitle="Verified singleton identity">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4"><span className="text-[#8E8EA2]">Name</span><span className="text-white">{data.security.ownerProfile.fullName}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-[#8E8EA2]">Email</span><span className="text-white">{data.security.ownerProfile.email}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-[#8E8EA2]">Designation</span><span className="text-white">{data.security.ownerProfile.title}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-[#8E8EA2]">Email verified</span><span className="text-white">{String(data.security.ownerProfile.emailVerified)}</span></div>
                  <div className="flex justify-between gap-4"><span className="text-[#8E8EA2]">MFA</span><span className="text-white">{data.security.loginSecurity.mfaStatus}</span></div>
                </div>
              </Panel>
              <Panel title="Audit & backup status" subtitle="Critical settings without secret values">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Audit logs" value={data.security.auditLogTotal} icon={Activity} accent />
                    <StatCard label="Sample" value={data.security.auditLogSample} icon={ClipboardList} />
                  </div>
                  <CountGrid values={data.security.backupStatus} />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {Object.entries(data.security.criticalSettings).map(([key, value]) => (
                      <div key={key} className="rounded-lg border border-[#20202E] bg-[#101019] px-3 py-2 text-xs">
                        <span className="text-[#8E8EA2]">{key}</span>
                        <span className={`float-right font-semibold ${value ? 'text-emerald-300' : 'text-amber-300'}`}>
                          {value ? 'ready' : 'missing'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
};
