import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
const port = 3000;

app.use(express.json());

// Initialize server-side Google GenAI client
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Helper to safely parse JSON from AI model outputs
function safeParseJson(text: string): any {
  if (!text) return {};
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    // If JSON parsing fails directly, try extracting first {...} block
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch (inner) {
        console.error('Safe JSON extraction failed:', inner);
      }
    }
    return {};
  }
}

// User-friendly error message formatter
function formatAiError(error: any): string {
  if (!error) return 'AI service temporarily unavailable. Please try again.';
  const msg = typeof error === 'string' ? error : error.message || '';
  if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
    return 'Gemini AI is currently experiencing high demand. Please try again in a few moments.';
  }
  if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
    return 'AI request limit reached. Please wait or request a quota increase from admin.';
  }
  return msg || 'AI generation encountered an unexpected error.';
}

// Resilient Gemini Model Invocation with automatic fallbacks
async function callGemini(contents: any, config?: any) {
  if (!ai) {
    throw new Error('Gemini API key is not configured.');
  }
  // Try supported fast models in order
  const models = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
  let lastErr: any = null;
  for (const model of models) {
    try {
      const callPromise = ai.models.generateContent({
        model,
        contents,
        config,
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout waiting for model ${model}`)), 20000)
      );
      const response = (await Promise.race([callPromise, timeoutPromise])) as any;
      return response;
    } catch (err: any) {
      lastErr = err;
      console.warn(`[Gemini Model ${model}] failed or timed out, trying fallback:`, err?.message || err);
    }
  }
  throw lastErr;
}

// ============================================================================
// TENANT USAGE TRACKER & ADMIN CONTROLS (Server-side in-memory + limits)
// ============================================================================
interface TenantUsage {
  requestsCount: number;
  dailyLimit: number;
  lastReset: string;
}

const usageStore: Record<string, TenantUsage> = {
  'default-tenant': { requestsCount: 3, dailyLimit: 50, lastReset: new Date().toISOString() },
  'biz-01': { requestsCount: 8, dailyLimit: 100, lastReset: new Date().toISOString() },
  'biz-02': { requestsCount: 5, dailyLimit: 50, lastReset: new Date().toISOString() },
};

function checkAndIncrementQuota(tenantId: string = 'default-tenant'): { allowed: boolean; remaining: number; limit: number } {
  const today = new Date().toISOString().split('T')[0];
  if (!usageStore[tenantId]) {
    usageStore[tenantId] = { requestsCount: 0, dailyLimit: 50, lastReset: today };
  } else if (!usageStore[tenantId].lastReset.startsWith(today)) {
    usageStore[tenantId].requestsCount = 0;
    usageStore[tenantId].lastReset = today;
  }

  const tenant = usageStore[tenantId];
  if (tenant.requestsCount >= tenant.dailyLimit) {
    return { allowed: false, remaining: 0, limit: tenant.dailyLimit };
  }

  tenant.requestsCount += 1;
  return { allowed: true, remaining: tenant.dailyLimit - tenant.requestsCount, limit: tenant.dailyLimit };
}

// Middleware to enforce tenant limits
const requireAiQuota = (req: Request, res: Response, next: Function) => {
  const tenantId = (req.body?.tenantId as string) || (req.query?.tenantId as string) || 'default-tenant';
  const quota = checkAndIncrementQuota(tenantId);
  if (!quota.allowed) {
    return res.status(429).json({
      error: 'Daily AI usage limit reached for your business account.',
      details: `Your daily quota of ${quota.limit} AI calls has been exhausted. Admin can increase this limit in the Platform Controls.`,
      remaining: 0,
      limit: quota.limit,
    });
  }
  (req as any).aiQuota = quota;
  next();
};

// ============================================================================
// AI API ROUTES (All secured server-side)
// ============================================================================

// 1. AI Website Generator
app.post('/api/ai/website-generator', requireAiQuota, async (req: Request, res: Response) => {
  try {
    const { businessName, businessType, location, language = 'en', specialFeatures } = req.body;

    if (!businessName || !businessType) {
      return res.status(400).json({ error: 'businessName and businessType are required.' });
    }

    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is not configured on the server. Please check the Secrets panel in AI Studio.',
      });
    }

    const prompt = `You are an expert luxury web designer and copywriter for Vijay Visuals Multi-Tenant Website Builder.
Generate a complete, high-converting business website content plan for:
Business Name: ${businessName}
Business Category: ${businessType}
Location: ${location || 'Hyderabad, India'}
Language: ${language} (en = English, te = Telugu, hi = Hindi)
Special Features / Notes: ${specialFeatures || 'Fast delivery, online shopping, luxury finish'}

Return ONLY a valid JSON object matching this structure:
{
  "tagline": "A punchy, memorable tagline",
  "heroTitle": "Compelling hero title (under 10 words)",
  "heroSubtitle": "Engaging 2-sentence value proposition",
  "primaryCta": "CTA label (e.g. Order Now / Book Appointment)",
  "aboutUs": "A compelling 3-4 sentence story of the business craft, heritage, and values.",
  "features": [
    { "title": "Feature 1", "description": "Short explanation" },
    { "title": "Feature 2", "description": "Short explanation" },
    { "title": "Feature 3", "description": "Short explanation" },
    { "title": "Feature 4", "description": "Short explanation" }
  ],
  "productsOrServices": [
    { "name": "Item 1", "price": "₹499", "description": "Crisp description" },
    { "name": "Item 2", "price": "₹899", "description": "Crisp description" },
    { "name": "Item 3", "price": "₹1,499", "description": "Crisp description" }
  ],
  "faq": [
    { "question": "Question 1?", "answer": "Clear, reassuring answer." },
    { "question": "Question 2?", "answer": "Clear, reassuring answer." }
  ],
  "suggestedThemeColor": "#DFBA5A",
  "suggestedFont": "Cinzel"
}`;

    const response = await callGemini(prompt, {
      responseMimeType: 'application/json',
    });

    const parsed = safeParseJson(response.text || '{}');
    return res.json({ success: true, data: parsed, quota: (req as any).aiQuota });
  } catch (error: any) {
    console.error('AI Website Generator Error:', error);
    return res.status(500).json({ error: formatAiError(error) });
  }
});

// 2. AI Content Writer
app.post('/api/ai/content-writer', requireAiQuota, async (req: Request, res: Response) => {
  try {
    const { businessName, category, contentType, tone = 'luxury', language = 'en', topic } = req.body;

    if (!ai) {
      return res.status(503).json({ error: 'Gemini API key is not configured.' });
    }

    const prompt = `Write professional, high-converting content for:
Business: "${businessName}" (${category})
Content Type to write: "${contentType}" (e.g. About Story, Hero Banner Headline, Announcement, Services List, FAQ)
Tone: "${tone}"
Language: "${language}" (en: English, te: Telugu, hi: Hindi)
Specific Instructions / Topic: "${topic || 'General high-end appeal'}"

Provide 2 distinct variations. Return JSON:
{
  "variation1": "Option 1 text",
  "variation2": "Option 2 text",
  "headline": "Recommended short headline"
}`;

    const response = await callGemini(prompt, {
      responseMimeType: 'application/json',
    });

    const data = safeParseJson(response.text || '{}');
    return res.json({ success: true, data, quota: (req as any).aiQuota });
  } catch (error: any) {
    console.error('Content Writer Error:', error);
    return res.status(500).json({ error: formatAiError(error) });
  }
});

// 3. AI Logo & Banner Generator
app.post('/api/ai/logo-generator', requireAiQuota, async (req: Request, res: Response) => {
  try {
    const { businessName, category, style = 'minimalist-gold', primaryColor = '#DFBA5A' } = req.body;

    const prompt = `You are a world-class luxury brand identity designer.
Generate SVG code and visual brand guidelines for:
Business Name: "${businessName}"
Category: "${category}"
Style: "${style}" (e.g. minimalist-gold, royal-crest, modern-geometric, monogram)
Primary Brand Color: "${primaryColor}"

Create a clean, scalable vector SVG logo (viewBox="0 0 200 200") with gold metallic gradient or refined vector paths, and output a JSON:
{
  "monogram": "2 letters",
  "svgCode": "<svg viewBox=\\"0 0 200 200\\" xmlns=\\"http://www.w3.org/2000/svg\\">...</svg>",
  "fontRecommendation": "Cinzel or Plus Jakarta Sans",
  "palette": ["#08080A", "${primaryColor}", "#ECC86A", "#1C1C26"],
  "designRationale": "1-2 sentences explaining the visual symbolism."
}`;

    const response = await callGemini(prompt, {
      responseMimeType: 'application/json',
    });

    const data = safeParseJson(response.text || '{}');
    return res.json({ success: true, data, quota: (req as any).aiQuota });
  } catch (error: any) {
    console.error('Logo Generator Error:', error);
    return res.status(500).json({ error: formatAiError(error) });
  }
});

// 4. AI Product Description Generator
app.post('/api/ai/product-description', requireAiQuota, async (req: Request, res: Response) => {
  try {
    const { productName, category, price, features, language = 'en' } = req.body;

    if (!ai) {
      return res.status(503).json({ error: 'Gemini API key is not configured.' });
    }

    const prompt = `Create a luxury e-commerce product description for:
Product Name: "${productName}"
Category: "${category}"
Price: "${price}"
Key Specifications / Ingredients: "${features || 'High-end craftsmanship'}"
Language: "${language}"

Return JSON:
{
  "catchyHeadline": "Engaging product headline",
  "shortHook": "1-2 sentence hook for catalog listing",
  "fullDescription": "Rich, sensory description highlighting benefits and craftsmanship.",
  "bulletPoints": [
    "Key benefit / spec 1",
    "Key benefit / spec 2",
    "Key benefit / spec 3",
    "Key benefit / spec 4"
  ],
  "deliveryCallout": "e.g. Express 30-min delivery or Insured Doorstep Courier available",
  "seoKeywords": ["keyword1", "keyword2", "keyword3"]
}`;

    const response = await callGemini(prompt, {
      responseMimeType: 'application/json',
    });

    const data = safeParseJson(response.text || '{}');
    return res.json({ success: true, data, quota: (req as any).aiQuota });
  } catch (error: any) {
    console.error('Product Description Error:', error);
    return res.status(500).json({ error: formatAiError(error) });
  }
});

// 5. AI Translator (Telugu, English & Hindi)
app.post('/api/ai/translate', requireAiQuota, async (req: Request, res: Response) => {
  try {
    const { text, sourceLang = 'en', targetLang = 'te', context = 'business' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required for translation.' });
    }

    if (!ai) {
      return res.status(503).json({ error: 'Gemini API key is not configured.' });
    }

    const prompt = `Translate the following text accurately with natural, professional phrasing suitable for a high-end website.
Source Language: ${sourceLang}
Target Language: ${targetLang} (en: English, te: Telugu, hi: Hindi)
Context: ${context} (e.g. food menu, luxury jewelry, doctor appointments, legal services)

Text to translate:
"""
${text}
"""

Return JSON:
{
  "translatedText": "the translated string in target language script (Telugu script if te, Devanagari script if hi, Latin if en)",
  "phoneticOrNotes": "Optional brief pronunciation note or cultural nuance"
}`;

    const response = await callGemini(prompt, {
      responseMimeType: 'application/json',
    });

    const data = safeParseJson(response.text || '{}');
    return res.json({ success: true, data, quota: (req as any).aiQuota });
  } catch (error: any) {
    console.error('Translation Error:', error);
    return res.status(500).json({ error: formatAiError(error) });
  }
});

// 6. AI Customer Support Chatbot
app.post('/api/ai/support-chatbot', requireAiQuota, async (req: Request, res: Response) => {
  try {
    const { message, history = [], businessContext } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required.' });
    }

    if (!ai) {
      return res.status(503).json({ error: 'Gemini API key is not configured.' });
    }

    const bizName = businessContext?.name || 'Vijay Visuals';
    const bizCategory = businessContext?.category || 'Digital Services';
    const bizCity = businessContext?.city || 'Hyderabad';
    const bizPhone = businessContext?.phone || '+91 93813 62201';

    const systemInstruction = `You are the polite, intelligent AI Virtual Concierge for "${bizName}" (${bizCategory}) based in ${bizCity}.
Business Details:
- Store Phone / WhatsApp: ${bizPhone}
- Fast delivery is managed by our dedicated Vijay Visuals logistics fleet.
- Keep answers helpful, concise, professional, and warmly welcoming.
- Answer questions regarding products, timings, location, delivery tracking, and order placement.
- If unsure or if the customer wants human help, offer to connect them via WhatsApp at ${bizPhone}.`;

    // Format chat history
    const contents: any[] = [];
    if (Array.isArray(history)) {
      history.slice(-6).forEach((h: any) => {
        contents.push({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.text }],
        });
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const response = await callGemini(contents as any, {
      systemInstruction,
    });

    const reply = response.text || 'I am here to assist you with any questions about our products and services!';
    return res.json({ success: true, reply, quota: (req as any).aiQuota });
  } catch (error: any) {
    console.error('Chatbot Error:', error);
    return res.status(500).json({ error: formatAiError(error) });
  }
});

// 7. AI SEO Generator
app.post('/api/ai/seo-generator', requireAiQuota, async (req: Request, res: Response) => {
  try {
    const { businessName, category, city = 'Hyderabad', keyOfferings } = req.body;

    const prompt = `Generate Google-optimized SEO metadata for:
Business: "${businessName}"
Industry: "${category}"
City / Target Region: "${city}"
Key Offerings: "${keyOfferings || 'Bespoke high-end services'}"

Output strict JSON:
{
  "seoTitle": "Title tag (STRICTLY under 60 characters, with high-intent keywords and brand name)",
  "metaDescription": "Meta description (STRICTLY between 135 and 155 characters with CTA)",
  "keywords": ["5-7 high-ranking long-tail keywords"],
  "ogTitle": "OpenGraph title for social media share cards",
  "ogDescription": "OpenGraph description",
  "jsonLdSchema": "Valid Schema.org LocalBusiness or Product JSON-LD string"
}`;

    const response = await callGemini(prompt, {
      responseMimeType: 'application/json',
    });

    const data = safeParseJson(response.text || '{}');
    return res.json({ success: true, data, quota: (req as any).aiQuota });
  } catch (error: any) {
    console.error('SEO Generator Error:', error);
    return res.status(500).json({ error: formatAiError(error) });
  }
});

// 8. AI Social Media Captions & Hashtags
app.post('/api/ai/social-captions', requireAiQuota, async (req: Request, res: Response) => {
  try {
    const { businessName, productOrOffer, platform = 'instagram' } = req.body;
    const prompt = `Generate viral, high-converting social media marketing posts for ${platform.toUpperCase()}:
Brand: "${businessName}"
Focus / Promotion: "${productOrOffer}"
Target Audience: Discerning buyers seeking luxury and quality.

Output JSON:
{
  "caption1": "Compelling story-driven caption with emojis and call to action",
  "caption2": "Short snappy promotional punchy caption",
  "hashtags": ["15 relevant viral hashtags including niche and regional"],
  "callToAction": "Direct instruction (e.g. DM to order, click bio link)"
}`;
    const response = await callGemini(prompt, { responseMimeType: 'application/json' });
    const data = safeParseJson(response.text || '{}');
    return res.json({ success: true, data, quota: (req as any).aiQuota });
  } catch (error: any) {
    return res.status(500).json({ error: formatAiError(error) });
  }
});

// 9. AI Email Marketing Campaign
app.post('/api/ai/email-campaign', requireAiQuota, async (req: Request, res: Response) => {
  try {
    const { businessName, goal, targetAudience } = req.body;
    const prompt = `Write an email marketing newsletter for:
Business: "${businessName}"
Campaign Goal: "${goal || 'VIP Customer Exclusive Preview'}"
Target: "${targetAudience || 'Loyal customers'}"

Output JSON:
{
  "subjectLine": "Irresistible open-rate subject line",
  "previewText": "Pre-header preview text snippet",
  "bodyHtml": "Structured text body with greeting, value offer, urgency hook, and sign-off",
  "buttonText": "Clear primary CTA button text"
}`;
    const response = await callGemini(prompt, { responseMimeType: 'application/json' });
    const data = safeParseJson(response.text || '{}');
    return res.json({ success: true, data, quota: (req as any).aiQuota });
  } catch (error: any) {
    return res.status(500).json({ error: formatAiError(error) });
  }
});

// 10. AI Business Name & Tagline Creator
app.post('/api/ai/business-names', requireAiQuota, async (req: Request, res: Response) => {
  try {
    const { industry, keywords, style = 'luxury' } = req.body;
    const prompt = `Generate 5 memorable brand names and matching taglines for a business in:
Industry: "${industry}"
Keywords: "${keywords}"
Vibe: "${style}"

Output JSON:
{
  "suggestions": [
    {"name": "Brand Name", "tagline": "Prestigious tagline", "rationale": "Why this works"}
  ]
}`;
    const response = await callGemini(prompt, { responseMimeType: 'application/json' });
    const data = safeParseJson(response.text || '{}');
    return res.json({ success: true, data, quota: (req as any).aiQuota });
  } catch (error: any) {
    return res.status(500).json({ error: formatAiError(error) });
  }
});

// 11. AI Category Suggester
app.post('/api/ai/category-suggester', requireAiQuota, async (req: Request, res: Response) => {
  try {
    const { businessType, sampleProducts } = req.body;
    const prompt = `Recommend optimized e-commerce category taxonomy for:
Type: "${businessType}"
Samples: "${sampleProducts}"

Output JSON:
{
  "categories": [
    {"name": "Category Name", "suggestedSubcategories": ["Sub 1", "Sub 2"]}
  ]
}`;
    const response = await callGemini(prompt, { responseMimeType: 'application/json' });
    const data = safeParseJson(response.text || '{}');
    return res.json({ success: true, data, quota: (req as any).aiQuota });
  } catch (error: any) {
    return res.status(500).json({ error: formatAiError(error) });
  }
});

// 12. AI Proposal Content Generator
app.post('/api/ai/proposal-generator', requireAiQuota, async (req: Request, res: Response) => {
  try {
    const { clientName, projectScope, totalBudget } = req.body;
    const prompt = `Write an executive project proposal for:
Client: "${clientName}"
Scope: "${projectScope}"
Budget: "${totalBudget}"

Output JSON:
{
  "executiveSummary": "Compelling summary paragraph",
  "keyDeliverables": ["Deliverable 1", "Deliverable 2", "Deliverable 3"],
  "timelineWeeks": 4,
  "paymentMilestones": ["50% Advance on signing", "30% Upon beta demo", "20% Final handover"],
  "termsSummary": "Standard high-level engagement terms"
}`;
    const response = await callGemini(prompt, { responseMimeType: 'application/json' });
    const data = safeParseJson(response.text || '{}');
    return res.json({ success: true, data, quota: (req as any).aiQuota });
  } catch (error: any) {
    return res.status(500).json({ error: formatAiError(error) });
  }
});

// 13. AI Analytics Explainer
app.post('/api/ai/analytics-explainer', requireAiQuota, async (req: Request, res: Response) => {
  try {
    const { metricsSummary } = req.body;
    const prompt = `Analyze these e-commerce & retail business metrics:
${JSON.stringify(metricsSummary)}

Output JSON:
{
  "keyInsight": "Primary executive insight",
  "strengths": ["Strength 1", "Strength 2"],
  "opportunities": ["Growth action 1", "Growth action 2"],
  "recommendedAction": "Top priority action for the merchant this week"
}`;
    const response = await callGemini(prompt, { responseMimeType: 'application/json' });
    const data = safeParseJson(response.text || '{}');
    return res.json({ success: true, data, quota: (req as any).aiQuota });
  } catch (error: any) {
    return res.status(500).json({ error: formatAiError(error) });
  }
});

// 14. AI WhatsApp Order Message Formatter
app.post('/api/ai/whatsapp-formatter', requireAiQuota, async (req: Request, res: Response) => {
  try {
    const { orderDetails, customerName } = req.body;
    const prompt = `Format a WhatsApp order confirmation notification message:
Customer: "${customerName}"
Order: "${JSON.stringify(orderDetails)}"

Output JSON:
{
  "messageText": "WhatsApp formatted message with bold asterisks, bullet points, tracking link placeholder, and contact line"
}`;
    const response = await callGemini(prompt, { responseMimeType: 'application/json' });
    const data = safeParseJson(response.text || '{}');
    return res.json({ success: true, data, quota: (req as any).aiQuota });
  } catch (error: any) {
    return res.status(500).json({ error: formatAiError(error) });
  }
});

// 15. AI SMS Notification & OTP Copywriter
app.post('/api/ai/sms-copywriter', requireAiQuota, async (req: Request, res: Response) => {
  try {
    const { brandName, eventType } = req.body;
    const prompt = `Draft 3 compliant 160-character DLT SMS templates for:
Brand: "${brandName}"
Event: "${eventType || 'Order Dispatch / OTP'}"

Output JSON:
{
  "smsTemplates": [
    {"label": "OTP Verification", "text": "Your {brandName} verification code is 1234. Valid for 10 mins. Do not share with anyone."},
    {"label": "Order Dispatched", "text": "Your order {orderNo} is out for delivery with our rider! Track live at {url}. Vijay Visuals"},
    {"label": "Delivered", "text": "Your order {orderNo} has been delivered successfully. Thank you for shopping with {brandName}."}
  ]
}`;
    const response = await callGemini(prompt, { responseMimeType: 'application/json' });
    const data = safeParseJson(response.text || '{}');
    return res.json({ success: true, data, quota: (req as any).aiQuota });
  } catch (error: any) {
    return res.status(500).json({ error: formatAiError(error) });
  }
});

// Usage Limits & Stats
app.get('/api/ai/usage-stats', (req: Request, res: Response) => {
  const tenantId = (req.query?.tenantId as string) || 'default-tenant';
  const tenant = usageStore[tenantId] || { requestsCount: 0, dailyLimit: 50, lastReset: new Date().toISOString() };
  return res.json({
    tenantId,
    usage: tenant,
    totalTenantsActive: Object.keys(usageStore).length,
    allUsage: usageStore,
  });
});

app.post('/api/ai/admin/update-quota', (req: Request, res: Response) => {
  const { tenantId, dailyLimit } = req.body;
  if (!tenantId || typeof dailyLimit !== 'number') {
    return res.status(400).json({ error: 'tenantId and dailyLimit (number) required.' });
  }
  if (!usageStore[tenantId]) {
    usageStore[tenantId] = { requestsCount: 0, dailyLimit, lastReset: new Date().toISOString() };
  } else {
    usageStore[tenantId].dailyLimit = dailyLimit;
  }
  return res.json({ success: true, updated: usageStore[tenantId] });
});

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    hasGeminiKey: Boolean(apiKey),
    serverTime: new Date().toISOString(),
  });
});

// ============================================================================
// MOUNT VITE MIDDLEWARES (Dev) OR STATIC BUILD (Prod)
// ============================================================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[VIJAY VISUALS Full-Stack Server] running on http://0.0.0.0:${port}`);
  });
}

startServer();
