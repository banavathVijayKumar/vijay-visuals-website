// ============================================================================
// src/components/VijayVisualsLogo.tsx — Official Vijay Visuals Brand Logo
// Features the 3D Navy-Blue & Metallic-Gold VV Monogram, Central Camera Aperture,
// Play Button, and Dynamic Gold Orbital Swoop with "VIJAY VISUALS" Typography.
// Supports full, compact, icon, and stacked layouts for dark & light backgrounds.
// ============================================================================

import React from 'react';

export type LogoVariant = 'full' | 'compact' | 'icon' | 'stacked';
export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type LogoMode = 'dark' | 'light';

interface VijayVisualsLogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  mode?: LogoMode;
  showTagline?: boolean;
  className?: string;
  onClick?: () => void;
}

export const VijayVisualsLogo: React.FC<VijayVisualsLogoProps> = ({
  variant = 'compact',
  size = 'md',
  mode = 'dark',
  showTagline = false,
  className = '',
  onClick,
}) => {
  // Height and scale mappings
  const heightClasses: Record<LogoSize, { iconH: string; textH: string; gap: string }> = {
    xs: { iconH: 'h-6 w-6', textH: 'text-xs', gap: 'gap-1.5' },
    sm: { iconH: 'h-8 w-8', textH: 'text-sm', gap: 'gap-2' },
    md: { iconH: 'h-10 w-10', textH: 'text-base', gap: 'gap-2.5' },
    lg: { iconH: 'h-14 w-14', textH: 'text-xl', gap: 'gap-3.5' },
    xl: { iconH: 'h-20 w-20', textH: 'text-2xl', gap: 'gap-4' },
  };

  const dim = heightClasses[size] || heightClasses.md;

  // Render the SVG Emblem
  const renderEmblem = () => (
    <svg
      viewBox="0 0 600 500"
      className={`${dim.iconH} shrink-0 select-none drop-shadow-md`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Vijay Visuals Monogram"
    >
      <defs>
        <linearGradient id="compGoldMain" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFF3C4" />
          <stop offset="25%" stop-color="#F5D061" />
          <stop offset="50%" stop-color="#D4AF37" />
          <stop offset="75%" stop-color="#AA7C11" />
          <stop offset="100%" stop-color="#6B4E00" />
        </linearGradient>

        <linearGradient id="compGoldGleam" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stop-color="#AA7C11" />
          <stop offset="35%" stop-color="#FDF3CD" />
          <stop offset="70%" stop-color="#D4AF37" />
          <stop offset="100%" stop-color="#7A5600" />
        </linearGradient>

        <linearGradient id="compGoldBevel" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#684700" />
          <stop offset="50%" stop-color="#E5C158" />
          <stop offset="100%" stop-color="#FFF6D6" />
        </linearGradient>

        <linearGradient id="compNavyDeep" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#12336D" />
          <stop offset="40%" stop-color="#0A1D3F" />
          <stop offset="100%" stop-color="#040C1A" />
        </linearGradient>

        <linearGradient id="compNavyFacet" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1C4B9E" />
          <stop offset="50%" stop-color="#0F2B5C" />
          <stop offset="100%" stop-color="#061329" />
        </linearGradient>

        <radialGradient id="compLensGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#1E4B92" stop-opacity="0.9" />
          <stop offset="70%" stop-color="#0B2148" stop-opacity="0.95" />
          <stop offset="100%" stop-color="#030A17" />
        </radialGradient>
      </defs>

      {/* Background Orbit Arc */}
      <path
        d="M 80,310 C 60,250 140,160 300,105 C 460,50 560,90 580,140"
        stroke="url(#compGoldGleam)"
        strokeWidth="9"
        strokeLinecap="round"
        opacity="0.75"
      />

      {/* Camera Shutter Aperture Sphere */}
      <g transform="translate(300, 200)">
        <circle cx="0" cy="0" r="102" stroke="url(#compGoldMain)" strokeWidth="10" />
        <circle cx="0" cy="0" r="95" fill="url(#compLensGlow)" />

        {/* Shutter Blades */}
        <path d="M 0,-95 A 95,95 0 0,1 82,-48 L 22,-12 Z" fill="#0E2752" stroke="url(#compGoldBevel)" strokeWidth="3" />
        <path d="M 82,-48 A 95,95 0 0,1 82,48 L 12,22 Z" fill="#0B2044" stroke="url(#compGoldBevel)" strokeWidth="3" />
        <path d="M 82,48 A 95,95 0 0,1 0,95 L -22,12 Z" fill="#081834" stroke="url(#compGoldBevel)" strokeWidth="3" />
        <path d="M 0,95 A 95,95 0 0,1 -82,48 L -12,-22 Z" fill="#0B2044" stroke="url(#compGoldBevel)" strokeWidth="3" />
        <path d="M -82,48 A 95,95 0 0,1 -82,-48 L 22,-12 Z" fill="#0E2752" stroke="url(#compGoldBevel)" strokeWidth="3" />
        <path d="M -82,-48 A 95,95 0 0,1 0,-95 L -12,22 Z" fill="#123164" stroke="url(#compGoldBevel)" strokeWidth="3" />

        {/* Central Play Triangle */}
        <circle cx="0" cy="0" r="40" fill="#051022" stroke="url(#compGoldMain)" strokeWidth="4" />
        <polygon points="-12,-22 24,0 -12,22" fill="url(#compGoldMain)" stroke="url(#compGoldBevel)" strokeWidth="2.5" />
      </g>

      {/* Interlocking VV Monogram */}
      <g>
        {/* Left V */}
        <path
          d="M 100,110 L 195,110 L 255,270 L 315,110 L 410,110 L 290,370 L 220,370 Z"
          fill="url(#compGoldMain)"
          stroke="url(#compGoldBevel)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path
          d="M 118,122 L 182,122 L 255,290 L 328,122 L 392,122 L 285,355 L 225,355 Z"
          fill="url(#compNavyDeep)"
        />
        <path d="M 118,122 L 150,122 L 235,320 L 225,355 Z" fill="url(#compNavyFacet)" opacity="0.6" />

        {/* Right V */}
        <path
          d="M 225,140 L 305,140 L 375,305 L 445,140 L 525,140 L 405,395 L 345,395 Z"
          fill="url(#compGoldMain)"
          stroke="url(#compGoldBevel)"
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
        <path
          d="M 240,152 L 295,152 L 375,325 L 455,152 L 510,152 L 400,380 L 350,380 Z"
          fill="url(#compNavyFacet)"
        />
        <path d="M 240,152 L 270,152 L 360,345 L 350,380 Z" fill="#040D1D" opacity="0.75" />
      </g>

      {/* Foreground Orbit Swoop */}
      <path
        d="M 110,320 C 130,380 240,420 370,390 C 470,365 540,300 580,240 C 600,210 595,170 560,160 C 530,150 490,170 440,200"
        stroke="url(#compGoldMain)"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <path
        d="M 110,320 C 130,380 240,420 370,390 C 470,365 540,300 580,240 C 600,210 595,170 560,160 C 530,150 490,170 440,200"
        stroke="url(#compGoldGleam)"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );

  // If icon-only variant
  if (variant === 'icon') {
    return (
      <div
        className={`inline-flex items-center justify-center ${className} ${onClick ? 'cursor-pointer' : ''}`}
        onClick={onClick}
      >
        {renderEmblem()}
      </div>
    );
  }

  // Wordmark Styling (Vijay in rich Navy with subtle gold glow, Visuals in gleaming metallic gold)
  const isDark = mode === 'dark';

  const wordmark = (
    <div className={`flex flex-col ${variant === 'stacked' ? 'items-center text-center mt-2' : 'items-start'}`}>
      <div className={`font-luxury font-black tracking-[0.14em] flex items-center leading-none ${dim.textH}`}>
        {/* "VIJAY" */}
        <span
          className={
            isDark
              ? 'text-[#5B8FF9] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] [text-shadow:_0_0_8px_rgba(212,175,55,0.35)] font-black'
              : 'text-[#0A2540] font-black'
          }
        >
          VIJAY
        </span>
        <span className="w-1.5" />
        {/* "VISUALS" */}
        <span className="bg-gradient-to-r from-[#FFF0BD] via-[#ECC86A] to-[#C29729] bg-clip-text text-transparent font-black">
          VISUALS
        </span>
      </div>

      {showTagline && (
        <span className="text-[9px] tracking-[0.22em] text-[#A0A0B5] uppercase font-semibold mt-1">
          Made in India · Built for the World
        </span>
      )}
    </div>
  );

  return (
    <div
      className={`inline-flex ${
        variant === 'stacked' ? 'flex-col items-center' : `items-center ${dim.gap}`
      } ${className} ${onClick ? 'cursor-pointer group' : ''}`}
      onClick={onClick}
    >
      {renderEmblem()}
      {wordmark}
    </div>
  );
};
