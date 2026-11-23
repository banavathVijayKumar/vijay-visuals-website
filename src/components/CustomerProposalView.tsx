// ============================================================================
// VIJAY VISUALS — CUSTOMER ONLINE PROPOSAL VIEW (/proposal/:token)
// Allows customers to view their bespoke digital proposal, interact with
// their future website preview, download the luxury A4 PDF, compare packages,
// and approve with direct Cashfree payment handoff.
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  HelpCircle,
  Lock,
  MessageCircle,
  Printer,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { initiateCashfreeStorefrontCheckout } from '../lib/cashfreeClient';
import { printOrDownloadProposalPdf, ProposalRecord } from '../lib/proposalPdfGenerator';
import { BusinessFuturePreview } from './BusinessFuturePreview';

interface CustomerProposalViewProps {
  token: string;
  onBackToHome?: () => void;
  onNotify: (msg: string) => void;
}

export const CustomerProposalView: React.FC<CustomerProposalViewProps> = ({ token, onBackToHome, onNotify }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<any | null>(null);

  // Approval modal state
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<'STARTER' | 'GOLD' | 'PREMIUM'>('STARTER');
  const [approving, setApproving] = useState(false);

  // Decline modal state
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declining, setDeclining] = useState(false);

  useEffect(() => {
    // Add noindex tag to protect customer private proposals from search engine scraping
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  const loadProposal = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ proposal: any }>(`/api/proposals/public/${encodeURIComponent(token)}`);
      setProposal(res.proposal);
      if (res.proposal?.package_tier) {
        setSelectedTier(res.proposal.package_tier);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load proposal. Please check your link or contact Vijay Visuals.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) loadProposal();
  }, [token]);

  const handleApprove = async () => {
    if (!proposal) return;
    setApproving(true);
    try {
      const res = await apiFetch<{
        success: boolean;
        selectedTier: 'STARTER' | 'GOLD' | 'PREMIUM';
        payableAmountInr: number;
        proposal: any;
      }>(`/api/proposals/${proposal.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'approve',
          token,
          selectedTier,
        }),
      });

      setProposal(res.proposal);
      setApproveModalOpen(false);
      onNotify(`Proposal approved for the ${selectedTier} Package! Launching Cashfree Checkout...`);

      // Initiate Cashfree checkout handoff
      try {
        const checkoutRes = await apiFetch<{
          paymentSessionId: string;
          orderId: string;
          environment: 'sandbox' | 'production';
          amountInr: number;
        }>(`/api/proposals/${proposal.id}/checkout`, {
          method: 'POST',
          body: JSON.stringify({ token }),
        });

        if (checkoutRes.paymentSessionId && checkoutRes.orderId) {
          await initiateCashfreeStorefrontCheckout({
            paymentSessionId: checkoutRes.paymentSessionId,
            orderId: checkoutRes.orderId,
            environment: checkoutRes.environment,
            onSuccess: (verifiedResult) => {
              onNotify('Payment authorized and verified! Onboarding kickoff initiated.');
              loadProposal();
            },
            onError: (payErr) => {
              onNotify(`Payment notice: ${payErr.message}`);
            },
          });
        }
      } catch (checkErr: any) {
        onNotify(`Payment checkout notice: ${checkErr.message}`);
      }
    } catch (err: any) {
      onNotify(err?.message || 'Failed to approve proposal.');
    } finally {
      setApproving(false);
    }
  };

  const handleDecline = async () => {
    if (!proposal) return;
    setDeclining(true);
    try {
      const res = await apiFetch<{ success: boolean; proposal: any }>(`/api/proposals/${proposal.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'reject',
          token,
          reason: declineReason.trim(),
        }),
      });
      setProposal(res.proposal);
      setDeclineModalOpen(false);
      onNotify('Proposal feedback recorded. Thank you.');
    } catch (err: any) {
      onNotify(err?.message || 'Failed to decline proposal.');
    } finally {
      setDeclining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07070B] text-white flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 rounded-full border-2 border-amber-400 border-t-transparent animate-spin mb-4" />
        <p className="text-xs text-[#8E8EA2] uppercase tracking-wider font-semibold">Loading Bespoke Proposal...</p>
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen bg-[#07070B] text-white flex flex-col items-center justify-center p-4 text-center">
        <div className="bg-[#12121C] border border-[#2B2B3E] rounded-2xl p-8 max-w-md space-y-4">
          <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-lg font-bold">Proposal Link Notice</h2>
          <p className="text-xs text-[#8E8EA2]">{error || 'This proposal link is invalid or has expired.'}</p>
          {onBackToHome && (
            <button
              type="button"
              onClick={onBackToHome}
              className="px-4 py-2 rounded-lg bg-[#D4AF37] text-black text-xs font-bold"
            >
              Go to Vijay Visuals Home
            </button>
          )}
        </div>
      </div>
    );
  }

  const isApproved = proposal.status === 'accepted_locked' || proposal.delivery_status === 'approved';
  const isDeclined = proposal.status === 'declined' || proposal.delivery_status === 'rejected';
  const isPaid = proposal.status === 'paid';

  const amountFormatted = `₹${(proposal.grand_total_inr || proposal.development_fee_inr || 7999).toLocaleString('en-IN')}`;

  const previewData = {
    customerName: proposal.customer_name,
    businessName: proposal.business_name,
    businessCategory: proposal.business_category,
    businessLogoUrl: proposal.business_logo_url,
    coverImageUrl: proposal.cover_image_url,
    businessPhotos: proposal.businessPhotos,
    products: proposal.products,
    phone: proposal.customer_phone,
    email: proposal.customer_email,
    businessAddress: proposal.business_address,
    area: proposal.area,
    city: proposal.city,
    state: proposal.state,
    pincode: proposal.pincode,
    openingHours: proposal.opening_hours,
    preferredColors: proposal.preferredColors,
  };

  return (
    <div className="min-h-screen bg-[#07070B] text-white pb-20 selection:bg-amber-400 selection:text-black">
      {/* Top Banner Navigation */}
      <div className="border-b border-[#1E1E2C] bg-[#0C0C12]/90 backdrop-blur sticky top-0 z-30 px-4 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="VIJAY VISUALS"
              className="w-9 h-9 rounded-lg border border-[#D4AF37]/50 object-contain bg-black shadow"
            />
            <div>
              <span className="font-extrabold text-sm tracking-wider text-[#D4AF37]">VIJAY VISUALS</span>
              <span className="text-[10px] text-[#8E8EA2] block uppercase tracking-wider">Executive Digital Proposal</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => printOrDownloadProposalPdf(proposal)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181824] hover:bg-[#222234] border border-[#2B2B40] text-xs font-semibold text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-amber-300" />
              <span>Download PDF (A4)</span>
            </button>

            {!isApproved && !isDeclined && (
              <>
                <button
                  type="button"
                  onClick={() => setDeclineModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-950/20 text-xs font-semibold transition-colors"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => setApproveModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#D4AF37] hover:bg-amber-400 text-black text-xs font-bold shadow-lg transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approve Proposal</span>
                </button>
              </>
            )}

            {isApproved && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Proposal Approved</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
        {/* Hero Proposal Summary Card */}
        <div className="bg-radial-gradient from-[#1B1710] to-[#0D0D14] border border-amber-500/30 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-950/50 text-amber-300 border border-amber-500/40">
                PROPOSAL #{proposal.proposal_number}
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                Website Architecture Proposal for {proposal.business_name}
              </h1>
              <p className="text-xs text-[#A0A0B8]">
                Prepared for <strong className="text-white">{proposal.customer_name}</strong> · {proposal.city || 'Hyderabad'}, {proposal.state || 'Telangana'}
              </p>
            </div>

            <div className="text-right bg-[#14141E] border border-amber-500/30 p-4 rounded-xl">
              <div className="text-[10px] text-[#8E8EA2] uppercase tracking-wider font-semibold">Selected Tier & Price</div>
              <div className="text-2xl font-extrabold text-[#ECC86A] mt-0.5">{amountFormatted}</div>
              <div className="text-[10px] text-[#10B981] font-medium">18% GST Included · Zero Hidden Costs</div>
            </div>
          </div>

          {/* Quick Notice Status */}
          {isApproved ? (
            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between gap-3">
              <div>
                <strong>✓ Approved & Price Locked:</strong> This proposal has been accepted. Development and onboarding are underway.
              </div>
              <button
                type="button"
                onClick={() => setApproveModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 text-black text-xs font-bold shrink-0"
              >
                Pay via Cashfree
              </button>
            </div>
          ) : isDeclined ? (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/40 text-red-200 text-xs">
              <strong>Decline Recorded:</strong> You declined this proposal. If you wish to discuss adjustments or customize features, please contact our team.
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <strong>Review Notice:</strong> Explore your future website below, download your A4 PDF proposal, and approve when ready. No payment is taken until you authorize.
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                <Clock className="w-3.5 h-3.5" />
                <span>Valid for 30 Days</span>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 1: BUSINESS FUTURE PREVIEW */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Interactive Business Future Preview</span>
              </h2>
              <p className="text-xs text-[#8E8EA2]">
                See exactly how your business website will look on Desktop, Tablet, and Mobile phones before paying.
              </p>
            </div>
          </div>

          <BusinessFuturePreview data={previewData} />
        </section>

        {/* SECTION 2: FEATURE-WISE PRICING ALLOCATION TABLE (₹7,999) */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <span>Feature-Wise Pricing Breakdown</span>
            </h2>
            <p className="text-xs text-[#8E8EA2]">
              Transparent breakdown of our <strong>₹7,999 Starter Business Package</strong>. Understand what each feature does and how it benefits your business.
            </p>
          </div>

          <div className="bg-[#0E0E16] border border-[#222232] rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#14141E] text-amber-400 font-semibold border-b border-[#242436]">
                  <tr>
                    <th className="py-3 px-4">Feature Name</th>
                    <th className="py-3 px-4 text-right">Individual Value</th>
                    <th className="py-3 px-4">What It Does</th>
                    <th className="py-3 px-4">Customer Benefit</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A1A28]">
                  {(proposal.features?.length > 0 ? proposal.features : [
                    { name: '1. Premium Website Design', individualValueInr: 2000, whatItDoes: 'Custom responsive design, branded visual identity, mobile-first layouts', customerBenefit: 'Converts visitors into paying clients' },
                    { name: '2. Mobile Responsive Design', individualValueInr: 800, whatItDoes: 'Fluid adaptation across smartphones, tablets, and desktops', customerBenefit: 'Smooth experience for 85%+ mobile users' },
                    { name: '3. Product Catalog and Categories', individualValueInr: 1000, whatItDoes: 'Organized product showcase with prices, variants, photos, descriptions', customerBenefit: 'Clear offerings and menu pricing' },
                    { name: '4. Shopping Cart and Checkout', individualValueInr: 1000, whatItDoes: 'Real-time item additions, instant quantity updates, promo coupons', customerBenefit: 'Minimizes abandoned carts and purchase friction' },
                    { name: '5. Cashfree Payment Integration', individualValueInr: 1000, whatItDoes: 'UPI (GPay/PhonePe/Paytm), Dynamic QR, Cards, Net Banking', customerBenefit: 'Direct payments to your merchant account' },
                    { name: '6. Admin Dashboard', individualValueInr: 1000, whatItDoes: 'Self-editing portal to edit products, prices, banners, orders', customerBenefit: 'Zero developer dependency for updates' },
                    { name: '7. WhatsApp Integration', individualValueInr: 400, whatItDoes: 'Click-to-chat WhatsApp inquiry & instant order alerts', customerBenefit: 'Direct personal customer relationship' },
                    { name: '8. Basic SEO Setup', individualValueInr: 500, whatItDoes: 'Search-friendly meta tags, sitemap.xml, local city targeting', customerBenefit: 'Helps local customers find you on Google' },
                    { name: '9. Contact and Location Setup', individualValueInr: 299, whatItDoes: 'Interactive Google Map directions, business hours, dialers', customerBenefit: 'Walk-in footfall trust and easy navigation' },
                  ]).map((f: any, idx: number) => (
                    <tr key={idx} className="hover:bg-[#12121D] transition-colors">
                      <td className="py-3 px-4 font-bold text-white">{f.name}</td>
                      <td className="py-3 px-4 text-right font-extrabold text-[#ECC86A]">
                        ₹{(f.individualValueInr || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4 text-[#A0A0B8]">{f.whatItDoes}</td>
                      <td className="py-3 px-4 text-emerald-400">{f.customerBenefit}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Included
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-[#12121E] p-4 border-t border-[#242436] flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-[#8E8EA2]">Total Base Package Development Fee</span>
              <div className="flex items-center gap-4">
                <span>Base: <strong className="text-white">₹7,999</strong></span>
                <span>GST (18%): <strong className="text-white">₹1,440</strong></span>
                <span className="text-sm font-bold text-[#ECC86A]">Grand Total: ₹9,439</span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: PACKAGE COMPARISON */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Package Tiers Comparison</span>
            </h2>
            <p className="text-xs text-[#8E8EA2]">
              Choose the tier that matches your current business size. Upgrade anytime with seamless data migration.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* STARTER */}
            <div className={`rounded-xl p-5 border flex flex-col justify-between ${
              selectedTier === 'STARTER' ? 'border-[#D4AF37] bg-[#14131B] shadow-lg shadow-amber-500/10' : 'border-[#222232] bg-[#0E0E16]'
            }`}>
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">STARTER TIER</span>
                    <h3 className="text-xl font-bold text-white">₹7,999</h3>
                    <div className="text-[10px] text-[#8E8EA2]">+18% GST (₹9,439 Total)</div>
                  </div>
                  {selectedTier === 'STARTER' && (
                    <span className="px-2 py-0.5 rounded text-[9px] bg-amber-400 text-black font-bold">Selected</span>
                  )}
                </div>
                <div className="text-xs text-[#B0B0C4] space-y-1.5 pt-2 border-t border-[#222234]">
                  <div>✓ Custom Premium Website Design</div>
                  <div>✓ All 9 Core Features Included</div>
                  <div>✓ Product Catalog & Shopping Cart</div>
                  <div>✓ Cashfree PG (UPI / QR / Cards)</div>
                  <div>✓ Self-Editing Business Dashboard</div>
                  <div>✓ 30 Days Free Support</div>
                  <div className="text-[11px] text-amber-300 pt-1 font-semibold">Delivery: 3–5 Business Days</div>
                </div>
              </div>
              {!isApproved && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTier('STARTER');
                    setApproveModalOpen(true);
                  }}
                  className="w-full mt-4 py-2 rounded-lg bg-[#D4AF37] text-black text-xs font-bold hover:bg-amber-400"
                >
                  Select Starter (₹7,999)
                </button>
              )}
            </div>

            {/* GOLD */}
            <div className={`rounded-xl p-5 border flex flex-col justify-between ${
              selectedTier === 'GOLD' ? 'border-[#D4AF37] bg-[#14131B] shadow-lg shadow-amber-500/10' : 'border-[#222232] bg-[#0E0E16]'
            }`}>
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">GOLD TIER</span>
                    <h3 className="text-xl font-bold text-white">₹14,999</h3>
                    <div className="text-[10px] text-[#8E8EA2]">+18% GST (₹17,699 Total)</div>
                  </div>
                  {selectedTier === 'GOLD' && (
                    <span className="px-2 py-0.5 rounded text-[9px] bg-amber-400 text-black font-bold">Selected</span>
                  )}
                </div>
                <div className="text-xs text-[#B0B0C4] space-y-1.5 pt-2 border-t border-[#222234]">
                  <div>✓ Everything in Starter Tier</div>
                  <div>✓ Customer Reviews & Ratings Engine</div>
                  <div>✓ Discount Coupons & Promo Engine</div>
                  <div>✓ Shiprocket Courier Integration</div>
                  <div>✓ Priority DNS & Custom Domain</div>
                  <div>✓ 90 Days Priority Support</div>
                  <div className="text-[11px] text-amber-300 pt-1 font-semibold">Delivery: 5–7 Business Days</div>
                </div>
              </div>
              {!isApproved && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTier('GOLD');
                    setApproveModalOpen(true);
                  }}
                  className="w-full mt-4 py-2 rounded-lg bg-[#D4AF37] text-black text-xs font-bold hover:bg-amber-400"
                >
                  Select Gold (₹14,999)
                </button>
              )}
            </div>

            {/* PREMIUM */}
            <div className={`rounded-xl p-5 border flex flex-col justify-between ${
              selectedTier === 'PREMIUM' ? 'border-[#D4AF37] bg-[#14131B] shadow-lg shadow-amber-500/10' : 'border-[#222232] bg-[#0E0E16]'
            }`}>
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">PREMIUM TIER</span>
                    <h3 className="text-xl font-bold text-white">₹24,999</h3>
                    <div className="text-[10px] text-[#8E8EA2]">+18% GST (₹29,499 Total)</div>
                  </div>
                  {selectedTier === 'PREMIUM' && (
                    <span className="px-2 py-0.5 rounded text-[9px] bg-amber-400 text-black font-bold">Selected</span>
                  )}
                </div>
                <div className="text-xs text-[#B0B0C4] space-y-1.5 pt-2 border-t border-[#222234]">
                  <div>✓ Everything in Gold Tier</div>
                  <div>✓ Installable Mobile PWA App</div>
                  <div>✓ App Icon & Offline Caching</div>
                  <div>✓ Multi-Currency FX Engine</div>
                  <div>✓ Dedicated Account Manager</div>
                  <div>✓ 1 Year VIP Support</div>
                  <div className="text-[11px] text-amber-300 pt-1 font-semibold">Delivery: 7–10 Business Days</div>
                </div>
              </div>
              {!isApproved && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTier('PREMIUM');
                    setApproveModalOpen(true);
                  }}
                  className="w-full mt-4 py-2 rounded-lg bg-[#D4AF37] text-black text-xs font-bold hover:bg-amber-400"
                >
                  Select Premium (₹24,999)
                </button>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 4: ACTIONS & DOWNLOAD CALLOUT */}
        <div className="bg-[#12121C] border border-[#242436] rounded-2xl p-6 text-center space-y-4">
          <h3 className="text-lg font-bold text-white">Need a Printable Copy for Internal Approval?</h3>
          <p className="text-xs text-[#8E8EA2] max-w-lg mx-auto">
            Download our luxury 9-page international digital agency proposal in A4 print-ready PDF format with all specifications, terms, and tables.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => printOrDownloadProposalPdf(proposal)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#D4AF37] text-black text-xs font-bold shadow-lg hover:bg-amber-400"
            >
              <Printer className="w-4 h-4" />
              <span>Download & Print PDF Proposal (A4)</span>
            </button>
          </div>
        </div>

        {/* OFFICIAL AGENCY CONTACT STRIP */}
        <div className="bg-[#0D0D14] border border-[#222232] rounded-2xl p-6 text-xs text-[#9E9EB2] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <img
              src="/logo.png"
              alt="VIJAY VISUALS"
              className="w-10 h-10 rounded-lg border border-[#D4AF37]/50 object-contain bg-black shadow"
            />
            <div>
              <p className="font-extrabold text-sm text-[#D4AF37] tracking-wider">VIJAY VISUALS</p>
              <p className="text-[11px] text-[#7E7E92]">Digital Architecture & High-Performance Websites · Hyderabad, India</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs">
            <a
              href="tel:+919381362201"
              className="inline-flex items-center gap-1.5 text-white hover:text-[#ECC86A] transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Official Mobile: <strong className="text-[#ECC86A]">+91 9381362201</strong></span>
            </a>
            <a
              href="https://wa.me/919381362201"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <span>WhatsApp Chat</span>
            </a>
            <a
              href="mailto:vk66278@gmail.com"
              className="inline-flex items-center gap-1.5 text-white hover:text-[#ECC86A] transition-colors"
            >
              <span>Official Email: <strong className="text-[#ECC86A]">vk66278@gmail.com</strong></span>
            </a>
          </div>
        </div>
      </div>

      {/* APPROVAL CONFIRMATION MODAL */}
      {approveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#101018] border border-amber-500/40 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#222232] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-amber-400" />
                <span>Approve Website Proposal</span>
              </h3>
              <button
                type="button"
                onClick={() => setApproveModalOpen(false)}
                className="text-[#8E8EA2] hover:text-white"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#B0B0C4]">
              <p>
                Confirm your approval for the <strong>{proposal.business_name}</strong> digital storefront.
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-white mb-1.5">Selected Package Tier:</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['STARTER', 'GOLD', 'PREMIUM'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedTier(t)}
                      className={`p-2 rounded-lg border text-center transition-all ${
                        selectedTier === t
                          ? 'border-amber-400 bg-amber-950/30 text-amber-300 font-bold'
                          : 'border-[#26263A] bg-[#161622] text-[#8E8EA2]'
                      }`}
                    >
                      <span className="block text-xs">{t}</span>
                      <span className="block text-[10px]">
                        {t === 'STARTER' ? '₹7,999' : t === 'GOLD' ? '₹14,999' : '₹24,999'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-[#141420] p-3 rounded-lg border border-[#252538] space-y-1">
                <div className="flex justify-between">
                  <span>Payable Amount:</span>
                  <strong className="text-amber-300">
                    {selectedTier === 'STARTER' ? '₹9,439' : selectedTier === 'GOLD' ? '₹17,699' : '₹29,499'} (incl. 18% GST)
                  </strong>
                </div>
                <div className="text-[10px] text-[#7C7C92]">
                  Includes all development, setup, and 30–90 days onboarding support.
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-emerald-400">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>Prices are permanently locked upon approval.</span>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setApproveModalOpen(false)}
                className="flex-1 py-2.5 rounded-lg border border-[#2C2C40] text-xs font-semibold text-white hover:bg-[#1A1A28]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={approving}
                onClick={handleApprove}
                className="flex-1 py-2.5 rounded-lg bg-[#D4AF37] hover:bg-amber-400 text-black text-xs font-bold disabled:opacity-50"
              >
                {approving ? 'Authorizing...' : 'Confirm & Proceed to Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DECLINE FEEDBACK MODAL */}
      {declineModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#101018] border border-red-500/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#222232] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-400" />
                <span>Decline Proposal</span>
              </h3>
              <button
                type="button"
                onClick={() => setDeclineModalOpen(false)}
                className="text-[#8E8EA2] hover:text-white"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#B0B0C4]">
              <p>Please share your feedback or what changes you would like us to make:</p>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="E.g., We would like to adjust the package scope, budget, or launch timeline..."
                rows={4}
                className="w-full rounded-lg border border-[#2C2C40] bg-[#09090D] p-3 text-xs text-white focus:outline-none focus:border-red-400"
              />
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeclineModalOpen(false)}
                className="flex-1 py-2.5 rounded-lg border border-[#2C2C40] text-xs font-semibold text-white hover:bg-[#1A1A28]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={declining}
                onClick={handleDecline}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold disabled:opacity-50"
              >
                {declining ? 'Submitting...' : 'Submit Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
