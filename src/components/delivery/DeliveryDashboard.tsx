import React, { useState, useEffect } from 'react';
import {
  UserProfile,
  DeliveryBoyProfile,
  Order,
  deliveryService,
  orderService,
  authService,
  subscribeToStore,
  OrderStatus
} from '../../lib/supabase';
import {
  Bike,
  LogOut,
  MapPin,
  Phone,
  MessageCircle,
  Navigation,
  CheckCircle2,
  Clock,
  Package,
  Check,
  X,
  AlertCircle,
  Calendar,
  DollarSign,
  Star,
  ChevronRight,
  Shield,
  Layers,
  ArrowRight
} from 'lucide-react';

interface DeliveryDashboardProps {
  currentUser: UserProfile;
  onLogout: () => void;
  onShowToast: (msg: string) => void;
}

export const DeliveryDashboard: React.FC<DeliveryDashboardProps> = ({
  currentUser,
  onLogout,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'history' | 'profile'>('active');
  const [deliveryBoyData, setDeliveryBoyData] = useState<{ profile: UserProfile; details: DeliveryBoyProfile } | null>(null);
  const [assignedOrders, setAssignedOrders] = useState<Order[]>([]);
  const [selectedOrderForDelivery, setSelectedOrderForDelivery] = useState<Order | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryOtp, setDeliveryOtp] = useState('');

  // Refresh data function
  const loadData = () => {
    const dData = deliveryService.getDeliveryBoyProfile(currentUser.id);
    setDeliveryBoyData(dData);
    // Strict isolation: Delivery boys see ONLY orders assigned to them
    const orders = orderService.getDeliveryBoyOrders(currentUser.id);
    setAssignedOrders(orders);
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToStore(loadData);
    return () => unsub();
  }, [currentUser.id]);

  const activeOrders = assignedOrders.filter(
    (o) => o.order_status !== 'delivered' && o.order_status !== 'cancelled'
  );
  const completedOrders = assignedOrders.filter((o) => o.order_status === 'delivered');

  const handleToggleStatus = (status: 'available' | 'busy' | 'offline') => {
    deliveryService.updateAvailability(currentUser.id, status);
    onShowToast(`Fleet status updated to: ${status.toUpperCase()}`);
  };

  const handleAcceptOrder = (orderId: string) => {
    orderService.updateOrderStatus(orderId, 'accepted');
    onShowToast('Order accepted! Head to the store for pickup.');
  };

  const handleRejectOrder = (orderId: string) => {
    if (confirm('Are you sure you want to decline this delivery assignment? It will return to the dispatch pool.')) {
      orderService.updateOrderStatus(orderId, 'rejected');
      onShowToast('Order declined and returned to dispatch.');
    }
  };

  const handleStatusStep = (order: Order, nextStatus: OrderStatus) => {
    orderService.updateOrderStatus(order.id, nextStatus);
    const labels: Record<string, string> = {
      out_for_delivery: 'Order is Out for Delivery! Customer has been notified.',
      reached_location: 'Arrived at delivery location.',
    };
    onShowToast(labels[nextStatus] || 'Order status updated.');
  };

  const handleCompleteDelivery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForDelivery) return;

    orderService.updateOrderStatus(
      selectedOrderForDelivery.id,
      'delivered',
      deliveryNotes ? `Delivered by partner. Note: ${deliveryNotes}` : 'Delivered successfully in good condition.'
    );

    onShowToast(`Order ${selectedOrderForDelivery.order_number} marked as DELIVERED!`);
    setSelectedOrderForDelivery(null);
    setDeliveryNotes('');
    setDeliveryOtp('');
  };

  const details = deliveryBoyData?.details || {
    id: currentUser.id,
    vehicle_type: 'Bike',
    vehicle_number: 'TS 09 EA 4589',
    assigned_area: 'Banjara Hills, Hyderabad',
    active_status: 'available',
    total_deliveries: 142,
    rating: 4.9,
  };

  return (
    <div className="min-h-screen bg-[#08080C] text-[#E8E8ED] flex flex-col justify-between">
      {/* Top Navbar */}
      <header className="bg-[#0D0D14] border-b border-[#1E1E2A] sticky top-0 z-30 px-4 sm:px-6 py-3.5 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#1E7E34] to-[#128C7E] flex items-center justify-center text-[#25D366] shadow-md">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-luxury font-bold text-white text-base tracking-wide">
                  Vijay Visuals Logistics
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#162919] text-[#25D366] border border-[#25D366]/30">
                  Delivery Partner
                </span>
              </div>
              <p className="text-[11px] text-[#868698]">
                {currentUser.full_name} · {details.assigned_area}
              </p>
            </div>
          </div>

          {/* Quick Availability Switcher */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:flex items-center gap-1 bg-[#13131D] p-1 rounded-lg border border-[#232332]">
              {(['available', 'busy', 'offline'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => handleToggleStatus(st)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded capitalize transition-all ${
                    details.active_status === st
                      ? st === 'available'
                        ? 'bg-[#1E7E34] text-white shadow'
                        : st === 'busy'
                        ? 'bg-[#B7791F] text-white shadow'
                        : 'bg-[#4A5568] text-white shadow'
                      : 'text-[#848496] hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181824] hover:bg-[#202030] text-xs font-semibold text-[#FF8585] border border-[#2E2020] hover:border-[#FF5555]/50 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 flex-1">
        
        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-[#0E0E16] border border-[#20202E] rounded-xl p-4">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#828294] block">
              Active Deliveries
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-mono text-2xl font-bold text-[#DFBA5A]">
                {activeOrders.length}
              </span>
              <span className="text-[11px] text-[#707084]">in progress</span>
            </div>
          </div>

          <div className="bg-[#0E0E16] border border-[#20202E] rounded-xl p-4">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#828294] block">
              Completed Total
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-mono text-2xl font-bold text-white">
                {details.total_deliveries}
              </span>
              <span className="text-[11px] text-[#25D366]">orders</span>
            </div>
          </div>

          <div className="bg-[#0E0E16] border border-[#20202E] rounded-xl p-4">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#828294] block">
              Fleet Rating
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="font-mono text-2xl font-bold text-[#DFBA5A]">
                {details.rating}
              </span>
              <Star className="w-4 h-4 fill-[#DFBA5A] text-[#DFBA5A] mb-1 inline" />
              <span className="text-[11px] text-[#707084] ml-1">(5.0 max)</span>
            </div>
          </div>

          <div className="bg-[#0E0E16] border border-[#20202E] rounded-xl p-4">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#828294] block">
              Vehicle Assigned
            </span>
            <p className="text-sm font-bold text-white mt-1 truncate">
              {details.vehicle_type}
            </p>
            <span className="text-[11px] font-mono text-[#8C8C9E]">
              {details.vehicle_number}
            </span>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-2 border-b border-[#1E1E2A] pb-3 mb-6">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'active'
                ? 'bg-[#181826] text-[#DFBA5A] border border-[#DFBA5A]/40 shadow-sm'
                : 'text-[#848496] hover:text-white'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Assigned Tasks ({activeOrders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'history'
                ? 'bg-[#181826] text-[#DFBA5A] border border-[#DFBA5A]/40 shadow-sm'
                : 'text-[#848496] hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Delivery History ({completedOrders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'profile'
                ? 'bg-[#181826] text-[#DFBA5A] border border-[#DFBA5A]/40 shadow-sm'
                : 'text-[#848496] hover:text-white'
            }`}
          >
            <Bike className="w-4 h-4" />
            <span>My Fleet Profile</span>
          </button>
        </div>

        {/* TAB 1: ACTIVE ASSIGNED DELIVERIES */}
        {activeTab === 'active' && (
          <div className="space-y-4">
            {activeOrders.length === 0 ? (
              <div className="text-center py-16 bg-[#0E0E15] border border-[#20202E] rounded-xl p-8">
                <CheckCircle2 className="w-12 h-12 text-[#25D366] mx-auto mb-3 opacity-80" />
                <h3 className="font-luxury text-lg font-bold text-white">All Clear! No Pending Deliveries</h3>
                <p className="text-xs text-[#8A8A9E] mt-1 max-w-sm mx-auto">
                  You are currently up to date. Keep your status set to <strong className="text-[#25D366]">Available</strong> to receive new order dispatches.
                </p>
              </div>
            ) : (
              activeOrders.map((order) => {
                const isAssignedPendingAccept = order.order_status === 'assigned';
                const isAccepted = order.order_status === 'accepted';
                const isOutForDelivery = order.order_status === 'out_for_delivery';
                const isReached = order.order_status === 'reached_location';

                return (
                  <div
                    key={order.id}
                    className="bg-[#0E0E16] border border-[#242436] rounded-xl p-5 sm:p-6 shadow-xl relative overflow-hidden"
                  >
                    {/* Status Top Strip */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-[#1C1C28]">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-bold text-white">
                          {order.order_number}
                        </span>
                        <span className="text-[11px] font-mono text-[#D4AF37] px-2.5 py-0.5 rounded bg-[#171510] border border-[#D4AF37]/30">
                          {order.business_name}
                        </span>
                      </div>

                      {/* Current Status Pill */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[#848496]">Status:</span>
                        <span className={`font-mono font-bold uppercase text-[11px] px-2.5 py-0.5 rounded ${
                          isAssignedPendingAccept
                            ? 'bg-amber-950/70 text-amber-300 border border-amber-600/50 animate-pulse'
                            : isAccepted
                            ? 'bg-blue-950/70 text-blue-300 border border-blue-600/50'
                            : isOutForDelivery
                            ? 'bg-purple-950/70 text-purple-300 border border-purple-600/50'
                            : 'bg-emerald-950/70 text-emerald-300 border border-emerald-600/50'
                        }`}>
                          {order.order_status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Customer & Address Details */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                      
                      {/* Left: Customer & Address */}
                      <div className="md:col-span-7 space-y-3">
                        <div>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[#79798C] block">
                            Customer & Recipient
                          </span>
                          <h4 className="font-luxury text-base font-bold text-white mt-0.5">
                            {order.customer_name}
                          </h4>
                        </div>

                        {/* Address with Navigation link */}
                        <div className="bg-[#13131E] p-3 rounded-lg border border-[#20202E] flex items-start gap-3">
                          <MapPin className="w-5 h-5 text-[#DFBA5A] shrink-0 mt-0.5" />
                          <div className="flex-1 text-xs">
                            <p className="text-white font-medium leading-relaxed">
                              {order.delivery_address}
                            </p>
                            <span className="text-[#868698] text-[11px] block mt-0.5">
                              {order.delivery_city}
                            </span>
                          </div>

                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.delivery_address + ', ' + order.delivery_city)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-[#1C1C2A] hover:bg-[#252538] text-[11px] font-semibold text-[#DFBA5A] border border-[#2E2E42] transition-colors shrink-0"
                            title="Open Google Maps Navigation"
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            <span>Navigate</span>
                          </a>
                        </div>

                        {/* Contact Actions (Call & WhatsApp) */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <a
                            href={`tel:${order.customer_phone}`}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#141420] hover:bg-[#1A1A2A] border border-[#242436] text-xs font-semibold text-white transition-colors"
                          >
                            <Phone className="w-3.5 h-3.5 text-[#25D366]" />
                            <span>Call {order.customer_phone}</span>
                          </a>

                          <a
                            href={`https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello ${order.customer_name}, I am ${currentUser.full_name}, your Vijay Visuals delivery partner for order ${order.order_number}. I am on my way to your location.`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#141420] hover:bg-[#1A1A2A] border border-[#242436] text-xs font-semibold text-[#25D366] transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp Customer</span>
                          </a>
                        </div>

                        {order.delivery_notes && (
                          <div className="p-2.5 rounded bg-[#1A1810] border border-[#D4AF37]/30 text-xs text-[#E3D19B]">
                            <strong className="text-[#DFBA5A]">Delivery Instruction: </strong>
                            {order.delivery_notes}
                          </div>
                        )}
                      </div>

                      {/* Right: Items, Payment & Action Controls */}
                      <div className="md:col-span-5 bg-[#0B0B10] p-4 rounded-xl border border-[#1E1E2A] space-y-4">
                        
                        {/* Items list */}
                        <div>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[#79798C] block mb-2">
                            Package Items ({order.items.length})
                          </span>
                          <div className="space-y-1.5 text-xs max-h-36 overflow-y-auto pr-1">
                            {order.items.map((item, i) => (
                              <div key={i} className="flex justify-between items-center text-[#B0B0C0] py-0.5 border-b border-[#161620]">
                                <span>{item.quantity}x {item.name}</span>
                                <span className="font-mono text-white">₹{item.price * item.quantity}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Bill & Payment */}
                        <div className="pt-2 border-t border-[#1C1C26] flex items-center justify-between text-xs">
                          <div>
                            <span className="text-[#7D7D90] block text-[11px]">Total to Collect</span>
                            <span className="font-mono text-base font-bold text-[#DFBA5A]">
                              ₹{order.total_amount.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[#7D7D90] block text-[11px]">Payment Mode</span>
                            <span className={`font-mono text-[11px] font-bold uppercase px-2 py-0.5 rounded ${
                              order.payment_method === 'cod'
                                ? 'bg-amber-950/50 text-amber-300 border border-amber-500/30'
                                : 'bg-emerald-950/50 text-emerald-300 border border-emerald-500/30'
                            }`}>
                              {order.payment_method === 'cod' ? 'Cash on Delivery (Collect)' : 'Paid Online'}
                            </span>
                          </div>
                        </div>

                        {/* DELIVERY ACTION BUTTONS */}
                        <div className="pt-3 border-t border-[#1C1C26]">
                          {isAssignedPendingAccept && (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleAcceptOrder(order.id)}
                                className="py-2.5 px-3 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow"
                              >
                                <Check className="w-4 h-4 stroke-[3]" />
                                <span>Accept Order</span>
                              </button>

                              <button
                                onClick={() => handleRejectOrder(order.id)}
                                className="py-2.5 px-3 rounded-lg bg-[#201518] hover:bg-[#2A181D] text-[#FF7A7A] border border-[#402026] text-xs font-semibold flex items-center justify-center gap-1.5"
                              >
                                <X className="w-4 h-4" />
                                <span>Decline</span>
                              </button>
                            </div>
                          )}

                          {isAccepted && (
                            <button
                              onClick={() => handleStatusStep(order, 'out_for_delivery')}
                              className="w-full py-2.5 px-3 rounded-lg bg-[#1E7E34] hover:bg-[#259440] text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-[#25D366]/20"
                            >
                              <Bike className="w-4 h-4" />
                              <span>Picked Up · Start Out for Delivery</span>
                            </button>
                          )}

                          {isOutForDelivery && (
                            <button
                              onClick={() => handleStatusStep(order, 'reached_location')}
                              className="w-full py-2.5 px-3 rounded-lg bg-[#1C5380] hover:bg-[#20639B] text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow"
                            >
                              <MapPin className="w-4 h-4" />
                              <span>I Have Reached Customer Location</span>
                            </button>
                          )}

                          {isReached && (
                            <button
                              onClick={() => setSelectedOrderForDelivery(order)}
                              className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-[#DFBA5A] via-[#ECC86A] to-[#B38D2C] hover:from-[#ECC86A] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/25"
                            >
                              <CheckCircle2 className="w-4 h-4 stroke-[3]" />
                              <span>Complete & Mark Delivered</span>
                            </button>
                          )}
                        </div>

                      </div>

                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: COMPLETED DELIVERY HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {completedOrders.length === 0 ? (
              <div className="text-center py-12 bg-[#0E0E15] border border-[#20202E] rounded-xl p-8 text-xs text-[#828294]">
                No completed delivery records yet. Completed orders will be archived here.
              </div>
            ) : (
              completedOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-[#0E0E16] border border-[#1E1E2A] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-white">
                        {order.order_number}
                      </span>
                      <span className="text-[11px] text-[#DFBA5A]">
                        {order.business_name}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#102915] text-[#25D366] border border-[#25D366]/30">
                        Delivered
                      </span>
                    </div>

                    <p className="text-xs text-[#A0A0B2]">
                      Delivered to <strong>{order.customer_name}</strong> · {order.delivery_city}
                    </p>
                    <span className="text-[10px] text-[#707080] font-mono">
                      Completed at: {order.delivered_at ? new Date(order.delivered_at).toLocaleString() : 'Recent'}
                    </span>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center">
                    <span className="font-mono text-sm font-bold text-white">
                      ₹{order.total_amount.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] text-[#25D366] font-mono">
                      +₹60 Delivery Fee Credited
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: PROFILE & FLEET DETAILS */}
        {activeTab === 'profile' && (
          <div className="max-w-2xl bg-[#0E0E16] border border-[#20202E] rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-4 pb-6 border-b border-[#1C1C28]">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1E7E34] to-[#128C7E] flex items-center justify-center text-[#25D366] text-xl font-bold">
                {currentUser.full_name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="font-luxury text-xl font-bold text-white">
                  {currentUser.full_name}
                </h3>
                <p className="text-xs text-[#8C8C9E] font-mono">
                  {currentUser.email} · {currentUser.phone}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#162919] text-[#25D366] border border-[#25D366]/30">
                    Role: Delivery Boy
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1E1E2C] text-[#DFBA5A] border border-[#DFBA5A]/30">
                    Status: Active
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-[#13131E] p-3.5 rounded-lg border border-[#20202E]">
                <span className="text-[10px] uppercase text-[#79798C] font-mono block">Vehicle Type</span>
                <p className="font-semibold text-white mt-1">{details.vehicle_type}</p>
              </div>

              <div className="bg-[#13131E] p-3.5 rounded-lg border border-[#20202E]">
                <span className="text-[10px] uppercase text-[#79798C] font-mono block">Registration Plate</span>
                <p className="font-mono font-semibold text-[#DFBA5A] mt-1">{details.vehicle_number}</p>
              </div>

              <div className="bg-[#13131E] p-3.5 rounded-lg border border-[#20202E]">
                <span className="text-[10px] uppercase text-[#79798C] font-mono block">Assigned Delivery Area</span>
                <p className="font-semibold text-white mt-1">{details.assigned_area}</p>
              </div>

              <div className="bg-[#13131E] p-3.5 rounded-lg border border-[#20202E]">
                <span className="text-[10px] uppercase text-[#79798C] font-mono block">Lifetime Deliveries</span>
                <p className="font-mono font-semibold text-white mt-1">{details.total_deliveries} Orders</p>
              </div>
            </div>

            {details.notes && (
              <div className="bg-[#111118] p-3 rounded-lg border border-[#1E1E28] text-xs text-[#8C8C9E]">
                <strong className="text-white">Admin Notes: </strong>
                {details.notes}
              </div>
            )}
          </div>
        )}

      </main>

      {/* MARK AS DELIVERED MODAL */}
      {selectedOrderForDelivery && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0E0E16] border border-[#2D2D40] rounded-xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-[#1E1E2C] mb-4">
              <div>
                <span className="text-[10px] font-mono text-[#DFBA5A] uppercase tracking-wider block">
                  Delivery Confirmation
                </span>
                <h3 className="font-luxury font-bold text-white text-lg">
                  Order {selectedOrderForDelivery.order_number}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrderForDelivery(null)}
                className="p-1 text-[#848496] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCompleteDelivery} className="space-y-4 text-xs">
              <div>
                <span className="text-[#868698] block">Customer:</span>
                <p className="text-sm font-bold text-white mt-0.5">{selectedOrderForDelivery.customer_name}</p>
                <p className="text-[11px] text-[#A0A0B2]">{selectedOrderForDelivery.delivery_address}</p>
              </div>

              <div className="p-3 rounded-lg bg-[#141420] border border-[#222234] flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase text-[#79798C] block">Payment Collection</span>
                  <span className="font-mono text-sm font-bold text-[#DFBA5A]">
                    ₹{selectedOrderForDelivery.total_amount.toLocaleString('en-IN')}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-[#25D366] font-semibold">
                  {selectedOrderForDelivery.payment_method === 'cod' ? 'Cash Collected' : 'Already Paid Online'}
                </span>
              </div>

              <div>
                <label className="text-[11px] text-[#C0C0D0] block mb-1 font-medium">
                  Customer Delivery OTP / Handover Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Handed to customer at front door"
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForDelivery(null)}
                  className="px-4 py-2 rounded text-xs text-[#848496] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider shadow"
                >
                  Confirm Delivery
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-[#050508] border-t border-[#161620] py-4 text-center text-[11px] text-[#555566]">
        Vijay Visuals Multi-Tenant Fleet Logistics · Hyderabad, India
      </footer>
    </div>
  );
};
