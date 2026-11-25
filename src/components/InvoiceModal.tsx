import React from 'react';
import { Printer, X } from 'lucide-react';
import { maskPaymentReference } from '../lib/paymentDisplay';
import { OrderItemLine, OrderRecord } from '../types/platform';

interface InvoiceModalProps {
  order: OrderRecord | null;
  tenantName: string;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ order, tenantName, onClose }) => {
  if (!order) return null;

  let items: OrderItemLine[] = [];
  try {
    items = JSON.parse(order.itemsJson || '[]');
  } catch {
    items = [];
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl border border-[#2A2A38] bg-[#101016] text-[#E8E8ED] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#222230]">
          <h3 className="font-luxury text-base font-semibold text-white">
            Tax Invoice · {order.invoiceNumber}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#8B8B9C] hover:text-white"
              aria-label="Close invoice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="printable-invoice p-6 space-y-6 bg-[#0B0B10]">
          <div className="flex flex-wrap justify-between gap-4 border-b border-[#222230] pb-4">
            <div>
              <p className="font-luxury text-lg font-bold text-[#ECC86A]">{tenantName}</p>
              <p className="text-xs text-[#8E8EA0] mt-0.5">Tax Invoice</p>
            </div>
            <div className="text-right text-xs font-mono-tabular">
              <p className="text-white">Invoice: {order.invoiceNumber}</p>
              <p className="text-[#8E8EA0]">Order: {order.orderNumber}</p>
              <p className="text-[#8E8EA0]">Date: {new Date(order.createdAt).toLocaleDateString('en-IN')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-[#8E8EA0] mb-1">Billed & Shipped To</p>
              <p className="text-white font-semibold">{order.customerName}</p>
              <p className="text-[#B4B4C4]">{order.customerPhone}</p>
              {order.customerEmail && <p className="text-[#B4B4C4]">{order.customerEmail}</p>}
              <p className="text-[#B4B4C4] mt-1">{order.shippingAddress}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-[#8E8EA0] mb-1">Payment Summary</p>
              <p className="text-white capitalize">Method: {order.paymentMethod.replace('_', ' ')}</p>
              <p className="text-white capitalize">Status: {order.paymentStatus.replace('_', ' ')}</p>
              {order.paymentReference && <p className="font-mono-tabular text-[#ECC86A]">Ref: {maskPaymentReference(order.paymentReference)}</p>}
              {order.isWholesale && <p className="text-[#ECC86A] mt-1">Wholesale Bulk Pricing Applied</p>}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#242432] text-[#8E8EA0] text-left">
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 px-3">Variant</th>
                  <th className="py-2 px-3 text-right">Qty</th>
                  <th className="py-2 px-3 text-right">Unit Price</th>
                  <th className="py-2 pl-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1C1C28]">
                {items.map((line, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 pr-3 text-white font-medium">{line.name}</td>
                    <td className="py-2.5 px-3 text-[#9B9BAE]">{line.variant || 'Standard'}</td>
                    <td className="py-2.5 px-3 text-right font-mono-tabular">{line.quantity}</td>
                    <td className="py-2.5 px-3 text-right font-mono-tabular">₹{line.unitPrice.toLocaleString('en-IN')}</td>
                    <td className="py-2.5 pl-3 text-right font-mono-tabular text-white">₹{line.lineTotal.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-[#242432] pt-4 ml-auto max-w-xs space-y-1.5 text-xs">
            <div className="flex justify-between text-[#A3A3B5]">
              <span>Subtotal</span>
              <span className="font-mono-tabular">₹{order.subtotal.toLocaleString('en-IN')}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Discount ({order.couponCode || 'Promo'})</span>
                <span className="font-mono-tabular">-₹{order.discount.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div className="flex justify-between text-[#A3A3B5]">
              <span>Delivery Fee</span>
              <span className="font-mono-tabular">₹{order.deliveryFee.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-white pt-2 border-t border-[#242432]">
              <span>Grand Total (INR)</span>
              <span className="font-mono-tabular text-[#ECC86A]">₹{order.total.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
