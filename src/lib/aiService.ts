// Client AI Service communicating securely with the server-side proxy routes
// NEVER exposes API keys to the browser bundle

export interface AiWebsiteResult {
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  primaryCta: string;
  aboutUs: string;
  features: { title: string; description: string }[];
  productsOrServices: { name: string; price: string; description: string }[];
  faq: { question: string; answer: string }[];
  suggestedThemeColor: string;
  suggestedFont: string;
}

export interface AiContentResult {
  variation1: string;
  variation2: string;
  headline: string;
}

export interface AiLogoResult {
  monogram: string;
  svgCode: string;
  fontRecommendation: string;
  palette: string[];
  designRationale: string;
}

export interface AiProductResult {
  catchyHeadline: string;
  shortHook: string;
  fullDescription: string;
  bulletPoints: string[];
  deliveryCallout: string;
  seoKeywords: string[];
}

export interface AiTranslateResult {
  translatedText: string;
  phoneticOrNotes?: string;
}

export interface AiSeoResult {
  seoTitle: string;
  metaDescription: string;
  keywords: string[];
  ogTitle: string;
  ogDescription: string;
  jsonLdSchema: string;
}

export interface AiQuotaInfo {
  allowed: boolean;
  remaining: number;
  limit: number;
}

export const aiService = {
  // 1. Generate Complete Website Content
  async generateWebsite(params: {
    businessName: string;
    businessType: string;
    location?: string;
    language?: 'en' | 'te' | 'hi';
    specialFeatures?: string;
    tenantId?: string;
  }): Promise<{ data: AiWebsiteResult; quota?: AiQuotaInfo }> {
    const res = await fetch('/api/ai/website-generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || json.details || 'Failed to generate website with AI.');
    }
    return { data: json.data, quota: json.quota };
  },

  // 2. Generate Marketing Content
  async generateContent(params: {
    businessName: string;
    category: string;
    contentType: 'about' | 'hero' | 'services' | 'announcement' | 'faq';
    tone?: 'luxury' | 'friendly' | 'corporate' | 'creative';
    language?: 'en' | 'te' | 'hi';
    topic?: string;
    tenantId?: string;
  }): Promise<{ data: AiContentResult; quota?: AiQuotaInfo }> {
    const res = await fetch('/api/ai/content-writer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to generate content with AI.');
    }
    return { data: json.data, quota: json.quota };
  },

  // 3. Generate Vector SVG Logo & Brand Identity
  async generateLogo(params: {
    businessName: string;
    category: string;
    style?: 'minimalist-gold' | 'royal-crest' | 'modern-geometric' | 'monogram';
    primaryColor?: string;
    tenantId?: string;
  }): Promise<{ data: AiLogoResult; quota?: AiQuotaInfo }> {
    const res = await fetch('/api/ai/logo-generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to generate logo with AI.');
    }
    return { data: json.data, quota: json.quota };
  },

  // 4. Generate Product Descriptions
  async generateProductDescription(params: {
    productName: string;
    category: string;
    price: string;
    features?: string;
    language?: 'en' | 'te' | 'hi';
    tenantId?: string;
  }): Promise<{ data: AiProductResult; quota?: AiQuotaInfo }> {
    const res = await fetch('/api/ai/product-description', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to generate product description.');
    }
    return { data: json.data, quota: json.quota };
  },

  // 5. Translate between Telugu, English & Hindi
  async translate(params: {
    text: string;
    sourceLang: 'en' | 'te' | 'hi';
    targetLang: 'en' | 'te' | 'hi';
    context?: string;
    tenantId?: string;
  }): Promise<{ data: AiTranslateResult; quota?: AiQuotaInfo }> {
    const res = await fetch('/api/ai/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Translation failed.');
    }
    return { data: json.data, quota: json.quota };
  },

  // 6. Support Chatbot Message
  async sendSupportChat(params: {
    message: string;
    history?: { role: 'user' | 'model'; text: string }[];
    businessContext?: {
      name: string;
      category: string;
      city?: string;
      phone?: string;
    };
    tenantId?: string;
  }): Promise<{ reply: string; quota?: AiQuotaInfo }> {
    const res = await fetch('/api/ai/support-chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Chatbot request failed.');
    }
    return { reply: json.reply, quota: json.quota };
  },

  // 7. SEO Metadata Generator
  async generateSeo(params: {
    businessName: string;
    category: string;
    city?: string;
    keyOfferings?: string;
    tenantId?: string;
  }): Promise<{ data: AiSeoResult; quota?: AiQuotaInfo }> {
    const res = await fetch('/api/ai/seo-generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'SEO generation failed.');
    }
    return { data: json.data, quota: json.quota };
  },

  // 8. Get Tenant Usage Stats
  async getUsageStats(tenantId: string = 'default-tenant') {
    const res = await fetch(`/api/ai/usage-stats?tenantId=${encodeURIComponent(tenantId)}`);
    return await res.json();
  },

  // 9. Admin Quota Update
  async updateQuota(tenantId: string, dailyLimit: number) {
    const res = await fetch('/api/ai/admin/update-quota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, dailyLimit }),
    });
    return await res.json();
  },
};
