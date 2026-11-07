import React from 'react';
import { X, ShieldCheck, FileText, HelpCircle, CheckCircle2 } from 'lucide-react';
import { CONTACT_INFO } from '../../data/content';

interface LegalModalProps {
  type: 'privacy' | 'terms' | 'faq' | null;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ type, onClose }) => {
  if (!type) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#0D0D14] border border-[#2B2B3C] rounded-2xl p-6 sm:p-8 max-h-[85vh] overflow-y-auto shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-[#8A8A9C] hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {type === 'privacy' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 border-b border-[#222230] pb-4">
              <div className="w-10 h-10 rounded-xl bg-[#181824] border border-[#DFBA5A]/30 flex items-center justify-center text-[#DFBA5A]">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-luxury text-xl font-bold text-white">Privacy Policy</h3>
                <p className="text-xs text-[#828294]">Effective Date: January 1, 2025 · VIJAY VISUALS SaaS</p>
              </div>
            </div>

            <div className="text-xs text-[#B2B2C2] space-y-3 leading-relaxed">
              <p>
                At <strong>VIJAY VISUALS</strong>, we respect your privacy and are committed to protecting the personal data of our customers, shop owners, and delivery partners across all multi-tenant websites.
              </p>
              <h4 className="font-semibold text-white text-sm pt-2">1. Tenant Data Isolation</h4>
              <p>
                Each business registered on our platform operates in complete data isolation. Customer profiles, order histories, CRM leads, and financial documents belonging to your business are strictly inaccessible to other tenants or unauthorized users.
              </p>
              <h4 className="font-semibold text-white text-sm pt-2">2. Information We Collect</h4>
              <ul className="list-disc pl-5 space-y-1 text-[#9E9EB0]">
                <li>Account details (Full name, verified email, verified mobile number).</li>
                <li>Business metadata (Store name, GSTIN, catalog items, pricing, delivery coordinates).</li>
                <li>Delivery logistics telemetry (Status transitions, dispatch proofs, secure OTP tokens).</li>
                <li>AI prompt inputs processed through our server-side secure Gemini engine proxies.</li>
              </ul>
              <h4 className="font-semibold text-white text-sm pt-2">3. Data Security & Storage</h4>
              <p>
                All communications are encrypted via TLS. Authentication tokens and passwords use cryptographic hashing. We never store or transmit plain-text credentials.
              </p>
              <h4 className="font-semibold text-white text-sm pt-2">4. Contact & Inquiries</h4>
              <p>
                For data privacy requests or inquiries, reach out directly to our Data Protection Officer at{' '}
                <a href={`mailto:${CONTACT_INFO.email}`} className="text-[#DFBA5A] underline">
                  {CONTACT_INFO.email}
                </a>{' '}
                or WhatsApp +91 9381362201.
              </p>
            </div>
          </div>
        )}

        {type === 'terms' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 border-b border-[#222230] pb-4">
              <div className="w-10 h-10 rounded-xl bg-[#181824] border border-[#DFBA5A]/30 flex items-center justify-center text-[#DFBA5A]">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-luxury text-xl font-bold text-white">Terms & Conditions</h3>
                <p className="text-xs text-[#828294]">Multi-Tenant SaaS Agreement · VIJAY VISUALS</p>
              </div>
            </div>

            <div className="text-xs text-[#B2B2C2] space-y-3 leading-relaxed">
              <p>
                Welcome to <strong>VIJAY VISUALS Multi-Tenant SaaS Business Platform</strong>. By creating an account, publishing a business website, or utilizing our delivery logistics network, you agree to these terms.
              </p>
              <h4 className="font-semibold text-white text-sm pt-2">1. Subscription Plans & Service Level</h4>
              <p>
                Features, custom domains, product quotas, and AI generation daily limits are governed by the tenant’s active subscription tier (Starter, Professional, Business, Enterprise).
              </p>
              <h4 className="font-semibold text-white text-sm pt-2">2. Acceptable Use</h4>
              <p>
                Shop owners agree not to publish fraudulent, unlawful, or infringing goods. Delivery boys agree to uphold safety standards and fulfill assigned deliveries promptly using OTP confirmation.
              </p>
              <h4 className="font-semibold text-white text-sm pt-2">3. Payments & Commission</h4>
              <p>
                Subscription billing occurs monthly or annually. Tenant customer payments made via direct UPI or cash on delivery settle directly to the business owner without platform withholding.
              </p>
              <h4 className="font-semibold text-white text-sm pt-2">4. Platform Availability</h4>
              <p>
                VIJAY VISUALS guarantees 99.9% platform availability. Automated nightly backups and point-in-time recovery ensure continuous business continuity.
              </p>
            </div>
          </div>
        )}

        {type === 'faq' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 border-b border-[#222230] pb-4">
              <div className="w-10 h-10 rounded-xl bg-[#181824] border border-[#DFBA5A]/30 flex items-center justify-center text-[#DFBA5A]">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-luxury text-xl font-bold text-white">Frequently Asked Questions</h3>
                <p className="text-xs text-[#828294]">Everything you need to know about VIJAY VISUALS Platform</p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                {
                  q: 'How does the multi-tenant business website publishing work?',
                  a: 'Every registered shop owner can choose from 35+ industry templates, customize logos, products, pricing, and publish instantly. The site is accessible via standalone link or their own custom domain (e.g. www.myshop.com) with automated SSL.',
                },
                {
                  q: 'Can I use Telugu, Hindi, or English for my store and products?',
                  a: 'Yes! The entire platform and all 35 templates support Telugu, Hindi, and English with 1-click AI translation and localized catalogs.',
                },
                {
                  q: 'How does the automated Delivery Boy Fleet management work?',
                  a: 'Admins and shop owners can onboard delivery partners, track live status, auto-assign orders, and verify drop-offs using secure 4-digit OTP tokens.',
                },
                {
                  q: 'How do the 15 Gemini AI business engines help my business?',
                  a: 'You get automated website generation, studio copy, product descriptions, multi-lingual translation, SEO metadata, email campaigns, and 24/7 customer support chatbots built-in.',
                },
              ].map((item, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-[#13131C] border border-[#20202E] space-y-1.5">
                  <h5 className="font-semibold text-white text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#DFBA5A] shrink-0" />
                    <span>{item.q}</span>
                  </h5>
                  <p className="text-xs text-[#9090A0] leading-relaxed pl-5.5">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-6 border-t border-[#222230] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-[#1C1C28] hover:bg-[#252536] text-white text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
