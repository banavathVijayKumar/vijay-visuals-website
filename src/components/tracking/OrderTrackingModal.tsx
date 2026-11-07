import React, { useState } from 'react';
import {
  X,
  Search,
  CheckCircle2,
  Clock,
  Bike,
  Package,
  MapPin,
  ShieldCheck,
  Phone,
  MessageCircle,
  AlertCircle,
  Star
} from 'lucide-react';
import { orderService, Order, OrderStatus } from '../../lib/supabase';
import { CONTACT_INFO } from '../../data/content';

interface OrderTrackingModalProps {
  isOpen: boolean;
  initialOrderNumber?: string;
  onClose: () => void;
}

const STAGES = [
  { id: 'placed', label: 'Order Placed', desc: 'Received by store system' },
  { id: 'accepted', label: 'Order Accepted', desc: 'Merchant confirmed order' },
  { id: 'preparing', label: 'Preparing', desc: 'Items being assembled' },
  { id: 'quality_check', label: 'Quality Check', desc: 'Checked for accuracy' },
  { id: 'packed', label: 'Packed & Sealed', desc: 'Ready for rider pickup' },
  { id: 'assigned', label: 'Assigned to Fleet', desc: 'Rider dispatched to store' },
  { id: 'out_for_delivery', label: 'Out for Delivery', desc: 'Live on route to your location' },
  { id: 'reached_customer', label: 'Arrived at Address', desc: 'Rider at your doorstep' },
  { id: 'otp_verified', label: 'OTP Confirmed', desc: 'Secure delivery handshake' },
  { id: 'delivered', label: 'Delivered', desc: 'Safely handed over' },
  { id: 'review_submitted', label: 'Completed & Rated', desc: 'Customer satisfaction recorded' },
];

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({
  isOpen,
  initialOrderNumber = '',
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState(initialOrderNumber);
  const [activeOrder, setActiveOrder] = useState<Order | null>(() => {
    if (initialOrderNumber) {
      return orderService.getOrderByNumber(initialOrderNumber) || null;
    }
    const all = orderService.getAllOrders();
    return all.length > 0 ? all[0] : null;
  });
  const [searchError, setSearchError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);
    if (!searchTerm.trim()) {
      setSearchError('Please enter an order number or customer phone.');
      return;
    }

    const found = orderService.getOrderByNumber(searchTerm.trim()) ||
      orderService.getAllOrders().find(o => o.customer_phone.includes(searchTerm.trim()));

    if (found) {
      setActiveOrder(found);
    } else {
      setSearchError(`No order found matching "${searchTerm}". Please check your order ID.`);
    }
  };

  // Map order status to progress index (0 to 10)
  const getStageIndex = (status: OrderStatus): number => {
    switch (status) {
      case 'placed': return 1;
      case 'confirmed': return 2;
      case 'preparing': return 3;
      case 'assigned': return 5;
      case 'accepted': return 6;
      case 'out_for_delivery': return 7;
      case 'reached_location': return 8;
      case 'delivered': return 10;
      case 'cancelled':
      case 'rejected': return 0;
      default: return 2;
    }
  };

  const currentStageIndex = activeOrder ? getStageIndex(activeOrder.order_status) : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#0B0B12] border border-[#262638] rounded-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-[#88889C] hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 border-b border-[#1E1E2C] pb-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#171724] border border-[#DFBA5A]/30 flex items-center justify-center text-[#DFBA5A]">
            <Bike className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-luxury text-xl font-bold text-white">Live Order Tracking</h3>
            <p className="text-xs text-[#808092]">Real-time 11-stage delivery progression & rider status</p>
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-6 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#686878]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Enter Order # (e.g. ORD-2025-001) or Mobile Number"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#12121D] border border-[#26263A] text-xs text-white placeholder-[#5A5A6C] focus:outline-none focus:border-[#DFBA5A]"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider hover:brightness-110"
          >
            Track
          </button>
        </form>

        {searchError && (
          <div className="p-3 mb-6 rounded-xl bg-[#201014] border border-[#4A2026] text-xs text-[#FF8585] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}

        {activeOrder ? (
          <div className="space-y-6">
            {/* Order Summary Pill */}
            <div className="p-4 rounded-xl bg-[#11111B] border border-[#1F1F30] flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-widest text-[#828294] block">
                  Order Reference
                </span>
                <span className="text-sm font-bold font-mono text-[#DFBA5A]">
                  {activeOrder.order_number}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-mono tracking-widest text-[#828294] block">
                  Customer
                </span>
                <span className="text-xs font-semibold text-white">
                  {activeOrder.customer_name}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-mono tracking-widest text-[#828294] block">
                  Amount
                </span>
                <span className="text-xs font-bold text-white">
                  ₹{activeOrder.total_amount.toLocaleString()}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-mono tracking-widest text-[#828294] block">
                  Status
                </span>
                <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-[#1D1B12] text-[#DFBA5A] border border-[#DFBA5A]/30">
                  {activeOrder.order_status.replace('_', ' ')}
                </span>
              </div>
            </div>

            {/* Delivery Boy Contact Card (if assigned) */}
            {activeOrder.assigned_delivery_boy_name && (
              <div className="p-3.5 rounded-xl bg-[#141E16] border border-[#203D24] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#1B331F] text-[#25D366] flex items-center justify-center font-bold text-xs">
                    <Bike className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Rider: {activeOrder.assigned_delivery_boy_name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#25D366]/20 text-[#25D366]">
                        Active Fleet
                      </span>
                    </h5>
                    <p className="text-[11px] text-[#86AA8B]">
                      Express City Dispatch · Phone: +91 9381362201
                    </p>
                  </div>
                </div>

                <a
                  href="tel:919381362201"
                  className="px-3 py-1.5 rounded-lg bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 text-xs font-semibold flex items-center gap-1"
                >
                  <Phone className="w-3 h-3" />
                  <span>Call Rider</span>
                </a>
              </div>
            )}

            {/* 11-Stage Visual Progress Timeline */}
            <div className="border border-[#1E1E2C] rounded-2xl p-5 bg-[#0D0D15]">
              <h4 className="text-xs uppercase font-mono tracking-widest text-[#828294] mb-4">
                11-Stage Delivery Timeline
              </h4>

              <div className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#1E1E2C]">
                {STAGES.map((st, idx) => {
                  const isCompleted = idx <= currentStageIndex;
                  const isCurrent = idx === currentStageIndex;

                  return (
                    <div key={st.id} className="relative flex items-start gap-4">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 z-10 transition-colors ${
                          isCompleted
                            ? 'bg-[#DFBA5A] text-[#0A0A0E] font-bold shadow-md shadow-[#DFBA5A]/30'
                            : 'bg-[#181824] text-[#5A5A6C] border border-[#26263A]'
                        }`}
                      >
                        {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                      </div>

                      <div className="flex-1 pt-0.5">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-semibold ${
                              isCurrent
                                ? 'text-[#DFBA5A]'
                                : isCompleted
                                ? 'text-white'
                                : 'text-[#585868]'
                            }`}
                          >
                            {st.label}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#2D210E] text-[#DFBA5A] animate-pulse">
                              In Progress
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#7A7A8C]">{st.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live WhatsApp Status Update Trigger */}
            <div className="flex items-center justify-between gap-4 pt-2">
              <a
                href={`${CONTACT_INFO.whatsappUrl}?text=${encodeURIComponent(
                  `Hello Vijay Visuals, I would like a live status update on my order ${activeOrder.order_number}.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#152418] hover:bg-[#1C3321] text-[#25D366] text-xs font-semibold border border-[#25D366]/30"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp Live Dispatch Desk</span>
              </a>

              <button
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-[#1C1C28] hover:bg-[#252536] text-white text-xs font-semibold"
              >
                Close Tracking
              </button>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-[#7A7A8C]">
            <Package className="w-10 h-10 mx-auto text-[#484858] mb-2" />
            <p className="text-xs">No active order loaded. Search using your order ID.</p>
          </div>
        )}
      </div>
    </div>
  );
};
