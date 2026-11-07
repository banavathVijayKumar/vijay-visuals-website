import React, { useState } from 'react';
import { PRICING_PLANS, PricingPlan, CONTACT_INFO } from '../data/content';
import { Check, MessageCircle, Clock, ShieldCheck, ArrowRight } from 'lucide-react';

export const PricingSection: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'web' | 'video' | 'graphics'>('all');

  const filteredPlans = activeCategory === 'all'
    ? PRICING_PLANS
    : PRICING_PLANS.filter((p) => p.serviceCategory === activeCategory);

  const handleSelectPlan = (plan: PricingPlan) => {
    window.open(`${CONTACT_INFO.whatsappUrl}?text=${encodeURIComponent(plan.whatsappMessage)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <section id="pricing" className="py-24 border-b border-[#1E1E26] relative bg-[#07070A]">
      <div className="max-w-7xl mx-auto px-6">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold tracking-widest uppercase text-[#DFBA5A] mb-3">
            <span>Investment Tiers</span>
            <span aria-hidden="true" className="text-[#646473]">·</span>
            <span className="text-[#888898]">Transparent Pricing</span>
          </div>
          <h2 className="font-luxury text-3xl sm:text-4xl lg:text-[2.6rem] font-bold text-white tracking-tight leading-tight">
            Curated Studio Packages.
          </h2>
          <p className="text-[#9E9EAF] text-sm sm:text-base mt-3 leading-relaxed">
            Straightforward scopes engineered for outstanding ROI. Zero hidden fees, direct collaboration with Vijay, and guaranteed delivery timelines.
          </p>

          {/* Interactive Category Filter */}
          <div className="flex items-center justify-center gap-1.5 p-1 bg-[#12121A] rounded-lg border border-[#21212C] mt-8 inline-flex">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                activeCategory === 'all'
                  ? 'bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] shadow-sm'
                  : 'text-[#888898] hover:text-white'
              }`}
            >
              All Packages
            </button>
            <button
              onClick={() => setActiveCategory('web')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                activeCategory === 'web'
                  ? 'bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] shadow-sm'
                  : 'text-[#888898] hover:text-white'
              }`}
            >
              Web & E-Commerce
            </button>
            <button
              onClick={() => setActiveCategory('video')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                activeCategory === 'video'
                  ? 'bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] shadow-sm'
                  : 'text-[#888898] hover:text-white'
              }`}
            >
              Wedding Cinema
            </button>
            <button
              onClick={() => setActiveCategory('graphics')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                activeCategory === 'graphics'
                  ? 'bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] shadow-sm'
                  : 'text-[#888898] hover:text-white'
              }`}
            >
              Graphic Design
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {filteredPlans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl p-6 sm:p-7 flex flex-col justify-between transition-all duration-300 relative ${
                plan.popular
                  ? 'bg-[#101018] border-2 border-[#D4AF37] shadow-xl shadow-[#D4AF37]/10'
                  : 'bg-[#0D0D14] border border-[#20202B] hover:border-[#2F2F40]'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-[10px] font-bold uppercase tracking-widest px-3 py-0.5 rounded-full shadow-md">
                  Most Requested
                </div>
              )}

              <div>
                {/* Header */}
                <div className="border-b border-[#1C1C26] pb-4 mb-6">
                  <span className="text-[11px] font-mono text-[#D4AF37] uppercase tracking-wider block">
                    {plan.billingCycle}
                  </span>
                  <h3 className="font-luxury text-xl font-bold text-white mt-1">
                    {plan.name}
                  </h3>
                  <p className="text-xs text-[#8C8C9E] mt-2 leading-relaxed">
                    {plan.tagline}
                  </p>

                  <div className="mt-4 pt-4 border-t border-[#181822] flex items-baseline gap-1">
                    <span className="font-luxury text-2xl font-bold text-white">
                      {plan.price}
                    </span>
                  </div>
                </div>

                {/* Features List */}
                <div className="space-y-3 mb-6">
                  <span className="text-[11px] uppercase tracking-wider text-[#707082] font-semibold block">
                    Included Deliverables
                  </span>
                  {plan.features.map((feature, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs text-[#C5C5D4]">
                      <Check className="w-3.5 h-3.5 text-[#DFBA5A] shrink-0 mt-0.5" />
                      <span className="leading-snug">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card Bottom / Action */}
              <div className="pt-4 border-t border-[#1C1C26] space-y-4">
                <div className="flex items-center gap-2 text-xs text-[#848496] font-mono">
                  <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Turnaround: {plan.turnaround}</span>
                </div>

                <button
                  onClick={() => handleSelectPlan(plan)}
                  className={`w-full inline-flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-wider rounded-md transition-all shadow-md ${
                    plan.popular
                      ? 'bg-gradient-to-r from-[#DFBA5A] via-[#ECC86A] to-[#B38D2C] hover:from-[#ECC86A] hover:to-[#C69C36] text-[#0A0A0E] shadow-[#D4AF37]/20 hover:scale-[1.02]'
                      : 'bg-[#181824] hover:bg-[#202030] text-white border border-[#2B2B3B] hover:border-[#D4AF37]/40'
                  }`}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Book via WhatsApp</span>
                </button>
              </div>

            </div>
          ))}
        </div>

        {/* Custom Contract Guarantee Strip */}
        <div className="mt-16 p-6 rounded-xl bg-[#0D0D14] border border-[#1E1E28] grid grid-cols-1 md:grid-cols-3 gap-6 text-center md:text-left">
          <div className="flex items-center gap-3 justify-center md:justify-start">
            <ShieldCheck className="w-6 h-6 text-[#DFBA5A] shrink-0" />
            <div>
              <p className="text-xs font-bold text-white uppercase tracking-wider">Milestone Based Payments</p>
              <p className="text-[11px] text-[#7F7F92]">Pay only upon agreed milestones & review checkpoints.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 justify-center md:justify-start">
            <Clock className="w-6 h-6 text-[#DFBA5A] shrink-0" />
            <div>
              <p className="text-xs font-bold text-white uppercase tracking-wider">On-Time Delivery Guarantee</p>
              <p className="text-[11px] text-[#7F7F92]">Strict adherence to agreed launch or premiere dates.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 justify-center md:justify-start">
            <MessageCircle className="w-6 h-6 text-[#DFBA5A] shrink-0" />
            <div>
              <p className="text-xs font-bold text-white uppercase tracking-wider">Direct WhatsApp Access</p>
              <p className="text-[11px] text-[#7F7F92]">Real-time feedback directly with Vijay, no agency middlemen.</p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
