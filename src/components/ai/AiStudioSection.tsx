import React, { useState, useEffect } from 'react';
import {
  aiService,
  AiWebsiteResult,
  AiContentResult,
  AiLogoResult,
  AiProductResult,
  AiTranslateResult,
  AiSeoResult,
  AiQuotaInfo
} from '../../lib/aiService';
import {
  Sparkles,
  Globe,
  FileText,
  Palette,
  ShoppingBag,
  Languages,
  MessageSquare,
  Search,
  Check,
  Copy,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Download,
  Send,
  Bot,
  User,
  ShieldCheck,
  Zap,
  Sliders,
  Layers
} from 'lucide-react';

interface AiStudioSectionProps {
  tenantId?: string;
  businessName?: string;
  category?: string;
  city?: string;
  onApplyWebsitePlan?: (plan: AiWebsiteResult) => void;
  onShowToast: (msg: string) => void;
}

export const AiStudioSection: React.FC<AiStudioSectionProps> = ({
  tenantId = 'default-tenant',
  businessName = 'Aura Haute Joaillerie',
  category = 'Luxury & Jewelry',
  city = 'Hyderabad',
  onApplyWebsitePlan,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<
    'website' | 'content' | 'logo' | 'product' | 'translate' | 'chatbot' | 'seo'
  >('website');

  // Shared Quota Info
  const [quotaInfo, setQuotaInfo] = useState<AiQuotaInfo | null>(null);

  // 1. Website Generator State
  const [genBizName, setGenBizName] = useState(businessName);
  const [genBizType, setGenBizType] = useState(category);
  const [genLocation, setGenLocation] = useState(city);
  const [genLang, setGenLang] = useState<'en' | 'te' | 'hi'>('en');
  const [genNotes, setGenNotes] = useState('High-converting e-commerce and express 30-min delivery fleet dispatch');
  const [genLoading, setGenLoading] = useState(false);
  const [generatedWebsite, setGeneratedWebsite] = useState<AiWebsiteResult | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  // 2. Content Writer State
  const [contentBizName, setContentBizName] = useState(businessName);
  const [contentType, setContentType] = useState<'about' | 'hero' | 'services' | 'announcement' | 'faq'>('about');
  const [contentTone, setContentTone] = useState<'luxury' | 'friendly' | 'corporate' | 'creative'>('luxury');
  const [contentLang, setContentLang] = useState<'en' | 'te' | 'hi'>('en');
  const [contentTopic, setContentTopic] = useState('Bespoke heritage craft and wedding collections');
  const [contentLoading, setContentLoading] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<AiContentResult | null>(null);

  // 3. Logo Generator State
  const [logoBizName, setLogoBizName] = useState(businessName);
  const [logoCategory, setLogoCategory] = useState(category);
  const [logoStyle, setLogoStyle] = useState<'minimalist-gold' | 'royal-crest' | 'modern-geometric' | 'monogram'>('minimalist-gold');
  const [logoColor, setLogoColor] = useState('#DFBA5A');
  const [logoLoading, setLogoLoading] = useState(false);
  const [generatedLogo, setGeneratedLogo] = useState<AiLogoResult | null>(null);

  // 4. Product Description State
  const [prodName, setProdName] = useState('22K Royal Emerald & Gold Monogram Pendant');
  const [prodPrice, setProdPrice] = useState('₹42,500');
  const [prodFeatures, setProdFeatures] = useState('Hallmark certified, certified Zambian emerald, handcrafted filigree');
  const [prodLang, setProdLang] = useState<'en' | 'te' | 'hi'>('en');
  const [prodLoading, setProdLoading] = useState(false);
  const [generatedProduct, setGeneratedProduct] = useState<AiProductResult | null>(null);

  // 5. Translator State
  const [transSource, setTransSource] = useState<'en' | 'te' | 'hi'>('en');
  const [transTarget, setTransTarget] = useState<'en' | 'te' | 'hi'>('te');
  const [transText, setTransText] = useState('Welcome to our flagship jewelry atelier. We provide royal bespoke gold jewelry with certified authenticity and express insured delivery across Hyderabad.');
  const [transLoading, setTransLoading] = useState(false);
  const [translatedResult, setTranslatedResult] = useState<AiTranslateResult | null>(null);

  // 6. Support Chatbot State
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([
    { role: 'model', text: `Namaste! Welcome to ${businessName}. How may I assist your order or booking today?` }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // 7. SEO Generator State
  const [seoBizName, setSeoBizName] = useState(businessName);
  const [seoCategory, setSeoCategory] = useState(category);
  const [seoCity, setSeoCity] = useState(city);
  const [seoOfferings, setSeoOfferings] = useState('Bridal gold jewelry, diamond rings, custom design consultations');
  const [seoLoading, setSeoLoading] = useState(false);
  const [generatedSeo, setGeneratedSeo] = useState<AiSeoResult | null>(null);

  // Fetch initial usage
  useEffect(() => {
    aiService.getUsageStats(tenantId).then((res) => {
      if (res?.usage) {
        setQuotaInfo({
          allowed: res.usage.requestsCount < res.usage.dailyLimit,
          remaining: res.usage.dailyLimit - res.usage.requestsCount,
          limit: res.usage.dailyLimit,
        });
      }
    }).catch(() => {});
  }, [tenantId]);

  const copyToClipboard = (text: string, label: string = 'Text') => {
    navigator.clipboard.writeText(text);
    onShowToast(`${label} copied to clipboard!`);
  };

  // 1. Run Website Generator
  const handleGenerateWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenLoading(true);
    setGenError(null);
    try {
      const res = await aiService.generateWebsite({
        businessName: genBizName,
        businessType: genBizType,
        location: genLocation,
        language: genLang,
        specialFeatures: genNotes,
        tenantId,
      });
      setGeneratedWebsite(res.data);
      if (res.quota) setQuotaInfo(res.quota);
      onShowToast('Complete website plan generated by AI!');
    } catch (err: any) {
      setGenError(err?.message || 'Failed to generate website.');
      onShowToast(err?.message || 'AI Generation failed.');
    } finally {
      setGenLoading(false);
    }
  };

  // 2. Run Content Writer
  const handleGenerateContent = async (e: React.FormEvent) => {
    e.preventDefault();
    setContentLoading(true);
    try {
      const res = await aiService.generateContent({
        businessName: contentBizName,
        category,
        contentType,
        tone: contentTone,
        language: contentLang,
        topic: contentTopic,
        tenantId,
      });
      setGeneratedContent(res.data);
      if (res.quota) setQuotaInfo(res.quota);
      onShowToast('Marketing copy generated by AI!');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to generate content.');
    } finally {
      setContentLoading(false);
    }
  };

  // 3. Run Logo Generator
  const handleGenerateLogo = async (e: React.FormEvent) => {
    e.preventDefault();
    setLogoLoading(true);
    try {
      const res = await aiService.generateLogo({
        businessName: logoBizName,
        category: logoCategory,
        style: logoStyle,
        primaryColor: logoColor,
        tenantId,
      });
      setGeneratedLogo(res.data);
      if (res.quota) setQuotaInfo(res.quota);
      onShowToast('Vector SVG Logo generated by AI!');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to generate logo.');
    } finally {
      setLogoLoading(false);
    }
  };

  // 4. Run Product Generator
  const handleGenerateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProdLoading(true);
    try {
      const res = await aiService.generateProductDescription({
        productName: prodName,
        category,
        price: prodPrice,
        features: prodFeatures,
        language: prodLang,
        tenantId,
      });
      setGeneratedProduct(res.data);
      if (res.quota) setQuotaInfo(res.quota);
      onShowToast('Luxury product copy generated by AI!');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to generate product copy.');
    } finally {
      setProdLoading(false);
    }
  };

  // 5. Run Translator
  const handleTranslate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transText.trim()) return;
    setTransLoading(true);
    try {
      const res = await aiService.translate({
        text: transText,
        sourceLang: transSource,
        targetLang: transTarget,
        context: category,
        tenantId,
      });
      setTranslatedResult(res.data);
      if (res.quota) setQuotaInfo(res.quota);
      onShowToast('Translation completed successfully!');
    } catch (err: any) {
      onShowToast(err?.message || 'Translation failed.');
    } finally {
      setTransLoading(false);
    }
  };

  // 6. Support Chatbot Send
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    const newHistory = [...chatMessages, { role: 'user' as const, text: userMsg }];
    setChatMessages(newHistory);
    setChatLoading(true);

    try {
      const res = await aiService.sendSupportChat({
        message: userMsg,
        history: newHistory,
        businessContext: {
          name: businessName,
          category,
          city,
          phone: '+91 93813 62201',
        },
        tenantId,
      });
      setChatMessages([...newHistory, { role: 'model', text: res.reply }]);
      if (res.quota) setQuotaInfo(res.quota);
    } catch (err: any) {
      setChatMessages([...newHistory, { role: 'model', text: 'I apologize, but our concierge assistant is temporarily connecting. Please reach us directly via WhatsApp at +91 93813 62201.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  // 7. Run SEO Generator
  const handleGenerateSeo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSeoLoading(true);
    try {
      const res = await aiService.generateSeo({
        businessName: seoBizName,
        category: seoCategory,
        city: seoCity,
        keyOfferings: seoOfferings,
        tenantId,
      });
      setGeneratedSeo(res.data);
      if (res.quota) setQuotaInfo(res.quota);
      onShowToast('SEO metadata generated by AI!');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to generate SEO.');
    } finally {
      setSeoLoading(false);
    }
  };

  const navTools = [
    { id: 'website', label: 'AI Website Generator', icon: Globe },
    { id: 'content', label: 'AI Content Writer', icon: FileText },
    { id: 'logo', label: 'AI Logo & Brand', icon: Palette },
    { id: 'product', label: 'AI Product Copy', icon: ShoppingBag },
    { id: 'translate', label: 'Telugu/Hindi Translator', icon: Languages },
    { id: 'chatbot', label: 'AI Concierge Chatbot', icon: MessageSquare },
    { id: 'seo', label: 'AI SEO & Metadata', icon: Search },
  ];

  return (
    <div className="bg-[#0A0A0F] border border-[#232334] rounded-2xl p-6 sm:p-8 shadow-2xl relative space-y-8">
      
      {/* Top Banner with Quota Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#1C1C2A]">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-[#DFBA5A] mb-1">
            <Sparkles className="w-4 h-4" />
            <span>Vijay Visuals Neural Studio</span>
            <span aria-hidden="true" className="text-[#646473]">·</span>
            <span className="text-[#8E8EA0]">Gemini 3.8 Flash Powered</span>
          </div>
          <h2 className="font-luxury text-2xl sm:text-3xl font-bold text-white">
            AI Suite for {businessName}
          </h2>
          <p className="text-xs text-[#8A8A9E] mt-1">
            Generate full website layouts, multi-language copy, vector logos, product descriptions, and SEO tags with secure server-side AI.
          </p>
        </div>

        {/* Quota Counter Badge */}
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-[#12121D] border border-[#242436] text-xs">
          <Zap className="w-4 h-4 text-[#DFBA5A]" />
          <div>
            <span className="text-[10px] text-[#7A7A8E] block uppercase font-mono">Daily AI Quota</span>
            <span className="font-mono font-bold text-white">
              {quotaInfo ? `${quotaInfo.remaining} / ${quotaInfo.limit} calls left` : '50 calls / day'}
            </span>
          </div>
        </div>
      </div>

      {/* Tool Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-[#1C1C28]">
        {navTools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTab === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTab(tool.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                isActive
                  ? 'bg-[#181826] text-[#DFBA5A] border-[#DFBA5A]/50 shadow-md shadow-[#D4AF37]/10'
                  : 'bg-[#0E0E16] text-[#868698] border-[#1C1C26] hover:text-white hover:border-[#2C2C3E]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tool.label}</span>
            </button>
          );
        })}
      </div>

      {/* TOOL 1: AI WEBSITE GENERATOR */}
      {activeTab === 'website' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form onSubmit={handleGenerateWebsite} className="lg:col-span-5 bg-[#0E0E16] border border-[#20202E] rounded-xl p-5 space-y-4 text-xs">
            <h3 className="font-luxury font-bold text-white text-sm pb-2 border-b border-[#1C1C28]">
              Generate Complete Website Blueprint
            </h3>

            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Business Name</label>
              <input
                type="text"
                required
                value={genBizName}
                onChange={(e) => setGenBizName(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">Category / Type</label>
                <input
                  type="text"
                  required
                  value={genBizType}
                  onChange={(e) => setGenBizType(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">City / Region</label>
                <input
                  type="text"
                  value={genLocation}
                  onChange={(e) => setGenLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Content Language</label>
              <select
                value={genLang}
                onChange={(e) => setGenLang(e.target.value as any)}
                className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
              >
                <option value="en">English</option>
                <option value="te">తెలుగు (Telugu)</option>
                <option value="hi">हिन्दी (Hindi)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Special Highlights & Selling Points</label>
              <textarea
                rows={3}
                value={genNotes}
                onChange={(e) => setGenNotes(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
              />
            </div>

            <button
              type="submit"
              disabled={genLoading}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider shadow flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{genLoading ? 'Architecting Website Plan...' : 'Generate Website with AI'}</span>
            </button>
          </form>

          {/* Result Showcase */}
          <div className="lg:col-span-7 bg-[#0E0E16] border border-[#20202E] rounded-xl p-6 space-y-4">
            {generatedWebsite ? (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between pb-3 border-b border-[#1C1C28]">
                  <div>
                    <span className="text-[10px] font-mono text-[#DFBA5A] uppercase">AI Generated Blueprint</span>
                    <h4 className="font-luxury text-lg font-bold text-white mt-0.5">{generatedWebsite.heroTitle}</h4>
                  </div>
                  {onApplyWebsitePlan && (
                    <button
                      onClick={() => onApplyWebsitePlan(generatedWebsite)}
                      className="px-3 py-1.5 rounded-lg bg-[#18261A] text-[#25D366] border border-[#25D366]/40 text-xs font-semibold hover:bg-[#1F3322]"
                    >
                      Apply to My Website
                    </button>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-[#14141E] border border-[#242434] space-y-1">
                  <span className="text-[#DFBA5A] font-semibold text-[11px] uppercase">Tagline & Subtitle</span>
                  <p className="text-white font-medium">{generatedWebsite.tagline}</p>
                  <p className="text-[#8E8EA0]">{generatedWebsite.heroSubtitle}</p>
                </div>

                <div className="p-3 rounded-lg bg-[#14141E] border border-[#242434] space-y-1">
                  <span className="text-[#DFBA5A] font-semibold text-[11px] uppercase">About Our Business</span>
                  <p className="text-[#C8C8D8] leading-relaxed">{generatedWebsite.aboutUs}</p>
                </div>

                <div>
                  <span className="text-[11px] uppercase text-[#7A7A8E] font-semibold block mb-2">Key Value Pillars</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {generatedWebsite.features.map((f, i) => (
                      <div key={i} className="p-2.5 rounded bg-[#12121C] border border-[#1E1E2A]">
                        <p className="font-bold text-white">{f.title}</p>
                        <p className="text-[11px] text-[#848496] mt-0.5">{f.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] uppercase text-[#7A7A8E] font-semibold block mb-2">Catalog Offerings</span>
                  <div className="space-y-1.5">
                    {generatedWebsite.productsOrServices.map((p, i) => (
                      <div key={i} className="p-2.5 rounded bg-[#12121C] border border-[#1E1E2A] flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-white">{p.name}</p>
                          <p className="text-[11px] text-[#848496]">{p.description}</p>
                        </div>
                        <span className="font-mono font-bold text-[#DFBA5A]">{p.price}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end">
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(generatedWebsite, null, 2), 'Website Blueprint JSON')}
                    className="flex items-center gap-1.5 text-xs text-[#DFBA5A] hover:underline"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Full Plan JSON</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-xs text-[#7A7A8E] space-y-2">
                <Globe className="w-10 h-10 text-[#DFBA5A]/50 mx-auto" />
                <p>Fill out your business details and click "Generate Website with AI".</p>
                <p className="text-[11px] text-[#555566]">Generates tailored headlines, about story, product menu, and FAQ.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOOL 2: AI CONTENT WRITER */}
      {activeTab === 'content' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form onSubmit={handleGenerateContent} className="lg:col-span-5 bg-[#0E0E16] border border-[#20202E] rounded-xl p-5 space-y-4 text-xs">
            <h3 className="font-luxury font-bold text-white text-sm pb-2 border-b border-[#1C1C28]">
              High-Converting Marketing Copy
            </h3>

            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Content Type</label>
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value as any)}
                className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
              >
                <option value="about">About Us Brand Story</option>
                <option value="hero">Hero Headline & Value Hook</option>
                <option value="services">Services / Menu Explanation</option>
                <option value="announcement">Promo Banner / Announcement</option>
                <option value="faq">Customer FAQ Questions & Answers</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">Brand Tone</label>
                <select
                  value={contentTone}
                  onChange={(e) => setContentTone(e.target.value as any)}
                  className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                >
                  <option value="luxury">Luxury & Exclusive</option>
                  <option value="friendly">Warm & Welcoming</option>
                  <option value="corporate">Authoritative & Corporate</option>
                  <option value="creative">Bold & Creative</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">Language</label>
                <select
                  value={contentLang}
                  onChange={(e) => setContentLang(e.target.value as any)}
                  className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                >
                  <option value="en">English</option>
                  <option value="te">Telugu (తెలుగు)</option>
                  <option value="hi">Hindi (हिन्दी)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Topic or Special Highlight</label>
              <textarea
                rows={3}
                value={contentTopic}
                onChange={(e) => setContentTopic(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
              />
            </div>

            <button
              type="submit"
              disabled={contentLoading}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider shadow flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{contentLoading ? 'Composing Luxury Copy...' : 'Generate Marketing Copy'}</span>
            </button>
          </form>

          <div className="lg:col-span-7 bg-[#0E0E16] border border-[#20202E] rounded-xl p-6 space-y-4">
            {generatedContent ? (
              <div className="space-y-4 text-xs">
                <div className="border-b border-[#1C1C28] pb-3">
                  <span className="text-[10px] font-mono text-[#DFBA5A] uppercase">Recommended Headline</span>
                  <h4 className="font-luxury text-lg font-bold text-white mt-0.5">{generatedContent.headline}</h4>
                </div>

                <div className="p-4 rounded-lg bg-[#14141E] border border-[#242434] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-[#DFBA5A]">Variation 1</span>
                    <button
                      onClick={() => copyToClipboard(generatedContent.variation1, 'Variation 1')}
                      className="text-xs text-[#8E8EA0] hover:text-white flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </button>
                  </div>
                  <p className="text-[#D1D1DE] leading-relaxed whitespace-pre-line">{generatedContent.variation1}</p>
                </div>

                <div className="p-4 rounded-lg bg-[#14141E] border border-[#242434] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-[#DFBA5A]">Variation 2</span>
                    <button
                      onClick={() => copyToClipboard(generatedContent.variation2, 'Variation 2')}
                      className="text-xs text-[#8E8EA0] hover:text-white flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </button>
                  </div>
                  <p className="text-[#D1D1DE] leading-relaxed whitespace-pre-line">{generatedContent.variation2}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-xs text-[#7A7A8E] space-y-2">
                <FileText className="w-10 h-10 text-[#DFBA5A]/50 mx-auto" />
                <p>Choose a content type and tone to generate two distinct copy variations.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOOL 3: AI LOGO & BRAND GENERATOR */}
      {activeTab === 'logo' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form onSubmit={handleGenerateLogo} className="lg:col-span-5 bg-[#0E0E16] border border-[#20202E] rounded-xl p-5 space-y-4 text-xs">
            <h3 className="font-luxury font-bold text-white text-sm pb-2 border-b border-[#1C1C28]">
              Vector SVG Logo & Identity
            </h3>

            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Business Name</label>
              <input
                type="text"
                required
                value={logoBizName}
                onChange={(e) => setLogoBizName(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
              />
            </div>

            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Logo Design Style</label>
              <select
                value={logoStyle}
                onChange={(e) => setLogoStyle(e.target.value as any)}
                className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
              >
                <option value="minimalist-gold">Minimalist Gold Foil Seal</option>
                <option value="royal-crest">Royal Heritage Crest</option>
                <option value="modern-geometric">Modern Geometric Luxury</option>
                <option value="monogram">Two-Letter Interlocking Monogram</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Primary Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={logoColor}
                  onChange={(e) => setLogoColor(e.target.value)}
                  className="w-8 h-8 rounded border border-[#333] cursor-pointer bg-transparent"
                />
                <span className="font-mono text-white text-xs">{logoColor}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={logoLoading}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider shadow flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Palette className="w-4 h-4" />
              <span>{logoLoading ? 'Crafting Vector Identity...' : 'Generate Vector SVG Logo'}</span>
            </button>
          </form>

          <div className="lg:col-span-7 bg-[#0E0E16] border border-[#20202E] rounded-xl p-6 space-y-4">
            {generatedLogo ? (
              <div className="space-y-5 text-xs">
                {/* SVG Render Box */}
                <div className="p-8 bg-[#09090D] border border-[#222232] rounded-xl flex flex-col items-center justify-center text-center">
                  <div
                    className="w-36 h-36 flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: generatedLogo.svgCode }}
                  />
                  <p className="font-luxury font-bold text-white text-base mt-4">{logoBizName}</p>
                  <span className="text-[11px] text-[#8C8C9E] font-mono">Monogram: {generatedLogo.monogram}</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#13131E] rounded-lg border border-[#20202E]">
                    <span className="text-[10px] uppercase font-mono text-[#79798C] block">Font Pairing</span>
                    <p className="font-semibold text-white mt-1">{generatedLogo.fontRecommendation}</p>
                  </div>

                  <div className="p-3 bg-[#13131E] rounded-lg border border-[#20202E]">
                    <span className="text-[10px] uppercase font-mono text-[#79798C] block">Brand Palette</span>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {generatedLogo.palette.map((c, i) => (
                        <div key={i} className="w-5 h-5 rounded border border-[#333]" style={{ backgroundColor: c }} title={c} />
                      ))}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-[#88889A] italic">{generatedLogo.designRationale}</p>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    onClick={() => copyToClipboard(generatedLogo.svgCode, 'SVG Vector Code')}
                    className="flex items-center gap-1.5 text-xs text-[#DFBA5A] hover:underline"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Raw SVG Code</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-xs text-[#7A7A8E] space-y-2">
                <Palette className="w-10 h-10 text-[#DFBA5A]/50 mx-auto" />
                <p>Generate clean vector SVG logos ready for websites, invoices, and social banners.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOOL 4: AI PRODUCT DESCRIPTION GENERATOR */}
      {activeTab === 'product' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form onSubmit={handleGenerateProduct} className="lg:col-span-5 bg-[#0E0E16] border border-[#20202E] rounded-xl p-5 space-y-4 text-xs">
            <h3 className="font-luxury font-bold text-white text-sm pb-2 border-b border-[#1C1C28]">
              High-Converting Product Description
            </h3>

            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Product / Item Name</label>
              <input
                type="text"
                required
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">Price / Tag</label>
                <input
                  type="text"
                  value={prodPrice}
                  onChange={(e) => setProdPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">Language</label>
                <select
                  value={prodLang}
                  onChange={(e) => setProdLang(e.target.value as any)}
                  className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                >
                  <option value="en">English</option>
                  <option value="te">Telugu (తెలుగు)</option>
                  <option value="hi">Hindi (हिन्दी)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Specifications / Key Benefits</label>
              <textarea
                rows={3}
                value={prodFeatures}
                onChange={(e) => setProdFeatures(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
              />
            </div>

            <button
              type="submit"
              disabled={prodLoading}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider shadow flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>{prodLoading ? 'Generating Product Copy...' : 'Generate Product Description'}</span>
            </button>
          </form>

          <div className="lg:col-span-7 bg-[#0E0E16] border border-[#20202E] rounded-xl p-6 space-y-4">
            {generatedProduct ? (
              <div className="space-y-4 text-xs">
                <div className="border-b border-[#1C1C28] pb-3">
                  <span className="text-[10px] font-mono text-[#DFBA5A] uppercase">{prodPrice}</span>
                  <h4 className="font-luxury text-lg font-bold text-white mt-0.5">{generatedProduct.catchyHeadline}</h4>
                  <p className="text-xs text-[#8E8EA0] mt-1">{generatedProduct.shortHook}</p>
                </div>

                <div className="p-3.5 bg-[#14141E] rounded-lg border border-[#242434]">
                  <p className="text-[#C8C8D8] leading-relaxed">{generatedProduct.fullDescription}</p>
                </div>

                <div>
                  <span className="text-[11px] uppercase text-[#7A7A8E] font-semibold block mb-2">Key Selling Points</span>
                  <div className="space-y-1.5">
                    {generatedProduct.bulletPoints.map((bp, i) => (
                      <div key={i} className="flex items-start gap-2 text-[#C0C0D2]">
                        <Check className="w-3.5 h-3.5 text-[#DFBA5A] shrink-0 mt-0.5" />
                        <span>{bp}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-2.5 rounded bg-[#102915] border border-[#25D366]/30 text-[#B9F5C8] font-mono text-[11px]">
                  {generatedProduct.deliveryCallout}
                </div>

                <div className="pt-2 flex items-center justify-end">
                  <button
                    onClick={() => copyToClipboard(generatedProduct.fullDescription, 'Product Description')}
                    className="flex items-center gap-1.5 text-xs text-[#DFBA5A] hover:underline"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Description</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-xs text-[#7A7A8E] space-y-2">
                <ShoppingBag className="w-10 h-10 text-[#DFBA5A]/50 mx-auto" />
                <p>Generate conversion-engineered e-commerce product listings and catalog copy.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOOL 5: AI TELUGU, ENGLISH & HINDI TRANSLATOR */}
      {activeTab === 'translate' && (
        <div className="bg-[#0E0E16] border border-[#20202E] rounded-xl p-6 space-y-6 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1C1C28]">
            <div>
              <h3 className="font-luxury font-bold text-white text-base">
                AI Multilingual Translator (Telugu · English · Hindi)
              </h3>
              <p className="text-[11px] text-[#868698]">
                Translate food menus, luxury jewelry catalogs, hospital services, and business terms with native nuance.
              </p>
            </div>

            {/* Language Switch Controls */}
            <div className="flex items-center gap-3">
              <select
                value={transSource}
                onChange={(e) => setTransSource(e.target.value as any)}
                className="px-3 py-1.5 rounded bg-[#14141E] border border-[#262636] text-white text-xs font-semibold"
              >
                <option value="en">English</option>
                <option value="te">Telugu (తెలుగు)</option>
                <option value="hi">Hindi (हिन्दी)</option>
              </select>

              <span className="text-[#DFBA5A] font-bold">&rarr;</span>

              <select
                value={transTarget}
                onChange={(e) => setTransTarget(e.target.value as any)}
                className="px-3 py-1.5 rounded bg-[#14141E] border border-[#262636] text-white text-xs font-semibold"
              >
                <option value="te">Telugu (తెలుగు)</option>
                <option value="hi">Hindi (हिन्दी)</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1 font-medium">Original Source Text</label>
              <textarea
                rows={6}
                value={transText}
                onChange={(e) => setTransText(e.target.value)}
                className="w-full p-3 rounded-lg bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
              />
              <button
                onClick={handleTranslate}
                disabled={transLoading}
                className="mt-3 px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider shadow flex items-center gap-2 disabled:opacity-50"
              >
                <Languages className="w-4 h-4" />
                <span>{transLoading ? 'Translating with Neural AI...' : 'Translate Content'}</span>
              </button>
            </div>

            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1 font-medium">Translated Target Output</label>
              <div className="min-h-[140px] p-3.5 rounded-lg bg-[#12121D] border border-[#242436] flex flex-col justify-between">
                {translatedResult ? (
                  <>
                    <p className="text-white text-sm leading-relaxed font-sans-clean select-all">
                      {translatedResult.translatedText}
                    </p>
                    {translatedResult.phoneticOrNotes && (
                      <p className="text-[11px] text-[#8A8A9E] mt-3 italic">
                        {translatedResult.phoneticOrNotes}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[#646476] italic">Translation output will appear here...</p>
                )}

                {translatedResult && (
                  <div className="pt-3 border-t border-[#1C1C28] flex justify-end">
                    <button
                      onClick={() => copyToClipboard(translatedResult.translatedText, 'Translated Text')}
                      className="flex items-center gap-1.5 text-xs text-[#DFBA5A] hover:underline"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Translation</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOOL 6: AI CUSTOMER SUPPORT CHATBOT */}
      {activeTab === 'chatbot' && (
        <div className="bg-[#0E0E16] border border-[#20202E] rounded-xl p-6 space-y-4 text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#1C1C28]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#18261A] text-[#25D366] flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-luxury font-bold text-white text-base">
                  {businessName} Virtual Concierge
                </h4>
                <p className="text-[11px] text-[#868698]">
                  Trained on your business products, timings, and delivery fleet policies.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#102915] text-[#25D366]">
              Live Server AI
            </span>
          </div>

          {/* Chat Window */}
          <div className="h-64 overflow-y-auto p-4 rounded-xl bg-[#09090D] border border-[#1E1E2A] space-y-3">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'model' && (
                  <div className="w-6 h-6 rounded-full bg-[#1A1A26] border border-[#2E2E40] flex items-center justify-center text-[#DFBA5A] shrink-0 text-[10px]">
                    VV
                  </div>
                )}
                <div
                  className={`p-3 rounded-xl max-w-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#181826] text-white border border-[#2E2E42]'
                      : 'bg-[#12121A] text-[#D8D8E8] border border-[#20202E]'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-2 text-xs text-[#8A8A9E] italic items-center">
                <span className="w-2 h-2 rounded-full bg-[#DFBA5A] animate-ping" />
                <span>Concierge is thinking...</span>
              </div>
            )}
          </div>

          {/* Chat Input Bar */}
          <form onSubmit={handleSendChat} className="flex gap-2">
            <input
              type="text"
              placeholder={`Ask a question (e.g. Do you deliver in Hyderabad? What are your timings?)...`}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
            />
            <button
              type="submit"
              disabled={chatLoading}
              className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>
      )}

      {/* TOOL 7: AI SEO & METADATA GENERATOR */}
      {activeTab === 'seo' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form onSubmit={handleGenerateSeo} className="lg:col-span-5 bg-[#0E0E16] border border-[#20202E] rounded-xl p-5 space-y-4 text-xs">
            <h3 className="font-luxury font-bold text-white text-sm pb-2 border-b border-[#1C1C28]">
              Google SEO & Meta Tag Generator
            </h3>

            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Business Name</label>
              <input
                type="text"
                required
                value={seoBizName}
                onChange={(e) => setSeoBizName(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">Category</label>
                <input
                  type="text"
                  required
                  value={seoCategory}
                  onChange={(e) => setSeoCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#B0B0C0] block mb-1">Target City</label>
                <input
                  type="text"
                  value={seoCity}
                  onChange={(e) => setSeoCity(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-[#B0B0C0] block mb-1">Core Keywords / Offerings</label>
              <textarea
                rows={3}
                value={seoOfferings}
                onChange={(e) => setSeoOfferings(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#14141E] border border-[#262636] text-white text-xs focus:outline-none focus:border-[#DFBA5A]"
              />
            </div>

            <button
              type="submit"
              disabled={seoLoading}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#DFBA5A] to-[#B38D2C] hover:from-[#ECC86A] text-[#0A0A0E] text-xs font-bold uppercase tracking-wider shadow flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Search className="w-4 h-4" />
              <span>{seoLoading ? 'Optimizing for Search...' : 'Generate Google SEO Tags'}</span>
            </button>
          </form>

          <div className="lg:col-span-7 bg-[#0E0E16] border border-[#20202E] rounded-xl p-6 space-y-4">
            {generatedSeo ? (
              <div className="space-y-4 text-xs">
                {/* Simulated Google SERP Card */}
                <div>
                  <span className="text-[10px] font-mono text-[#7A7A8E] uppercase block mb-1.5">
                    Google Search Result Preview
                  </span>
                  <div className="p-4 rounded-xl bg-white text-slate-900 shadow-md space-y-1">
                    <span className="text-[11px] text-slate-500 font-mono block">https://{businessName.toLowerCase().replace(/[^a-z0-9]/g, '')}.vijayvisuals.com</span>
                    <h5 className="text-base text-blue-700 hover:underline font-medium cursor-pointer">
                      {generatedSeo.seoTitle}
                    </h5>
                    <p className="text-xs text-slate-600 leading-snug">
                      {generatedSeo.metaDescription}
                    </p>
                  </div>
                </div>

                {/* Character Counter Compliance */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#13131E] rounded-lg border border-[#20202E]">
                    <span className="text-[10px] font-mono text-[#79798C] uppercase block">Title Tag Length</span>
                    <p className="font-mono font-bold text-white mt-1">
                      {generatedSeo.seoTitle.length} / 60 characters
                    </p>
                  </div>

                  <div className="p-3 bg-[#13131E] rounded-lg border border-[#20202E]">
                    <span className="text-[10px] font-mono text-[#79798C] uppercase block">Meta Description</span>
                    <p className="font-mono font-bold text-white mt-1">
                      {generatedSeo.metaDescription.length} / 160 characters
                    </p>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] uppercase text-[#7A7A8E] font-semibold block mb-2">High-Ranking Focus Keywords</span>
                  <div className="flex flex-wrap gap-1.5">
                    {generatedSeo.keywords.map((kw, i) => (
                      <span key={i} className="px-2.5 py-1 rounded bg-[#13131E] border border-[#242436] text-[#DFBA5A] font-mono text-[11px]">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end">
                  <button
                    onClick={() => copyToClipboard(`<title>${generatedSeo.seoTitle}</title>\n<meta name="description" content="${generatedSeo.metaDescription}" />`, 'HTML Meta Tags')}
                    className="flex items-center gap-1.5 text-xs text-[#DFBA5A] hover:underline"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy HTML Meta Tags</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-xs text-[#7A7A8E] space-y-2">
                <Search className="w-10 h-10 text-[#DFBA5A]/50 mx-auto" />
                <p>Generate Google-compliant SEO titles, meta descriptions, and Schema tags.</p>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
