import React from 'react';
import { TESTIMONIALS_DATA, FAQS } from '../data/content';
import { Star, Quote, ChevronDown } from 'lucide-react';

export const TestimonialsSection: React.FC = () => {
  const [openFaqIndex, setOpenFaqIndex] = React.useState<number | null>(0);

  const toggleFaq = (idx: number) => {
    setOpenFaqIndex(openFaqIndex === idx ? null : idx);
  };

  return (
    <section className="py-24 border-b border-[#1E1E26] relative bg-[#07070A]">
      <div className="max-w-7xl mx-auto px-6">
        
        {/* Testimonials Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold tracking-widest uppercase text-[#DFBA5A] mb-3">
            <span>Client Praise & Endorsements</span>
            <span aria-hidden="true" className="text-[#646473]">·</span>
            <span className="text-[#888898]">Verified Feedback</span>
          </div>
          <h2 className="font-luxury text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
            Trusted by Discerning Clients.
          </h2>
          <p className="text-[#9E9EAF] text-sm sm:text-base mt-3 leading-relaxed">
            From high-ticket real estate developers to newlyweds celebrating palace weddings across India and abroad.
          </p>
        </div>

        {/* Testimonials 3-Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-24">
          {TESTIMONIALS_DATA.map((t) => (
            <div
              key={t.id}
              className="bg-[#0D0D14] border border-[#20202B] rounded-xl p-6 sm:p-7 flex flex-col justify-between relative hover:border-[#D4AF37]/40 transition-colors"
            >
              <div>
                {/* 5-Star Rating */}
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(t.rating)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-[#DFBA5A] text-[#DFBA5A]" />
                  ))}
                  <span className="text-[11px] font-mono text-[#D4AF37] ml-2">5.0</span>
                </div>

                {/* Service Tag */}
                <div className="text-[11px] font-mono text-[#8C8C9E] uppercase tracking-wider mb-3">
                  Service: {t.serviceUsed}
                </div>

                {/* Quote */}
                <p className="text-xs sm:text-sm text-[#C8C8D8] leading-relaxed italic">
                  "{t.quote}"
                </p>
              </div>

              {/* Attribution */}
              <div className="pt-6 mt-6 border-t border-[#1C1C26] flex items-center justify-between">
                <div>
                  <h4 className="font-luxury text-sm font-bold text-white">
                    {t.name}
                  </h4>
                  <p className="text-[11px] text-[#78788A]">
                    {t.role} · {t.companyOrEvent}
                  </p>
                </div>
                <span className="text-[10px] font-mono text-[#6A6A7C]">
                  {t.location}
                </span>
              </div>

            </div>
          ))}
        </div>

        {/* FAQ Accordion */}
        <div className="max-w-3xl mx-auto pt-8 border-t border-[#1C1C26]">
          <div className="text-center mb-10">
            <span className="text-xs font-mono text-[#D4AF37] uppercase tracking-wider block mb-1">
              Common Questions
            </span>
            <h3 className="font-luxury text-2xl font-bold text-white">
              Everything You Need to Know
            </h3>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="bg-[#0D0D14] border border-[#1E1E28] rounded-lg overflow-hidden transition-colors"
                >
                  <button
                    onClick={() => toggleFaq(idx)}
                    className="w-full text-left p-4 sm:p-5 flex items-center justify-between gap-4 hover:text-[#ECC86A] transition-colors focus:outline-none"
                  >
                    <span className="text-xs sm:text-sm font-semibold text-white font-luxury">
                      {faq.question}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-[#D4AF37] transition-transform duration-200 shrink-0 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-4 sm:px-5 pb-5 text-xs text-[#9E9EAF] leading-relaxed border-t border-[#181822] pt-3 animate-in fade-in duration-150">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
};
