import { GoogleGenAI, Type } from '@google/genai';

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add a valid key in Settings > Secrets.'
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

export async function generateAiText(params: {
  systemInstruction: string;
  prompt: string;
  jsonMode?: boolean;
}): Promise<string> {
  const ai = getGeminiClient();
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: params.prompt,
        config: {
          systemInstruction: params.systemInstruction,
          ...(params.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      });
      return (response.text ?? '').trim();
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || '');
      const isTransient = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429');
      if (isTransient && attempt === 0) {
        await new Promise((r) => setTimeout(r, 900));
        continue;
      }
      break;
    }
  }

  const rawMsg = String((lastError as any)?.message || 'AI service temporarily unavailable.');
  if (rawMsg.includes('503') || rawMsg.includes('UNAVAILABLE')) {
    throw new Error('Gemini AI is experiencing brief high demand. Please retry in a few seconds.');
  }
  throw lastError instanceof Error ? lastError : new Error(rawMsg);
}

export async function generateBusinessSetupDraft(params: {
  businessBrief: string;
  language: 'en' | 'te' | 'hi';
}): Promise<Record<string, unknown>> {
  const ai = getGeminiClient();
  const langLabel =
    params.language === 'te' ? 'Telugu' : params.language === 'hi' ? 'Hindi' : 'English';

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Create a complete, practical business website blueprint in ${langLabel} (keep slug and category id in lowercase English) for this business description:\n${params.businessBrief}`,
    config: {
      systemInstruction:
        'You are the Vijay Visuals AI Business Setup Assistant. Return clean structured JSON with realistic Indian INR pricing, luxury brand identity colors (dark obsidian surface + refined metallic accent), SEO metadata, 4 starter products/services, and 4 FAQs. Category must be one of: clothing, grocery, electronics, restaurant, hotel, photography, real_estate, education, beauty_salon, gym, travel, automobile, freelancer, professional_services, wholesale, other.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          slug: { type: Type.STRING },
          category: { type: Type.STRING },
          tagline: { type: Type.STRING },
          description: { type: Type.STRING },
          seoTitle: { type: Type.STRING },
          seoDescription: { type: Type.STRING },
          primaryColor: { type: Type.STRING },
          accentColor: { type: Type.STRING },
          logoText: { type: Type.STRING },
          categories: { type: Type.ARRAY, items: { type: Type.STRING } },
          starterProducts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                category: { type: Type.STRING },
                price: { type: Type.INTEGER },
                description: { type: Type.STRING },
              },
            },
          },
          faqs: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                q: { type: Type.STRING },
                a: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
  });

  const text = (response.text ?? '{}').trim();
  return JSON.parse(text);
}
