import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CreditCard, ShieldCheck, Wallet, Mail, MessageSquare } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  PlatformAnnouncementRecord,
  PlatformPaymentRecord,
  SellerPayoutAccountRecord,
  SellerTransferRecord,
} from '../types/platform';

interface AdminEcosystemPanelProps {
  onNotify: (msg: string) => void;
}

export const AdminEcosystemPanel: React.FC<AdminEcosystemPanelProps> = ({ onNotify }) => {
  const [loading, setLoading] = useState(true);
  const [cashfree, setCashfree] = useState<{
    configured: boolean;
    mode: string;
    message: string;
    webhookConfigured: boolean;
  } | null>(null);
  const [payments, setPayments] = useState<PlatformPaymentRecord[]>([]);
  const [sellers, setSellers] = useState<SellerPayoutAccountRecord[]>([]);
  const [transfers, setTransfers] = useState<SellerTransferRecord[]>([]);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncementRecord[]>([]);
  const [webhookCount, setWebhookCount] = useState(0);
  const [notificationLogs, setNotificationLogs] = useState<
    Array<{
      id: number;
      recipient: string;
      channel: string;
      eventType: string;
      subject: string;
      status: string;
      providerMessageId: string;
      errorDetail: string;
      createdAt: string;
      fallbackAvailable: boolean;
    }>
  >([]);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [whatsappConfigured, setWhatsappConfigured] = useState(false);
  const [refundHistory, setRefundHistory] = useState<Array<Record<string, any>>>([]);
  const [deliveryHistory, setDeliveryHistory] = useState<Array<Record<string, any>>>([]);

  // Announcement form
  const [annTitle, setAnnTitle] = useState('');
  const [annMsg, setAnnMsg] = useState('');
  const [annSeverity, setAnnSeverity] = useState<'info' | 'update' | 'maintenance'>('info');

  // Seller Route review drafts
  const [routeIdDrafts, setRouteIdDrafts] = useState<Record<number, string>>({});
  const [commissionDrafts, setCommissionDrafts] = useState<Record<number, number>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        cashfree?: { configured: boolean; mode: string; message: string; webhookConfigured: boolean };
        platformPayments: PlatformPaymentRecord[];
        sellerAccounts: SellerPayoutAccountRecord[];
        sellerTransfers: SellerTransferRecord[];
        announcements: PlatformAnnouncementRecord[];
        webhookEvents: Array<{ id: number }>;
        notificationLogs?: Array<any>;
        refundHistory?: Array<Record<string, any>>;
        deliveryHistory?: Array<Record<string, any>>;
        emailConfigured?: boolean;
        whatsappConfigured?: boolean;
      }>('/api/admin/ecosystem');
      setCashfree(res.cashfree || null);
      setPayments(res.platformPayments);
      setSellers(res.sellerAccounts);
      setTransfers(res.sellerTransfers);
      setAnnouncements(res.announcements);
      setWebhookCount(res.webhookEvents.length);
      setNotificationLogs(res.notificationLogs || []);
      setRefundHistory(res.refundHistory || []);
      setDeliveryHistory(res.deliveryHistory || []);
      setEmailConfigured(Boolean(res.emailConfigured));
      setWhatsappConfigured(Boolean(res.whatsappConfigured));
      const rDrafts: Record<number, string> = {};
      const cDrafts: Record<number, number> = {};
      res.sellerAccounts.forEach((s) => {
        rDrafts[s.id] = s.razorpayAccountId || '';
        cDrafts[s.id] = s.platformCommissionPct;
      });
      setRouteIdDrafts(rDrafts);
      setCommissionDrafts(cDrafts);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load admin ecosystem panel.');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-8 text-center text-xs text-[#9E9EB2]">
        Loading Cashfree payments, Seller Settlement queue & platform announcements...
      </div>
    );
  }

  return (
    <div className="space-y-6 text-xs">
      {/* Cashfree & Webhook Health */}
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-[#ECC86A] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            <span>Cashfree Payments &amp; Webhook Security Status</span>
          </p>
          <p className="text-[#A3A3B5] mt-1">{cashfree?.message}</p>
        </div>
        <div className="flex flex-wrap gap-2 font-mono-tabular">
          <span className="px-2.5 py-1 rounded border border-[#2A2A38] text-[#ECC86A]">
            Mode: {(cashfree?.mode || 'unconfigured').toUpperCase()}
          </span>
          <span className="px-2.5 py-1 rounded border border-[#2A2A38] text-[#B8B8C8]">
            Verified Webhooks: {webhookCount}
          </span>
          <span className="px-2.5 py-1 rounded border border-[#2A2A38] text-[#B8B8C8]">
            Seller Transfers: {transfers.length}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Global Announcements Publisher */}
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#D4AF37]" />
            <span>Global Platform Announcements</span>
          </h3>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await apiFetch('/api/admin/announcements', {
                method: 'POST',
                body: JSON.stringify({ title: annTitle, message: annMsg, severity: annSeverity }),
              });
              setAnnTitle('');
              setAnnMsg('');
              onNotify('Platform announcement published.');
              loadData();
            }}
            className="space-y-2.5"
          >
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                required
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder="Announcement Title"
                className="col-span-2 rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
              />
              <select
                value={annSeverity}
                onChange={(e) => setAnnSeverity(e.target.value as typeof annSeverity)}
                className="rounded border border-[#2A2A38] bg-[#08080C] px-2 py-2 text-white"
              >
                <option value="info">Info</option>
                <option value="update">Release Update</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
            <input
              type="text"
              required
              value={annMsg}
              onChange={(e) => setAnnMsg(e.target.value)}
              placeholder="Broadcast message visible across Vijay Visuals"
              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-white"
            />
            <button type="submit" className="px-4 py-2 rounded bg-gold-gradient text-[#08080A] font-semibold">
              Publish Announcement
            </button>
          </form>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {announcements.map((a) => (
              <div key={a.id} className="rounded border border-[#1F1F2D] bg-[#09090D] p-3 flex justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{a.title}</p>
                  <p className="text-[11px] text-[#9E9EB2]">{a.message}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/admin/announcements/${a.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ active: !a.active }),
                    });
                    loadData();
                  }}
                  className={`px-2.5 py-1 rounded border h-fit ${
                    a.active ? 'border-emerald-500/40 text-emerald-300' : 'border-[#2A2A38] text-[#8E8EA2]'
                  }`}
                >
                  {a.active ? 'Active' : 'Hidden'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Verified Platform Payments & Refund Control */}
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#D4AF37]" />
            <span>Vijay Visuals Platform Payments ({payments.length})</span>
          </h3>
          {payments.length === 0 ? (
            <p className="text-[#8E8EA2]">
              No Cashfree platform payments recorded yet. Configure Cashfree Sandbox credentials in Secrets to accept verified platform purchases.
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {payments.map((p) => (
                <div key={p.id} className="rounded border border-[#1F1F2D] bg-[#09090D] p-3 flex justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">
                      {p.receiptNumber} · {p.planName}
                    </p>
                    <p className="text-[11px] text-[#8E8EA2] font-mono-tabular">
                      ₹{p.amountInr.toLocaleString('en-IN')} · {p.mode.toUpperCase()} · {p.status} · Sig:{' '}
                      {p.signatureVerified ? 'Verified' : 'Pending'}
                    </p>
                    <p className="text-[10px] text-[#8E8EA2]">
                      Access: {p.accessStatus || p.entitlementStatus || 'inactive'} · Entitlement:{' '}
                      {p.entitlementStatus || 'inactive'} · Delivery: {p.deliveryStatus || 'unknown'}
                    </p>
                    <p className="text-[10px] text-[#7E7E92]">
                      Email: {p.verificationStatus === 'unavailable' ? 'verification unavailable' : p.emailVerified ? 'verified' : 'unverified'}
                      {' · '}Account: {p.accountStatus || 'active'}
                    </p>
                    <p className="text-[10px] text-[#7E7E92] font-mono-tabular">
                      Cashfree order: {p.cashfreeOrderId || 'unavailable'}
                      {p.cashfreePaymentId ? ` · payment: ${p.cashfreePaymentId}` : ''}
                      {p.accessStartDate ? ` · from ${new Date(p.accessStartDate).toLocaleDateString('en-IN')}` : ''}
                      {p.accessEndDate ? ` · until ${new Date(p.accessEndDate).toLocaleDateString('en-IN')}` : ''}
                    </p>
                  </div>
                  {p.status === 'paid' && p.signatureVerified && !p.refundId && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiFetch(`/api/payments/platform/${p.id}/refund`, { method: 'POST' });
                          onNotify(`Refund initiated for ${p.receiptNumber}.`);
                          loadData();
                        } catch (err) {
                          onNotify(err instanceof Error ? err.message : 'Refund failed.');
                        }
                      }}
                      className="px-2.5 py-1 rounded border border-rose-500/40 text-rose-300 h-fit"
                    >
                      Refund
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-2">
            <h3 className="text-sm font-semibold text-white">Refund &amp; Reversal History ({refundHistory.length})</h3>
            {refundHistory.length === 0 ? (
              <p className="text-[11px] text-[#8E8EA2]">No refund ledger records found.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto text-[10px] text-[#A0A0B4]">
                {refundHistory.map((r) => (
                  <p key={r.id} className="font-mono-tabular">
                    #{r.id} · {r.flowType} · ₹{Number(r.amountInr || 0).toLocaleString('en-IN')} · {r.status}
                    {r.cashfreeRefundId ? ` · ${r.cashfreeRefundId}` : ''}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-2">
            <h3 className="text-sm font-semibold text-white">Delivery &amp; Recovery History ({deliveryHistory.length})</h3>
            {deliveryHistory.length === 0 ? (
              <p className="text-[11px] text-[#8E8EA2]">No delivery audit events found.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto text-[10px] text-[#A0A0B4]">
                {deliveryHistory.map((d) => (
                  <p key={d.id} className="font-mono-tabular">
                    {d.action} · {d.targetType || 'payment'} {d.targetId} · {d.createdAt}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Seller Cashfree Easy Split & Platform Commission Control */}
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[#D4AF37]" />
          <span>Seller Payouts &amp; Easy Split Commission Control ({sellers.length})</span>
        </h3>
        {sellers.length === 0 ? (
          <p className="text-[#8E8EA2]">No business owners have submitted payout details yet.</p>
        ) : (
          <div className="space-y-3">
            {sellers.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border border-[#1F1F2D] bg-[#09090D] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
              >
                <div>
                  <p className="font-semibold text-white">
                    {s.legalBusinessName} (Tenant #{s.tenantId})
                  </p>
                  <p className="text-[11px] text-[#8E8EA2] font-mono-tabular">
                    Bank ****{s.bankAccountLast4} · IFSC {s.ifscCode} · GSTIN {s.gstin || 'N/A'} · Status:{' '}
                    <span className="text-[#ECC86A]">{s.kycStatus}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={routeIdDrafts[s.id] ?? ''}
                    onChange={(e) => setRouteIdDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                    placeholder="CF Easy Split Account ID"
                    className="rounded border border-[#2A2A38] bg-[#101018] px-2.5 py-1.5 text-white font-mono-tabular w-44"
                  />
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={commissionDrafts[s.id] ?? 5}
                    onChange={(e) => setCommissionDrafts((prev) => ({ ...prev, [s.id]: Number(e.target.value) }))}
                    className="rounded border border-[#2A2A38] bg-[#101018] px-2 py-1.5 text-white font-mono-tabular w-16"
                    title="Platform Commission %"
                  />
                  <span className="text-[#8E8EA2]">%</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/admin/seller-accounts/${s.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                          kycStatus: 'verified',
                          razorpayAccountId: routeIdDrafts[s.id] || '',
                          platformCommissionPct: commissionDrafts[s.id] ?? 5,
                          routeEnabled: Boolean(routeIdDrafts[s.id]),
                        }),
                      });
                      onNotify(`Updated Cashfree Easy Split verification for ${s.legalBusinessName}.`);
                      loadData();
                    }}
                    className="px-3 py-1.5 rounded bg-emerald-600 text-white font-semibold"
                  >
                    Approve & Save
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/admin/seller-accounts/${s.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ kycStatus: 'rejected', routeEnabled: false }),
                      });
                      onNotify(`Rejected KYC for ${s.legalBusinessName}.`);
                      loadData();
                    }}
                    className="px-3 py-1.5 rounded border border-rose-500/40 text-rose-300"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. TRANSACTIONAL NOTIFICATIONS MONITOR (RESEND & WHATSAPP) */}
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#1E1E2B]">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#DFBA5A]" />
              <span>Transactional Notifications Ledger</span>
            </h3>
            <p className="text-[11px] text-[#8E8EA2]">
              Real-time audit log of customer registration OTPs, order confirmations, payment receipts, and delivery notifications.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                emailConfigured
                  ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-950/60 border border-amber-500/40 text-amber-300'
              }`}
            >
              Email: {emailConfigured ? 'Resend Ready' : 'Setup Required'}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                whatsappConfigured
                  ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-950/60 border border-amber-500/40 text-amber-300'
              }`}
            >
              WhatsApp: {whatsappConfigured ? 'Cloud API' : 'Click-to-Chat Fallback'}
            </span>
          </div>
        </div>

        {notificationLogs.length === 0 ? (
          <p className="text-[#8E8EA2] text-center py-4">No notification events recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#1E1E2B] text-[#8E8EA2]">
                  <th className="pb-2 font-medium">Channel</th>
                  <th className="pb-2 font-medium">Event</th>
                  <th className="pb-2 font-medium">Recipient</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Provider Ref ID</th>
                  <th className="pb-2 font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#171722]">
                {notificationLogs.map((log) => (
                  <tr key={log.id} className="text-[#CCCCCC]">
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-1 font-semibold uppercase text-[10px] text-white">
                        {log.channel === 'whatsapp' ? (
                          <>
                            <MessageSquare className="w-3 h-3 text-emerald-400" /> WhatsApp
                          </>
                        ) : (
                          <>
                            <Mail className="w-3 h-3 text-[#DFBA5A]" /> Email
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono text-[11px] text-[#E0C068]">{log.eventType}</td>
                    <td className="py-2.5 font-mono text-[11px] text-white">{log.recipient}</td>
                    <td className="py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          log.status === 'delivered' || log.status === 'sent'
                            ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-500/30'
                            : log.status === 'setup_required'
                              ? 'bg-amber-950/50 text-amber-300 border border-amber-500/30'
                              : 'bg-rose-950/50 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono text-[10px] text-[#8E8EA2]">
                      {log.providerMessageId || '—'}
                    </td>
                    <td className="py-2.5 text-[11px] text-[#707085]">{log.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
