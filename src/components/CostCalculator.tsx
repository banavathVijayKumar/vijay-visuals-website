import React, { useState } from 'react';
import { CONTACT_INFO } from '../data/content';
import { Calculator, MessageCircle, Check, Sparkles, RefreshCw, ArrowRight } from 'lucide-react';

interface AddonOption {
  id: string;
  label: string;
  price: number;
}

export const CostCalculator: React.FC = () => {
  const [selectedService, setSelectedService] = useState<'web' | 'ecommerce' | 'business' | 'video' | 'graphics'>('web');
  const [selectedTier, setSelectedTier] = useState<'starter' | 'pro' | 'bespoke'>('pro');
  const [selectedAddons, setSelectedAddons] = useState<string[]>(['express']);

  const basePrices: Record<string, Record<string, number>> = {
    web: { starter: 15000, pro: 35000, bespoke: 65000 },
    ecommerce: { starter: 25000, pro: 55000, bespoke: 95000 },
    business: { starter: 20000, pro: 45000, bespoke: 80000 },
    video: { starter: 18000, pro: 40000, bespoke: 75000 },
    graphics: { starter: 10000, pro: 25000, bespoke: 45000 },
  };

  const serviceAddons: Record<string, AddonOption[]> = {
    web: [
      { id: 'express', label: 'Express 72-Hour Rapid Delivery', price: 8000 },
      { id: 'seo', label: 'Advanced Technical SEO & Google Search Schema', price: 6000 },
      { id: 'animation', label: 'Custom GSAP / Motion UI Micro-interactions', price: 7000 },
      { id: 'copywriting', label: 'Professional Conversion Copywriting', price: 5000 },
    ],
    ecommerce: [
      { id: 'express', label: 'Express Delivery (Under 7 Days)', price: 12000 },
      { id: 'payment', label: 'Razorpay, Stripe & Instant UPI Integration', price: 6000 },
      { id: 'whatsapp_orders', label: 'WhatsApp Automated Order Tracking Desk', price: 5000 },
      { id: 'inventory', label: 'Multi-Variant Inventory & Stock Synchronization', price: 7500 },
    ],
    business: [
      { id: 'express', label: 'Priority 5-Day Fast-Track Delivery', price: 9000 },
      { id: 'lead_funnel', label: 'Custom Lead Qualification & Booking Funnel', price: 6500 },
      { id: 'cms', label: 'Client Content Management Dashboard', price: 8000 },
      { id: 'legal', label: 'Enterprise Legal Architecture & GDPR / DPDP Suite', price: 4000 },
    ],
    video: [
      { id: 'express', label: '72-Hour Express Wedding Teaser Delivery', price: 9000 },
      { id: 'drone', label: 'Drone & S-Log3 Cinematic Color Science Grade', price: 6000 },
      { id: 'reels', label: '3x High-Retention 9:16 Vertical Instagram Reels', price: 5000 },
      { id: 'audio_cleanup', label: 'iZotope RX Advanced Speech & Vows Restoration', price: 4500 },
    ],
    graphics: [
      { id: 'express', label: 'Express 48-Hour Brand Turnaround', price: 5000 },
      { id: 'guidelines', label: 'Comprehensive 20-Page Luxury Brand Bible', price: 7000 },
      { id: 'packaging', label: 'Gold Foil Packaging Box & Label Vector Dies', price: 8000 },
      { id: 'social_kit', label: '15x Editable Social Media Instagram Templates', price: 4500 },
    ]
  };

  const toggleAddon = (id: string) => {
    setSelectedAddons((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const basePrice = basePrices[selectedService][selectedTier];
  const addonsTotal = (serviceAddons[selectedService] || [])
    .filter((a) => selectedAddons.includes(a.id))
    .reduce((sum, a) => sum + a.price, 0);

  const totalEstimate = basePrice + addonsTotal;

  const getServiceName = (key: string) => {
    switch (key) {
      case 'web': return 'Website Development';
      case 'ecommerce': return 'E-commerce Website';
      case 'business': return 'Business Website';
      case 'video': return 'Wedding Video Editing';
      case 'graphics': return 'Graphic Design & Branding';
      default: return 'Creative Project';
    }
  };

  const handleSendToWhatsApp = () => {
    const serviceName = getServiceName(selectedService);
    const tierName = selectedTier.toUpperCase();
    const addonsNames = (serviceAddons[selectedService] || [])
      .filter((a) => selectedAddons.includes(a.id))
      .map((a) => a.label)
      .join(', ');

    const message = `Hello Vijay! I calculated an estimate on the Vijay Visuals website:
*Service:* ${serviceName}
*Package Tier:* ${tierName}
*Add-ons:* ${addonsNames || 'None'}
*Estimated Budget:* ₹${totalEstimate.toLocaleString('en-IN')}

I would like to discuss this project and confirm the timeline with you!`;

    window.open(`${CONTACT_INFO.whatsappUrl}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <section id="calculator" className="py-24 border-b border-[#1E1E26] relative bg-[#09090D]">
      <div className="max-w-7xl mx-auto px-6">
        
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-[#DFBA5A] mb-3">
            <Calculator className="w-3.5 h-3.5" />
            <span>Interactive Project Estimator</span>
          </div>
          <h2 className="font-luxury text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
            Calculate Your Custom Investment.
          </h2>
          <p className="text-[#9E9EAF] text-sm sm:text-base mt-3 leading-relaxed">
            Select your discipline, scope, and specialized add-ons to receive an instant transparent preliminary quote.
          </p>
        </div>

        {/* Calculator Body Card */}
        <div className="max-w-4xl mx-auto bg-[#0E0E15] border border-[#232330] rounded-xl p-6 sm:p-8 shadow-2xl relative">
          
          {/* Step 1: Service Type */}
          <div className="mb-8">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37] block mb-3">
              1. Select Creative Service Discipline
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {[
                { key: 'web', label: 'Website Dev' },
                { key: 'ecommerce', label: 'E-commerce' },
                { key: 'business', label: 'Business Web' },
                { key: 'video', label: 'Wedding Video' },
                { key: 'graphics', label: 'Graphic Design' },
              ].map((s) => (
                <button
                  key={s.key}
                  onClick={() => {
                    setSelectedService(s.key as any);
                    setSelectedAddons(['express']);
                  }}
                  className={`p-3 rounded-lg text-xs font-semibold transition-all border text-center ${
                    selectedService === s.key
                      ? 'bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] border-[#DFBA5A] shadow-md shadow-[#D4AF37]/15 font-bold'
                      : 'bg-[#13131C] text-[#A0A0B2] border-[#20202C] hover:text-white hover:border-[#333344]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Tier Scale */}
          <div className="mb-8">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37] block mb-3">
              2. Select Scope & Complexity Tier
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { key: 'starter', label: 'Essential Tier', desc: 'Fast, clean foundation for emerging ventures.' },
                { key: 'pro', label: 'Professional Standard', desc: 'Most popular. Full features & high performance.' },
                { key: 'bespoke', label: 'Luxury Bespoke Suite', desc: 'White-glove custom architecture & cinema masters.' },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setSelectedTier(t.key as any)}
                  className={`p-4 rounded-lg text-left transition-all border ${
                    selectedTier === t.key
                      ? 'bg-[#181824] border-[#D4AF37] text-white shadow-lg'
                      : 'bg-[#12121A] border-[#1E1E28] text-[#8C8C9E] hover:text-[#CCC] hover:border-[#2C2C3A]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white font-luxury">{t.label}</span>
                    {selectedTier === t.key && <Check className="w-4 h-4 text-[#DFBA5A]" />}
                  </div>
                  <p className="text-[11px] text-[#7F7F92] leading-snug">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: Add-on Capabilities */}
          <div className="mb-8">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37] block mb-3">
              3. Specialized Capabilities & Add-Ons
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(serviceAddons[selectedService] || []).map((addon) => {
                const isChecked = selectedAddons.includes(addon.id);
                return (
                  <div
                    key={addon.id}
                    onClick={() => toggleAddon(addon.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      isChecked
                        ? 'bg-[#161622] border-[#D4AF37]/50 text-white'
                        : 'bg-[#101017] border-[#1C1C26] text-[#7E7E90] hover:text-[#B0B0C0]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] ${
                        isChecked ? 'bg-[#DFBA5A] border-[#DFBA5A] text-[#0A0A0E] font-bold' : 'border-[#333344] bg-[#0A0A0E]'
                      }`}>
                        {isChecked && '✓'}
                      </div>
                      <span className="text-xs font-medium">{addon.label}</span>
                    </div>
                    <span className="font-mono text-xs text-[#D8AF44] font-semibold">
                      +₹{addon.price.toLocaleString('en-IN')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Result Box & WhatsApp Push */}
          <div className="pt-6 border-t border-[#20202E] flex flex-col md:flex-row items-center justify-between gap-6 bg-[#0B0B10] p-6 rounded-lg">
            <div>
              <span className="text-[11px] font-mono text-[#7A7A8E] uppercase tracking-wider block">
                Estimated Project Investment
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-luxury text-3xl sm:text-4xl font-bold text-gold-gradient">
                  ₹{totalEstimate.toLocaleString('en-IN')}
                </span>
                <span className="text-xs text-[#8C8C9E] font-mono">
                  (Estimated Turnaround: 4–10 days)
                </span>
              </div>
              <p className="text-xs text-[#6F6F80] mt-1">
                *Final scope confirmed after reviewing specific assets and briefs.
              </p>
            </div>

            <button
              onClick={handleSendToWhatsApp}
              className="w-full md:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-[#0A0A0E] bg-gradient-to-r from-[#DFBA5A] via-[#ECC86A] to-[#B38D2C] hover:from-[#ECC86A] hover:to-[#C69C36] rounded-md transition-all shadow-lg shadow-[#D4AF37]/20 whitespace-nowrap hover:scale-[1.02] active:scale-[0.98]"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Send Estimate to Vijay on WhatsApp</span>
            </button>
          </div>

        </div>

      </div>
    </section>
  );
};
