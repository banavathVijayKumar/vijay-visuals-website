import React, { useState } from 'react';
import { Mail, MessageSquare, Phone, ShoppingBag, User, X } from 'lucide-react';
import { OrderRecord } from '../types/platform';

export interface CustomerProfileData {
  name: string;
  phone: string;
  email: string;
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string;
}

interface OwnerCustomerProfileModalProps {
  customer: CustomerProfileData;
  orders: OrderRecord[];
  isOpen: boolean;
  onClose: () => void;
  onOpenOrder: (ord: OrderRecord) => void;
  onNotify: (msg: string) => void;
}

export const OwnerCustomerProfileModal: React.FC<OwnerCustomerProfileModalProps> = ({
  customer,
  orders,
  isOpen,
  onClose,
  onOpenOrder,
  onNotify,
}) => {
  const [notes, setNotes] = useState('');
  const [commPref, setCommPref] = useState<'whatsapp' | 'phone' | 'email'>('whatsapp');

  if (!isOpen) return null;

  const cleanPhone = customer.phone.replace(/\D/g, '');
  const customerOrders = orders.filter((o) => {
    const oPhone = String(o.customerPhone || '').replace(/\D/g, '');
    const oEmail = String(o.customerEmail || '').toLowerCase();
    return (
      (cleanPhone && oPhone === cleanPhone) ||
      (customer.email && oEmail === customer.email.toLowerCase()) ||
      o.customerName.toLowerCase() === customer.name.toLowerCase()
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[#2B2B3C] bg-[#0E0E14] p-6 shadow-2xl space-y-5 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1E1E2B] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#1A1A26] border border-[#2A2A38] flex items-center justify-center text-[#D4AF37] font-bold text-sm">
              {customer.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">{customer.name}</h3>
              <p className="text-[11px] text-[#8E8EA2]">Storefront Customer Profile</p>
            </div>
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

        {/* Contact Info & Direct Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="rounded-xl border border-[#20202E] bg-[#12121B] p-3.5 space-y-2">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Contact Details</span>
            </span>
            <div className="space-y-1 text-[#A5A5B8]">
              <div className="flex items-center gap-1.5 font-mono-tabular">
                <Phone className="w-3 h-3 text-[#7E7E92]" />
                <a href={`tel:${customer.phone}`} className="hover:text-white hover:underline">
                  {customer.phone || 'No phone'}
                </a>
              </div>
              <div className="flex items-center gap-1.5">
                <Mail className="w-3 h-3 text-[#7E7E92]" />
                <span className="truncate">{customer.email || 'No email provided'}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#20202E] bg-[#12121B] p-3.5 space-y-2">
            <span className="text-xs font-semibold text-white">Lifetime Value</span>
            <div>
              <p className="font-mono-tabular text-lg font-bold text-[#D4AF37]">
                ₹{customer.totalSpent.toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-[#8E8EA2]">
                {customerOrders.length} placed {customerOrders.length === 1 ? 'order' : 'orders'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              {cleanPhone && (
                <a
                  href={`https://wa.me/91${cleanPhone.slice(-10)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 rounded bg-[#25D366]/20 border border-[#25D366]/40 text-[#25D366] text-[10px] font-medium hover:bg-[#25D366]/30 inline-flex items-center gap-1"
                >
                  <MessageSquare className="w-3 h-3" /> WhatsApp
                </a>
              )}
              {customer.phone && (
                <a
                  href={`tel:${customer.phone}`}
                  className="px-2 py-1 rounded border border-[#2A2A38] text-white text-[10px] hover:border-[#D4AF37]"
                >
                  Call
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Communication Preferences & Notes */}
        <div className="rounded-xl border border-[#20202E] bg-[#12121B] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white">Preferred Channel</span>
            <div className="flex items-center gap-2">
              {(['whatsapp', 'phone', 'email'] as const).map((pref) => (
                <button
                  key={pref}
                  type="button"
                  onClick={() => setCommPref(pref)}
                  className={`px-2 py-0.5 rounded text-[10px] capitalize font-medium ${
                    commPref === pref
                      ? 'bg-[#D4AF37] text-[#08080A]'
                      : 'bg-[#1C1C28] text-[#8E8EA2] hover:text-white'
                  }`}
                >
                  {pref}
                </button>
              ))}
            </div>
          </div>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add internal notes about customer preferences, measurements, or special requests..."
            className="w-full rounded border border-[#2A2A38] bg-[#0A0A0E] px-3 py-1.5 text-xs text-white placeholder:text-[#6E6E82]"
          />
        </div>

        {/* Order History */}
        <div className="rounded-xl border border-[#20202E] bg-[#12121B] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1E1E2B] bg-[#0A0A0F] font-semibold text-white flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Purchase History ({customerOrders.length})</span>
            </span>
          </div>
          <div className="divide-y divide-[#1C1C28] max-h-48 overflow-y-auto">
            {customerOrders.length === 0 ? (
              <p className="p-4 text-center text-[11px] text-[#8E8EA2]">No orders recorded.</p>
            ) : (
              customerOrders.map((ord) => (
                <div
                  key={ord.id}
                  onClick={() => {
                    onClose();
                    onOpenOrder(ord);
                  }}
                  className="flex items-center justify-between p-3 hover:bg-[#1A1A26] cursor-pointer transition-colors"
                >
                  <div>
                    <span className="font-mono-tabular font-medium text-[#ECC86A]">{ord.orderNumber}</span>
                    <span className="text-[10px] text-[#8E8EA2] ml-2">{ord.createdAt || 'N/A'}</span>
                    <div className="text-[10px] text-[#A5A5B8] capitalize mt-0.5">
                      Status: {ord.status.replace(/_/g, ' ')} · {ord.paymentMethod.toUpperCase()}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono-tabular font-bold text-white">
                      ₹{ord.total.toLocaleString('en-IN')}
                    </span>
                    <div className="text-[9px] text-[#D4AF37] hover:underline mt-0.5">View &gt;</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-[#1E1E2B]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded border border-[#2A2A38] bg-[#12121A] text-xs text-white hover:border-[#D4AF37]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
