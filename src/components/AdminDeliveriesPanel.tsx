import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Wand2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface AdminDeliveryItem {
  id: number;
  ownerId: string;
  buyerEmail: string;
  buyerName: string;
  planCode: string;
  planName: string;
  billingCycle: string;
  baseAmountInr: number;
  gstAmountInr: number;
  totalAmountInr: number;
  paymentOrderId?: string;
  paymentId?: string | null;
  razorpayOrderId?: string;
  razorpayPaymentId?: string | null;
  signatureVerified: boolean;
  status: string;
  orderState: string;
  deliveryStatus: string;
  provisioningError: string | null;
  deliveryAttempts: number;
  deliveredAt: string | null;
  websiteId: string | null;
  websiteSlug: string | null;
  websiteName: string | null;
  websiteUrl: string | null;
  websiteStatus: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface DeliveriesApiResponse {
  stats: {
    totalOrders: number;
    totalDelivered: number;
    totalPending: number;
    totalFailed: number;
    totalRefunded: number;
  };
  deliveries: AdminDeliveryItem[];
}

interface AdminDeliveriesPanelProps {
  onNotify: (msg: string) => void;
}

export const AdminDeliveriesPanel: React.FC<AdminDeliveriesPanelProps> = ({ onNotify }) => {
  const [data, setData] = useState<DeliveriesApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'failed' | 'refunded'>('all');
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<DeliveriesApiResponse>('/api/admin/deliveries');
      setData(res);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load delivery records.');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

  const handleRetryDelivery = async (paymentId: number) => {
    setRetryingId(paymentId);
    try {
      const res = await apiFetch<{ ok: boolean; message: string; websiteUrl?: string }>(
        '/api/admin/deliveries',
        {
          method: 'POST',
          body: JSON.stringify({ paymentId }),
        }
      );
      onNotify(res.message || 'Website delivery retried successfully!');
      await loadDeliveries();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Delivery retry failed.');
    } finally {
      setRetryingId(null);
    }
  };

  const filteredDeliveries = (data?.deliveries || []).filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      item.buyerEmail.toLowerCase().includes(q) ||
      item.buyerName.toLowerCase().includes(q) ||
      (item.websiteSlug || '').toLowerCase().includes(q) ||
      item.planName.toLowerCase().includes(q) ||
      (item.paymentOrderId || item.razorpayOrderId || '').toLowerCase().includes(q) ||
      (item.paymentId || item.razorpayPaymentId || '').toLowerCase().includes(q) ||
      String(item.id).includes(q);

    if (!matchesSearch) return false;

    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return item.orderState === 'ACTIVE' || item.deliveryStatus === 'DELIVERY_READY';
    if (statusFilter === 'failed') return item.orderState === 'DELIVERY_FAILED' || item.deliveryStatus === 'DELIVERY_FAILED';
    if (statusFilter === 'refunded') return item.orderState === 'REFUNDED' || item.status === 'refunded';
    if (statusFilter === 'pending') {
      return (
        item.orderState === 'PAYMENT_PENDING' ||
        item.orderState === 'PROVISIONING' ||
        item.orderState === 'PAYMENT_VERIFIED'
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header and Refresh */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#D4AF37]" />
            <span>Automatic Website Delivery &amp; Tenant Provisioning Engine</span>
          </h2>
          <p className="text-xs text-[#9E9EB2] mt-0.5">
            Real-time status of all customer package purchases, delivery state transitions, and safe retry recovery.
          </p>
        </div>
        <button
          type="button"
          onClick={loadDeliveries}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#2B2B3C] bg-[#12121A] text-xs text-[#ECC86A] hover:bg-[#1A1A26] transition-colors self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Deliveries</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3.5">
          <p className="text-[11px] text-[#8E8EA2]">Total Orders</p>
          <p className="font-mono-tabular text-lg font-bold text-white mt-0.5">
            {data?.stats.totalOrders ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3.5">
          <p className="text-[11px] text-emerald-300">Live Delivered</p>
          <p className="font-mono-tabular text-lg font-bold text-emerald-400 mt-0.5">
            {data?.stats.totalDelivered ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-sky-900/40 bg-sky-950/20 p-3.5">
          <p className="text-[11px] text-sky-300">Pending / Awaiting</p>
          <p className="font-mono-tabular text-lg font-bold text-sky-400 mt-0.5">
            {data?.stats.totalPending ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-rose-900/40 bg-rose-950/20 p-3.5">
          <p className="text-[11px] text-rose-300">Delivery Failed</p>
          <p className="font-mono-tabular text-lg font-bold text-rose-400 mt-0.5">
            {data?.stats.totalFailed ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3.5">
          <p className="text-[11px] text-amber-300">Refunded</p>
          <p className="font-mono-tabular text-lg font-bold text-amber-400 mt-0.5">
            {data?.stats.totalRefunded ?? 0}
          </p>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-[#737388] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer email, name, slug, or order ID..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-[#2B2B3C] bg-[#09090D] text-white placeholder-[#68687A] focus:outline-none focus:border-[#D4AF37]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {(
            [
              { id: 'all', label: 'All Orders' },
              { id: 'active', label: 'Live Delivered' },
              { id: 'pending', label: 'Pending / In Progress' },
              { id: 'failed', label: 'Delivery Failed' },
              { id: 'refunded', label: 'Refunded' },
            ] as const
          ).map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStatusFilter(filter.id)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                statusFilter === filter.id
                  ? 'bg-[#D4AF37] text-[#08080A]'
                  : 'bg-[#12121A] text-[#9E9EB2] hover:text-white border border-[#222230]'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Deliveries Table */}
      <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-[#8E8EA2] flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
            <span>Loading customer website delivery records...</span>
          </div>
        ) : filteredDeliveries.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#8E8EA2]">
            No delivery records matched the current search and filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#1E1E2B] bg-[#09090D] text-[11px] uppercase tracking-wider text-[#7E7E92]">
                <tr>
                  <th className="py-3 px-4">Order / Customer</th>
                  <th className="py-3 px-4">Purchased Package</th>
                  <th className="py-3 px-4">Payment Verification</th>
                  <th className="py-3 px-4">Delivery State</th>
                  <th className="py-3 px-4">Website URL</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A24]">
                {filteredDeliveries.map((item) => {
                  const isDelivered =
                    item.orderState === 'ACTIVE' || item.deliveryStatus === 'DELIVERY_READY';
                  const isFailed =
                    item.orderState === 'DELIVERY_FAILED' || item.deliveryStatus === 'DELIVERY_FAILED';
                  const isRefunded = item.orderState === 'REFUNDED' || item.status === 'refunded';
                  const isPending = !isDelivered && !isFailed && !isRefunded;

                  return (
                    <tr key={item.id} className="hover:bg-[#12121A]/50 transition-colors">
                      {/* Order / Customer */}
                      <td className="py-3.5 px-4 space-y-0.5">
                        <p className="font-mono-tabular font-medium text-white">
                          Order #{item.id}
                        </p>
                        <p className="text-[11px] text-[#A5A5B8]">
                          {item.buyerName || 'Customer'}
                        </p>
                        <p className="text-[10px] text-[#7E7E92] font-mono-tabular">
                          {item.buyerEmail || item.ownerId}
                        </p>
                      </td>

                      {/* Purchased Package */}
                      <td className="py-3.5 px-4 space-y-0.5">
                        <p className="font-medium text-[#ECC86A]">{item.planName}</p>
                        <p className="font-mono-tabular text-[11px] text-white">
                          ₹{item.totalAmountInr.toLocaleString('en-IN')}{' '}
                          <span className="text-[10px] text-[#7E7E92]">
                            (₹{item.baseAmountInr.toLocaleString('en-IN')} + ₹{item.gstAmountInr.toLocaleString('en-IN')} GST)
                          </span>
                        </p>
                        <p className="text-[10px] text-[#7E7E92] capitalize">
                          {item.billingCycle.replace('_', ' ')}
                        </p>
                      </td>

                      {/* Payment Verification */}
                      <td className="py-3.5 px-4 space-y-0.5">
                        {item.signatureVerified ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>HMAC Verified</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Pending Signature</span>
                          </span>
                        )}
                        {(item.paymentId || item.razorpayPaymentId) && (
                          <p className="font-mono-tabular text-[10px] text-[#7E7E92]">
                            {item.paymentId || item.razorpayPaymentId}
                          </p>
                        )}
                        <p className="text-[10px] text-[#606070]">
                          {item.paidAt ? new Date(item.paidAt).toLocaleDateString('en-IN') : 'Unpaid'}
                        </p>
                      </td>

                      {/* Delivery State */}
                      <td className="py-3.5 px-4 space-y-1">
                        {isDelivered && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 text-[11px] font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Delivered · Active</span>
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/40 text-[11px] font-medium">
                            <AlertCircle className="w-3 h-3" />
                            <span>Delivery Failed</span>
                          </span>
                        )}
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-800/40 text-[11px] font-medium">
                            <Clock className="w-3 h-3" />
                            <span>Provisioning...</span>
                          </span>
                        )}
                        {isRefunded && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40 text-[11px] font-medium">
                            <span>Refunded</span>
                          </span>
                        )}

                        {item.provisioningError && (
                          <p className="text-[10px] text-rose-300 max-w-xs leading-snug">
                            Error: {item.provisioningError}
                          </p>
                        )}
                      </td>

                      {/* Website URL */}
                      <td className="py-3.5 px-4 space-y-0.5">
                        {item.websiteUrl ? (
                          <a
                            href={item.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono-tabular text-xs text-[#ECC86A] hover:underline"
                          >
                            <span>/site/{item.websiteSlug}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-[11px] text-[#6E6E82]">Unlinked</span>
                        )}
                        {item.websiteName && (
                          <p className="text-[10px] text-[#A5A5B8] truncate max-w-xs">
                            {item.websiteName}
                          </p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right space-x-2">
                        {item.signatureVerified && !isRefunded && (
                          <button
                            type="button"
                            disabled={retryingId === item.id}
                            onClick={() => handleRetryDelivery(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#D4AF37]/50 bg-[#121218] text-[#ECC86A] hover:bg-[#D4AF37] hover:text-[#08080A] text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            {retryingId === item.id ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Retrying...</span>
                              </>
                            ) : (
                              <>
                                <Wand2 className="w-3 h-3" />
                                <span>{isFailed ? 'Retry Delivery' : 'Sync Entitlement'}</span>
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
