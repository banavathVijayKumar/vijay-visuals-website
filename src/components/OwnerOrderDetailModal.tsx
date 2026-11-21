import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  MapPin,
  Package,
  Phone,
  Printer,
  RotateCcw,
  Shield,
  Truck,
  User,
  X,
} from 'lucide-react';
import { OrderRecord, DeliveryPartnerRecord } from '../types/platform';
import { apiFetch } from '../lib/api';

interface OwnerOrderDetailModalProps {
  order: OrderRecord;
  deliveryPartners: DeliveryPartnerRecord[];
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated: () => void;
  onOpenInvoice: (ord: OrderRecord, businessName: string) => void;
  businessName: string;
  onNotify: (msg: string) => void;
}

export const OwnerOrderDetailModal: React.FC<OwnerOrderDetailModalProps> = ({
  order,
  deliveryPartners,
  isOpen,
  onClose,
  onOrderUpdated,
  onOpenInvoice,
  businessName,
  onNotify,
}) => {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [refunding, setRefunding] = useState(false);
  const [refundNotes, setRefundNotes] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  let items: any[] = [];
  try {
    items = JSON.parse(order.itemsJson || '[]');
  } catch {
    items = [];
  }

  const handleUpdateStatus = async (status: string, extra?: Record<string, any>) => {
    setBusy(true);
    try {
      await apiFetch(`/api/owner/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, ...extra }),
      });
      onNotify(`Order status updated to ${status.replace(/_/g, ' ')}.`);
      onOrderUpdated();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to update order.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdatePaymentStatus = async (paymentStatus: string, extra?: Record<string, any>) => {
    setBusy(true);
    try {
      await apiFetch(`/api/owner/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ paymentStatus, ...extra }),
      });
      onNotify(`Payment status updated to ${paymentStatus}.`);
      onOrderUpdated();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to update payment.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectReason.trim()) {
      onNotify('Please provide a reason for rejecting this order.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/owner/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'reject', rejectionReason: rejectReason.trim() }),
      });
      onNotify('Order rejected and customer notification queued.');
      setRejecting(false);
      onOrderUpdated();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to reject order.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmRefund = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/owner/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'refund', refundNotes: refundNotes.trim() || 'Refund issued by store owner' }),
      });
      onNotify(`Payment marked refunded for order ${order.orderNumber}.`);
      setRefunding(false);
      onOrderUpdated();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to process refund.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[#2B2B3C] bg-[#0E0E14] p-6 shadow-2xl space-y-5 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1E1E2B] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono-tabular text-base font-bold text-[#D4AF37]">{order.orderNumber}</span>
              <span className="rounded bg-[#1A1A26] border border-[#2A2A38] px-2 py-0.5 text-[10px] text-[#A5A5B8] uppercase">
                {order.paymentMethod}
              </span>
            </div>
            <p className="text-[11px] text-[#8E8EA2] mt-0.5">Placed on {order.createdAt || 'N/A'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[#8E8EA2] hover:text-white"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Customer & Address Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="rounded-xl border border-[#20202E] bg-[#12121B] p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-white">
              <User className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Customer Information</span>
            </div>
            <p className="text-white font-medium text-sm">{order.customerName}</p>
            <div className="space-y-1 text-[#A5A5B8]">
              <div className="flex items-center gap-1.5 font-mono-tabular">
                <Phone className="w-3 h-3 text-[#7E7E92]" />
                <a href={`tel:${order.customerPhone}`} className="hover:text-white hover:underline">
                  {order.customerPhone}
                </a>
              </div>
              {order.customerEmail && (
                <div className="text-[11px] text-[#8E8EA2] truncate">{order.customerEmail}</div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#20202E] bg-[#12121B] p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-white">
              <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Shipping Destination</span>
            </div>
            <p className="text-[#C8C8D8] text-[11px] whitespace-pre-wrap leading-relaxed">
              {order.shippingAddress || 'Store Pickup / Counter Sale'}
            </p>
          </div>
        </div>

        {/* Order Items Breakdown */}
        <div className="rounded-xl border border-[#20202E] bg-[#12121B] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1E1E2B] bg-[#0A0A0F] font-semibold text-white flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Purchased Items Snapshot ({items.length})</span>
            </span>
            <span className="text-[10px] text-[#8E8EA2]">Historical record (immutable)</span>
          </div>
          <div className="divide-y divide-[#1C1C28] p-1">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5">
                <div>
                  <p className="font-medium text-white">{item.name || item.title || 'Product'}</p>
                  <p className="text-[10px] text-[#8E8EA2]">
                    Qty: {item.quantity || item.qty || 1} {item.variant ? `· Variant: ${item.variant}` : ''}
                  </p>
                </div>
                <div className="text-right font-mono-tabular text-white font-medium">
                  ₹{((item.price || 0) * (item.quantity || item.qty || 1)).toLocaleString('en-IN')}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-[#1E1E2B] bg-[#0C0C12] p-3 space-y-1 text-[#A5A5B8]">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-mono-tabular text-white">₹{(order.subtotal || order.total).toLocaleString('en-IN')}</span>
            </div>
            {order.discount ? (
              <div className="flex justify-between text-emerald-400">
                <span>Discount:</span>
                <span className="font-mono-tabular">-₹{order.discount.toLocaleString('en-IN')}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-white font-bold text-sm pt-1 border-t border-[#1C1C28]">
              <span>Total Payable:</span>
              <span className="font-mono-tabular text-[#D4AF37]">₹{order.total.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        {/* Payment & Delivery Partner Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="rounded-xl border border-[#20202E] bg-[#12121B] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Payment Status</span>
              </span>
              <span className={`px-2 py-0.5 rounded font-medium text-[10px] ${
                order.paymentStatus === 'paid' ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40' :
                order.paymentStatus === 'refunded' ? 'bg-rose-950/60 text-rose-300 border border-rose-800/40' :
                'bg-amber-950/60 text-amber-300 border border-amber-800/40'
              }`}>
                {order.paymentStatus.toUpperCase()}
              </span>
            </div>
            {order.paymentReference && (
              <p className="text-[11px] text-[#A5A5B8]">UTR / Ref: <span className="font-mono-tabular text-white">{order.paymentReference}</span></p>
            )}
            <div className="flex gap-1.5 pt-1">
              {order.paymentStatus !== 'paid' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleUpdatePaymentStatus('paid')}
                  className="px-2.5 py-1 rounded bg-emerald-600 text-white text-[10px] font-semibold hover:bg-emerald-500"
                >
                  Mark Paid
                </button>
              )}
              {order.paymentStatus === 'paid' && (
                <button
                  type="button"
                  onClick={() => setRefunding(true)}
                  className="px-2.5 py-1 rounded border border-rose-500/40 text-rose-300 text-[10px] hover:bg-rose-950/40"
                >
                  Process Refund
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-[#20202E] bg-[#12121B] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Delivery Partner</span>
              </span>
              <span className="text-[10px] text-[#8E8EA2]">
                {order.deliveryPartnerId ? 'Assigned' : 'Unassigned'}
              </span>
            </div>
            <select
              value={order.deliveryPartnerId ?? ''}
              disabled={busy}
              onChange={async (e) => {
                const partnerId = e.target.value ? Number(e.target.value) : null;
                await apiFetch(`/api/owner/orders/${order.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ deliveryPartnerId: partnerId }),
                });
                onNotify('Delivery partner assigned.');
                onOrderUpdated();
              }}
              className="w-full rounded border border-[#2A2A38] bg-[#0A0A0E] px-2.5 py-1.5 text-xs text-white"
            >
              <option value="">Select rider to assign...</option>
              {deliveryPartners.map((dp) => (
                <option key={dp.id} value={dp.id}>
                  {dp.name} ({dp.available ? 'Available' : 'Busy'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Rejection Sub-Modal */}
        {rejecting && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-4 space-y-2.5">
            <p className="font-semibold text-rose-300">Reject Order with Reason</p>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Out of stock, Delivery location not serviceable"
              className="w-full rounded border border-[#2A2A38] bg-[#0A0A0E] px-3 py-1.5 text-xs text-white"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRejecting(false)}
                className="px-2.5 py-1 rounded border border-[#2A2A38] text-[10px] text-[#A5A5B8]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !rejectReason.trim()}
                onClick={handleConfirmReject}
                className="px-3 py-1 rounded bg-rose-600 text-white text-[10px] font-semibold"
              >
                {busy ? 'Processing...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        )}

        {/* Refund Sub-Modal */}
        {refunding && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-4 space-y-2.5">
            <p className="font-semibold text-rose-300">Issue Refund for Order {order.orderNumber}</p>
            <p className="text-[11px] text-[#C8C8D8]">
              This will update the payment status to <strong>REFUNDED</strong> and record the event in the business audit trail.
            </p>
            <input
              type="text"
              value={refundNotes}
              onChange={(e) => setRefundNotes(e.target.value)}
              placeholder="Reason / Refund reference (optional)"
              className="w-full rounded border border-[#2A2A38] bg-[#0A0A0E] px-3 py-1.5 text-xs text-white"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRefunding(false)}
                className="px-2.5 py-1 rounded border border-[#2A2A38] text-[10px] text-[#A5A5B8]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmRefund}
                className="px-3 py-1 rounded bg-rose-600 text-white text-[10px] font-semibold"
              >
                {busy ? 'Refunding...' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        )}

        {/* Actions Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#1E1E2B]">
          <div className="flex flex-wrap items-center gap-1.5">
            {order.status === 'placed' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleUpdateStatus('confirmed')}
                className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500"
              >
                Accept Order
              </button>
            )}
            {order.status === 'confirmed' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleUpdateStatus('packed')}
                className="px-3 py-1.5 rounded bg-sky-600 text-white text-xs font-semibold hover:bg-sky-500"
              >
                Mark Packed
              </button>
            )}
            {order.status === 'packed' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleUpdateStatus('out_for_delivery')}
                className="px-3 py-1.5 rounded bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500"
              >
                Mark Dispatched
              </button>
            )}
            {order.status === 'out_for_delivery' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleUpdateStatus('delivered')}
                className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500"
              >
                Mark Delivered
              </button>
            )}
            {order.status !== 'cancelled' && order.status !== 'delivered' && (
              <button
                type="button"
                onClick={() => setRejecting(true)}
                className="px-3 py-1.5 rounded border border-rose-600/40 text-rose-300 text-xs hover:bg-rose-950/30"
              >
                Reject Order
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenInvoice(order, businessName)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#D4AF37]/40 text-[#ECC86A] text-xs font-medium hover:bg-[#1A180E]"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Tax Invoice</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded border border-[#2A2A38] bg-[#12121A] text-xs text-white hover:border-[#D4AF37]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
