import React, { useState, useEffect } from 'react';
import {
  UserProfile,
  DeliveryBoyProfile,
  Order,
  BusinessTenant,
  TEMPLATES_DATA,
  deliveryService,
  orderService,
  businessService,
  authService,
  subscribeToStore,
  AccountStatus,
  OrderStatus
} from '../../lib/supabase';
import {
  Users,
  Store,
  Bike,
  LayoutTemplate,
  ShoppingBag,
  CreditCard,
  Tag,
  Mail,
  Globe,
  Settings,
  Plus,
  Search,
  Copy,
  Check,
  RotateCw,
  LogOut,
  ChevronRight,
  ShieldAlert,
  ArrowUpRight,
  ExternalLink,
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  Eye,
  Send,
  Sparkles,
  DollarSign,
  Zap,
  ShieldCheck,
  Sliders,
  Cpu,
  Bot
} from 'lucide-react';
import { aiService } from '../../lib/aiService';

interface AdminDashboardProps {
  currentUser: UserProfile;
  onLogout: () => void;
  onShowToast: (msg: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  onLogout,
  onShowToast,
}) => {
  const [activeModule, setActiveModule] = useState<
    | 'delivery_boys'
    | 'orders'
    | 'customers'
    | 'shop_owners'
    | 'templates'
    | 'websites'
    | 'payments'
    | 'pricing_plans'
    | 'leads'
    | 'ai_controls'
    | 'settings'
  >('delivery_boys');

  const [deliveryBoys, setDeliveryBoys] = useState<{ profile: UserProfile; details: DeliveryBoyProfile }[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [businesses, setBusinesses] = useState<BusinessTenant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Create Delivery Boy Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDelName, setNewDelName] = useState('');
  const [newDelEmail, setNewDelEmail] = useState('');
  const [newDelPhone, setNewDelPhone] = useState('');
  const [newDelVehicle, setNewDelVehicle] = useState<'Bike' | 'Scooter' | 'Electric Vehicle' | 'Car'>('Bike');
  const [newDelPlate, setNewDelPlate] = useState('');
  const [newDelArea, setNewDelArea] = useState('');
  const [newDelNotes, setNewDelNotes] = useState('');
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);

  // Assign Order Modal State
  const [orderToAssign, setOrderToAssign] = useState<Order | null>(null);
  const [selectedDeliveryBoyId, setSelectedDeliveryBoyId] = useState<string>('');

  // AI Usage & Controls State
  const [aiUsageStats, setAiUsageStats] = useState<{
    tenantId?: string;
    usage?: { requestsCount: number; dailyLimit: number };
    allUsage?: Record<string, { requestsCount: number; dailyLimit: number; lastReset: string }>;
  } | null>(null);
  const [loadingAiStats, setLoadingAiStats] = useState(false);
  const [editingTenantQuota, setEditingTenantQuota] = useState<string | null>(null);
  const [quotaInputValue, setQuotaInputValue] = useState<number>(50);

  const fetchAiUsage = async () => {
    setLoadingAiStats(true);
    try {
      const stats = await aiService.getUsageStats();
      setAiUsageStats(stats);
    } catch (err) {
      console.error('Failed to fetch AI usage stats:', err);
    } finally {
      setLoadingAiStats(false);
    }
  };

  const handleUpdateTenantQuota = async (tenantId: string, limit: number) => {
    try {
      await aiService.updateQuota(tenantId, limit);
      onShowToast(`Updated daily AI limit for ${tenantId} to ${limit} requests.`);
      setEditingTenantQuota(null);
      fetchAiUsage();
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to update quota.');
    }
  };

  const loadData = () => {
    setDeliveryBoys(deliveryService.getAllDeliveryBoys());
    setOrders(orderService.getAllOrders());
    setBusinesses(businessService.getAllBusinesses());
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToStore(loadData);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (activeModule === 'ai_controls') {
      fetchAiUsage();
    }
  }, [activeModule]);

  // Copy Delivery Boy Login URL
  const handleCopyLoginUrl = () => {
    const loginUrl = `${window.location.origin}?portal=delivery`;
    navigator.clipboard.writeText(loginUrl);
    onShowToast('Delivery Boy Login URL copied to clipboard!');
  };

  // Create delivery boy account
  const handleCreateDeliveryBoy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDelName.trim() || !newDelEmail.trim() || !newDelPhone.trim()) {
      onShowToast('Please fill out all required fields.');
      return;
    }

    const res = deliveryService.createDeliveryBoy({
      full_name: newDelName,
      email: newDelEmail,
      phone: newDelPhone,
      vehicle_type: newDelVehicle,
      vehicle_number: newDelPlate || 'TS 09 XY 0000',
      assigned_area: newDelArea || 'Hyderabad Central',
      notes: newDelNotes,
    });

    if (res.success && res.inviteLink) {
      setCreatedInviteLink(res.inviteLink);
      onShowToast(`Delivery Partner account created for ${newDelName}!`);
      loadData();
    } else {
      onShowToast(res.error || 'Failed to create account.');
    }
  };

  const handleToggleStatus = (id: string, currentStatus: AccountStatus) => {
    const nextStatus: AccountStatus = currentStatus === 'active' ? 'inactive' : 'active';
    deliveryService.toggleDeliveryBoyStatus(id, nextStatus);
    onShowToast(`Account status updated to: ${nextStatus.toUpperCase()}`);
  };

  const handleResendInvite = (id: string) => {
    const res = deliveryService.resendInvitation(id);
    if (res.success && res.inviteLink) {
      navigator.clipboard.writeText(res.inviteLink);
      onShowToast('New invitation link generated & copied to clipboard!');
    }
  };

  const handleAssignOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderToAssign || !selectedDeliveryBoyId) return;

    orderService.assignOrder(orderToAssign.id, selectedDeliveryBoyId);
    onShowToast(`Order ${orderToAssign.order_number} assigned to delivery partner!`);
    setOrderToAssign(null);
    setSelectedDeliveryBoyId('');
  };

  const modules = [
    { id: 'delivery_boys', label: 'Delivery Boys', icon: Bike, count: deliveryBoys.length },
    { id: 'orders', label: 'Orders & Dispatch', icon: ShoppingBag, count: orders.length },
    { id: 'shop_owners', label: 'Shop Owners', icon: Store, count: businesses.length },
    { id: 'customers', label: 'Customers', icon: Users, count: 42 },
    { id: 'templates', label: '20+ Templates', icon: LayoutTemplate, count: TEMPLATES_DATA.length },
    { id: 'websites', label: 'Published Sites', icon: Globe, count: businesses.length },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'pricing_plans', label: 'Pricing Plans', icon: Tag },
    { id: 'leads', label: 'Leads & Enquiries', icon: Mail, count: 18 },
    { id: 'ai_controls', label: 'AI Usage & Limits', icon: Sparkles, count: '7 Tools' },
    { id: 'settings', label: 'Platform Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#07070A] text-[#E8E8ED] flex flex-col">
      {/* Top Admin Header */}
      <header className="bg-[#0D0D14] border-b border-[#1E1E2A] px-6 py-4 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#DFBA5A] to-[#8C6D1F] flex items-center justify-center text-[#08080A] text-xs font-black shadow-md">
              VV
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-luxury font-bold text-white text-base tracking-wider">
                  VIJAY VISUALS
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#2D210E] text-[#DFBA5A] border border-[#DFBA5A]/30">
                  SUPER ADMIN
                </span>
              </div>
              <p className="text-[11px] text-[#7A7A8C]">
                Multi-Tenant Website Builder & Logistics Control Center
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleCopyLoginUrl}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141420] hover:bg-[#1A1A2A] border border-[#232334] text-xs text-[#DFBA5A] font-semibold transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Delivery Login URL</span>
            </button>

            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1E1418] hover:bg-[#28181D] text-xs font-semibold text-[#FF8585] border border-[#3E2024] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container with Sidebar + Content */}
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col md:flex-row gap-6 p-6">
        
        {/* Sidebar Nav */}
        <aside className="w-full md:w-64 bg-[#0E0E16] border border-[#1E1E2A] rounded-xl p-3 shrink-0 h-fit space-y-1">
          <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-[#69697A]">
            Core Modules
          </div>

          {modules.map((m) => {
            const Icon = m.icon;
            const isActive = activeModule === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setActiveModule(m.id as any)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-[#181826] text-[#DFBA5A] border border-[#DFBA5A]/40 font-semibold shadow-sm'
                    : 'text-[#8C8C9E] hover:text-white hover:bg-[#13131D]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#DFBA5A]' : 'text-[#6C6C7E]'}`} />
                  <span>{m.label}</span>
                </div>
                {m.count !== undefined && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-[#DFBA5A] text-[#0A0A0E] font-bold' : 'bg-[#161622] text-[#7E7E90]'
                  }`}>
                    {m.count}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Content Area */}
        <main className="flex-1 space-y-6">
          
          {/* MODULE 1: DELIVERY BOYS MANAGEMENT */}
          {activeModule === 'delivery_boys' && (
            <div className="space-y-6">
              
              {/* Header with Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0E0E16] border border-[#1E1E2A] p-5 rounded-xl">
                <div>
                  <h2 className="font-luxury text-xl font-bold text-white">
                    Delivery Boy Fleet Management
                  </h2>
                  <p className="text-xs text-[#848496] mt-0.5">
                    Onboard new delivery partners, dispatch invitations, activate accounts, and track deliveries.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCopyLoginUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#141420] hover:bg-[#1A1A2A] border border-[#242436] text-xs font-semibold text-[#DFBA5A]"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Login URL</span>
                  </button>

                  <button
                    onClick={() => {
                      setCreatedInviteLink(null);
                      setShowCreateModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider shadow"
                  >
                    <Plus className="w-4 h-4 stroke-[3]" />
                    <span>Create Delivery Boy</span>
                  </button>
                </div>
              </div>

              {/* Delivery Boy List Table */}
              <div className="bg-[#0E0E16] border border-[#1E1E2A] rounded-xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-[#C5C5D6]">
                    <thead className="bg-[#13131E] border-b border-[#1E1E2C] text-[10px] font-mono uppercase tracking-wider text-[#79798C]">
                      <tr>
                        <th className="py-3 px-4">Partner Name</th>
                        <th className="py-3 px-4">Contact Details</th>
                        <th className="py-3 px-4">Vehicle & Area</th>
                        <th className="py-3 px-4">Account Status</th>
                        <th className="py-3 px-4">Stats & Rating</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#171722]">
                      {deliveryBoys.map(({ profile, details }) => {
                        const isPending = profile.status === 'pending_invite';
                        const isActive = profile.status === 'active';
                        const isAvailable = details.active_status === 'available';

                        return (
                          <tr key={profile.id} className="hover:bg-[#12121C] transition-colors">
                            {/* Name */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1E7E34] to-[#128C7E] flex items-center justify-center text-[#25D366] font-bold text-xs">
                                  {profile.full_name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-semibold text-white">{profile.full_name}</p>
                                  <span className="text-[10px] font-mono text-[#78788A]">ID: {profile.id}</span>
                                </div>
                              </div>
                            </td>

                            {/* Contact */}
                            <td className="py-3.5 px-4 font-mono">
                              <p className="text-white text-xs">{profile.email}</p>
                              <span className="text-[11px] text-[#A0A0B2]">{profile.phone}</span>
                            </td>

                            {/* Vehicle & Area */}
                            <td className="py-3.5 px-4">
                              <p className="font-medium text-white">{details.vehicle_type} ({details.vehicle_number})</p>
                              <span className="text-[11px] text-[#868698]">{details.assigned_area}</span>
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4">
                              <div className="space-y-1">
                                <span className={`inline-block font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                                  isActive
                                    ? 'bg-[#102915] text-[#25D366] border border-[#25D366]/30'
                                    : isPending
                                    ? 'bg-[#292210] text-[#E5B54F] border border-[#E5B54F]/30'
                                    : 'bg-[#291010] text-[#FF6B6B] border border-[#FF6B6B]/30'
                                }`}>
                                  {profile.status.replace('_', ' ')}
                                </span>
                                <div>
                                  <span className="text-[10px] text-[#707080]">
                                    Fleet: {details.active_status}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Stats */}
                            <td className="py-3.5 px-4 font-mono">
                              <p className="text-white font-semibold">{details.total_deliveries} Delivered</p>
                              <span className="text-[11px] text-[#DFBA5A]">★ {details.rating}</span>
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {isPending ? (
                                  <button
                                    onClick={() => handleResendInvite(profile.id)}
                                    className="px-2.5 py-1 rounded bg-[#181824] hover:bg-[#202030] text-[11px] font-semibold text-[#DFBA5A] border border-[#2B2B3B]"
                                    title="Copy Fresh Invitation Link"
                                  >
                                    Copy Invite
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleToggleStatus(profile.id, profile.status)}
                                    className={`px-2.5 py-1 rounded text-[11px] font-semibold border ${
                                      isActive
                                        ? 'bg-[#211417] text-[#FF7A7A] border-[#402026] hover:bg-[#2B181C]'
                                        : 'bg-[#142116] text-[#25D366] border-[#204026] hover:bg-[#182B1B]'
                                    }`}
                                  >
                                    {isActive ? 'Deactivate' : 'Activate'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* MODULE 2: ORDERS & DISPATCH */}
          {activeModule === 'orders' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0E0E16] border border-[#1E1E2A] p-5 rounded-xl">
                <div>
                  <h2 className="font-luxury text-xl font-bold text-white">
                    Tenant Orders & Fleet Dispatch
                  </h2>
                  <p className="text-xs text-[#848496] mt-0.5">
                    View customer orders across tenant shops and assign to available delivery partners.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {orders.map((order) => {
                  const isAssigned = Boolean(order.assigned_delivery_boy_id);
                  return (
                    <div
                      key={order.id}
                      className="bg-[#0E0E16] border border-[#1E1E2A] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-bold text-white">{order.order_number}</span>
                          <span className="text-[11px] font-mono text-[#DFBA5A]">{order.business_name}</span>
                          <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-[#161622] text-[#8C8C9E]">
                            {order.order_status.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <p className="text-xs text-[#C8C8D6]">
                          Customer: <strong>{order.customer_name}</strong> ({order.customer_phone}) · {order.delivery_address}
                        </p>

                        <div className="text-[11px] text-[#7A7A8E] flex items-center gap-2">
                          <span>Items: {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</span>
                          <span>·</span>
                          <span className="font-mono text-white font-bold">Total: ₹{order.total_amount.toLocaleString('en-IN')}</span>
                        </div>
                      </div>

                      {/* Assignment Status & Action */}
                      <div className="flex items-center gap-3 shrink-0">
                        {isAssigned ? (
                          <div className="text-right">
                            <span className="text-[10px] text-[#7A7A8C] block uppercase font-mono">Assigned Partner</span>
                            <span className="text-xs font-semibold text-[#25D366]">
                              {order.assigned_delivery_boy_name || 'Delivery Partner'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-[#E5B54F] font-mono">Unassigned</span>
                        )}

                        <button
                          onClick={() => {
                            setOrderToAssign(order);
                            setSelectedDeliveryBoyId(deliveryBoys[0]?.profile.id || '');
                          }}
                          className="px-3.5 py-2 rounded-lg bg-[#181826] hover:bg-[#202034] text-xs font-semibold text-[#DFBA5A] border border-[#2D2D42]"
                        >
                          {isAssigned ? 'Reassign Partner' : 'Assign Partner'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* MODULE 3: SHOP OWNERS */}
          {activeModule === 'shop_owners' && (
            <div className="space-y-4">
              <div className="bg-[#0E0E16] border border-[#1E1E2A] p-5 rounded-xl">
                <h2 className="font-luxury text-xl font-bold text-white">Registered Tenant Shop Owners</h2>
                <p className="text-xs text-[#848496] mt-0.5">Manage business owners, their active domains, and subscription tiers.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {businesses.map((biz) => (
                  <div key={biz.id} className="bg-[#0E0E16] border border-[#1E1E2A] rounded-xl p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-mono text-[#DFBA5A] uppercase">{biz.category}</span>
                        <h4 className="font-luxury text-base font-bold text-white mt-0.5">{biz.business_name}</h4>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#102915] text-[#25D366]">Live</span>
                    </div>
                    <p className="text-xs text-[#8C8C9E]">{biz.tagline}</p>
                    <div className="pt-2 border-t border-[#1C1C26] flex items-center justify-between text-xs text-[#707080]">
                      <span className="font-mono text-[#DFBA5A]">{biz.subdomain}</span>
                      <span>{biz.city}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MODULE 4: CUSTOMERS */}
          {activeModule === 'customers' && (
            <div className="space-y-4">
              <div className="bg-[#0E0E16] border border-[#1E1E2A] p-5 rounded-xl">
                <h2 className="font-luxury text-xl font-bold text-white">Registered Customers Directory</h2>
                <p className="text-xs text-[#848496] mt-0.5">Customers ordering across all tenant storefronts.</p>
              </div>

              <div className="bg-[#0E0E16] border border-[#1E1E2A] rounded-xl p-4 text-xs space-y-2">
                {[
                  { name: 'Rahul Sharma', email: 'rahul@gmail.com', phone: '+91 98765 43210', city: 'Hyderabad', orders: 4, spend: '₹46,390' },
                  { name: 'Pooja Reddy', email: 'pooja.reddy@outlook.com', phone: '+91 97011 88990', city: 'Hyderabad', orders: 2, spend: '₹3,450' },
                  { name: 'Dr. Anand Verma', email: 'dranand@vermaclinic.com', phone: '+91 99499 77889', city: 'Hyderabad', orders: 6, spend: '₹84,000' },
                  { name: 'Karthik Raju', email: 'karthik@techcorp.in', phone: '+91 98888 22114', city: 'Hyderabad', orders: 1, spend: '₹640' },
                ].map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-[#12121D] border border-[#1C1C28]">
                    <div>
                      <p className="font-semibold text-white">{c.name}</p>
                      <span className="text-[11px] font-mono text-[#8C8C9E]">{c.email} · {c.phone}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-[#DFBA5A]">{c.spend}</p>
                      <span className="text-[10px] text-[#7A7A8E]">{c.orders} Orders placed</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MODULE 5: 20+ TEMPLATES MANAGER */}
          {activeModule === 'templates' && (
            <div className="space-y-4">
              <div className="bg-[#0E0E16] border border-[#1E1E2A] p-5 rounded-xl">
                <h2 className="font-luxury text-xl font-bold text-white">20+ Multi-Tenant Industry Templates</h2>
                <p className="text-xs text-[#848496] mt-0.5">Each category includes localized Telugu, Hindi and English storefront templates.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {TEMPLATES_DATA.map((t) => (
                  <div key={t.id} className="bg-[#0E0E16] border border-[#1E1E2A] rounded-xl p-4 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-mono uppercase text-[#DFBA5A]">{t.category}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1A1A24] text-white">{t.badge}</span>
                      </div>
                      <h4 className="font-luxury text-sm font-bold text-white">{t.name}</h4>
                      <p className="text-[11px] text-[#868698] mt-1 line-clamp-2">{t.description}</p>
                    </div>

                    <div className="pt-2 border-t border-[#1C1C26] flex items-center justify-between text-[11px]">
                      <span className="text-[#646473]">Demo: /{t.demo_slug}</span>
                      <span className="text-[#25D366] font-mono">Active</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MODULE 6: WEBSITES PUBLISHING */}
          {activeModule === 'websites' && (
            <div className="space-y-4">
              <div className="bg-[#0E0E16] border border-[#1E1E2A] p-5 rounded-xl">
                <h2 className="font-luxury text-xl font-bold text-white">Website Publishing & Domains</h2>
                <p className="text-xs text-[#848496] mt-0.5">Subdomains and mapped custom domains for tenant businesses.</p>
              </div>

              <div className="space-y-3">
                {businesses.map((biz) => (
                  <div key={biz.id} className="bg-[#0E0E16] border border-[#1E1E2A] rounded-xl p-4 flex items-center justify-between text-xs">
                    <div>
                      <h4 className="font-bold text-white">{biz.business_name}</h4>
                      <a
                        href={`https://${biz.subdomain}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[#DFBA5A] hover:underline flex items-center gap-1 mt-0.5"
                      >
                        <span>https://{biz.subdomain}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#102915] text-[#25D366]">Published</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MODULE 7: PAYMENTS */}
          {activeModule === 'payments' && (
            <div className="space-y-4">
              <div className="bg-[#0E0E16] border border-[#1E1E2A] p-5 rounded-xl">
                <h2 className="font-luxury text-xl font-bold text-white">Platform Revenue & Payment Gateways</h2>
                <p className="text-xs text-[#848496] mt-0.5">UPI, Razorpay, Stripe, and COD reconciliation.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-[#0E0E16] border border-[#1E1E2A] p-4 rounded-xl">
                  <span className="text-[10px] font-mono uppercase text-[#79798C] block">Total Gross Volume</span>
                  <p className="font-luxury text-2xl font-bold text-white mt-1">₹1,84,200</p>
                </div>
                <div className="bg-[#0E0E16] border border-[#1E1E2A] p-4 rounded-xl">
                  <span className="text-[10px] font-mono uppercase text-[#79798C] block">Platform Commissions (5%)</span>
                  <p className="font-luxury text-2xl font-bold text-[#DFBA5A] mt-1">₹9,210</p>
                </div>
                <div className="bg-[#0E0E16] border border-[#1E1E2A] p-4 rounded-xl">
                  <span className="text-[10px] font-mono uppercase text-[#79798C] block">Fleet Payouts Dispatched</span>
                  <p className="font-luxury text-2xl font-bold text-[#25D366] mt-1">₹4,260</p>
                </div>
              </div>
            </div>
          )}

          {/* MODULE 8: PRICING PLANS */}
          {activeModule === 'pricing_plans' && (
            <div className="space-y-4">
              <div className="bg-[#0E0E16] border border-[#1E1E2A] p-5 rounded-xl">
                <h2 className="font-luxury text-xl font-bold text-white">Multi-Tenant Builder Subscription Plans</h2>
                <p className="text-xs text-[#848496] mt-0.5">Shop owner website plans and delivery fleet access.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { name: 'Starter Launch', price: '₹999/mo', desc: '1 Website, standard templates, WhatsApp orders, manual delivery.' },
                  { name: 'Professional Growth', price: '₹2,499/mo', desc: 'Online cart, payment gateway, custom domain, automated delivery fleet dispatch.' },
                  { name: 'VIP Enterprise', price: '₹5,999/mo', desc: 'Unlimited products, dedicated delivery boys fleet management, Telugu/Hindi/English SEO.' }
                ].map((p, i) => (
                  <div key={i} className="bg-[#0E0E16] border border-[#1E1E2A] p-5 rounded-xl space-y-3">
                    <h4 className="font-luxury font-bold text-white text-base">{p.name}</h4>
                    <span className="font-mono text-xl font-bold text-[#DFBA5A] block">{p.price}</span>
                    <p className="text-xs text-[#8C8C9E]">{p.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MODULE 9: LEADS */}
          {activeModule === 'leads' && (
            <div className="space-y-4">
              <div className="bg-[#0E0E16] border border-[#1E1E2A] p-5 rounded-xl">
                <h2 className="font-luxury text-xl font-bold text-white">Inbound Leads & Website Inquiries</h2>
                <p className="text-xs text-[#848496] mt-0.5">Prospective clients inquiring about website creation and wedding photography.</p>
              </div>

              <div className="space-y-2">
                {[
                  { name: 'Siddharth Varma', service: 'E-commerce Jewelry Website', phone: '+91 93813 62201', time: '10 mins ago' },
                  { name: 'Manasa Rao', service: 'Royal Wedding Cinema 4K Editing', phone: '+91 98490 22331', time: '1 hour ago' },
                  { name: 'Dr. Suresh Kumar', service: 'Clinic Appointment Portal', phone: '+91 97000 44332', time: 'Yesterday' }
                ].map((l, i) => (
                  <div key={i} className="bg-[#0E0E16] border border-[#1E1E2A] p-3.5 rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-white">{l.name}</p>
                      <span className="text-[11px] text-[#DFBA5A]">{l.service}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-white block">{l.phone}</span>
                      <span className="text-[10px] text-[#707080]">{l.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MODULE 10: SETTINGS */}
          {activeModule === 'settings' && (
            <div className="bg-[#0E0E16] border border-[#1E1E2A] p-6 rounded-xl space-y-4 text-xs">
              <h2 className="font-luxury text-xl font-bold text-white">Platform Configuration & Settings</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-[#13131E] rounded-lg border border-[#20202E]">
                  <span className="text-[#848496] block text-[11px]">Platform Name</span>
                  <p className="font-bold text-white text-sm mt-0.5">Vijay Visuals Studio & Multi-Tenant Builder</p>
                </div>
                <div className="p-3 bg-[#13131E] rounded-lg border border-[#20202E]">
                  <span className="text-[#848496] block text-[11px]">Supported Languages</span>
                  <p className="font-bold text-white text-sm mt-0.5">English, Telugu (తెలుగు), Hindi (हिन्दी)</p>
                </div>
                <div className="p-3 bg-[#13131E] rounded-lg border border-[#20202E]">
                  <span className="text-[#848496] block text-[11px]">Primary Currency</span>
                  <p className="font-bold text-[#DFBA5A] text-sm mt-0.5">₹ INR (Indian Rupee)</p>
                </div>
                <div className="p-3 bg-[#13131E] rounded-lg border border-[#20202E]">
                  <span className="text-[#848496] block text-[11px]">Default Delivery Radius</span>
                  <p className="font-bold text-white text-sm mt-0.5">25 Kilometers (Hyderabad Metro Zone)</p>
                </div>
              </div>
            </div>
          )}

          {/* MODULE 11: AI USAGE & LIMITS CONTROLS */}
          {activeModule === 'ai_controls' && (
            <div className="space-y-6">
              {/* Header Card */}
              <div className="bg-[#0E0E16] border border-[#1E1E2A] p-5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-[#DFBA5A]/10 text-[#DFBA5A]">
                      <Sparkles className="w-5 h-5" />
                    </span>
                    <h2 className="font-luxury text-xl font-bold text-white">AI Neural Engines & Tenant Quota Controls</h2>
                  </div>
                  <p className="text-xs text-[#848496] mt-1">
                    Manage server-side Gemini AI models, monitor tenant prompt usage, enforce rate limits, and audit security isolation.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchAiUsage}
                    disabled={loadingAiStats}
                    className="px-3.5 py-2 rounded-lg bg-[#181826] hover:bg-[#202034] text-xs font-semibold text-[#DFBA5A] border border-[#2D2D42] flex items-center gap-1.5"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${loadingAiStats ? 'animate-spin' : ''}`} />
                    <span>Refresh Stats</span>
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/health');
                        const data = await res.json();
                        onShowToast(`Server AI Health: ${data.status.toUpperCase()} (Gemini Key Configured: ${data.hasGeminiKey ? 'YES' : 'NO'})`);
                      } catch {
                        onShowToast('Server health check failed.');
                      }
                    }}
                    className="px-3.5 py-2 rounded-lg bg-[#122317] hover:bg-[#18301f] text-xs font-semibold text-[#25D366] border border-[#1e4828] flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Ping AI Health</span>
                  </button>
                </div>
              </div>

              {/* Top Overview Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#0E0E16] border border-[#1E1E2A] p-4 rounded-xl">
                  <div className="flex items-center justify-between text-xs text-[#79798C] mb-1">
                    <span className="uppercase font-mono text-[10px]">AI Model Core</span>
                    <Cpu className="w-4 h-4 text-[#DFBA5A]" />
                  </div>
                  <p className="font-luxury text-lg font-bold text-white">Gemini 2.5 Flash</p>
                  <span className="text-[11px] text-[#25D366] flex items-center gap-1 mt-1 font-mono">
                    <CheckCircle2 className="w-3 h-3" /> Server-side Proxy Active
                  </span>
                </div>

                <div className="bg-[#0E0E16] border border-[#1E1E2A] p-4 rounded-xl">
                  <div className="flex items-center justify-between text-xs text-[#79798C] mb-1">
                    <span className="uppercase font-mono text-[10px]">Active AI Engines</span>
                    <Zap className="w-4 h-4 text-[#DFBA5A]" />
                  </div>
                  <p className="font-luxury text-lg font-bold text-white">7 Production Tools</p>
                  <span className="text-[11px] text-[#8C8C9E] mt-1 block">
                    Website, Logo, Copy, Translators
                  </span>
                </div>

                <div className="bg-[#0E0E16] border border-[#1E1E2A] p-4 rounded-xl">
                  <div className="flex items-center justify-between text-xs text-[#79798C] mb-1">
                    <span className="uppercase font-mono text-[10px]">Security Boundary</span>
                    <ShieldCheck className="w-4 h-4 text-[#25D366]" />
                  </div>
                  <p className="font-luxury text-lg font-bold text-white">Zero Key Exposure</p>
                  <span className="text-[11px] text-[#8C8C9E] mt-1 block">
                    Strict express proxy /api/ai/*
                  </span>
                </div>

                <div className="bg-[#0E0E16] border border-[#1E1E2A] p-4 rounded-xl">
                  <div className="flex items-center justify-between text-xs text-[#79798C] mb-1">
                    <span className="uppercase font-mono text-[10px]">Multilingual AI</span>
                    <Bot className="w-4 h-4 text-[#DFBA5A]" />
                  </div>
                  <p className="font-luxury text-lg font-bold text-white">Telugu, Hindi & En</p>
                  <span className="text-[11px] text-[#8C8C9E] mt-1 block">
                    Native Indian regional nuances
                  </span>
                </div>
              </div>

              {/* Tenant Quota Management Table */}
              <div className="bg-[#0E0E16] border border-[#1E1E2A] rounded-xl overflow-hidden">
                <div className="p-4 border-b border-[#1E1E2A] flex items-center justify-between">
                  <div>
                    <h3 className="font-luxury text-base font-bold text-white">Tenant Business AI Quotas & Usage</h3>
                    <p className="text-xs text-[#848496] mt-0.5">Control daily prompt allowances for each registered tenant storefront.</p>
                  </div>
                  <span className="text-xs font-mono text-[#DFBA5A] bg-[#181826] px-2.5 py-1 rounded-md border border-[#2D2D42]">
                    {businesses.length} Managed Businesses
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#12121D] text-[#7A7A8E] font-mono uppercase text-[10px] border-b border-[#1C1C28]">
                      <tr>
                        <th className="py-3 px-4">Business & Tenant ID</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Daily Usage / Limit</th>
                        <th className="py-3 px-4">Quota Utilization</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1A1A26]">
                      {businesses.map((biz) => {
                        const tenantRecord = aiUsageStats?.allUsage?.[biz.id] || {
                          requestsCount: 0,
                          dailyLimit: 50,
                          lastReset: new Date().toISOString(),
                        };
                        const isEditing = editingTenantQuota === biz.id;
                        const pct = Math.min(100, Math.round((tenantRecord.requestsCount / tenantRecord.dailyLimit) * 100));

                        return (
                          <tr key={biz.id} className="hover:bg-[#12121C]/50 transition-colors">
                            <td className="py-3 px-4">
                              <p className="font-bold text-white text-sm">{biz.business_name}</p>
                              <span className="font-mono text-[10px] text-[#707080]">ID: {biz.id} · {biz.subdomain}</span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded bg-[#181826] text-[#DFBA5A] font-mono text-[10px] uppercase">
                                {biz.category}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-mono">
                                <span className="text-white font-bold">{tenantRecord.requestsCount}</span>
                                <span className="text-[#646478]"> / {tenantRecord.dailyLimit} requests/day</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 min-w-[160px]">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[10px] font-mono">
                                  <span className={pct > 80 ? 'text-[#FF4D4D]' : 'text-[#25D366]'}>{pct}% Used</span>
                                  <span className="text-[#646478]">{tenantRecord.dailyLimit - tenantRecord.requestsCount} left</span>
                                </div>
                                <div className="w-full bg-[#1A1A28] h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      pct > 85 ? 'bg-[#FF4D4D]' : pct > 50 ? 'bg-[#DFBA5A]' : 'bg-[#25D366]'
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              {isEditing ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={5}
                                    max={1000}
                                    value={quotaInputValue}
                                    onChange={(e) => setQuotaInputValue(Number(e.target.value))}
                                    className="w-16 px-2 py-1 rounded bg-[#141420] border border-[#3E3E55] text-white text-xs font-mono text-center"
                                  />
                                  <button
                                    onClick={() => handleUpdateTenantQuota(biz.id, quotaInputValue)}
                                    className="px-2.5 py-1 rounded bg-[#DFBA5A] text-[#0A0A0E] text-xs font-bold hover:bg-[#EAC665]"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingTenantQuota(null)}
                                    className="px-2 py-1 rounded bg-[#1C1C28] text-[#868698] text-xs hover:text-white"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingTenantQuota(biz.id);
                                      setQuotaInputValue(tenantRecord.dailyLimit);
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-[#181826] hover:bg-[#202034] text-xs text-[#DFBA5A] border border-[#2D2D42] flex items-center gap-1"
                                  >
                                    <Sliders className="w-3 h-3" />
                                    <span>Set Quota</span>
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 7 Integrated AI Engines Matrix */}
              <div className="bg-[#0E0E16] border border-[#1E1E2A] rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="font-luxury text-base font-bold text-white">7 Production AI Engines Specifications</h3>
                  <p className="text-xs text-[#848496] mt-0.5">High-speed endpoints powered by Gemini 2.5 Flash on server-side architecture.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {[
                    {
                      title: '1. AI Website Generator',
                      route: '/api/ai/website-generator',
                      desc: 'Generates full business website blueprints: Hero, Story, Offerings, FAQs, color palette, and typography pairing.',
                      badge: 'One-Click Apply',
                    },
                    {
                      title: '2. AI Marketing Copywriter',
                      route: '/api/ai/content-writer',
                      desc: 'Drafts brand narratives, launch announcements, feature highlights, and FAQs in Luxury, Friendly, or Corporate tones.',
                      badge: 'Variations Engine',
                    },
                    {
                      title: '3. Vector Logo & Banner Studio',
                      route: '/api/ai/logo-generator',
                      desc: 'Generates clean scalable SVG vector emblems, monogram glyphs, and luxury brand palettes.',
                      badge: 'Native SVG Vector',
                    },
                    {
                      title: '4. Catalog Product Descriptions',
                      route: '/api/ai/product-description',
                      desc: 'Generates sensory hooks, bulleted craftsmanship highlights, and delivery callouts for e-commerce listings.',
                      badge: 'Conversion Copy',
                    },
                    {
                      title: '5. Regional AI Translator',
                      route: '/api/ai/translate',
                      desc: 'Deep contextual translations between English, Telugu (తెలుగు), and Hindi (हिन्दी) for retail & wedding services.',
                      badge: '3 Languages',
                    },
                    {
                      title: '6. AI Virtual Concierge',
                      route: '/api/ai/support-chatbot',
                      desc: 'Tenant-scoped interactive support agent answering customer questions about products, delivery, and services.',
                      badge: 'Customer Support',
                    },
                    {
                      title: '7. SERP & SEO Generator',
                      route: '/api/ai/seo-generator',
                      desc: 'Produces search-engine compliant meta titles (<60 chars), descriptions (<160 chars), and JSON-LD schema markup.',
                      badge: 'Google Schema',
                    },
                  ].map((engine, idx) => (
                    <div key={idx} className="p-3.5 bg-[#12121D] border border-[#1E1E2C] rounded-xl flex flex-col justify-between space-y-2">
                      <div>
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-white text-xs">{engine.title}</h4>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#1B1B2A] text-[#DFBA5A] border border-[#2D2D42]">
                            {engine.badge}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-[#747488] mt-0.5">{engine.route}</p>
                        <p className="text-xs text-[#8C8C9E] mt-2 line-clamp-3">{engine.desc}</p>
                      </div>
                      <div className="pt-2 border-t border-[#1C1C28] flex items-center justify-between text-[10px] font-mono">
                        <span className="text-[#25D366] flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" /> Ready
                        </span>
                        <span className="text-[#646478]">Gemini 2.5 Flash</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* CREATE DELIVERY BOY MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0E0E16] border border-[#2E2E42] rounded-xl max-w-lg w-full p-6 shadow-2xl relative animate-in fade-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#1E1E2C] mb-4">
              <div>
                <span className="text-[10px] font-mono text-[#DFBA5A] uppercase tracking-wider block">
                  Logistics Onboarding
                </span>
                <h3 className="font-luxury font-bold text-white text-lg">
                  Create Delivery Boy Account
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-[#848496] hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {createdInviteLink ? (
              <div className="space-y-4 py-3 text-center">
                <CheckCircle2 className="w-12 h-12 text-[#25D366] mx-auto" />
                <div>
                  <h4 className="font-luxury font-bold text-white text-base">Account Created!</h4>
                  <p className="text-xs text-[#9E9EAF] mt-1">
                    Send this secure setup link to the delivery partner so they can activate and set their password:
                  </p>
                </div>

                <div className="p-3 bg-[#13131E] border border-[#252536] rounded-lg text-left">
                  <span className="text-[10px] text-[#7E7E90] block mb-1 font-mono uppercase">Setup Link</span>
                  <p className="text-xs font-mono text-[#DFBA5A] break-all select-all">{createdInviteLink}</p>
                </div>

                <div className="pt-2 flex items-center justify-center gap-3">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdInviteLink);
                      onShowToast('Invitation link copied to clipboard!');
                    }}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-xs font-bold flex items-center gap-1.5"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Copy Setup Link</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setCreatedInviteLink(null);
                    }}
                    className="px-4 py-2 rounded-lg bg-[#181824] text-xs text-white"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateDeliveryBoy} className="space-y-4 text-xs">
                <div>
                  <label className="text-[11px] text-[#C0C0D0] block mb-1 font-medium">
                    Delivery Partner Full Name <span className="text-[#DFBA5A]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={newDelName}
                    onChange={(e) => setNewDelName(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#C0C0D0] block mb-1 font-medium">
                      Email Address <span className="text-[#DFBA5A]">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="delivery@vijayvisuals.com"
                      value={newDelEmail}
                      onChange={(e) => setNewDelEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs font-mono focus:outline-none focus:border-[#DFBA5A]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[#C0C0D0] block mb-1 font-medium">
                      Mobile Number <span className="text-[#DFBA5A]">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="+91 98480 12345"
                      value={newDelPhone}
                      onChange={(e) => setNewDelPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs font-mono focus:outline-none focus:border-[#DFBA5A]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#C0C0D0] block mb-1 font-medium">
                      Vehicle Type
                    </label>
                    <select
                      value={newDelVehicle}
                      onChange={(e) => setNewDelVehicle(e.target.value as any)}
                      className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                    >
                      <option value="Bike">Bike (Standard Two-Wheeler)</option>
                      <option value="Scooter">Scooter / Moped</option>
                      <option value="Electric Vehicle">Electric Vehicle (EV)</option>
                      <option value="Car">Car / Van (Large Deliveries)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-[#C0C0D0] block mb-1 font-medium">
                      Vehicle Registration Number
                    </label>
                    <input
                      type="text"
                      placeholder="TS 09 EA 1234"
                      value={newDelPlate}
                      onChange={(e) => setNewDelPlate(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs font-mono uppercase focus:outline-none focus:border-[#DFBA5A]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-[#C0C0D0] block mb-1 font-medium">
                    Assigned Operating Zone / Area
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Banjara Hills, Jubilee Hills, Hyderabad"
                    value={newDelArea}
                    onChange={(e) => setNewDelArea(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-[#C0C0D0] block mb-1 font-medium">
                    Internal Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Certified for fragile luxury goods and evening food deliveries..."
                    value={newDelNotes}
                    onChange={(e) => setNewDelNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded text-xs text-[#848496] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider shadow"
                  >
                    Create Account & Generate Invite
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ASSIGN ORDER MODAL */}
      {orderToAssign && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0E0E16] border border-[#2E2E42] rounded-xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E1E2C] mb-4">
              <div>
                <span className="text-[10px] font-mono text-[#DFBA5A] uppercase tracking-wider block">
                  Fleet Dispatch
                </span>
                <h3 className="font-luxury font-bold text-white text-base">
                  Assign Order {orderToAssign.order_number}
                </h3>
              </div>
              <button
                onClick={() => setOrderToAssign(null)}
                className="p-1 text-[#848496] hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignOrder} className="space-y-4 text-xs">
              <div className="p-3 rounded-lg bg-[#141420] border border-[#202030] space-y-1">
                <p className="text-white font-semibold">{orderToAssign.business_name}</p>
                <p className="text-[#A0A0B2]">Recipient: {orderToAssign.customer_name} ({orderToAssign.customer_phone})</p>
                <p className="text-[#848496] text-[11px]">{orderToAssign.delivery_address}</p>
              </div>

              <div>
                <label className="text-[11px] text-[#C0C0D0] block mb-1 font-medium">
                  Select Delivery Boy
                </label>
                <select
                  value={selectedDeliveryBoyId}
                  onChange={(e) => setSelectedDeliveryBoyId(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                >
                  {deliveryBoys.map(({ profile, details }) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name} ({details.vehicle_type} - {details.assigned_area}) [{details.active_status}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOrderToAssign(null)}
                  className="px-4 py-2 rounded text-xs text-[#848496] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider shadow"
                >
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
