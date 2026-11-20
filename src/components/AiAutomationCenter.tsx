import React, { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Check,
  Play,
  Plus,
  ShieldAlert,
  Sparkles,
  Workflow,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Lang, SUPPORTED_LANGUAGES } from '../data/content';
import {
  AutomationLogRecord,
  AutomationWorkflowRecord,
  TenantRecord,
} from '../types/platform';

interface AiAutomationCenterProps {
  lang: Lang;
  onGoBuilder: () => void;
  onNotify: (msg: string) => void;
}

export const AiAutomationCenter: React.FC<AiAutomationCenterProps> = ({
  lang,
  onGoBuilder,
  onNotify,
}) => {
  const { profile, ownedTenants, signInWithGoogle } = useAuth();
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [tenant, setTenant] = useState<TenantRecord | null>(null);
  const [workflows, setWorkflows] = useState<AutomationWorkflowRecord[]>([]);
  const [logs, setLogs] = useState<AutomationLogRecord[]>([]);
  const [integrations, setIntegrations] = useState<Record<string, boolean>>({});

  // Gemini AI Studio Tool State (Modules 8 & 10)
  const [aiTask, setAiTask] = useState<
    | 'product_description'
    | 'marketing_campaign'
    | 'sales_forecast'
    | 'business_assistant'
    | 'support_chat'
    | 'seo_metadata'
    | 'blog_article'
    | 'ad_campaign'
    | 'poster_brief'
  >('sales_forecast');
  const [aiLang, setAiLang] = useState<Lang>(lang);
  const [aiPrompt, setAiPrompt] = useState(
    'Forecast next 30-day revenue, highlight low-stock items, and recommend 2 high-margin festive offers.'
  );
  const [aiOutput, setAiOutput] = useState('');
  const [aiRunning, setAiRunning] = useState(false);

  // Workflow Builder State
  const [wfName, setWfName] = useState('');
  const [wfTrigger, setWfTrigger] = useState('abandoned_cart');
  const [wfCondition, setWfCondition] = useState('Cart value > ₹1,000 and customer consented');
  const [wfAction, setWfAction] = useState('whatsapp_template');
  const [wfSchedule, setWfSchedule] = useState('Every 2 Hours');
  const [wfApproval, setWfApproval] = useState(true);

  useEffect(() => {
    if (ownedTenants[0] && !selectedTenantId) {
      setSelectedTenantId(ownedTenants[0].id);
    }
  }, [ownedTenants, selectedTenantId]);

  const loadWorkspace = useCallback(async (tenantId: number) => {
    try {
      const [overview, health] = await Promise.all([
        apiFetch<{
          tenant: TenantRecord;
          workflows: AutomationWorkflowRecord[];
          logs: AutomationLogRecord[];
        }>(`/api/owner/tenants/${tenantId}/overview`),
        apiFetch<{ integrations: Record<string, boolean> }>('/api/health'),
      ]);
      setTenant(overview.tenant);
      setWorkflows(overview.workflows);
      setLogs(overview.logs);
      setIntegrations(health.integrations || {});
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load AI Automation Center.');
    }
  }, [onNotify]);

  useEffect(() => {
    if (profile && selectedTenantId) {
      loadWorkspace(selectedTenantId);
    }
  }, [profile, selectedTenantId, loadWorkspace]);

  const handleRunAiTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId || !aiPrompt.trim()) return;
    setAiRunning(true);
    setAiOutput('');
    try {
      if (aiTask === 'support_chat' && tenant) {
        const res = await apiFetch<{ reply: string }>('/api/ai/support-chat', {
          method: 'POST',
          body: JSON.stringify({
            tenantSlug: tenant.slug,
            message: aiPrompt.trim(),
            language: aiLang,
          }),
        });
        setAiOutput(res.reply);
        await loadWorkspace(selectedTenantId);
        onNotify('Storefront AI Support reply generated (1 credit used).');
      } else if (
        aiTask === 'seo_metadata' ||
        aiTask === 'blog_article' ||
        aiTask === 'ad_campaign' ||
        aiTask === 'poster_brief'
      ) {
        const res = await apiFetch<{ output: string; creditsUsed: number }>('/api/ai/content-studio', {
          method: 'POST',
          body: JSON.stringify({
            tenantId: selectedTenantId,
            mode: aiTask,
            topic: aiPrompt.trim(),
            language: aiLang,
          }),
        });
        setAiOutput(res.output);
        await loadWorkspace(selectedTenantId);
        onNotify(`AI Content Studio generated (${res.creditsUsed} credits used).`);
      } else {
        const res = await apiFetch<{ output: string; creditsUsed: number }>('/api/ai/generate', {
          method: 'POST',
          body: JSON.stringify({
            tenantId: selectedTenantId,
            task: aiTask,
            input: aiPrompt.trim(),
            language: aiLang,
          }),
        });
        setAiOutput(res.output);
        await loadWorkspace(selectedTenantId);
        onNotify(`Gemini AI response generated (${res.creditsUsed} credits used).`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gemini AI request failed.';
      setAiOutput(`Error: ${msg}`);
      onNotify(msg);
    } finally {
      setAiRunning(false);
    }
  };

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId || !wfName.trim()) return;
    try {
      await apiFetch(`/api/tenants/${selectedTenantId}/workflows`, {
        method: 'POST',
        body: JSON.stringify({
          name: wfName.trim(),
          triggerType: wfTrigger,
          conditionText: wfCondition.trim(),
          actionType: wfAction,
          requiresApproval: wfApproval,
          scheduleCron: wfSchedule.trim(),
        }),
      });
      setWfName('');
      await loadWorkspace(selectedTenantId);
      onNotify('Automation workflow saved.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save workflow.');
    }
  };

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="rounded-xl border border-[#242434] bg-[#0E0E15] p-8 space-y-4">
          <h1 className="font-luxury text-2xl font-bold text-white">AI Automation Center</h1>
          <p className="text-sm text-[#9E9EB2]">
            Sign in with Google to run Gemini-powered product copywriting, marketing campaigns, sales forecasting, and approval-gated business workflows.
          </p>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="px-6 py-3 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
          >
            Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  if (ownedTenants.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="rounded-xl border border-[#242434] bg-[#0E0E15] p-8 space-y-4">
          <h1 className="font-luxury text-2xl font-bold text-white">Create a Business First</h1>
          <p className="text-sm text-[#9E9EB2]">
            Publish a business website in the Website Builder so the AI Automation Center can analyze your real products, stock, and orders.
          </p>
          <button
            type="button"
            onClick={onGoBuilder}
            className="px-6 py-3 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
          >
            Open Website Builder
          </button>
        </div>
      </div>
    );
  }

  const pendingApprovals = logs.filter((l) => l.status === 'awaiting_approval');

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {/* Header & Tenant Selector */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#D4AF37] mb-1">
            Module 7 · Server-Side Gemini AI & Workflow Engine
          </p>
          <h1 className="font-luxury text-2xl md:text-3xl font-bold text-white">
            AI Automation Center
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedTenantId ?? ''}
            onChange={(e) => setSelectedTenantId(Number(e.target.value))}
            className="rounded-md border border-[#2A2A3A] bg-[#0D0D13] px-3 py-2 text-xs text-white"
          >
            {ownedTenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {tenant && (
            <div className="px-3.5 py-2 rounded-md border border-[#242434] bg-[#0D0D13] text-xs font-mono-tabular">
              AI Credits: <strong className="text-[#ECC86A]">{tenant.aiCreditsUsed}</strong> / {tenant.aiCreditsLimit}
            </div>
          )}
        </div>
      </div>

      {/* Gemini Live AI Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleRunAiTask}
          className="lg:col-span-5 rounded-xl border border-[#222230] bg-[#0D0D13] p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#D4AF37]" />
              <span>Gemini AI Generators & Analyst</span>
            </h2>
            <select
              aria-label="AI output language"
              value={aiLang}
              onChange={(e) => setAiLang(e.target.value as Lang)}
              className="rounded border border-[#282838] bg-[#09090D] px-2.5 py-1 text-[11px] text-[#ECC86A] focus:border-[#D4AF37] focus:outline-none"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName} ({l.englishName})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'sales_forecast', label: 'AI Sales Forecast', sample: 'Forecast next 30-day sales based on current orders and low-stock products.' },
              { id: 'product_description', label: 'Product Copywriter', sample: 'Handwoven Kanchipuram Silk Saree with antique gold border, ₹18,500.' },
              { id: 'marketing_campaign', label: 'Promo & Captions', sample: 'Ugadi & Wedding Season 15% Off WhatsApp and Instagram campaign.' },
              { id: 'business_assistant', label: 'AI Business Advisor', sample: 'How can I increase repeat orders and reduce COD returns for my store?' },
              { id: 'support_chat', label: 'Support Chatbot Test', sample: 'Do you offer Cash on Delivery and wholesale discounts?' },
              { id: 'seo_metadata', label: 'AI SEO & Meta Studio', sample: 'Rank higher for luxury bridal couture and handloom sarees in Hyderabad.' },
              { id: 'blog_article', label: 'AI Blog Writer', sample: '5 tips to style authentic Banarasi silk for destination weddings.' },
              { id: 'ad_campaign', label: 'Ad Campaigns', sample: 'Meta & Google Search ad campaign for festive collection launch.' },
              { id: 'poster_brief', label: 'Banner & Poster Brief', sample: 'Festive Mega Sale 20% Off banner & social media poster creative direction.' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setAiTask(item.id as typeof aiTask);
                  setAiPrompt(item.sample);
                }}
                className={`text-left px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
                  aiTask === item.id
                    ? 'border-[#D4AF37] bg-[#1B180E] text-[#ECC86A]'
                    : 'border-[#252534] bg-[#09090D] text-[#A5A5B8]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs text-[#9D9DB0] mb-1">Prompt / Product / Business Goal</label>
            <textarea
              rows={4}
              required
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2.5 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={aiRunning}
            className="w-full py-2.5 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
          >
            {aiRunning ? 'Running Server-Side Gemini AI...' : 'Run AI Generation (2 Credits)'}
          </button>
        </form>

        <div className="lg:col-span-7 rounded-xl border border-[#222230] bg-[#0D0D13] p-6 flex flex-col">
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-[#1E1E2B]">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#D4AF37]" />
              <span>Live Gemini AI Output</span>
            </h2>
            <span className="text-[11px] text-[#8E8EA2]">Grounded in PostgreSQL store data</span>
          </div>
          <div className="flex-1 min-h-[220px] rounded-lg border border-[#1E1E2A] bg-[#09090D] p-4 text-xs text-[#DDDDE8] whitespace-pre-wrap leading-relaxed overflow-y-auto">
            {aiRunning
              ? 'Analyzing your live catalog, stock levels, and order history via Gemini...'
              : aiOutput || 'Select an AI task on the left and click Run AI Generation to produce real output powered by Gemini.'}
          </div>
        </div>
      </div>

      {/* Workflow Builder + Approval Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 rounded-xl border border-[#222230] bg-[#0D0D13] p-6 space-y-5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Workflow className="w-4 h-4 text-[#D4AF37]" />
            <span>Workflow Builder (Trigger · Condition · Action · Approval)</span>
          </h2>

          <form onSubmit={handleCreateWorkflow} className="space-y-3 border-b border-[#1E1E2A] pb-5">
            <input
              type="text"
              required
              value={wfName}
              onChange={(e) => setWfName(e.target.value)}
              placeholder="Workflow name (e.g. Abandoned Cart Follow-up)"
              className="w-full rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={wfTrigger}
                onChange={(e) => setWfTrigger(e.target.value)}
                className="rounded-md border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-xs text-white"
              >
                <option value="order_created">Trigger: Order Created</option>
                <option value="order_status_changed">Trigger: Order Status Changed</option>
                <option value="low_stock">Trigger: Low Stock Alert</option>
                <option value="abandoned_cart">Trigger: Abandoned Cart</option>
                <option value="scheduled_daily">Trigger: Scheduled Cron</option>
                <option value="customer_followup">Trigger: Customer Follow-Up</option>
              </select>
              <select
                value={wfAction}
                onChange={(e) => setWfAction(e.target.value)}
                className="rounded-md border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-xs text-white"
              >
                <option value="generate_invoice">Action: Generate GST Invoice</option>
                <option value="low_stock_alert">Action: Send Low-Stock Alert</option>
                <option value="whatsapp_template">Action: WhatsApp Business Message</option>
                <option value="email_notification">Action: Automated Email</option>
                <option value="ai_campaign">Action: Generate AI Promo</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={wfCondition}
                onChange={(e) => setWfCondition(e.target.value)}
                placeholder="Condition"
                className="rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
              />
              <input
                type="text"
                value={wfSchedule}
                onChange={(e) => setWfSchedule(e.target.value)}
                placeholder="Schedule (e.g. 0 9 * * *)"
                className="rounded-md border border-[#2A2A38] bg-[#08080C] px-3 py-2 text-xs text-white"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-[#CFCFDA] cursor-pointer">
              <input
                type="checkbox"
                checked={wfApproval}
                onChange={(e) => setWfApproval(e.target.checked)}
                className="accent-[#D4AF37]"
              />
              <span>Require manual owner approval before executing sensitive action</span>
            </label>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Save Automation Rule</span>
            </button>
          </form>

          <div className="space-y-2.5">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                className="rounded-lg border border-[#20202E] bg-[#09090D] p-3.5 flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <p className="text-white font-semibold">{wf.name}</p>
                  <p className="text-[11px] text-[#8E8EA2] mt-0.5">
                    {wf.triggerType} → {wf.actionType} · {wf.scheduleCron || 'On Event'}
                    {wf.requiresApproval ? ' · Manual Approval Gate' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/workflows/${wf.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ enabled: !wf.enabled }),
                      });
                      await loadWorkspace(selectedTenantId!);
                      onNotify(`Workflow "${wf.name}" ${wf.enabled ? 'paused' : 'enabled'}.`);
                    }}
                    className={`px-2.5 py-1.5 rounded border text-[11px] font-medium ${
                      wf.enabled
                        ? 'border-emerald-500/40 text-emerald-300'
                        : 'border-[#2A2A38] text-[#8E8EA2]'
                    }`}
                  >
                    {wf.enabled ? 'Active' : 'Paused'}
                  </button>
                  <button
                    type="button"
                    disabled={!wf.enabled}
                    onClick={async () => {
                      await apiFetch(`/api/workflows/${wf.id}/run`, { method: 'POST' });
                      await loadWorkspace(selectedTenantId!);
                      onNotify(`Triggered "${wf.name}".`);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[#D4AF37]/40 text-[#ECC86A] hover:bg-[#19170E] disabled:opacity-40"
                  >
                    <Play className="w-3 h-3" />
                    <span>Run</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Manual Approval Queue + Execution Logs + Integration Transparency */}
        <div className="lg:col-span-6 space-y-6">
          <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-6 space-y-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Manual Approval Queue ({pendingApprovals.length})</span>
            </h2>
            {pendingApprovals.length === 0 ? (
              <p className="text-xs text-[#8E8EA2]">No sensitive automation actions awaiting approval.</p>
            ) : (
              <div className="space-y-2.5">
                {pendingApprovals.map((log) => (
                  <div key={log.id} className="rounded-lg border border-amber-500/30 bg-amber-950/15 p-3.5 text-xs space-y-2">
                    <p className="text-white">{log.summary}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/automation-logs/${log.id}/decision`, {
                            method: 'PATCH',
                            body: JSON.stringify({ decision: 'approved' }),
                          });
                          await loadWorkspace(selectedTenantId!);
                          onNotify('Action approved.');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded bg-emerald-600 text-white font-semibold"
                      >
                        <Check className="w-3 h-3" />
                        <span>Approve</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/automation-logs/${log.id}/decision`, {
                            method: 'PATCH',
                            body: JSON.stringify({ decision: 'rejected' }),
                          });
                          await loadWorkspace(selectedTenantId!);
                          onNotify('Action rejected.');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded border border-rose-500/40 text-rose-300"
                      >
                        <X className="w-3 h-3" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-6 space-y-3">
            <h2 className="text-sm font-semibold text-white">Automation History & Logs</h2>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1 text-xs">
              {logs.map((l) => (
                <div key={l.id} className="rounded border border-[#1E1E2A] bg-[#09090D] p-3">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="font-mono-tabular text-[#ECC86A]">{l.eventType}</span>
                    <span className="capitalize text-[#9A9AAE]">{l.status.replace('_', ' ')}</span>
                  </div>
                  <p className="text-[#D4D4E0]">{l.summary}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Honest External Integrations Status */}
          <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 text-xs space-y-2">
            <h3 className="text-sm font-semibold text-white mb-2">Production Connector Status</h3>
            {[
              { key: 'postgresql', label: 'Cloud SQL PostgreSQL Multi-Tenant DB', active: integrations.postgresql },
              { key: 'geminiAi', label: 'Server-Side Gemini AI Engine', active: integrations.geminiAi },
              { key: 'razorpayGateway', label: 'Razorpay / Card Webhook Settlement (External Keys)', active: integrations.razorpayGateway },
              { key: 'whatsappCloudApi', label: 'WhatsApp Business Cloud API (External Token)', active: integrations.whatsappCloudApi },
              { key: 'smtpEmail', label: 'SMTP Transactional Email Relay (External Credentials)', active: integrations.smtpEmail },
            ].map((item) => (
              <div key={item.key} className="flex justify-between py-1.5 border-b border-[#1A1A26] last:border-0">
                <span className="text-[#B8B8C8]">{item.label}</span>
                <span className={item.active ? 'text-emerald-400 font-medium' : 'text-amber-300'}>
                  {item.active ? 'Connected' : 'Requires External Credentials'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
