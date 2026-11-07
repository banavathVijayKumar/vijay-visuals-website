import React, { useState } from 'react';
import { PORTFOLIO_DATA, PortfolioItem, CONTACT_INFO } from '../data/content';
import { ArrowUpRight, Play, Eye, X, MessageCircle, CheckCircle, ExternalLink, Film, Code, Palette, Sparkles, Volume2, VolumeX } from 'lucide-react';

export const PortfolioSection: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'web' | 'video' | 'graphics'>('all');
  const [selectedProject, setSelectedProject] = useState<PortfolioItem | null>(null);
  const [isPlayingModalVideo, setIsPlayingModalVideo] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const filteredItems = activeFilter === 'all'
    ? PORTFOLIO_DATA
    : PORTFOLIO_DATA.filter(item => {
        if (activeFilter === 'web') return item.category === 'web' || item.category === 'ecommerce';
        return item.category === activeFilter;
      });

  const handleInquireForProject = (project: PortfolioItem) => {
    const message = encodeURIComponent(`Hello Vijay, I was admiring "${project.title}" from your Vijay Visuals portfolio. I would like to inquire about a similar ${project.categoryLabel} project.`);
    window.open(`${CONTACT_INFO.whatsappUrl}?text=${message}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <section id="portfolio" className="py-24 border-b border-[#1E1E26] relative bg-[#07070A]">
      <div className="max-w-7xl mx-auto px-6">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-[#DFBA5A] mb-3">
              <span>Curated Showcases</span>
              <span aria-hidden="true" className="text-[#646473]">·</span>
              <span className="text-[#888898]">Recent Commissions</span>
            </div>
            <h2 className="font-luxury text-3xl sm:text-4xl lg:text-[2.6rem] font-bold text-white tracking-tight leading-tight text-balance">
              Selected Works & Creative Direction.
            </h2>
            <p className="text-[#9E9EAF] text-sm sm:text-base mt-3 leading-relaxed">
              Explore our recent web platforms, wedding cinema showreels, and luxury brand identities engineered for real business growth and emotional resonance.
            </p>
          </div>

          {/* Interactive Category Filter Tabs (allowed as functional buttons) */}
          <div className="flex items-center gap-1.5 p-1 bg-[#12121A] rounded-lg border border-[#21212C] self-start md:self-end">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                activeFilter === 'all'
                  ? 'bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] shadow-sm'
                  : 'text-[#888898] hover:text-white'
              }`}
            >
              All Works
            </button>
            <button
              onClick={() => setActiveFilter('web')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                activeFilter === 'web'
                  ? 'bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] shadow-sm'
                  : 'text-[#888898] hover:text-white'
              }`}
            >
              Web & E-Commerce
            </button>
            <button
              onClick={() => setActiveFilter('video')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                activeFilter === 'video'
                  ? 'bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] shadow-sm'
                  : 'text-[#888898] hover:text-white'
              }`}
            >
              Wedding Cinema
            </button>
            <button
              onClick={() => setActiveFilter('graphics')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                activeFilter === 'graphics'
                  ? 'bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] shadow-sm'
                  : 'text-[#888898] hover:text-white'
              }`}
            >
              Graphic Design
            </button>
          </div>
        </div>

        {/* Dynamic Bento Grid of Projects */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedProject(item)}
              className="bg-[#0E0E14] border border-[#20202B] hover:border-[#D4AF37]/50 rounded-xl overflow-hidden cursor-pointer group transition-all duration-300 hover:shadow-2xl hover:shadow-[#D4AF37]/5 flex flex-col justify-between"
            >
              {/* Media Preview Container with Styled CSS/SVG Fallback */}
              <div className="relative aspect-[16/10] bg-[#14141E] overflow-hidden flex flex-col justify-between p-5 border-b border-[#1E1E28]">
                
                {/* Background decorative luxury grid & gradient mesh */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#1C1810]/40 via-[#121218] to-[#0A0A0F] pointer-events-none" />
                <div
                  className="absolute inset-0 opacity-15 pointer-events-none"
                  style={{
                    backgroundImage: `radial-gradient(#D4AF37 1px, transparent 1px)`,
                    backgroundSize: '16px 16px',
                  }}
                />

                {/* Top Bar inside card preview */}
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] font-mono text-[#D4AF37]">
                    {item.category === 'video' && <Film className="w-3.5 h-3.5" />}
                    {(item.category === 'web' || item.category === 'ecommerce') && <Code className="w-3.5 h-3.5" />}
                    {item.category === 'graphics' && <Palette className="w-3.5 h-3.5" />}
                    <span>{item.categoryLabel}</span>
                  </div>

                  {item.mockupData?.statMetric && (
                    <span className="text-[10px] font-mono font-bold text-white px-2 py-0.5 rounded bg-black/60 border border-[#2D2D3A]">
                      {item.mockupData.statMetric}
                    </span>
                  )}
                </div>

                {/* Center Content Simulation */}
                <div className="relative z-10 flex flex-col items-center justify-center text-center py-2">
                  {item.category === 'video' ? (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <Play className="w-5 h-5 ml-0.5 fill-current" />
                    </div>
                  ) : item.category === 'graphics' ? (
                    <div className="w-12 h-12 rounded-lg bg-[#191924] border border-[#2C2C3E] text-[#DFBA5A] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <Palette className="w-6 h-6" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[#191924] border border-[#2C2C3E] text-[#DFBA5A] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <Code className="w-6 h-6" />
                    </div>
                  )}

                  <span className="text-[11px] font-mono text-[#8C8C9E] mt-3 group-hover:text-white transition-colors">
                    Click to Open Case Study & Preview
                  </span>
                </div>

                {/* Bottom Card Preview info */}
                <div className="relative z-10 flex items-center justify-between text-[11px] font-mono text-[#747486]">
                  <span>Client: {item.client}</span>
                  <span>{item.year}</span>
                </div>
              </div>

              {/* Card Meta & Description (Zero-Pill discipline applied) */}
              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  {/* Clean unboxed metadata with typographic separators */}
                  <div className="flex items-center gap-2 text-xs text-[#7B7B8E] mb-2 font-mono">
                    <span>{item.client}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.year}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.deliverables.length} Deliverables</span>
                  </div>

                  <h3 className="font-luxury text-xl font-bold text-white group-hover:text-[#ECC86A] transition-colors leading-snug">
                    {item.title}
                  </h3>

                  <p className="text-xs text-[#9B9BAE] mt-2 line-clamp-2 leading-relaxed">
                    {item.tagline}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-[#1C1C26] flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] text-[#D4AF37] font-semibold">
                    <span>Explore Breakdown</span>
                    <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  </div>

                  <span className="text-[11px] font-mono text-[#6A6A7C]">
                    {item.toolsUsed[0]}
                  </span>
                </div>
              </div>

            </div>
          ))}
        </div>

        {/* Bottom CTA to request bespoke portfolio review */}
        <div className="mt-14 p-6 sm:p-8 bg-gradient-to-r from-[#12121A] via-[#161622] to-[#12121A] rounded-xl border border-[#262636] flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h4 className="font-luxury text-xl font-bold text-white">
              Have a Specific Concept in Mind?
            </h4>
            <p className="text-xs sm:text-sm text-[#9494A6] mt-1">
              From wedding film timelines to full-scale e-commerce architectures, Vijay can share tailored sample reels and live demos.
            </p>
          </div>
          <a
            href={`${CONTACT_INFO.whatsappUrl}?text=${encodeURIComponent('Hello Vijay, I would like to see specific portfolio samples for my project.')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#0A0A0E] bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] hover:to-[#C69C36] rounded-md transition-all whitespace-nowrap shrink-0 shadow-md shadow-[#D4AF37]/15"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Request Samples on WhatsApp</span>
          </a>
        </div>

      </div>

      {/* Fullscreen Interactive Case Study Modal */}
      {selectedProject && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-[#0D0D14] border border-[#2B2B3C] rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
            
            {/* Modal Header */}
            <div className="sticky top-0 bg-[#0D0D14]/95 backdrop-blur-md px-6 py-4 border-b border-[#20202E] flex items-center justify-between z-20">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-[#D4AF37]">
                  {selectedProject.categoryLabel}
                </span>
                <span className="text-[#555]">|</span>
                <span className="font-luxury font-bold text-white text-base truncate max-w-xs sm:max-w-md">
                  {selectedProject.title}
                </span>
              </div>
              <button
                onClick={() => {
                  setSelectedProject(null);
                  setIsPlayingModalVideo(false);
                }}
                className="p-1.5 text-[#9595A6] hover:text-white rounded-md hover:bg-[#1A1A24] transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Media Showcase */}
            <div className="p-6 space-y-6">
              
              {/* Media Player Frame */}
              <div className="relative aspect-video rounded-lg overflow-hidden border border-[#252536] bg-[#07070A] flex flex-col justify-between p-6">
                <div className="absolute inset-0 bg-gradient-to-br from-[#1E1910]/40 via-[#0A0A0E] to-[#07070A] pointer-events-none" />

                <div className="relative z-10 flex items-center justify-between">
                  <span className="text-xs font-mono text-[#D4AF37] px-2.5 py-1 rounded bg-black/70 border border-[#D4AF37]/30">
                    {selectedProject.category === 'video' ? '4K Cinema Reel Master' : 'Live Interactive Production'}
                  </span>
                  {selectedProject.category === 'video' && (
                    <button
                      onClick={() => setIsMuted(!isMuted)}
                      className="p-1.5 rounded bg-black/60 text-white/80 hover:text-white border border-[#2E2E3E]"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {/* Center playback simulator */}
                <div className="relative z-10 flex flex-col items-center justify-center my-auto py-6">
                  {selectedProject.category === 'video' ? (
                    <>
                      <button
                        onClick={() => setIsPlayingModalVideo(!isPlayingModalVideo)}
                        className="w-16 h-16 rounded-full bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] flex items-center justify-center shadow-xl hover:scale-105 transition-transform"
                      >
                        {isPlayingModalVideo ? (
                          <span className="font-mono font-bold text-xs">PAUSE</span>
                        ) : (
                          <Play className="w-6 h-6 ml-0.5 fill-current" />
                        )}
                      </button>
                      <p className="text-xs font-mono text-[#DFBA5A] mt-3">
                        {isPlayingModalVideo ? 'Simulated 4K 60fps Playback Active' : 'Click to Play Cinematic Reel'}
                      </p>
                    </>
                  ) : (
                    <div className="text-center space-y-2">
                      <div className="w-14 h-14 mx-auto rounded-full bg-[#181824] border border-[#2F2F42] flex items-center justify-center text-[#DFBA5A]">
                        <Code className="w-7 h-7" />
                      </div>
                      <p className="font-luxury text-base text-white font-bold">{selectedProject.title}</p>
                      <p className="text-xs text-[#88889A] max-w-md mx-auto">{selectedProject.tagline}</p>
                    </div>
                  )}
                </div>

                {/* Bottom Timeline or status */}
                <div className="relative z-10 flex items-center justify-between text-xs font-mono text-[#828294] pt-2 border-t border-[#1C1C26]">
                  <span>{selectedProject.client}</span>
                  <span>{selectedProject.mockupData?.videoResolution || '100% Responsive React + Tailwind'}</span>
                </div>
              </div>

              {/* Case Study Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-[#DFBA5A] uppercase tracking-wider mb-1">
                      The Challenge
                    </h4>
                    <p className="text-xs text-[#ABABBD] leading-relaxed">
                      {selectedProject.challenge}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-[#DFBA5A] uppercase tracking-wider mb-1">
                      The Solution
                    </h4>
                    <p className="text-xs text-[#ABABBD] leading-relaxed">
                      {selectedProject.solution}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-[#ECC86A] uppercase tracking-wider mb-2">
                      Key Outcomes & Results
                    </h4>
                    <div className="space-y-2">
                      {selectedProject.results.map((res, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-[#D1D1DE] bg-[#13131D] p-2 rounded border border-[#20202E]">
                          <CheckCircle className="w-3.5 h-3.5 text-[#DFBA5A] shrink-0 mt-0.5" />
                          <span>{res}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-[#ECC86A] uppercase tracking-wider mb-2">
                      Tools & Stack
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedProject.toolsUsed.map((tool, i) => (
                        <span key={i} className="text-[11px] font-mono px-2.5 py-0.5 bg-[#14141E] text-[#B9B9CB] border border-[#272738] rounded">
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer CTAs */}
              <div className="pt-6 border-t border-[#1C1C28] flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-[#7A7A8C]">
                  Commissioned by <strong className="text-white">{selectedProject.client}</strong>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    onClick={() => handleInquireForProject(selectedProject)}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#0A0A0E] bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] hover:to-[#C69C36] rounded-md transition-all shadow-md shadow-[#D4AF37]/15"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Inquire About Similar Project</span>
                  </button>

                  <button
                    onClick={() => setSelectedProject(null)}
                    className="hidden sm:inline-block px-4 py-2.5 text-xs font-semibold text-[#8C8C9E] hover:text-white bg-[#14141E] border border-[#242432] rounded-md"
                  >
                    Close
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </section>
  );
};
