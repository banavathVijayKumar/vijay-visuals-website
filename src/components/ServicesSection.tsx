import React, { useState } from 'react';
import { SERVICES_DATA, ServiceItem, CONTACT_INFO } from '../data/content';
import { ArrowUpRight, Check, MessageCircle, Globe, ShoppingBag, Briefcase, Video, Palette, Sparkles } from 'lucide-react';

interface ServicesSectionProps {
  onSelectService?: (serviceName: string) => void;
}

export const ServicesSection: React.FC<ServicesSectionProps> = ({ onSelectService }) => {
  const [selectedServiceId, setSelectedServiceId] = useState<string>(SERVICES_DATA[0].id);

  const activeService = SERVICES_DATA.find((s) => s.id === selectedServiceId) || SERVICES_DATA[0];

  const getServiceIcon = (id: string) => {
    switch (id) {
      case 'web-development':
        return <Globe className="w-5 h-5 text-[#DFBA5A]" />;
      case 'ecommerce-websites':
        return <ShoppingBag className="w-5 h-5 text-[#DFBA5A]" />;
      case 'business-websites':
        return <Briefcase className="w-5 h-5 text-[#DFBA5A]" />;
      case 'wedding-video-editing':
        return <Video className="w-5 h-5 text-[#DFBA5A]" />;
      case 'graphic-design':
        return <Palette className="w-5 h-5 text-[#DFBA5A]" />;
      default:
        return <Sparkles className="w-5 h-5 text-[#DFBA5A]" />;
    }
  };

  const handleInquire = (service: ServiceItem) => {
    const text = encodeURIComponent(`Hello Vijay, I am interested in inquiring about your "${service.title}" service at Vijay Visuals.`);
    window.open(`${CONTACT_INFO.whatsappUrl}?text=${text}`, '_blank', 'noopener,noreferrer');
    if (onSelectService) {
      onSelectService(service.title);
    }
  };

  return (
    <section id="services" className="py-24 border-b border-[#1E1E26] relative bg-[#09090D]">
      <div className="max-w-7xl mx-auto px-6">
        
        {/* Section Header */}
        <div className="max-w-3xl mb-16">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-[#DFBA5A] mb-3">
            <span>Specialized Capabilities</span>
            <span aria-hidden="true" className="text-[#646473]">·</span>
            <span className="text-[#888898]">5 Core Creative Disciplines</span>
          </div>
          <h2 className="font-luxury text-3xl sm:text-4xl lg:text-[2.6rem] font-bold text-white tracking-tight leading-tight text-balance">
            Engineered For Excellence. Crafted For Distinction.
          </h2>
          <p className="text-[#9E9EAF] text-base sm:text-lg mt-4 leading-relaxed">
            Whether launching a revenue-generating web application or immortalizing a royal wedding in 4K cinema, Vijay Visuals executes with uncompromising luxury craftsmanship.
          </p>
        </div>

        {/* 5-Service Interactive Selector Bar (Segmented button control allowed for interactive state) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8 scrollbar-none border-b border-[#1C1C24]">
          {SERVICES_DATA.map((service) => {
            const isSelected = service.id === selectedServiceId;
            return (
              <button
                key={service.id}
                onClick={() => setSelectedServiceId(service.id)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all whitespace-nowrap shrink-0 border ${
                  isSelected
                    ? 'bg-[#181822] text-[#ECC86A] border-[#D4AF37]/50 shadow-md shadow-[#D4AF37]/10'
                    : 'bg-[#0E0E14] text-[#868696] border-[#1C1C24] hover:text-[#D1D1DE] hover:border-[#2C2C3A]'
                }`}
              >
                <span>{service.number}.</span>
                <span>{service.title}</span>
              </button>
            );
          })}
        </div>

        {/* Active Service Detailed Showcase Panel */}
        <div className="bg-[#0F0F16] border border-[#262633] rounded-xl p-6 sm:p-8 lg:p-10 mb-16 shadow-2xl relative overflow-hidden">
          {/* Subtle gold gradient accent in corner */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-[#DFBA5A]/10 via-transparent to-transparent pointer-events-none" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative z-10">
            
            {/* Left 7 cols: Service details */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#191924] border border-[#2D2D3E] flex items-center justify-center">
                  {getServiceIcon(activeService.id)}
                </div>
                <div>
                  <span className="text-xs font-mono text-[#D4AF37] uppercase tracking-wider block">
                    Service {activeService.number}
                  </span>
                  <h3 className="font-luxury text-2xl sm:text-3xl font-bold text-white mt-0.5">
                    {activeService.title}
                  </h3>
                </div>
              </div>

              <p className="text-[#B5B5C6] text-base leading-relaxed">
                {activeService.fullDescription}
              </p>

              {/* Deliverables Checklist */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#ECC86A] mb-3">
                  Scope of Deliverables & Output
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeService.deliverables.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-[#C8C8D6] bg-[#14141E] p-2.5 rounded-md border border-[#1E1E2A]">
                      <Check className="w-3.5 h-3.5 text-[#DFBA5A] shrink-0 mt-0.5" />
                      <span className="leading-snug">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ideal for quote */}
              <div className="bg-[#12121A] p-4 rounded-lg border border-[#222230] text-xs text-[#9595A6]">
                <span className="text-[#ECC86A] font-semibold block mb-1">Recommended For:</span>
                <p>{activeService.idealFor}</p>
              </div>

              {/* Inquire Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center gap-4">
                <button
                  onClick={() => handleInquire(activeService)}
                  className="inline-flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#0A0A0E] bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] hover:to-[#C69C36] rounded-md transition-all shadow-md shadow-[#D4AF37]/20 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Inquire on WhatsApp</span>
                </button>

                <a
                  href="#contact"
                  className="inline-flex items-center gap-1.5 px-4 py-3 text-xs font-semibold text-[#D1D1DE] hover:text-white bg-[#14141E] hover:bg-[#1A1A26] border border-[#262634] rounded-md transition-colors"
                >
                  <span>Request Custom Proposal</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#A3A3B2]" />
                </a>
              </div>
            </div>

            {/* Right 5 cols: Tech Stack, Process & Tools Vault */}
            <div className="lg:col-span-5 bg-[#0B0B10] p-6 rounded-lg border border-[#21212E] space-y-5">
              <div className="border-b border-[#1A1A24] pb-3">
                <span className="text-xs font-mono text-[#D4AF37] uppercase tracking-wider block">
                  Production Standards
                </span>
                <h4 className="font-luxury text-lg font-bold text-white mt-1">
                  Tools & Architecture
                </h4>
              </div>

              {/* Tech Stack List */}
              <div className="space-y-2">
                <span className="text-[11px] uppercase tracking-wider text-[#79798C] font-semibold block">
                  Industry Grade Tools
                </span>
                <div className="flex flex-wrap gap-2">
                  {activeService.techStack.map((tool, i) => (
                    <span
                      key={i}
                      className="text-xs font-mono px-3 py-1 bg-[#151520] text-[#D8AF44] border border-[#2A2A38] rounded"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>

              {/* Execution Process Steps (Clean editorial numbers) */}
              <div className="space-y-3 pt-2">
                <span className="text-[11px] uppercase tracking-wider text-[#79798C] font-semibold block">
                  Studio Workflow
                </span>
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-start gap-3">
                    <span className="font-mono text-[#DFBA5A] font-bold">01.</span>
                    <div>
                      <p className="text-white font-medium">Vision Discovery & Ingestion</p>
                      <p className="text-[#848496] text-[11px]">Creative brief, raw media upload or brand assets intake.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="font-mono text-[#DFBA5A] font-bold">02.</span>
                    <div>
                      <p className="text-white font-medium">Precision Production / Editing</p>
                      <p className="text-[#848496] text-[11px]">4K color grading, multi-cam cut, or full-stack frontend build.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="font-mono text-[#DFBA5A] font-bold">03.</span>
                    <div>
                      <p className="text-white font-medium">Review & High-Res Handover</p>
                      <p className="text-[#848496] text-[11px]">Private preview link, revisions round, master delivery.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-[#1A1A24] text-[11px] text-[#7E7E90]">
                Guaranteed satisfaction with dedicated 1-on-1 collaboration directly with Vijay.
              </div>
            </div>

          </div>
        </div>

        {/* 5-Column Compact Grid for Fast Scanning */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {SERVICES_DATA.map((service) => (
            <div
              key={service.id}
              onClick={() => setSelectedServiceId(service.id)}
              className={`p-5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between group ${
                service.id === selectedServiceId
                  ? 'bg-[#14141E] border-[#D4AF37]/50 shadow-lg'
                  : 'bg-[#0E0E14] border-[#1C1C24] hover:border-[#2D2D3D] hover:bg-[#12121A]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-xs font-bold text-[#D4AF37]">{service.number}</span>
                  <div className="w-8 h-8 rounded bg-[#1A1A24] flex items-center justify-center text-[#D8AF44] group-hover:scale-110 transition-transform">
                    {getServiceIcon(service.id)}
                  </div>
                </div>
                <h4 className="font-luxury text-base font-bold text-white group-hover:text-[#ECC86A] transition-colors leading-tight">
                  {service.title}
                </h4>
                <p className="text-xs text-[#8A8A9E] mt-2 line-clamp-3 leading-relaxed">
                  {service.shortDescription}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#1C1C26] flex items-center justify-between text-[11px]">
                <span className="text-[#7A7A8E]">View Details</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#DFBA5A] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
