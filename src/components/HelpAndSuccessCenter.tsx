import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  MessageSquarePlus,
  Search,
  Star,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface HelpCenterData {
  serviceStatus: {
    overall: string;
    checkedAt: string;
    database: { status: string; latencyMs: number; engine: string };
    apiRateLimiting: { status: string; limitPerMinute: number };
    integrations: Array<{ name: string; status: string; requiredFor: string }>;
  };
  transparentCostBreakdown: Array<{ item: string; billing: string; ownerCostNote: string }>;
  tutorials: Array<{ id: string; category: string; title: string; duration: string; steps: string[] }>;
  faqs: Array<{ q: string; a: string }>;
}

interface FeedbackItem {
  id: number;
  authorName: string;
  feedbackType: string;
  rating: number;
  title: string;
  message: string;
  status: string;
  createdAt: string;
}

interface HelpAndSuccessCenterProps {
  tenantId?: number | null;
  onNotify: (msg: string) => void;
}

export const HelpAndSuccessCenter: React.FC<HelpAndSuccessCenterProps> = ({ tenantId, onNotify }) => {
  const [data, setData] = useState<HelpCenterData | null>(null);
  const [search, setSearch] = useState('');
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [avgRating, setAvgRating] = useState(0);

  const [fbType, setFbType] = useState<'feedback' | 'feature_request'>('feedback');
  const [fbRating, setFbRating] = useState(5);
  const [fbTitle, setFbTitle] = useState('');
  const [fbMessage, setFbMessage] = useState('');
  const [submittingFb, setSubmittingFb] = useState(false);

  const loadHelp = useCallback(async () => {
    try {
      const [helpRes, fbRes] = await Promise.all([
        apiFetch<HelpCenterData>('/api/help-center'),
        apiFetch<{ feedback: FeedbackItem[]; summary: { averageRating: number } }>('/api/feedback'),
      ]);
      setData(helpRes);
      setFeedbackList(fbRes.feedback || []);
      setAvgRating(fbRes.summary?.averageRating || 0);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load Help Centre.');
    }
  }, [onNotify]);

  useEffect(() => {
    loadHelp();
  }, [loadHelp]);

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbTitle.trim() || !fbMessage.trim()) return;
    setSubmittingFb(true);
    try {
      await apiFetch('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: tenantId ?? null,
          feedbackType: fbType,
          rating: fbRating,
          title: fbTitle.trim(),
          message: fbMessage.trim(),
        }),
      });
      setFbTitle('');
      setFbMessage('');
      await loadHelp();
      onNotify('Thank you! Your feedback has been saved.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to submit feedback.');
    } finally {
      setSubmittingFb(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filteredTutorials = (data?.tutorials || []).filter(
    (t) => !q || t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || t.steps.some((s) => s.toLowerCase().includes(q))
  );
  const filteredFaqs = (data?.faqs || []).filter(
    (f) => !q || f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)
  );

  return (
    <div className="space-y-6">
      {/* Searchable Help Centre Header */}
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[#D4AF37]">Modules 13, 15, 16 & 17 · Customer Success & Transparency</p>
            <h2 className="font-luxury text-xl font-bold text-white mt-0.5">
              Help Centre, Live System Status & Transparent Costs
            </h2>
          </div>
          {data && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-emerald-500/40 bg-emerald-950/20 text-xs text-emerald-300">
              <Activity className="w-3.5 h-3.5" />
              <span>
                {data.serviceStatus.overall.toUpperCase()} · DB {data.serviceStatus.database.latencyMs}ms
              </span>
            </span>
          )}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-[#8E8EA2] absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tutorials, FAQs, domain setup, GST reports, backup or payments..."
            className="w-full rounded-md border border-[#2A2A3A] bg-[#08080C] pl-9 pr-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
          />
        </div>
      </div>

      {/* Guided Tutorials & FAQs */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#D4AF37]" />
            <span>Guided Business Tutorials</span>
          </h3>
          <div className="space-y-3">
            {filteredTutorials.map((tut) => (
              <div key={tut.id} className="rounded-lg border border-[#1E1E2B] bg-[#09090D] p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase text-[#ECC86A]">{tut.category}</span>
                  <span className="text-[10px] text-[#8E8EA2]">{tut.duration}</span>
                </div>
                <p className="text-xs font-semibold text-white">{tut.title}</p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-[#A9A9BC]">
                  {tut.steps.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[#D4AF37]" />
            <span>Frequently Asked Questions</span>
          </h3>
          <div className="space-y-3">
            {filteredFaqs.map((faq, idx) => (
              <div key={idx} className="rounded-lg border border-[#1E1E2B] bg-[#09090D] p-3.5">
                <p className="text-xs font-semibold text-white">{faq.q}</p>
                <p className="text-[11px] text-[#A4A4B8] mt-1.5 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Module 16: Transparent Cost Breakdown (No Unlimited Claims) */}
      {data && (
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">Module 16 · Transparent Infrastructure & Cost Breakdown</h3>
          <p className="text-xs text-[#9E9EB2]">
            Every platform fee and external third-party provider cost is listed separately. We never advertise “unlimited” hosting, storage, or AI where real provider quotas apply.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#1E1E2B] text-[#8E8EA2]">
                  <th className="py-2 pr-3">Cost Component</th>
                  <th className="py-2 pr-3">Billing Model</th>
                  <th className="py-2">Transparent Details</th>
                </tr>
              </thead>
              <tbody>
                {data.transparentCostBreakdown.map((row) => (
                  <tr key={row.item} className="border-b border-[#161620]">
                    <td className="py-2.5 pr-3 font-medium text-white whitespace-nowrap">{row.item}</td>
                    <td className="py-2.5 pr-3 text-[#ECC86A] whitespace-nowrap">{row.billing}</td>
                    <td className="py-2.5 text-[#A7A7BA]">{row.ownerCostNote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Live Service & External Integration Readiness Status */}
      {data && (
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">Live Service & External Integration Status</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.serviceStatus.integrations.map((intg) => {
              const ok = intg.status === 'configured';
              return (
                <div key={intg.name} className="rounded-lg border border-[#1E1E2B] bg-[#09090D] p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{intg.name}</span>
                    {ok ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Configured
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-300">
                        <XCircle className="w-3.5 h-3.5" />
                        Not Configured
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#8E8EA2]">{intg.requiredFor}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Customer Feedback, CSAT & Feature Requests */}
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <MessageSquarePlus className="w-4 h-4 text-[#D4AF37]" />
            <span>Customer Feedback & Feature Requests</span>
          </h3>
          {avgRating > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-[#ECC86A]">
              <Star className="w-3.5 h-3.5 fill-[#D4AF37]" />
              <span>CSAT {avgRating}/5 ({feedbackList.length} responses)</span>
            </span>
          )}
        </div>

        <form onSubmit={handleSubmitFeedback} className="grid sm:grid-cols-2 gap-3 text-xs">
          <select
            value={fbType}
            onChange={(e) => setFbType(e.target.value as 'feedback' | 'feature_request')}
            className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-3 py-2 text-white"
          >
            <option value="feedback">Customer Feedback / Satisfaction</option>
            <option value="feature_request">Feature Request</option>
          </select>
          <select
            value={fbRating}
            onChange={(e) => setFbRating(Number(e.target.value))}
            className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-3 py-2 text-white"
          >
            <option value={5}>5 Stars — Very Satisfied</option>
            <option value={4}>4 Stars — Satisfied</option>
            <option value={3}>3 Stars — Good</option>
            <option value={2}>2 Stars — Needs Improvement</option>
            <option value={1}>1 Star — Issue Reported</option>
          </select>
          <input
            type="text"
            required
            value={fbTitle}
            onChange={(e) => setFbTitle(e.target.value)}
            placeholder="Short title"
            className="sm:col-span-2 rounded-md border border-[#2A2A3A] bg-[#08080C] px-3 py-2 text-white"
          />
          <textarea
            rows={2}
            required
            value={fbMessage}
            onChange={(e) => setFbMessage(e.target.value)}
            placeholder="Share your feedback or request a new business tool..."
            className="sm:col-span-2 rounded-md border border-[#2A2A3A] bg-[#08080C] px-3 py-2 text-white"
          />
          <button
            type="submit"
            disabled={submittingFb}
            className="sm:col-span-2 py-2 rounded-md bg-gold-gradient text-[#08080A] font-semibold disabled:opacity-50"
          >
            {submittingFb ? 'Submitting...' : 'Submit Feedback / Feature Request'}
          </button>
        </form>

        {feedbackList.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-[#1E1E2B]">
            {feedbackList.slice(0, 6).map((fb) => (
              <div key={fb.id} className="rounded-lg border border-[#1B1B27] bg-[#09090D] p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">{fb.title}</span>
                  <span className="text-[10px] uppercase text-[#ECC86A]">
                    {fb.feedbackType.replace('_', ' ')} · {fb.rating}★
                  </span>
                </div>
                <p className="text-[11px] text-[#A2A2B6] mt-1">{fb.message}</p>
                <p className="text-[10px] text-[#7A7A8E] mt-1">By {fb.authorName}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
