import React, { useState } from 'react';
import { MessageCircle, ArrowRight, Play, Eye, Sparkles, Code2, Film, Layers, CheckCircle2 } from 'lucide-react';
import { CONTACT_INFO } from '../data/content';

export const Hero: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'web' | 'video' | 'graphics'>('web');
  const [isPlayingCinema, setIsPlayingCinema] = useState(true);
  const [colorGradeMode, setColorGradeMode] = useState<'raw' | 'gold'>('gold');

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative pt-32 pb-16 md:pt-40 md:pb-24 overflow-hidden border-b border-[#1E1E26]">
      {/* Subtle Luxury Ambient Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[450px] bg-gradient-to-tr from-[#D4AF37]/8 via-[#B38D2C]/5 to-transparent rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#DFBA5A]/5 rounded-full blur-[120px] pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-6">
        {/* Split-Screen Hero */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-stretch">
          
          {/* Left Column: Typographic Hierarchy */}
          <div className="lg:col-span-6 flex flex-col justify-center">
            {/* Clean kicker text with typographic separator (no pills) */}
            <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-[#DFBA5A] mb-4">
              <span>Vijay Visuals Creative Studio</span>
              <span aria-hidden="true" className="text-[#646473]">·</span>
              <span className="text-[#A3A3B2]">Digital Engineering & Cinema</span>
            </div>

            <h1 className="font-luxury text-3xl sm:text-4xl md:text-5xl lg:text-[3.4rem] font-bold tracking-tight text-white leading-[1.12] text-balance mb-6">
              Bespoke Digital Platforms & <span className="text-gold-gradient">Cinematic Film</span> Craft.
            </h1>

            <p className="text-[#A7A7B8] text-base md:text-lg leading-relaxed max-w-xl mb-8">
              We engineer lightning-fast business websites, high-conversion e-commerce stores, and royal 4K wedding cinema films with uncompromising luxury aesthetics.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-8">
              <a
                href={`${CONTACT_INFO.whatsappUrl}?text=${encodeURIComponent('Hello Vijay, I would like to discuss a project with Vijay Visuals.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-[#0A0A0E] bg-gradient-to-r from-[#DFBA5A] via-[#ECC86A] to-[#B38D2C] hover:from-[#ECC86A] hover:to-[#C69C36] rounded-md transition-all duration-200 shadow-lg shadow-[#D4AF37]/20 whitespace-nowrap hover:scale-[1.02] active:scale-[0.98]"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Start Project on WhatsApp</span>
              </a>

              <button
                onClick={() => scrollToSection('portfolio')}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-xs font-semibold tracking-wider uppercase text-[#E5E5EB] hover:text-white bg-[#121218] hover:bg-[#1A1A24] border border-[#2A2A36] hover:border-[#D4AF37]/50 rounded-md transition-all duration-200 whitespace-nowrap"
              >
                <span>Explore Curated Works</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37]" />
              </button>
            </div>

            {/* Editorial Quick Services List */}
            <div className="pt-6 border-t border-[#1C1C24] grid grid-cols-2 gap-3 text-xs text-[#9090A0]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                <span>High-Speed Web Architecture</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                <span>4K Multi-Cam Wedding Cinema</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                <span>Frictionless E-Commerce</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                <span>Luxury Brand Identity Systems</span>
              </div>
            </div>
          </div>

          {/* Right Column: High-Impact Interactive Showcase Container */}
          <div className="lg:col-span-6 flex flex-col justify-center">
            <div className="bg-[#0F0F16] border border-[#262633] rounded-xl overflow-hidden shadow-2xl relative flex flex-col h-full min-h-[460px]">
              
              {/* Showcase Header Controls */}
              <div className="px-4 py-3 bg-[#13131D] border-b border-[#21212C] flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#E85D5D]/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#E5B54F]/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#5FB875]/80" />
                  <span className="text-[11px] font-mono text-[#767688] ml-2 hidden sm:inline">
                    craft.vijayvisuals.com
                  </span>
                </div>

                {/* Interactive Mode Tabs */}
                <div className="flex items-center gap-1 bg-[#09090D] p-1 rounded-md border border-[#1E1E26]">
                  <button
                    onClick={() => setActiveTab('web')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                      activeTab === 'web'
                        ? 'bg-[#1C1C26] text-[#ECC86A] shadow-sm'
                        : 'text-[#888898] hover:text-white'
                    }`}
                  >
                    <Code2 className="w-3 h-3" />
                    <span>Web & Store</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('video')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                      activeTab === 'video'
                        ? 'bg-[#1C1C26] text-[#ECC86A] shadow-sm'
                        : 'text-[#888898] hover:text-white'
                    }`}
                  >
                    <Film className="w-3 h-3" />
                    <span>Wedding Cinema</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('graphics')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                      activeTab === 'graphics'
                        ? 'bg-[#1C1C26] text-[#ECC86A] shadow-sm'
                        : 'text-[#888898] hover:text-white'
                    }`}
                  >
                    <Layers className="w-3 h-3" />
                    <span>Brand Suite</span>
                  </button>
                </div>
              </div>

              {/* Showcase Body Preview */}
              <div className="p-6 flex-1 flex flex-col justify-between bg-gradient-to-b from-[#0D0D14] to-[#0A0A0F]">
                
                {activeTab === 'web' && (
                  <div className="flex-1 flex flex-col justify-between space-y-6">
                    <div className="flex items-center justify-between border-b border-[#1E1E28] pb-4">
                      <div>
                        <span className="text-[11px] font-mono text-[#D4AF37] uppercase tracking-wider block">
                          Client Flagship Demo
                        </span>
                        <h3 className="font-luxury text-xl font-bold text-white mt-0.5">
                          Aura Haute Joaillerie
                        </h3>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-[#828294] block">Lighthouse Speed</span>
                        <span className="font-mono text-sm font-bold text-[#5FB875]">99 / 100</span>
                      </div>
                    </div>

                    {/* Simulated Interface Grid */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-[#14141E] p-3 rounded-lg border border-[#232330]">
                        <span className="text-[10px] text-[#7A7A8E] block uppercase">Storefront</span>
                        <p className="text-xs font-semibold text-white mt-1">E-Commerce</p>
                        <span className="text-[10px] text-[#D4AF37] block mt-2">Instant UPI / Cards</span>
                      </div>
                      <div className="bg-[#14141E] p-3 rounded-lg border border-[#232330]">
                        <span className="text-[10px] text-[#7A7A8E] block uppercase">Tech Stack</span>
                        <p className="text-xs font-semibold text-white mt-1">React + Vite</p>
                        <span className="text-[10px] text-[#A3A3B2] block mt-2">Tailwind CSS</span>
                      </div>
                      <div className="bg-[#14141E] p-3 rounded-lg border border-[#232330]">
                        <span className="text-[10px] text-[#7A7A8E] block uppercase">Lead Capture</span>
                        <p className="text-xs font-semibold text-white mt-1">WhatsApp API</p>
                        <span className="text-[10px] text-[#5FB875] block mt-2">1-Click Booking</span>
                      </div>
                    </div>

                    {/* Simulated Live Luxury Code / Mockup Frame */}
                    <div className="bg-[#08080C] p-4 rounded-lg border border-[#1E1E28] font-mono text-xs text-[#9B9BB0] space-y-1">
                      <div className="flex items-center justify-between text-[#686878] pb-2 border-b border-[#181822]">
                        <span>src/components/AtelierShowcase.tsx</span>
                        <span className="text-[#5FB875]">Compiled in 18ms</span>
                      </div>
                      <p className="pt-1 text-[#DFBA5A]">const LuxuryStorefront = &#123;</p>
                      <p className="pl-4 text-[#D1D1DE]"><span className="text-[#7D9BF5]">performance</span>: '0.8s mobile paint',</p>
                      <p className="pl-4 text-[#D1D1DE]"><span className="text-[#7D9BF5]">paymentGateways</span>: ['Razorpay', 'Stripe', 'UPI'],</p>
                      <p className="pl-4 text-[#D1D1DE]"><span className="text-[#7D9BF5]">conversionDesign</span>: 'Active'</p>
                      <p className="text-[#DFBA5A]">&#125;;</p>
                    </div>

                    <div className="pt-2 flex items-center justify-between text-xs">
                      <span className="text-[#777789]">Engineered by Vijay Visuals</span>
                      <button
                        onClick={() => scrollToSection('services')}
                        className="text-[#ECC86A] hover:underline flex items-center gap-1 font-medium"
                      >
                        <span>View Web Services</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'video' && (
                  <div className="flex-1 flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between border-b border-[#1E1E28] pb-4">
                      <div>
                        <span className="text-[11px] font-mono text-[#D4AF37] uppercase tracking-wider block">
                          Cinema Editing Console
                        </span>
                        <h3 className="font-luxury text-xl font-bold text-white mt-0.5">
                          Udaipur Royal Wedding Film
                        </h3>
                      </div>
                      {/* Color Grade Toggle */}
                      <div className="flex items-center gap-1 bg-[#151520] p-1 rounded border border-[#242432]">
                        <button
                          onClick={() => setColorGradeMode('raw')}
                          className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                            colorGradeMode === 'raw' ? 'bg-[#2A2A38] text-white' : 'text-[#7D7D90]'
                          }`}
                        >
                          Flat Log
                        </button>
                        <button
                          onClick={() => setColorGradeMode('gold')}
                          className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                            colorGradeMode === 'gold' ? 'bg-gradient-to-r from-[#DFBA5A] to-[#A07A20] text-[#0A0A0E]' : 'text-[#7D7D90]'
                          }`}
                        >
                          Royal Gold LUT
                        </button>
                      </div>
                    </div>

                    {/* Simulated Cinema Screen */}
                    <div
                      className={`relative aspect-video rounded-lg overflow-hidden border border-[#2B2B3A] flex flex-col justify-between p-4 transition-all duration-300 ${
                        colorGradeMode === 'gold'
                          ? 'bg-gradient-to-br from-[#2D210E] via-[#141215] to-[#0D0D12]'
                          : 'bg-[#18181F]'
                      }`}
                    >
                      <div className="flex items-center justify-between z-10">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/60 text-[#DFBA5A] border border-[#D4AF37]/30">
                          4K UHD · 24FPS CINEMA
                        </span>
                        <span className="text-[10px] font-mono text-white/80">
                          {colorGradeMode === 'gold' ? 'Signature Vijay Visuals Color Grade' : 'S-Log3 Raw Camera Profile'}
                        </span>
                      </div>

                      {/* Center Play Graphic */}
                      <div className="flex flex-col items-center justify-center py-4 z-10">
                        <button
                          onClick={() => setIsPlayingCinema(!isPlayingCinema)}
                          className="w-12 h-12 rounded-full bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#08080A] flex items-center justify-center shadow-lg shadow-[#D4AF37]/30 hover:scale-105 transition-transform"
                        >
                          {isPlayingCinema ? <Play className="w-5 h-5 ml-0.5 fill-current" /> : <Eye className="w-5 h-5" />}
                        </button>
                        <p className="text-xs text-white/90 font-luxury mt-2">
                          The Royal Union: Samar & Meera
                        </p>
                      </div>

                      {/* Simulated Audio & Timeline Waveform */}
                      <div className="z-10 space-y-1">
                        <div className="flex items-center gap-1.5 h-3">
                          {[40, 75, 55, 90, 30, 85, 60, 95, 45, 80, 65, 90, 70, 40, 85, 60].map((h, i) => (
                            <div
                              key={i}
                              className={`flex-1 rounded-full transition-all duration-150 ${
                                colorGradeMode === 'gold' ? 'bg-[#ECC86A]' : 'bg-[#7E7E92]'
                              }`}
                              style={{ height: `${h}%` }}
                            />
                          ))}
                        </div>
                        <div className="flex justify-between text-[10px] font-mono text-[#8C8C9E]">
                          <span>02:14 / 04:48</span>
                          <span>DaVinci Studio Multi-Cam Sync</span>
                        </div>
                      </div>

                      {/* Ambient Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-[#777789]">Audio mastered with iZotope RX</span>
                      <button
                        onClick={() => scrollToSection('portfolio')}
                        className="text-[#ECC86A] hover:underline flex items-center gap-1 font-medium"
                      >
                        <span>See Wedding Cinema Works</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'graphics' && (
                  <div className="flex-1 flex flex-col justify-between space-y-6">
                    <div className="flex items-center justify-between border-b border-[#1E1E28] pb-4">
                      <div>
                        <span className="text-[11px] font-mono text-[#D4AF37] uppercase tracking-wider block">
                          Identity & Stationery
                        </span>
                        <h3 className="font-luxury text-xl font-bold text-white mt-0.5">
                          Kavya Botanicals & Luxury Identity
                        </h3>
                      </div>
                      <span className="text-xs font-mono text-[#D4AF37] border border-[#D4AF37]/30 px-2 py-0.5 rounded bg-[#171510]">
                        Vector AI / SVG
                      </span>
                    </div>

                    {/* Simulated Graphic Board */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#0B0B10] p-5 rounded-lg border border-[#2B2B38] flex flex-col items-center justify-center text-center space-y-2">
                        <div className="w-14 h-14 rounded-full border-2 border-[#D4AF37] flex items-center justify-center bg-gradient-to-br from-[#1C1A14] to-[#0A0A0C] shadow-inner">
                          <span className="font-luxury text-xl font-bold text-gold-gradient">KB</span>
                        </div>
                        <p className="font-luxury text-sm text-white font-medium">KAVYA BOTANICALS</p>
                        <span className="text-[10px] text-[#8C8C9E] uppercase tracking-widest">
                          Embossed Gold Foil Seal
                        </span>
                      </div>

                      <div className="space-y-3">
                        <div className="bg-[#14141E] p-3 rounded-lg border border-[#232330]">
                          <span className="text-[10px] text-[#7A7A8E] block uppercase">Color Palette</span>
                          <div className="flex items-center gap-1.5 mt-2">
                            <div className="w-5 h-5 rounded bg-[#08080A] border border-[#333]" title="Obsidian #08080A" />
                            <div className="w-5 h-5 rounded bg-[#D4AF37]" title="Imperial Gold #D4AF37" />
                            <div className="w-5 h-5 rounded bg-[#ECC86A]" title="Champagne Gold #ECC86A" />
                            <div className="w-5 h-5 rounded bg-[#2D4030]" title="Deep Botanical #2D4030" />
                          </div>
                        </div>

                        <div className="bg-[#14141E] p-3 rounded-lg border border-[#232330]">
                          <span className="text-[10px] text-[#7A7A8E] block uppercase">Deliverables</span>
                          <p className="text-xs font-semibold text-white mt-1">Logo Suite & Packaging Dies</p>
                          <span className="text-[10px] text-[#5FB875] block mt-1">Ready for Print & Social</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between text-xs">
                      <span className="text-[#777789]">Crafted in Adobe Illustrator & Cinema 4D</span>
                      <button
                        onClick={() => scrollToSection('services')}
                        className="text-[#ECC86A] hover:underline flex items-center gap-1 font-medium"
                      >
                        <span>Explore Design Services</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>

        </div>

        {/* Full-width proof strip placed in a clean row below the hero split (following skill instructions) */}
        <div className="mt-16 pt-8 border-t border-[#1C1C24] grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="border-l border-[#262633] pl-4">
            <span className="font-mono text-2xl md:text-3xl font-bold text-white tracking-tight">
              150+
            </span>
            <p className="text-xs text-[#8A8A9E] mt-1">
              Projects Delivered Globally
            </p>
          </div>
          <div className="border-l border-[#262633] pl-4">
            <span className="font-mono text-2xl md:text-3xl font-bold text-[#DFBA5A] tracking-tight">
              99.8%
            </span>
            <p className="text-xs text-[#8A8A9E] mt-1">
              Client Satisfaction Rating
            </p>
          </div>
          <div className="border-l border-[#262633] pl-4">
            <span className="font-mono text-2xl md:text-3xl font-bold text-white tracking-tight">
              4K HDR
            </span>
            <p className="text-xs text-[#8A8A9E] mt-1">
              Cinema Master Color Science
            </p>
          </div>
          <div className="border-l border-[#262633] pl-4">
            <span className="font-mono text-2xl md:text-3xl font-bold text-[#ECC86A] tracking-tight">
              1-on-1
            </span>
            <p className="text-xs text-[#8A8A9E] mt-1">
              Direct Collaboration with Vijay
            </p>
          </div>
        </div>

      </div>
    </section>
  );
};
