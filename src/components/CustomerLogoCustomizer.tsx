// ============================================================================
// src/components/CustomerLogoCustomizer.tsx — Customer Website Logo Customizer
// Enables business owners to upload image logos (PNG, JPG, WebP, sanitized SVG)
// or generate custom text/monogram logos with selectable fonts, layouts, colors,
// and badge shapes. Features live desktop & mobile header/footer previews,
// history restoration, and strict tenant isolation.
// ============================================================================

import React, { useState, useId } from 'react';
import {
  Upload,
  Type,
  Palette,
  Eye,
  Smartphone,
  Monitor,
  RotateCcw,
  History,
  Check,
  AlertCircle,
  Sparkles,
  Download,
  Trash2,
} from 'lucide-react';

export interface LogoConfig {
  type: 'image' | 'text';
  imageUrl?: string;
  imageFileName?: string;
  businessName: string;
  initials: string;
  tagline?: string;
  fontFamily: string;
  layout: 'badge_left' | 'stacked' | 'badge_only' | 'text_only';
  badgeShape: 'circle' | 'rounded_square' | 'shield' | 'hexagon' | 'minimal_frame';
  badgeBgColor: string;
  badgeBorderColor: string;
  badgeTextColor: string;
  nameTextColor: string;
  taglineTextColor: string;
  size: 'sm' | 'md' | 'lg';
  letterSpacing: 'tight' | 'normal' | 'wide' | 'luxury';
}

interface CustomerLogoCustomizerProps {
  tenantId: string | number;
  tenantName: string;
  currentLogo?: Partial<LogoConfig>;
  onSaveLogo: (config: LogoConfig) => Promise<void> | void;
  onNotify?: (msg: string) => void;
  className?: string;
}

const FONT_OPTIONS = [
  { id: 'font-luxury', label: 'Cinzel (Luxury Serif)', css: 'font-luxury' },
  { id: 'font-sans', label: 'Plus Jakarta Sans (Modern Clean)', css: 'font-sans' },
  { id: 'font-mono', label: 'JetBrains Mono (Tech / Minimal)', css: 'font-mono' },
  { id: 'font-serif', label: 'Playfair (Classic Editorial)', css: 'font-serif' },
];

const PRESET_PALETTES = [
  { name: 'Gold & Obsidian', bg: '#181822', border: '#D4AF37', badgeText: '#D4AF37', nameText: '#FFFFFF', tagText: '#ECC86A' },
  { name: 'Royal Emerald', bg: '#064E3B', border: '#10B981', badgeText: '#FFFFFF', nameText: '#FFFFFF', tagText: '#6EE7B7' },
  { name: 'Sapphire Navy', bg: '#1E3A8A', border: '#3B82F6', badgeText: '#FFFFFF', nameText: '#FFFFFF', tagText: '#93C5FD' },
  { name: 'Crimson Velvet', bg: '#881337', border: '#F43F5E', badgeText: '#FFFFFF', nameText: '#FFFFFF', tagText: '#FDA4AF' },
  { name: 'Monochrome Luxe', bg: '#0F0F14', border: '#3A3A4C', badgeText: '#FFFFFF', nameText: '#FFFFFF', tagText: '#A1A1B5' },
];

export const CustomerLogoCustomizer: React.FC<CustomerLogoCustomizerProps> = ({
  tenantId,
  tenantName,
  currentLogo,
  onSaveLogo,
  onNotify,
  className = '',
}) => {
  const sanitizeSvg = (rawSvg: string): string => {
    // Strip script tags, event handlers, and remote object includes for safety
    return rawSvg
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\s(href|xlink:href)\s*=\s*['"]javascript:[^'"]*['"]/gi, '')
      .replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  };

  const defaultInitials = (tenantName || 'MY')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 3)
    .join('')
    .toUpperCase() || 'MY';

  const [activeTab, setActiveTab] = useState<'text' | 'image'>(
    currentLogo?.type === 'image' && currentLogo?.imageUrl ? 'image' : 'text'
  );

  const [config, setConfig] = useState<LogoConfig>({
    type: currentLogo?.type || 'text',
    imageUrl: currentLogo?.imageUrl || '',
    imageFileName: currentLogo?.imageFileName || '',
    businessName: currentLogo?.businessName || tenantName || 'My Business Store',
    initials: currentLogo?.initials || defaultInitials,
    tagline: currentLogo?.tagline || 'Quality & Excellence',
    fontFamily: currentLogo?.fontFamily || 'font-luxury',
    layout: currentLogo?.layout || 'badge_left',
    badgeShape: currentLogo?.badgeShape || 'circle',
    badgeBgColor: currentLogo?.badgeBgColor || '#181822',
    badgeBorderColor: currentLogo?.badgeBorderColor || '#D4AF37',
    badgeTextColor: currentLogo?.badgeTextColor || '#D4AF37',
    nameTextColor: currentLogo?.nameTextColor || '#FFFFFF',
    taglineTextColor: currentLogo?.taglineTextColor || '#ECC86A',
    size: currentLogo?.size || 'md',
    letterSpacing: currentLogo?.letterSpacing || 'wide',
  });

  const [history, setHistory] = useState<LogoConfig[]>([]);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [saving, setSaving] = useState(false);

  // Handle Image Upload with validation and SVG sanitization
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      onNotify?.('Please upload a valid PNG, JPG, WebP, or SVG logo file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      onNotify?.('Logo file size must be under 2MB.');
      return;
    }

    const reader = new FileReader();
    if (file.type === 'image/svg+xml') {
      reader.onload = (event) => {
        const rawSvg = String(event.target?.result || '');
        const cleanSvg = sanitizeSvg(rawSvg);
        const encoded = `data:image/svg+xml;utf8,${encodeURIComponent(cleanSvg)}`;
        updateConfigWithHistory({
          type: 'image',
          imageUrl: encoded,
          imageFileName: file.name,
        });
        onNotify?.('SVG logo uploaded & sanitized successfully.');
      };
      reader.readAsText(file);
    } else {
      reader.onload = (event) => {
        const dataUrl = String(event.target?.result || '');
        updateConfigWithHistory({
          type: 'image',
          imageUrl: dataUrl,
          imageFileName: file.name,
        });
        onNotify?.('Raster logo image uploaded & ready.');
      };
      reader.readAsDataURL(file);
    }
  };

  const updateConfigWithHistory = (updates: Partial<LogoConfig>) => {
    setHistory((prev) => [config, ...prev.slice(0, 4)]);
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  const handleRestorePrevious = () => {
    if (history.length === 0) return;
    const [previous, ...rest] = history;
    setConfig(previous);
    setHistory(rest);
    onNotify?.('Reverted to previous logo version.');
  };

  const handleResetToDefault = () => {
    setHistory((prev) => [config, ...prev.slice(0, 4)]);
    setConfig({
      type: 'text',
      imageUrl: '',
      imageFileName: '',
      businessName: tenantName || 'My Business Store',
      initials: defaultInitials,
      tagline: 'Quality & Excellence',
      fontFamily: 'font-luxury',
      layout: 'badge_left',
      badgeShape: 'circle',
      badgeBgColor: '#181822',
      badgeBorderColor: '#D4AF37',
      badgeTextColor: '#D4AF37',
      nameTextColor: '#FFFFFF',
      taglineTextColor: '#ECC86A',
      size: 'md',
      letterSpacing: 'wide',
    });
    setActiveTab('text');
    onNotify?.('Reset to clean template default logo.');
  };

  const handleApplyPalette = (palette: (typeof PRESET_PALETTES)[0]) => {
    updateConfigWithHistory({
      badgeBgColor: palette.bg,
      badgeBorderColor: palette.border,
      badgeTextColor: palette.badgeText,
      nameTextColor: palette.nameText,
      taglineTextColor: palette.tagText,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveLogo(config);
      onNotify?.('Website logo customized and published successfully!');
    } catch (err: any) {
      onNotify?.(err?.message || 'Failed to save logo changes.');
    } finally {
      setSaving(false);
    }
  };

  // Helper for badge border-radius / clip-path
  const getBadgeShapeStyle = () => {
    switch (config.badgeShape) {
      case 'circle':
        return 'rounded-full';
      case 'rounded_square':
        return 'rounded-xl';
      case 'minimal_frame':
        return 'rounded-sm border-2';
      case 'shield':
        return 'rounded-t-lg rounded-b-3xl';
      case 'hexagon':
        return 'rounded-md';
      default:
        return 'rounded-full';
    }
  };

  const getSpacingClass = () => {
    switch (config.letterSpacing) {
      case 'tight':
        return 'tracking-tight';
      case 'normal':
        return 'tracking-normal';
      case 'wide':
        return 'tracking-wider';
      case 'luxury':
        return 'tracking-[0.18em]';
      default:
        return 'tracking-wider';
    }
  };

  const getSizeClasses = () => {
    switch (config.size) {
      case 'sm':
        return { badge: 'w-8 h-8 text-xs', name: 'text-sm', tag: 'text-[9px]' };
      case 'lg':
        return { badge: 'w-14 h-14 text-lg', name: 'text-xl', tag: 'text-xs' };
      case 'md':
      default:
        return { badge: 'w-10 h-10 text-sm', name: 'text-base', tag: 'text-[10px]' };
    }
  };

  const sizeCls = getSizeClasses();

  // Render the Actual Logo Component
  const renderRenderedLogo = () => {
    if (config.type === 'image' && config.imageUrl) {
      return (
        <div className="flex items-center gap-3">
          <img
            src={config.imageUrl}
            alt={config.businessName}
            className={`${sizeCls.badge} object-contain rounded shrink-0`}
          />
          {config.layout !== 'badge_only' && (
            <div className="flex flex-col">
              <span className={`font-bold ${sizeCls.name}`} style={{ color: config.nameTextColor }}>
                {config.businessName}
              </span>
              {config.tagline && (
                <span className={`font-medium ${sizeCls.tag}`} style={{ color: config.taglineTextColor }}>
                  {config.tagline}
                </span>
              )}
            </div>
          )}
        </div>
      );
    }

    // Text / Monogram Logo
    const badgeElement = (
      <div
        className={`${sizeCls.badge} ${getBadgeShapeStyle()} flex items-center justify-center font-bold font-mono shrink-0 transition-transform`}
        style={{
          backgroundColor: config.badgeBgColor,
          borderColor: config.badgeBorderColor,
          borderWidth: '2px',
          borderStyle: 'solid',
          color: config.badgeTextColor,
        }}
      >
        {config.initials || 'VV'}
      </div>
    );

    if (config.layout === 'badge_only') {
      return badgeElement;
    }

    const textElement = (
      <div className={`flex flex-col ${config.layout === 'stacked' ? 'items-center text-center mt-1.5' : ''}`}>
        <span
          className={`font-bold leading-tight ${config.fontFamily} ${sizeCls.name} ${getSpacingClass()}`}
          style={{ color: config.nameTextColor }}
        >
          {config.businessName}
        </span>
        {config.tagline && (
          <span
            className={`font-medium uppercase mt-0.5 ${sizeCls.tag} tracking-wider`}
            style={{ color: config.taglineTextColor }}
          >
            {config.tagline}
          </span>
        )}
      </div>
    );

    if (config.layout === 'text_only') {
      return textElement;
    }

    if (config.layout === 'stacked') {
      return (
        <div className="flex flex-col items-center">
          {badgeElement}
          {textElement}
        </div>
      );
    }

    // Default: badge_left
    return (
      <div className="flex items-center gap-3">
        {badgeElement}
        {textElement}
      </div>
    );
  };

  return (
    <div className={`rounded-xl border border-[#242436] bg-[#0E0E15] p-5 text-xs text-[#E1E1EE] shadow-xl ${className}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E1E2C] pb-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D4AF37]" />
            <h2 className="font-luxury text-base font-bold text-white">Customer Website Logo Customizer</h2>
          </div>
          <p className="text-[11px] text-[#8E8EA2] mt-0.5">
            Design and preview custom branding for <span className="text-[#D4AF37] font-semibold">{tenantName}</span>. Independent from Vijay Visuals platform branding.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              type="button"
              onClick={handleRestorePrevious}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#181824] hover:bg-[#222232] text-[#ECC86A] border border-[#2A2A3C] transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              <span>Restore Previous ({history.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleResetToDefault}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#181824] hover:bg-[#222232] text-[#A5A5B8] border border-[#2A2A3C] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-gold-gradient text-[#08080A] font-semibold hover:opacity-95 transition-opacity disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{saving ? 'Publishing...' : 'Save & Publish Logo'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Controls & Configuration */}
        <div className="lg:col-span-5 space-y-4">
          {/* Mode Switcher */}
          <div className="flex rounded-lg bg-[#14141E] p-1 border border-[#242436]">
            <button
              type="button"
              onClick={() => {
                setActiveTab('text');
                setConfig((prev) => ({ ...prev, type: 'text' }));
              }}
              className={`flex-1 py-1.5 rounded text-center font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${
                activeTab === 'text'
                  ? 'bg-[#D4AF37] text-[#08080A] shadow-sm'
                  : 'text-[#9A9AB0] hover:text-white'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Design Text &amp; Monogram</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('image');
                setConfig((prev) => ({ ...prev, type: 'image' }));
              }}
              className={`flex-1 py-1.5 rounded text-center font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${
                activeTab === 'image'
                  ? 'bg-[#D4AF37] text-[#08080A] shadow-sm'
                  : 'text-[#9A9AB0] hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Image File</span>
            </button>
          </div>

          {/* Mode A: Image Upload */}
          {activeTab === 'image' && (
            <div className="rounded-lg border border-[#242436] bg-[#12121A] p-4 space-y-3">
              <label className="block text-xs font-semibold text-white">Upload Custom Brand Logo</label>
              <p className="text-[11px] text-[#868698]">
                Supports PNG, JPG, WebP, and sanitized SVG. Recommended aspect ratio: 1:1 or 3:1 (Max 2MB).
              </p>

              <div className="border-2 border-dashed border-[#2C2C3E] rounded-lg p-6 text-center hover:border-[#D4AF37] transition-colors relative cursor-pointer">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Upload className="w-7 h-7 mx-auto text-[#D4AF37] mb-2 opacity-80" />
                <p className="text-xs font-medium text-white">Click or drag &amp; drop logo file here</p>
                <p className="text-[10px] text-[#7E7E92] mt-1">PNG, JPG, WebP or SVG (max 2MB)</p>
              </div>

              {config.imageUrl && (
                <div className="flex items-center justify-between p-2.5 rounded bg-[#181824] border border-[#282838]">
                  <div className="flex items-center gap-2.5">
                    <img src={config.imageUrl} alt="Uploaded logo" className="w-8 h-8 object-contain rounded bg-black/40" />
                    <div>
                      <p className="text-xs text-white font-medium truncate max-w-[180px]">
                        {config.imageFileName || 'Custom Logo File'}
                      </p>
                      <p className="text-[10px] text-emerald-400">Ready for website header</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateConfigWithHistory({ imageUrl: '', imageFileName: '' })}
                    className="p-1 text-[#868698] hover:text-red-400"
                    title="Remove uploaded logo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mode B: Text & Monogram Design Form */}
          {activeTab === 'text' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#A0A0B5] mb-1">Business Name</label>
                  <input
                    type="text"
                    value={config.businessName}
                    onChange={(e) => updateConfigWithHistory({ businessName: e.target.value })}
                    className="w-full rounded border border-[#2A2A3A] bg-[#0A0A10] px-3 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#A0A0B5] mb-1">Initials / Monogram</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={config.initials}
                    onChange={(e) => updateConfigWithHistory({ initials: e.target.value.toUpperCase() })}
                    className="w-full rounded border border-[#2A2A3A] bg-[#0A0A10] px-3 py-1.5 text-xs text-white font-mono uppercase focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#A0A0B5] mb-1">Tagline (Optional)</label>
                <input
                  type="text"
                  value={config.tagline || ''}
                  placeholder="e.g. Pure Taste Since 1998"
                  onChange={(e) => updateConfigWithHistory({ tagline: e.target.value })}
                  className="w-full rounded border border-[#2A2A3A] bg-[#0A0A10] px-3 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              {/* Font Picker */}
              <div>
                <label className="block text-[11px] font-semibold text-[#A0A0B5] mb-1">Typography Font</label>
                <select
                  value={config.fontFamily}
                  onChange={(e) => updateConfigWithHistory({ fontFamily: e.target.value })}
                  className="w-full rounded border border-[#2A2A3A] bg-[#0A0A10] px-3 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.id} value={f.css}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Layout & Badge Shapes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#A0A0B5] mb-1">Layout</label>
                  <select
                    value={config.layout}
                    onChange={(e) => updateConfigWithHistory({ layout: e.target.value as any })}
                    className="w-full rounded border border-[#2A2A3A] bg-[#0A0A10] px-2.5 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                  >
                    <option value="badge_left">Icon Left + Name</option>
                    <option value="stacked">Stacked (Icon Top)</option>
                    <option value="badge_only">Icon Badge Only</option>
                    <option value="text_only">Typography Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#A0A0B5] mb-1">Badge Shape</label>
                  <select
                    value={config.badgeShape}
                    onChange={(e) => updateConfigWithHistory({ badgeShape: e.target.value as any })}
                    className="w-full rounded border border-[#2A2A3A] bg-[#0A0A10] px-2.5 py-1.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                  >
                    <option value="circle">Circular</option>
                    <option value="rounded_square">Rounded Square</option>
                    <option value="shield">Shield</option>
                    <option value="hexagon">Hexagon</option>
                    <option value="minimal_frame">Minimal Frame</option>
                  </select>
                </div>
              </div>

              {/* Quick Preset Palettes */}
              <div>
                <label className="block text-[11px] font-semibold text-[#A0A0B5] mb-1.5">Color Theme Presets</label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_PALETTES.map((pal) => (
                    <button
                      key={pal.name}
                      type="button"
                      onClick={() => handleApplyPalette(pal)}
                      className="px-2 py-1 rounded bg-[#161622] hover:bg-[#202030] text-[10px] text-[#A6A6BC] border border-[#242436] flex items-center gap-1.5 transition-colors"
                    >
                      <span className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ backgroundColor: pal.border }} />
                      <span>{pal.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Customizers */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="block text-[10px] text-[#868698] mb-0.5">Badge Background</label>
                  <input
                    type="color"
                    value={config.badgeBgColor}
                    onChange={(e) => updateConfigWithHistory({ badgeBgColor: e.target.value })}
                    className="w-full h-8 rounded border border-[#282838] bg-transparent cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#868698] mb-0.5">Badge Border</label>
                  <input
                    type="color"
                    value={config.badgeBorderColor}
                    onChange={(e) => updateConfigWithHistory({ badgeBorderColor: e.target.value })}
                    className="w-full h-8 rounded border border-[#282838] bg-transparent cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#868698] mb-0.5">Brand Name Text</label>
                  <input
                    type="color"
                    value={config.nameTextColor}
                    onChange={(e) => updateConfigWithHistory({ nameTextColor: e.target.value })}
                    className="w-full h-8 rounded border border-[#282838] bg-transparent cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Live Header & Footer Preview */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E1E2C] pb-2">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-[#D4AF37]" />
              <span>Live Website Storefront Preview</span>
            </span>

            <div className="flex items-center gap-1 bg-[#14141E] p-0.5 rounded border border-[#242436]">
              <button
                type="button"
                onClick={() => setPreviewDevice('desktop')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
                  previewDevice === 'desktop'
                    ? 'bg-[#D4AF37] text-[#08080A]'
                    : 'text-[#9696A8] hover:text-white'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Desktop (1200px)</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewDevice('mobile')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
                  previewDevice === 'mobile'
                    ? 'bg-[#D4AF37] text-[#08080A]'
                    : 'text-[#9696A8] hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Mobile (375px)</span>
              </button>
            </div>
          </div>

          {/* Interactive Preview Container */}
          <div
            className={`rounded-xl border border-[#242436] bg-[#0A0A10] p-4 mx-auto transition-all ${
              previewDevice === 'mobile' ? 'max-w-[375px] shadow-2xl ring-4 ring-[#1E1E2C]' : 'w-full'
            }`}
          >
            {/* Mock Browser Header / Status Bar */}
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#1A1A24] text-[10px] text-[#6E6E82]">
              <span className="truncate">https://{tenantName.toLowerCase().replace(/[^a-z0-9]/g, '')}.vijayvisuals.in</span>
              <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-400 rounded border border-emerald-500/30">
                SSL Secured
              </span>
            </div>

            {/* Mock Website Storefront Navigation Bar */}
            <div className="rounded-lg border border-[#20202E] bg-[#0F0F17] p-3 shadow-md mb-4 flex items-center justify-between gap-4">
              {renderRenderedLogo()}

              {previewDevice === 'desktop' ? (
                <div className="flex items-center gap-4 text-[11px] text-[#A2A2B4]">
                  <span className="text-[#D4AF37] font-medium cursor-pointer">Shop All</span>
                  <span className="hover:text-white cursor-pointer">Categories</span>
                  <span className="hover:text-white cursor-pointer">Offers</span>
                  <span className="hover:text-white cursor-pointer">Contact</span>
                  <span className="px-2.5 py-1 rounded bg-[#D4AF37] text-[#08080A] font-bold text-[10px]">
                    Cart (0)
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[#9C9CAE]">
                  <span className="px-2 py-0.5 rounded bg-[#D4AF37] text-[#08080A] font-bold text-[9px]">
                    Cart (0)
                  </span>
                  <div className="w-6 h-6 rounded bg-[#181824] flex items-center justify-center text-white">
                    ☰
                  </div>
                </div>
              )}
            </div>

            {/* Mock Storefront Hero / Catalog Preview */}
            <div className="rounded-lg border border-[#1A1A24] bg-[#0C0C12] p-4 text-center space-y-2 mb-4">
              <span className="text-[10px] text-[#D4AF37] tracking-widest uppercase font-semibold">
                Welcome to {config.businessName}
              </span>
              <h3 className="font-luxury text-sm font-bold text-white">
                Handcrafted Products Delivered Directly to Your Door
              </h3>
              <p className="text-[11px] text-[#7A7A8E] max-w-sm mx-auto">
                Discover exceptional quality, verified authenticity, and localized customer support across India.
              </p>
              <div className="pt-1">
                <span className="inline-block px-3 py-1 rounded bg-[#181824] text-[10px] text-[#ECC86A] border border-[#2A2A3C]">
                  Simulated Storefront Body
                </span>
              </div>
            </div>

            {/* Mock Website Footer Preview */}
            <div className="rounded-lg border border-[#1E1E2C] bg-[#08080C] p-3 flex flex-col md:flex-row items-center justify-between gap-3 text-[10px] text-[#78788C]">
              <div>{renderRenderedLogo()}</div>
              <span>© {new Date().getFullYear()} {config.businessName}. All rights reserved.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
