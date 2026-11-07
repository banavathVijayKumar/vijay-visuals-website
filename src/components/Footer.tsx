import React from 'react';
import { CONTACT_INFO, SERVICES_DATA } from '../data/content';
import { ArrowUp, Instagram, Mail, MessageCircle, Heart } from 'lucide-react';

interface FooterProps {
  onOpenLegal?: (type: 'privacy' | 'terms' | 'faq') => void;
  onOpenTracking?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenLegal, onOpenTracking }) => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="bg-[#050508] border-t border-[#1C1C24] py-16 text-[#8B8B9C] text-xs">
      <div className="max-w-7xl mx-auto px-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <a href="#" className="flex items-center gap-3 text-white font-luxury font-bold tracking-widest text-lg">
              <span className="w-7 h-7 rounded bg-gradient-to-br from-[#DFBA5A] to-[#8C6D1F] flex items-center justify-center text-[#08080A] text-xs font-black">
                VV
              </span>
              <span>VIJAY VISUALS</span>
            </a>

            <p className="text-xs text-[#828294] leading-relaxed max-w-sm">
              High-end digital agency & creative cinema studio. We engineer bespoke websites, conversion e-commerce stores, and royal 4K wedding cinema films with uncompromising luxury artistry.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <a
                href={CONTACT_INFO.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg bg-[#111118] border border-[#21212C] flex items-center justify-center text-[#25D366] hover:border-[#D4AF37] transition-colors"
                title="WhatsApp"
              >
                <MessageCircle className="w-4 h-4" />
              </a>

              <a
                href={CONTACT_INFO.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg bg-[#111118] border border-[#21212C] flex items-center justify-center text-[#DFBA5A] hover:border-[#D4AF37] transition-colors"
                title="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>

              <a
                href={`mailto:${CONTACT_INFO.email}`}
                className="w-8 h-8 rounded-lg bg-[#111118] border border-[#21212C] flex items-center justify-center text-[#DFBA5A] hover:border-[#D4AF37] transition-colors"
                title="Email"
              >
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-luxury text-sm font-bold text-white uppercase tracking-wider mb-4">
              Navigation
            </h4>
            <ul className="space-y-2.5">
              <li>
                <a href="#services" className="hover:text-[#ECC86A] transition-colors">Services</a>
              </li>
              <li>
                <a href="#portfolio" className="hover:text-[#ECC86A] transition-colors">Portfolio</a>
              </li>
              <li>
                <a href="#calculator" className="hover:text-[#ECC86A] transition-colors">Quote Estimator</a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-[#ECC86A] transition-colors">Pricing Tiers</a>
              </li>
              <li>
                <a href="#about" className="hover:text-[#ECC86A] transition-colors">About Vijay</a>
              </li>
              <li>
                <a href="#contact" className="hover:text-[#ECC86A] transition-colors">Contact</a>
              </li>
              {onOpenTracking && (
                <li>
                  <button
                    onClick={onOpenTracking}
                    className="hover:text-[#ECC86A] text-[#DFBA5A] font-semibold transition-colors"
                  >
                    Track Live Order
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* Services Links */}
          <div>
            <h4 className="font-luxury text-sm font-bold text-white uppercase tracking-wider mb-4">
              Disciplines
            </h4>
            <ul className="space-y-2.5">
              {SERVICES_DATA.map((s) => (
                <li key={s.id}>
                  <a href="#services" className="hover:text-[#ECC86A] transition-colors">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Direct Contact info */}
          <div>
            <h4 className="font-luxury text-sm font-bold text-white uppercase tracking-wider mb-4">
              Direct Inquiries
            </h4>
            <div className="space-y-3">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#646473] block">WhatsApp</span>
                <a
                  href={CONTACT_INFO.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-white hover:text-[#ECC86A] transition-colors"
                >
                  {CONTACT_INFO.whatsappDisplay}
                </a>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#646473] block">Direct Email</span>
                <a
                  href={`mailto:${CONTACT_INFO.email}`}
                  className="font-mono text-white hover:text-[#ECC86A] transition-colors select-all"
                >
                  {CONTACT_INFO.email}
                </a>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#646473] block">Instagram</span>
                <a
                  href={CONTACT_INFO.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-white hover:text-[#ECC86A] transition-colors"
                >
                  @{CONTACT_INFO.instagram}
                </a>
              </div>
            </div>
          </div>

        </div>

        {/* Quiet Bottom Copyright & Back to Top */}
        <div className="pt-8 border-t border-[#15151E] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 text-[#646473]">
            <p>© {new Date().getFullYear()} Vijay Visuals. All rights reserved.</p>
            {onOpenLegal && (
              <div className="flex items-center gap-3 text-[11px] text-[#808092]">
                <button
                  onClick={() => onOpenLegal('privacy')}
                  className="hover:text-[#DFBA5A] transition-colors"
                >
                  Privacy Policy
                </button>
                <span>·</span>
                <button
                  onClick={() => onOpenLegal('terms')}
                  className="hover:text-[#DFBA5A] transition-colors"
                >
                  Terms & Conditions
                </button>
                <span>·</span>
                <button
                  onClick={() => onOpenLegal('faq')}
                  className="hover:text-[#DFBA5A] transition-colors"
                >
                  FAQ
                </button>
              </div>
            )}
          </div>

          <button
            onClick={scrollToTop}
            className="flex items-center gap-1.5 text-xs text-[#8A8A9C] hover:text-[#ECC86A] transition-colors group"
          >
            <span>Back to top</span>
            <ArrowUp className="w-3.5 h-3.5 group-hover:-translate-y-0.5 transition-transform text-[#D4AF37]" />
          </button>
        </div>

      </div>
    </footer>
  );
};
