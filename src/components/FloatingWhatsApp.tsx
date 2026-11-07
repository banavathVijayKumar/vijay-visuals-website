import React, { useState } from 'react';
import { CONTACT_INFO } from '../data/content';
import { MessageCircle, X, Send, Sparkles, Phone, ArrowUpRight } from 'lucide-react';

export const FloatingWhatsApp: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  const quickPrompts = [
    { label: 'Website Development Quote', msg: 'Hi Vijay, I would like to get a quote for a new website.' },
    { label: 'Wedding Video Editing', msg: 'Hi Vijay, I want to book wedding video editing services.' },
    { label: 'E-commerce Store Project', msg: 'Hi Vijay, I need an e-commerce website with payment integration.' },
    { label: 'Graphic Design & Branding', msg: 'Hi Vijay, I want to discuss a custom brand identity package.' },
  ];

  const handleSendPrompt = (msg: string) => {
    window.open(`${CONTACT_INFO.whatsappUrl}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    setIsOpen(false);
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end">
      {/* Expandable Quick-Chat Card */}
      {isOpen && (
        <div className="mb-3 w-80 max-w-[calc(100vw-2rem)] bg-[#0E0E15] border border-[#2B2B3C] rounded-xl shadow-2xl p-4 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-[#1E1E2A] mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#DFBA5A] to-[#8C6D1F] p-0.5">
                <div className="w-full h-full bg-[#0A0A0E] rounded-full flex items-center justify-center text-[10px] font-luxury font-bold text-[#ECC86A]">
                  VV
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-white font-luxury">Vijay Visuals</p>
                <div className="flex items-center gap-1.5 text-[10px] text-[#25D366]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse" />
                  <span>Online for Inquiries</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-[#78788A] hover:text-white rounded"
              aria-label="Close WhatsApp Drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-[#A8A8B8] leading-relaxed mb-3">
            How can Vijay assist your project today? Pick a quick topic or chat directly:
          </p>

          <div className="space-y-1.5 mb-3">
            {quickPrompts.map((p, i) => (
              <button
                key={i}
                onClick={() => handleSendPrompt(p.msg)}
                className="w-full text-left p-2 rounded-md bg-[#14141E] hover:bg-[#1A1A26] border border-[#1E1E2A] hover:border-[#D4AF37]/40 text-xs text-[#D1D1DE] hover:text-[#ECC86A] transition-colors flex items-center justify-between group"
              >
                <span className="truncate pr-2">{p.label}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#6D6D7F] group-hover:text-[#D4AF37] shrink-0" />
              </button>
            ))}
          </div>

          <a
            href={`${CONTACT_INFO.whatsappUrl}?text=${encodeURIComponent('Hello Vijay, I would like to chat about a project.')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold uppercase tracking-wider text-[#0A0A0E] bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] hover:to-[#C69C36] rounded-md transition-all shadow-md"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Open Custom Chat</span>
          </a>
        </div>
      )}

      {/* Floating Circular Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="WhatsApp Contact Button"
        className="w-13 h-13 rounded-full bg-gradient-to-tr from-[#1E7E34] via-[#25D366] to-[#4CE580] text-white flex items-center justify-center shadow-xl shadow-[#25D366]/25 hover:scale-110 active:scale-95 transition-all duration-200 border-2 border-[#DFBA5A] group"
      >
        <MessageCircle className="w-6 h-6 fill-current group-hover:rotate-12 transition-transform" />
      </button>
    </div>
  );
};
