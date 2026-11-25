// ============================================================================
// POST /api/owner/tenants/:tenantId/ai-assistant — Live Grounded Q&A Assistant
// Answers business queries grounded strictly in the tenant's real D1 data.
// Enforces server-side credit limits and records to tenant_ai_usage ledger.
// ============================================================================

import { requireUser } from '../../../_auth';
import {
  PagesContext,
  callGeminiEdge,
  checkRateLimit,
  formatAiError,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from '../../../_shared';
import { requireAuthorizedAiTenant } from '../../../_aiTenantAccess';
import { executeWithAiCreditDeduction } from '../../../_aiCredits';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireAuthorizedAiTenant(env, auth.user, params.tenantId);
  if (!access.ok) return access.response;

  const rl = await checkRateLimit(env, `ai_asst:${auth.user.id}`, 30, 3600);
  if (!rl.allowed) {
    return jsonResponse(
      { error: 'Hourly AI Assistant request limit reached. Please try again later.' },
      429
    );
  }

  const body = await parseJsonBody<{ question?: string; language?: string; requestId?: string }>(request);
  const question = sanitizeText(body?.question, 1000);
  const language = sanitizeText(body?.language || 'en', 20);

  if (!question) {
    return jsonResponse({ error: 'Question is required.' }, 400);
  }

  const { row, parsed } = access;
  const websiteId = row.website_id;

  // Gather live business facts from D1
  let totalRevenue = 0;
  let orderCount = 0;
  let pendingOrders = 0;
  let lowStockProducts: Array<{ name: string; stock: number }> = [];
  let productCount = 0;
  let appointmentsCount = 0;

  if (env.DB) {
    try {
      const ordersRes = await env.DB.prepare(
        `SELECT total_inr, order_status FROM store_orders WHERE website_id = ?`
      )
        .bind(websiteId)
        .all<{ total_inr: number; order_status: string }>();

      for (const o of ordersRes.results || []) {
        orderCount++;
        const status = String(o.order_status || '').toLowerCase();
        if (!['cancelled', 'returned'].includes(status)) {
          totalRevenue += Number(o.total_inr || 0);
        }
        if (!['delivered', 'cancelled', 'returned'].includes(status)) {
          pendingOrders++;
        }
      }
    } catch {}

    try {
      const prodRes = await env.DB.prepare(
        `SELECT name, stock_qty, low_stock_threshold FROM store_products WHERE website_id = ?`
      )
        .bind(websiteId)
        .all<{ name: string; stock_qty: number; low_stock_threshold: number }>();

      productCount = (prodRes.results || []).length;
      for (const p of prodRes.results || []) {
        if (Number(p.stock_qty || 0) <= Number(p.low_stock_threshold || 5)) {
          lowStockProducts.push({ name: p.name, stock: Number(p.stock_qty || 0) });
        }
      }
    } catch {}

    try {
      const apptRes = await env.DB.prepare(
        `SELECT COUNT(*) as count FROM appointments WHERE website_id = ? AND status = 'confirmed'`
      )
        .bind(websiteId)
        .first<{ count: number }>();
      appointmentsCount = apptRes?.count || 0;
    } catch {}
  }

  const lowStockSummary =
    lowStockProducts.length > 0
      ? lowStockProducts.map((p) => `${p.name} (stock: ${p.stock})`).join(', ')
      : 'None (all products have healthy stock)';

  const groundedContext = `
BUSINESS IDENTITY & LIVE METRICS:
- Business Name: ${row.business_name || row.public_slug}
- Category: ${parsed.category || 'Retail/Commerce'}
- Website Slug: /site/${row.public_slug}
- Status: ${row.status}
- Total Revenue to Date: ₹${totalRevenue.toLocaleString('en-IN')}
- Total Orders Placed: ${orderCount}
- Pending Orders Requiring Action: ${pendingOrders}
- Total Products in Catalog: ${productCount}
- Items with Low Stock: ${lowStockSummary}
- Confirmed Appointments: ${appointmentsCount}
`;

  const langInstruction =
    language === 'te'
      ? 'Answer in natural Telugu (Telangana/Andhra conversational business style).'
      : language === 'hi'
      ? 'Answer in clear, polite Hindi with accurate numbers.'
      : 'Answer in clear, concise, professional English.';

  const systemInstruction = `You are the Vijay Visuals Business AI Assistant. You answer questions for the business owner of "${row.business_name || row.public_slug}".
Use STRICTLY the live metrics provided below. Do not fabricate order numbers, revenues, or inventory that do not exist.
If the owner asks about an aspect not covered in the data, explain honestly what the live metrics show.
${langInstruction}`;

  const prompt = `${groundedContext}

Owner Question: "${question}"

Provide a direct, practical, and helpful answer for the business owner:`;

  try {
    const result = await executeWithAiCreditDeduction(env, {
      websiteId,
      tenantRowId: row.rowid ? Number(row.rowid) : undefined,
      userId: auth.user.id,
      serviceSlug: 'owner-ai-assistant',
      requestId: body?.requestId,
      creditsNeeded: 1,
      fallbackPlanTier: parsed.planTier,
      promptSnippet: `Assistant: ${question.slice(0, 80)}`,
      executeAiCall: async () => {
        const hasKey = Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
        if (!hasKey) {
          let fallback = `Based on your live store data for ${row.business_name || row.public_slug}:\n`;
          fallback += `• Total Revenue: ₹${totalRevenue.toLocaleString('en-IN')} across ${orderCount} orders (${pendingOrders} pending fulfillment).\n`;
          fallback += `• Catalog Health: ${productCount} products listed. Low stock items: ${lowStockSummary}.\n`;
          if (appointmentsCount > 0) {
            fallback += `• Bookings: ${appointmentsCount} confirmed appointments scheduled.\n`;
          }
          return fallback;
        }
        return callGeminiEdge(prompt, env, { systemInstruction });
      },
    });

    return jsonResponse({
      answer: result.output,
      text: result.output,
      creditsUsed: result.creditsUsed,
      creditsRemaining: result.creditsRemaining,
      isDuplicate: result.isDuplicate,
      quota: result.quota,
    });
  } catch (err: any) {
    if (err?.status === 403 || err?.code === 'AI_QUOTA_EXHAUSTED') {
      return jsonResponse(
        {
          error: err.message,
          code: 'AI_QUOTA_EXHAUSTED',
          quota: err.quota,
        },
        403
      );
    }
    return jsonResponse({ error: formatAiError(err) }, 502);
  }
}
