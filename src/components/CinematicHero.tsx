import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Headphones,
  Play,
  ShieldCheck,
  Sparkles,
  Star,
  Zap,
} from 'lucide-react';
import { AppView } from '../types/platform';

interface CinematicHeroProps {
  onNavigate: (view: AppView) => void;
  onOpenQuote?: () => void;
}

export const CinematicHero: React.FC<CinematicHeroProps> = ({
  onNavigate,
  onOpenQuote,
}) => {
  const heroRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Desktop subtle mouse parallax tilt
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || window.innerWidth < 1024 || !heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    // Limit tilt to max +-3.5 degrees
    setTilt({
      x: Math.max(-3.5, Math.min(3.5, -y * 7)),
      y: Math.max(-3.5, Math.min(3.5, x * 7)),
    });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  const handleExploreServices = () => {
    const el = document.getElementById('services');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleWatchDemo = () => {
    onNavigate('demo');
  };

  const handleQuoteClick = () => {
    if (onOpenQuote) {
      onOpenQuote();
    } else {
      const el = document.getElementById('pricing');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      id="hero"
      ref={heroRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative overflow-hidden bg-[#060812] border-b border-[#1A1F32] select-none text-white w-full"
      style={{ perspective: '1200px' }}
    >
      {/* ============================================================== */}
      {/* 1. ATMOSPHERIC BACKDROP & LIGHTING ENGINE                      */}
      {/* ============================================================== */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Base dark canvas gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#05070F] via-[#080D1F] to-[#05070F]" />

        {/* Central Warm Gold Ambient Radial Spotlight behind 3D Typography */}
        <div
          className="absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-35"
          style={{
            top: '20%',
            right: '18%',
            background: 'radial-gradient(circle, rgba(245,208,97,0.35) 0%, rgba(212,175,55,0.15) 45%, transparent 75%)',
          }}
        />

        {/* Atmospheric Blue Studio Haze on the right edge */}
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-3xl opacity-30"
          style={{
            top: '30%',
            right: '-5%',
            background: 'radial-gradient(circle, rgba(30,64,135,0.45) 0%, rgba(15,35,80,0.2) 50%, transparent 80%)',
          }}
        />

        {/* Camera Operator Silhouette in Blue Atmospheric Studio Light */}
        <div className="absolute right-0 top-16 md:top-20 h-[380px] w-[260px] opacity-25 lg:opacity-40 hidden sm:block">
          <img
            src="/cinematic_operator.png"
            alt="Studio Camera Operator"
            className="w-full h-full object-contain object-right"
          />
        </div>

        {/* 3D Curved Film-Strip Ribbon Across Background */}
        <svg
          className="absolute inset-0 w-full h-full opacity-35"
          viewBox="0 0 1440 700"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          {/* Top-Right looping film strip */}
          <path
            d="M 600,80 C 850,50 1150,90 1400,240 C 1450,270 1400,340 1280,360 C 1120,380 950,300 800,320"
            stroke="url(#stripGoldGleam)"
            strokeWidth="38"
            strokeDasharray="18 10"
            strokeLinecap="round"
            opacity="0.65"
          />
          <path
            d="M 600,80 C 850,50 1150,90 1400,240 C 1450,270 1400,340 1280,360 C 1120,380 950,300 800,320"
            stroke="#ECC86A"
            strokeWidth="2"
            opacity="0.9"
          />

          {/* Left ambient film ribbon curve behind founder */}
          <path
            d="M -40,380 C 150,350 250,450 320,520 C 360,560 300,600 150,620"
            stroke="url(#stripGoldGleam)"
            strokeWidth="28"
            strokeDasharray="14 8"
            strokeLinecap="round"
            opacity="0.45"
          />

          <defs>
            <linearGradient id="stripGoldGleam" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFF1B8" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#D4AF37" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#6E500A" stopOpacity="0.2" />
            </linearGradient>
          </defs>
        </svg>

        {/* Floating Golden Dust / Bokeh Particles */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute w-2.5 h-2.5 rounded-full bg-[#FFE58F] blur-[1px] shadow-[0_0_12px_#ECC86A]"
            style={{ top: '22%', left: '46%', animation: 'particleDrift 7s infinite ease-in-out' }}
          />
          <div
            className="absolute w-2 h-2 rounded-full bg-[#D4AF37] blur-[1px] shadow-[0_0_10px_#D4AF37]"
            style={{ top: '35%', right: '28%', animation: 'particleDrift 9s infinite ease-in-out 1.5s' }}
          />
          <div
            className="absolute w-3 h-3 rounded-full bg-[#FFF0BD] blur-[1.5px] shadow-[0_0_15px_#FFE27D]"
            style={{ top: '65%', right: '40%', animation: 'particleDrift 8s infinite ease-in-out 3s' }}
          />
          <div
            className="absolute w-1.5 h-1.5 rounded-full bg-[#ECC86A] blur-[1px]"
            style={{ top: '18%', right: '12%', animation: 'particleDrift 10s infinite ease-in-out 2s' }}
          />
          <div
            className="absolute w-2 h-2 rounded-full bg-[#FFE27D] blur-[1px]"
            style={{ top: '50%', left: '38%', animation: 'particleDrift 6.5s infinite ease-in-out 0.8s' }}
          />
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. MAIN HERO STAGE (Parallax 3D Container)                     */}
      {/* ============================================================== */}
      <div
        className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-8 sm:pb-12 relative z-10 transition-transform duration-200 ease-out"
        style={{
          transform: prefersReducedMotion
            ? 'none'
            : `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transformStyle: 'preserve-3d',
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center min-h-[520px] lg:min-h-[580px]">
          
          {/* ---------------------------------------------------------- */}
          {/* LEFT: AUTHENTIC FOUNDER PORTRAIT                           */}
          {/* ---------------------------------------------------------- */}
          <div className="lg:col-span-5 flex flex-col items-center lg:items-start justify-end relative order-2 lg:order-1 pt-4 lg:pt-0">
            <div className="relative w-full max-w-[340px] sm:max-w-[380px] lg:max-w-[430px] group">
              
              {/* Golden rim light glow behind founder */}
              <div className="absolute -inset-2 bg-gradient-to-tr from-[#D4AF37]/20 via-transparent to-[#F5D061]/25 rounded-3xl blur-2xl opacity-60 group-hover:opacity-85 transition-opacity" />

              {/* Founder Cutout Image */}
              <div className="relative rounded-2xl overflow-hidden drop-shadow-[0_20px_35px_rgba(0,0,0,0.9)]">
                <img
                  src="/founder_hero_portrait.png"
                  alt="Vijay Kumar — Founder & Digital Architect, Vijay Visuals"
                  className="w-full h-auto object-cover object-bottom select-none transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                />
              </div>

              {/* Cursive Signature & Name Tag Overlay */}
              <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 z-20 pointer-events-none">
                <p className="font-script text-2xl sm:text-3xl text-[#FFEBB0] drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] drop-shadow-[0_0_12px_rgba(212,175,55,0.7)] tracking-wide">
                  Vijay Kumar
                </p>
                <p className="text-[10px] sm:text-[11px] font-semibold text-[#ECC86A] tracking-wider uppercase font-luxury drop-shadow-md">
                  Founder &amp; Digital Architect
                </p>
              </div>

              {/* Founder Plinth dark blend at the bottom */}
              <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#060812] to-transparent pointer-events-none" />
            </div>
          </div>

          {/* ---------------------------------------------------------- */}
          {/* RIGHT: 3D BRAND TITLE, RIBBON, SUBTITLE & CTA BUTTONS      */}
          {/* ---------------------------------------------------------- */}
          <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left relative z-10 order-1 lg:order-2">
            
            {/* Kicker: "Dream it... We Create it..." */}
            <div className="mb-1 sm:mb-2 flex items-center gap-2">
              <span className="font-script text-3xl sm:text-4xl md:text-5xl text-[#FFE8A3] drop-shadow-[0_0_14px_rgba(245,208,97,0.7)] tracking-wide font-normal">
                Dream it... We Create it...
              </span>
            </div>

            {/* Massive 3D Brand Title */}
            <div className="flex flex-col leading-none tracking-tight select-none my-1 sm:my-2 w-full">
              {/* "VIJAY" — Extruded Metallic Gold */}
              <h1 className="font-luxury font-black text-6xl sm:text-7xl md:text-8xl lg:text-[102px] xl:text-[114px] text-3d-gold tracking-[0.06em] leading-[0.92] drop-shadow-2xl">
                VIJAY
              </h1>

              {/* "VISUALS" — Chrome Silver & Beveled Metallic Gold */}
              <h2 className="font-luxury font-black text-5xl sm:text-6xl md:text-7xl lg:text-[88px] xl:text-[98px] text-3d-chrome tracking-[0.08em] leading-[0.95] drop-shadow-2xl mt-1">
                VISUALS
              </h2>
            </div>

            {/* 3D Golden Satin Ribbon Banner: "Creative Solutions for a Digital World" */}
            <div className="relative my-3 sm:my-4 max-w-full">
              <div className="gold-ribbon-3d py-1.5 sm:py-2 px-6 sm:px-10 rounded-sm inline-block shadow-xl">
                <p className="font-sans-clean font-black text-xs sm:text-sm md:text-base text-[#090D17] uppercase tracking-[0.18em] sm:tracking-[0.24em] whitespace-nowrap drop-shadow-sm">
                  Creative Solutions for a Digital World
                </p>
              </div>
            </div>

            {/* Subtitle: "YOUR BUSINESS · YOUR WEBSITE · YOUR IDENTITY" */}
            <p className="text-[11px] sm:text-xs md:text-sm font-bold text-white/95 uppercase tracking-[0.2em] sm:tracking-[0.26em] my-2 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
              YOUR BUSINESS &nbsp;·&nbsp; YOUR WEBSITE &nbsp;·&nbsp; YOUR IDENTITY
            </p>

            {/* Interactive CTA Buttons */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 sm:gap-4 mt-4 sm:mt-6 w-full">
              
              {/* Primary: "Watch Demo" */}
              <button
                type="button"
                onClick={handleWatchDemo}
                className="group inline-flex items-center gap-2.5 px-6 sm:px-8 py-3 rounded-full bg-gradient-to-r from-[#FDE082] via-[#E2B743] to-[#B8861B] text-[#08080C] font-bold text-xs sm:text-sm shadow-[0_0_25px_rgba(212,175,55,0.45)] hover:shadow-[0_0_35px_rgba(212,175,55,0.7)] hover:scale-105 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              >
                <span className="w-6 h-6 rounded-full bg-[#08080C] flex items-center justify-center text-[#ECC86A] shadow-inner group-hover:scale-110 transition-transform">
                  <Play className="w-3 h-3 fill-current ml-0.5" />
                </span>
                <span>Watch Demo</span>
              </button>

              {/* Secondary: "Explore Services" */}
              <button
                type="button"
                onClick={handleExploreServices}
                className="inline-flex items-center gap-2 px-6 sm:px-7 py-3 rounded-full bg-[#0E1324]/85 backdrop-blur-sm border border-[#D4AF37]/65 text-[#F5E2AC] font-semibold text-xs sm:text-sm shadow-lg hover:bg-[#D4AF37]/15 hover:border-[#ECC86A] hover:text-white transition-all cursor-pointer whitespace-nowrap"
              >
                <span>Explore Services</span>
                <ArrowRight className="w-4 h-4 text-[#ECC86A] group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Bottom-Right Foreground Camera Gear Accent */}
            <div className="hidden lg:block absolute -right-6 -bottom-8 w-56 xl:w-64 opacity-90 pointer-events-none drop-shadow-[0_15px_30px_rgba(0,0,0,0.9)] animate-float-slow">
              <img
                src="/cinematic_camera_gear.png"
                alt="Cinema DSLR Camera Body, Lens and Film Reel"
                className="w-full h-auto object-contain"
              />
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 3. BOTTOM TRUST INDICATOR STRIP                              */}
        {/* ============================================================ */}
        <div className="mt-8 sm:mt-12 pt-4 relative z-20 w-full">
          <div className="bg-[#070B18]/90 backdrop-blur-md border border-[#D4AF37]/30 rounded-2xl md:rounded-full py-3.5 px-4 sm:px-8 shadow-2xl">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4 items-center justify-between">
              
              {/* 1. Premium Quality */}
              <div className="flex items-center justify-center gap-2 text-center sm:text-left">
                <Sparkles className="w-4 h-4 text-[#ECC86A] shrink-0 drop-shadow-[0_0_8px_#D4AF37]" />
                <span className="text-[11px] sm:text-xs font-semibold text-white/90 whitespace-nowrap">
                  Premium Quality
                </span>
              </div>

              {/* 2. Fast Delivery */}
              <div className="flex items-center justify-center gap-2 text-center sm:text-left">
                <Zap className="w-4 h-4 text-[#ECC86A] shrink-0 drop-shadow-[0_0_8px_#D4AF37]" />
                <span className="text-[11px] sm:text-xs font-semibold text-white/90 whitespace-nowrap">
                  Fast Delivery
                </span>
              </div>

              {/* 3. 24/7 Support */}
              <div className="flex items-center justify-center gap-2 text-center sm:text-left">
                <Headphones className="w-4 h-4 text-[#ECC86A] shrink-0 drop-shadow-[0_0_8px_#D4AF37]" />
                <span className="text-[11px] sm:text-xs font-semibold text-white/90 whitespace-nowrap">
                  24/7 Support
                </span>
              </div>

              {/* 4. Trusted Service */}
              <div className="flex items-center justify-center gap-2 text-center sm:text-left">
                <ShieldCheck className="w-4 h-4 text-[#ECC86A] shrink-0 drop-shadow-[0_0_8px_#D4AF37]" />
                <span className="text-[11px] sm:text-xs font-semibold text-white/90 whitespace-nowrap">
                  Trusted Service
                </span>
              </div>

              {/* 5. Client Satisfaction */}
              <div className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 text-center sm:text-left">
                <Star className="w-4 h-4 text-[#ECC86A] fill-current shrink-0 drop-shadow-[0_0_8px_#D4AF37]" />
                <span className="text-[11px] sm:text-xs font-semibold text-white/90 whitespace-nowrap">
                  Client Satisfaction
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
