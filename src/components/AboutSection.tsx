import React from 'react';
import { CONTACT_INFO } from '../data/content';
import { Sparkles, Award, Cpu, Video, CheckCircle2, Instagram, MessageCircle, ArrowRight } from 'lucide-react';

export const AboutSection: React.FC = () => {
  return (
    <section id="about" className="py-24 border-b border-[#1E1E26] relative bg-[#09090D] overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* Left Column: Visual & Studio Equipment Badge */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-[#0F0F16] border border-[#262635] rounded-xl p-8 relative overflow-hidden shadow-2xl">
              {/* Subtle luxury ambient glow */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />

              {/* Founder Monogram Crest */}
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#DFBA5A] to-[#8C6D1F] p-0.5 shadow-xl shadow-[#D4AF37]/20 mb-6">
                <div className="w-full h-full bg-[#0C0C12] rounded-2xl flex items-center justify-center">
                  <span className="font-luxury font-black text-2xl text-gold-gradient">VV</span>
                </div>
              </div>

              <div className="space-y-2 mb-6">
                <span className="text-xs font-mono text-[#D4AF37] uppercase tracking-wider block">
                  The Founder & Creative Director
                </span>
                <h3 className="font-luxury text-2xl font-bold text-white">
                  Vijay
                </h3>
                <p className="text-xs text-[#8E8EA0] leading-relaxed">
                  Principal Full-Stack Engineer, Video Colorist & Creative Director at Vijay Visuals.
                </p>
              </div>

              {/* Studio Equipment / Gear Badges */}
              <div className="space-y-3 pt-4 border-t border-[#1C1C28]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#79798C] block">
                  Studio Tech & Production Suites
                </span>

                <div className="space-y-2 text-xs text-[#C2C2D4]">
                  <div className="flex items-center justify-between p-2 rounded bg-[#13131D] border border-[#1E1E2A]">
                    <span className="font-medium">Video Cinema Suite</span>
                    <span className="text-[11px] font-mono text-[#D4AF37]">DaVinci Studio & Premiere</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-[#13131D] border border-[#1E1E2A]">
                    <span className="font-medium">Web Engineering Stack</span>
                    <span className="text-[11px] font-mono text-[#D4AF37]">React, TypeScript, Tailwind</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-[#13131D] border border-[#1E1E2A]">
                    <span className="font-medium">Audio Restoration</span>
                    <span className="text-[11px] font-mono text-[#D4AF37]">iZotope RX Advanced</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-[#13131D] border border-[#1E1E2A]">
                    <span className="font-medium">Brand & Graphic Vector</span>
                    <span className="text-[11px] font-mono text-[#D4AF37]">Adobe Illustrator & Figma</span>
                  </div>
                </div>
              </div>

              {/* Direct links */}
              <div className="pt-6 border-t border-[#1C1C28] flex items-center justify-between text-xs">
                <a
                  href={CONTACT_INFO.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[#D4AF37] hover:underline font-semibold"
                >
                  <Instagram className="w-4 h-4" />
                  <span>@{CONTACT_INFO.instagram}</span>
                </a>

                <span className="text-[#6D6D7E] font-mono">
                  {CONTACT_INFO.projectsCompleted} Delivered
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Story & 4 Pillars */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-[#DFBA5A]">
              <span>About Vijay Visuals</span>
              <span aria-hidden="true" className="text-[#646473]">·</span>
              <span className="text-[#888898]">The Studio Philosophy</span>
            </div>

            <h2 className="font-luxury text-3xl sm:text-4xl lg:text-[2.5rem] font-bold text-white tracking-tight leading-tight text-balance">
              Where Engineering Precision Meets Cinematic Artistry.
            </h2>

            <p className="text-[#A4A4B6] text-base leading-relaxed">
              At Vijay Visuals, we believe that modern digital presence requires two masteries: the mathematical precision of high-speed code, and the emotive poetry of cinema and visual design.
            </p>

            <p className="text-[#8D8D9E] text-sm leading-relaxed">
              Founded by Vijay, our studio is dedicated to eliminating the friction of multi-agency handoffs. Whether a founder needs a flagship e-commerce web platform or a family needs their once-in-a-lifetime wedding memories graded in royal 4K cinema, we bring obsessive attention to every frame and every line of code.
            </p>

            {/* The 4 Studio Pillars */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              <div className="p-4 rounded-lg bg-[#0E0E15] border border-[#1F1F2B]">
                <span className="font-mono text-xs text-[#DFBA5A] font-bold block mb-1">01.</span>
                <h4 className="text-sm font-luxury font-bold text-white">Uncompromising Luxury Polish</h4>
                <p className="text-xs text-[#7F7F92] mt-1 leading-relaxed">
                  Obsidian and gold elegance that commands respect and establishes high market value.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-[#0E0E15] border border-[#1F1F2B]">
                <span className="font-mono text-xs text-[#DFBA5A] font-bold block mb-1">02.</span>
                <h4 className="text-sm font-luxury font-bold text-white">High-Speed Performance</h4>
                <p className="text-xs text-[#7F7F92] mt-1 leading-relaxed">
                  Sub-second web paint times, clean React architecture, and optimized mobile experiences.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-[#0E0E15] border border-[#1F1F2B]">
                <span className="font-mono text-xs text-[#DFBA5A] font-bold block mb-1">03.</span>
                <h4 className="text-sm font-luxury font-bold text-white">Emotional Wedding Storytelling</h4>
                <p className="text-xs text-[#7F7F92] mt-1 leading-relaxed">
                  Custom royal color science, pristine vows audio restoration, and goosebump-inducing music pacing.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-[#0E0E15] border border-[#1F1F2B]">
                <span className="font-mono text-xs text-[#DFBA5A] font-bold block mb-1">04.</span>
                <h4 className="text-sm font-luxury font-bold text-white">Direct 1-on-1 Collaboration</h4>
                <p className="text-xs text-[#7F7F92] mt-1 leading-relaxed">
                  No junior handoffs or convoluted ticket queues. Work directly with Vijay from kickoff to launch.
                </p>
              </div>
            </div>

            {/* CTA */}
            <div className="pt-4 flex items-center gap-4">
              <a
                href={`${CONTACT_INFO.whatsappUrl}?text=${encodeURIComponent('Hello Vijay, I would like to introduce my project and discuss working together.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#0A0A0E] bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] hover:to-[#C69C36] rounded-md transition-all shadow-md shadow-[#D4AF37]/15"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Connect Directly with Vijay</span>
              </a>

              <a
                href={`mailto:${CONTACT_INFO.email}`}
                className="text-xs text-[#B5B5C4] hover:text-white transition-colors"
              >
                {CONTACT_INFO.email}
              </a>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
