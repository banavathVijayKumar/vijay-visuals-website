// ============================================================================
// VIJAY VISUALS — PROPOSAL MANAGER (ADMIN & BUSINESS OWNER DASHBOARD)
// Manage customer proposals, create new business proposals, edit feature pricing,
// generate/download luxury 9-page PDFs, dispatch WhatsApp & Email proposals,
// track customer views, and monitor approval analytics.
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Mail,
  MessageCircle,
  MoreVertical,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { printOrDownloadProposalPdf, ProposalRecord } from '../lib/proposalPdfGenerator';

interface ProposalManagerProps {
  onNotify: (msg: string) => void;
  onOpenCustomerView?: (token: string) => void;
}

export function getProposalStatusBadge(p: any): { label: string; className: string } {
  const isPaid = p.status === 'paid' || p.delivery_status === 'paid';
  if (isPaid) {
    return {
      label: 'Paid',
      className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    };
  }

  const isApproved = p.status === 'accepted_locked' || p.delivery_status === 'approved';
  if (isApproved) {
    return {
      label: 'Approved',
      className: 'bg-amber-400/20 text-amber-300 border-amber-400/40',
    };
  }

  const isDeclined = p.status === 'declined' || p.delivery_status === 'rejected';
  if (isDeclined) {
    return {
      label: 'Declined',
      className: 'bg-red-500/20 text-red-300 border-red-500/40',
    };
  }

  const isExpired = Boolean(
    p.isExpired ||
    (p.expires_at && new Date(p.expires_at).getTime() < Date.now())
  );
  if (isExpired) {
    return {
      label: 'Expired',
      className: 'bg-zinc-800 text-zinc-400 border-zinc-700',
    };
  }

  if (p.delivery_status === 'viewed' || (Number(p.view_count) > 0)) {
    return {
      label: 'Viewed',
      className: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    };
  }

  if (p.delivery_status === 'shared' || p.delivery_status === 'email_sent' || p.status === 'sent') {
    return {
      label: 'Sent',
      className: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    };
  }

  return {
    label: 'Draft',
    className: 'bg-[#181824] text-[#8E8EA2] border-[#2B2B40]',
  };
}

export const ProposalManager: React.FC<ProposalManagerProps> = ({ onNotify, onOpenCustomerView }) => {
  const [proposals, setProposals] = useState<ProposalRecord[]>([]);
  const [summary, setSummary] = useState<{
    totalCount: number;
    totalProposedInr: number;
    approvedInr: number;
    pendingInr: number;
    approvedCount: number;
    conversionRatePct: number;
  }>({
    totalCount: 0,
    totalProposedInr: 0,
    approvedInr: 0,
    pendingInr: 0,
    approvedCount: 0,
    conversionRatePct: 0,
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Create/Edit modal state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingProposal, setEditingProposal] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  // Delivery Modal State
  const [deliveryModal, setDeliveryModal] = useState<{
    proposal: ProposalRecord;
    channel: 'whatsapp' | 'email';
    prefilledText?: string;
    clickToChatUrl?: string;
    emailPreviewHtml?: string;
    providerNotice?: string;
  } | null>(null);

  // Form fields
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessCategory, setBusinessCategory] = useState('clothing');
  const [businessAddress, setBusinessAddress] = useState('');
  const [city, setCity] = useState('Hyderabad');
  const [state, setState] = useState('Telangana');
  const [pincode, setPincode] = useState('500081');
  const [openingHours, setOpeningHours] = useState('Mon–Sat: 10:00 AM – 9:00 PM');
  const [packageTier, setPackageTier] = useState<'STARTER' | 'GOLD' | 'PREMIUM'>('STARTER');
  const [goldPriceInr, setGoldPriceInr] = useState(14999);
  const [premiumPriceInr, setPremiumPriceInr] = useState(24999);

  // 9 Default Editable Features
  const [features, setFeatures] = useState([
    { id: 'feat-1', name: 'Premium Website Design', individualValueInr: 2000, whatItDoes: 'Custom responsive design, branded visual identity, mobile-first layouts', customerBenefit: 'Converts visitors into paying clients', packageStatus: 'included' },
    { id: 'feat-2', name: 'Mobile Responsive Design', individualValueInr: 800, whatItDoes: 'Fluid adaptation across smartphones, tablets, and desktops', customerBenefit: 'Smooth, optimized experience for all mobile and smartphone users', packageStatus: 'included' },
    { id: 'feat-3', name: 'Product Catalog and Categories', individualValueInr: 1000, whatItDoes: 'Organized product showcase with prices, variants, photos, descriptions', customerBenefit: 'Clear offerings and menu pricing', packageStatus: 'included' },
    { id: 'feat-4', name: 'Shopping Cart and Checkout', individualValueInr: 1000, whatItDoes: 'Real-time item additions, instant quantity updates, promo coupons', customerBenefit: 'Minimizes abandoned carts and purchase friction', packageStatus: 'included' },
    { id: 'feat-5', name: 'Cashfree Payment Integration', individualValueInr: 1000, whatItDoes: 'UPI (GPay/PhonePe/Paytm), Dynamic QR, Cards, Net Banking', customerBenefit: 'Direct payments to your merchant account', packageStatus: 'included' },
    { id: 'feat-6', name: 'Admin Dashboard', individualValueInr: 1000, whatItDoes: 'Self-editing portal to edit products, prices, banners, orders', customerBenefit: 'Zero developer dependency for updates', packageStatus: 'included' },
    { id: 'feat-7', name: 'WhatsApp Integration', individualValueInr: 400, whatItDoes: 'Click-to-chat WhatsApp inquiry & instant order alerts', customerBenefit: 'Direct personal customer relationship', packageStatus: 'included' },
    { id: 'feat-8', name: 'Basic SEO Setup', individualValueInr: 500, whatItDoes: 'Search-friendly meta tags, sitemap.xml, local city targeting', customerBenefit: 'Helps local customers find you on Google', packageStatus: 'included' },
    { id: 'feat-9', name: 'Contact and Location Setup', individualValueInr: 299, whatItDoes: 'Interactive Google Map directions, business hours, dialers', customerBenefit: 'Walk-in footfall trust and easy navigation', packageStatus: 'included' },
  ]);

  const loadProposals = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ proposals: ProposalRecord[]; summary: any }>('/api/proposals');
      setProposals(res.proposals || []);
      if (res.summary) setSummary(res.summary);
    } catch (err) {
      console.error('Failed to load proposals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProposals();
  }, []);

  const totalCalculatedDevFee = features
    .filter((f) => f.packageStatus === 'included')
    .reduce((sum, f) => sum + (Number(f.individualValueInr) || 0), 0);

  const totalCalculatedGst = Math.round((totalCalculatedDevFee * 18) / 100);
  const totalCalculatedGrand = totalCalculatedDevFee + totalCalculatedGst;

  const resetForm = () => {
    setEditingProposal(null);
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setBusinessName('');
    setBusinessCategory('clothing');
    setBusinessAddress('');
    setCity('Hyderabad');
    setState('Telangana');
    setPincode('500081');
    setPackageTier('STARTER');
    setGoldPriceInr(14999);
    setPremiumPriceInr(24999);
  };

  const handleOpenCreate = () => {
    resetForm();
    setWizardOpen(true);
  };

  const handleOpenEdit = (p: any) => {
    setEditingProposal(p);
    setCustomerName(p.customer_name);
    setCustomerEmail(p.customer_email);
    setCustomerPhone(p.customer_phone || '');
    setBusinessName(p.business_name);
    setBusinessCategory(p.business_category || 'clothing');
    setBusinessAddress(p.business_address || '');
    setCity(p.city || 'Hyderabad');
    setState(p.state || 'Telangana');
    setPincode(p.pincode || '500081');
    setPackageTier(p.package_tier || 'STARTER');

    if (p.feature_breakdown_json) {
      try {
        setFeatures(JSON.parse(p.feature_breakdown_json));
      } catch {}
    }
    setWizardOpen(true);
  };

  const handleSaveProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerEmail.trim() || !businessName.trim()) {
      onNotify('Customer name, email, and business name are required.');
      return;
    }

    setSaving(true);
    try {
      if (editingProposal) {
        await apiFetch('/api/proposals', {
          method: 'PUT',
          body: JSON.stringify({
            id: editingProposal.id,
            customerName: customerName.trim(),
            customerEmail: customerEmail.trim(),
            customerPhone: customerPhone.trim(),
            businessName: businessName.trim(),
            businessCategory,
            businessAddress: businessAddress.trim(),
            city: city.trim(),
            state: state.trim(),
            pincode: pincode.trim(),
            packageTier,
            featureBreakdown: features,
            packagesComparison: {
              starter: { priceInr: 7999, name: 'STARTER' },
              gold: { priceInr: goldPriceInr, name: 'GOLD' },
              premium: { priceInr: premiumPriceInr, name: 'PREMIUM' },
            },
          }),
        });
        onNotify('Proposal updated successfully.');
      } else {
        const res = await apiFetch<{ proposal: any; secureToken: string }>('/api/proposals', {
          method: 'POST',
          body: JSON.stringify({
            customerName: customerName.trim(),
            customerEmail: customerEmail.trim(),
            customerPhone: customerPhone.trim(),
            businessName: businessName.trim(),
            businessCategory,
            businessAddress: businessAddress.trim(),
            city: city.trim(),
            state: state.trim(),
            pincode: pincode.trim(),
            openingHours,
            packageTier,
            featureBreakdown: features,
            goldPriceInr,
            premiumPriceInr,
          }),
        });
        onNotify(`New Proposal #${res.proposal.proposal_number} created successfully.`);
      }

      setWizardOpen(false);
      resetForm();
      loadProposals();
    } catch (err: any) {
      onNotify(err?.message || 'Failed to save proposal.');
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerDelivery = async (p: ProposalRecord, channel: 'whatsapp' | 'email') => {
    try {
      const res = await apiFetch<any>(`/api/proposals/${p.id}/delivery`, {
        method: 'POST',
        body: JSON.stringify({ channel }),
      });

      setDeliveryModal({
        proposal: p,
        channel,
        prefilledText: res.messageText,
        clickToChatUrl: res.clickToChatUrl,
        emailPreviewHtml: res.htmlPreview,
        providerNotice: res.providerNotice,
      });

      loadProposals();
    } catch (err: any) {
      onNotify(err?.message || `Failed to prepare ${channel} dispatch.`);
    }
  };

  const copyProposalLink = (p: ProposalRecord) => {
    const link = `${window.location.origin}/proposal/${p.secure_token}`;
    navigator.clipboard.writeText(link);
    onNotify('Customer proposal link copied to clipboard!');
  };

  const filteredProposals = proposals.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.proposal_number?.toLowerCase().includes(q) ||
      p.business_name?.toLowerCase().includes(q) ||
      p.customer_name?.toLowerCase().includes(q) ||
      p.customer_email?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 text-xs text-white">
      {/* Top Header & Metrics */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#222232] pb-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span>Customer Proposals & Quotation Management</span>
          </h2>
          <p className="text-xs text-[#8E8EA2]">
            Create luxury digital proposals, customize feature allocations, and track customer engagement.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadProposals}
            className="p-2 rounded-lg bg-[#14141E] border border-[#27273C] text-[#8E8EA2] hover:text-white"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#D4AF37] hover:bg-amber-400 text-black font-bold shadow-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Proposal</span>
          </button>
        </div>
      </div>

      {/* Analytics KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#101018] border border-[#222232] rounded-xl p-3.5 space-y-1">
          <div className="text-[10px] text-[#7C7C92] uppercase font-semibold">Total Proposals</div>
          <div className="text-xl font-extrabold text-white">{summary.totalCount}</div>
          <div className="text-[10px] text-[#8E8EA2]">{summary.approvedCount} approved</div>
        </div>

        <div className="bg-[#101018] border border-[#222232] rounded-xl p-3.5 space-y-1">
          <div className="text-[10px] text-[#7C7C92] uppercase font-semibold">Total Pipeline Value</div>
          <div className="text-xl font-extrabold text-white">₹{summary.totalProposedInr.toLocaleString('en-IN')}</div>
          <div className="text-[10px] text-[#8E8EA2]">All proposed packages</div>
        </div>

        <div className="bg-[#101018] border border-emerald-500/30 rounded-xl p-3.5 space-y-1">
          <div className="text-[10px] text-emerald-400 uppercase font-semibold">Approved Revenue</div>
          <div className="text-xl font-extrabold text-emerald-300">₹{summary.approvedInr.toLocaleString('en-IN')}</div>
          <div className="text-[10px] text-emerald-400/80">Accepted & price locked</div>
        </div>

        <div className="bg-[#101018] border border-amber-500/30 rounded-xl p-3.5 space-y-1">
          <div className="text-[10px] text-amber-400 uppercase font-semibold">Conversion Rate</div>
          <div className="text-xl font-extrabold text-[#ECC86A]">{summary.conversionRatePct}%</div>
          <div className="text-[10px] text-amber-300/80">Approved proposals</div>
        </div>
      </div>

      {/* Proposals List Table */}
      <div className="bg-[#0E0E16] border border-[#222232] rounded-xl overflow-hidden shadow">
        <div className="p-3 border-b border-[#202030] flex flex-wrap items-center justify-between gap-2">
          <div className="relative max-w-xs w-full">
            <Search className="w-3.5 h-3.5 text-[#7C7C92] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by proposal #, business, or client..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#28283C] bg-[#08080C] text-xs text-white focus:outline-none"
            />
          </div>
          <span className="text-[11px] text-[#8E8EA2] font-mono">
            {filteredProposals.length} of {proposals.length} proposals
          </span>
        </div>

        {filteredProposals.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <FileText className="w-8 h-8 text-[#55556E] mx-auto" />
            <p className="text-xs text-[#8E8EA2]">No proposals created yet.</p>
            <button
              type="button"
              onClick={handleOpenCreate}
              className="px-3.5 py-1.5 rounded-lg bg-[#D4AF37] text-black text-xs font-bold"
            >
              Create First Proposal
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#13131D] text-[#8E8EA2] font-semibold border-b border-[#222232]">
                <tr>
                  <th className="py-2.5 px-3">Proposal #</th>
                  <th className="py-2.5 px-3">Business & Client</th>
                  <th className="py-2.5 px-3">Tier & Price</th>
                  <th className="py-2.5 px-3 text-center">Views</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181826]">
                {filteredProposals.map((p) => {
                  const statusInfo = getProposalStatusBadge(p);

                  return (
                    <tr key={p.id} className="hover:bg-[#12121D] transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-amber-300">
                        {p.proposal_number}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-white">{p.business_name}</div>
                        <div className="text-[#8E8EA2] text-[11px]">{p.customer_name} · {p.customer_phone || p.customer_email}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-extrabold text-[#ECC86A]">
                          ₹{(p.grand_total_inr || p.development_fee_inr || 7999).toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] text-[#7C7C92]">{p.package_tier || 'STARTER'} Tier</div>
                      </td>
                      <td className="py-3 px-3 text-center font-mono">
                        <span className="inline-flex items-center gap-1 text-[#B0B0C4]">
                          <Eye className="w-3 h-3 text-amber-400" />
                          <span>{p.view_count || 0}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${statusInfo.className}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Copy Link */}
                          <button
                            type="button"
                            onClick={() => copyProposalLink(p)}
                            className="p-1.5 rounded bg-[#161622] hover:bg-[#202030] text-[#B8B8CC]"
                            title="Copy Proposal Link"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {/* Print / Download PDF */}
                          <button
                            type="button"
                            onClick={() => printOrDownloadProposalPdf(p)}
                            className="p-1.5 rounded bg-[#161622] hover:bg-[#202030] text-amber-300"
                            title="Download PDF (A4)"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {/* WhatsApp */}
                          <button
                            type="button"
                            onClick={() => handleTriggerDelivery(p, 'whatsapp')}
                            className="p-1.5 rounded bg-[#161622] hover:bg-[#202030] text-emerald-400"
                            title="Share on WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>

                          {/* Email */}
                          <button
                            type="button"
                            onClick={() => handleTriggerDelivery(p, 'email')}
                            className="p-1.5 rounded bg-[#161622] hover:bg-[#202030] text-blue-400"
                            title="Send via Email"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>

                          {/* Open Preview Page */}
                          {p.secure_token && onOpenCustomerView && (
                            <button
                              type="button"
                              onClick={() => onOpenCustomerView(p.secure_token!)}
                              className="p-1.5 rounded bg-[#161622] hover:bg-[#202030] text-white"
                              title="Open Customer View"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Edit */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 rounded bg-[#161622] hover:bg-[#202030] text-[#8E8EA2]"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE & EDIT PROPOSAL WIZARD MODAL */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#101018] border border-amber-500/40 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#222232] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>{editingProposal ? 'Edit Proposal' : 'Create New Luxury Proposal'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setWizardOpen(false)}
                className="text-[#8E8EA2] hover:text-white"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveProposal} className="space-y-4">
              {/* Client & Business Details */}
              <div className="space-y-3">
                <div className="font-semibold text-xs text-amber-300">1. Customer & Business Information</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#8E8EA2] mb-1">Customer / Owner Name *</label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full rounded-lg border border-[#2B2B40] bg-[#09090D] p-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#8E8EA2] mb-1">Business Name *</label>
                    <input
                      type="text"
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g. Royal Silks Boutique"
                      className="w-full rounded-lg border border-[#2B2B40] bg-[#09090D] p-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#8E8EA2] mb-1">Customer Email *</label>
                    <input
                      type="email"
                      required
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="e.g. client@business.com"
                      className="w-full rounded-lg border border-[#2B2B40] bg-[#09090D] p-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#8E8EA2] mb-1">WhatsApp / Phone *</label>
                    <input
                      type="text"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full rounded-lg border border-[#2B2B40] bg-[#09090D] p-2 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#8E8EA2] mb-1">Industry Category</label>
                    <select
                      value={businessCategory}
                      onChange={(e) => setBusinessCategory(e.target.value)}
                      className="w-full rounded-lg border border-[#2B2B40] bg-[#09090D] p-2 text-xs text-white"
                    >
                      <option value="clothing">Clothing & Fashion Boutique</option>
                      <option value="restaurant">Restaurant & Cloud Kitchen</option>
                      <option value="cafe">Cafe & Artisan Bakery</option>
                      <option value="photography">Photography & Creative Studio</option>
                      <option value="beauty_salon">Beauty Salon & Spa</option>
                      <option value="gym">Gym & Fitness Center</option>
                      <option value="real_estate">Real Estate & Property</option>
                      <option value="small_business">Small Business & Local Store</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#8E8EA2] mb-1">City</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Hyderabad"
                      className="w-full rounded-lg border border-[#2B2B40] bg-[#09090D] p-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#8E8EA2] mb-1">Initial Selected Tier</label>
                    <select
                      value={packageTier}
                      onChange={(e) => setPackageTier(e.target.value as any)}
                      className="w-full rounded-lg border border-[#2B2B40] bg-[#09090D] p-2 text-xs text-white font-bold"
                    >
                      <option value="STARTER">STARTER (₹7,999)</option>
                      <option value="GOLD">GOLD (₹{goldPriceInr})</option>
                      <option value="PREMIUM">PREMIUM (₹{premiumPriceInr})</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Feature-Wise Pricing Allocations (Starter = ₹7,999) */}
              <div className="space-y-3 pt-3 border-t border-[#222234]">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-xs text-amber-300">2. Feature-Wise Value Allocation</span>
                    <p className="text-[10px] text-[#8E8EA2]">Default 9 allocations total ₹7,999. Edit any feature price as needed.</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-[#8E8EA2]">Base Allocation Total:</span>
                    <span className="block text-sm font-extrabold text-[#ECC86A]">₹{totalCalculatedDevFee.toLocaleString('en-IN')}</span>
                    <span className="block text-[10px] text-[#8E8EA2]">Applicable taxes will be confirmed before payment.</span>
                  </div>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {features.map((f, idx) => (
                    <div
                      key={f.id}
                      className="bg-[#141420] border border-[#252538] p-2.5 rounded-lg flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex-1">
                        <span className="font-bold text-white block">{f.name}</span>
                        <span className="text-[10px] text-[#8E8EA2] block">{f.whatItDoes}</span>
                      </div>
                      <div className="w-24 text-right shrink-0">
                        <input
                          type="number"
                          min="0"
                          value={f.individualValueInr}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setFeatures((prev) => prev.map((item, i) => i === idx ? { ...item, individualValueInr: val } : item));
                          }}
                          className="w-full rounded border border-[#2D2D42] bg-[#0A0A0F] p-1 text-right text-xs font-mono font-bold text-[#ECC86A]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gold & Premium Configurable Prices */}
              <div className="space-y-2 pt-3 border-t border-[#222234]">
                <div className="font-semibold text-xs text-amber-300">3. Configurable Gold & Premium Tier Prices</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#8E8EA2] mb-1">GOLD Tier Base Price (INR)</label>
                    <input
                      type="number"
                      value={goldPriceInr}
                      onChange={(e) => setGoldPriceInr(Math.max(1000, Number(e.target.value) || 0))}
                      className="w-full rounded-lg border border-[#2B2B40] bg-[#09090D] p-2 text-xs font-mono font-bold text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#8E8EA2] mb-1">PREMIUM Tier Base Price (INR)</label>
                    <input
                      type="number"
                      value={premiumPriceInr}
                      onChange={(e) => setPremiumPriceInr(Math.max(1000, Number(e.target.value) || 0))}
                      className="w-full rounded-lg border border-[#2B2B40] bg-[#09090D] p-2 text-xs font-mono font-bold text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5 pt-3 border-t border-[#222234]">
                <button
                  type="button"
                  onClick={() => setWizardOpen(false)}
                  className="flex-1 py-2.5 rounded-lg border border-[#2C2C40] text-xs font-semibold text-white hover:bg-[#1A1A28]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg bg-[#D4AF37] hover:bg-amber-400 text-black text-xs font-bold disabled:opacity-50"
                >
                  {saving ? 'Generating...' : editingProposal ? 'Save Changes' : 'Generate & Issue Proposal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WHATSAPP & EMAIL DISPATCH MODAL */}
      {deliveryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#101018] border border-amber-500/40 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#222232] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {deliveryModal.channel === 'whatsapp' ? (
                  <>
                    <MessageCircle className="w-5 h-5 text-emerald-400" />
                    <span>WhatsApp Delivery Dispatch</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-5 h-5 text-blue-400" />
                    <span>Email Proposal Dispatch</span>
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setDeliveryModal(null)}
                className="text-[#8E8EA2] hover:text-white"
              >
                &times;
              </button>
            </div>

            {deliveryModal.channel === 'whatsapp' ? (
              <div className="space-y-3 text-xs">
                <p className="text-[#B0B0C4]">
                  Personalized WhatsApp proposal message for <strong>{deliveryModal.proposal.customer_name}</strong>:
                </p>
                <div className="bg-[#09090D] border border-[#232332] rounded-lg p-3 text-[11px] font-mono text-[#D4D4E8] max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {deliveryModal.prefilledText}
                </div>
                <div className="flex gap-2 pt-2">
                  <a
                    href={deliveryModal.clickToChatUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs text-center inline-flex items-center justify-center gap-1.5"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Open in WhatsApp</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(deliveryModal.prefilledText || '');
                      onNotify('WhatsApp text copied!');
                    }}
                    className="px-4 py-2.5 rounded-lg border border-[#2B2B40] text-xs font-semibold text-white"
                  >
                    Copy Text
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <p className="text-[#B0B0C4]">
                  Email dispatch for <strong>{deliveryModal.proposal.customer_email}</strong>:
                </p>
                {deliveryModal.providerNotice && (
                  <div className="p-3 bg-amber-950/30 border border-amber-500/40 rounded-lg text-amber-200 text-[11px]">
                    <strong>Provider Setup Notice:</strong> {deliveryModal.providerNotice}
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(deliveryModal.emailPreviewHtml || '');
                      onNotify('Email HTML template copied!');
                    }}
                    className="flex-1 py-2 rounded-lg bg-[#D4AF37] text-black font-bold text-xs"
                  >
                    Copy Email HTML Template
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryModal(null)}
                    className="px-4 py-2 rounded-lg border border-[#2B2B40] text-xs text-white"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
