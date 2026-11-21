import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { ReviewRecord } from '../types/platform';

interface AdminReviewsModerationProps {
  onNotify: (msg: string) => void;
}

export function AdminReviewsModeration({ onNotify }: AdminReviewsModerationProps) {
  const [loading, setLoading] = useState(false);
  const [reviews, setReviews] = useState<Array<ReviewRecord & { business_name?: string }>>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'flagged' | 'hidden' | 'published'>('flagged');
  const [searchQuery, setSearchQuery] = useState('');

  // Moderation action modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<(ReviewRecord & { business_name?: string }) | null>(null);
  const [decision, setDecision] = useState<'published' | 'hidden' | 'removed'>('published');
  const [moderationReason, setModerationReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadModerationQueue = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        reviews: Array<ReviewRecord & { business_name?: string }>;
      }>('/api/platform/reviews?includeModerated=true');

      setReviews(Array.isArray(res.reviews) ? res.reviews : []);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load moderation queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModerationQueue();
  }, []);

  const openDecisionModal = (
    rev: ReviewRecord & { business_name?: string },
    actionDecision: 'published' | 'hidden' | 'removed'
  ) => {
    setSelectedReview(rev);
    setDecision(actionDecision);
    setModerationReason('');
    setModalOpen(true);
  };

  const handleExecuteModeration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReview || moderationReason.trim().length < 5) {
      onNotify('A moderation audit reason of at least 5 characters is mandatory.');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/platform/reviews', {
        method: 'POST',
        body: {
          action: 'moderate',
          reviewId: selectedReview.id,
          decision,
          reason: moderationReason.trim(),
        },
      });

      setReviews((prev) =>
        prev
          .map((r) =>
            r.id === selectedReview.id
              ? {
                  ...r,
                  moderationStatus: decision,
                  lastReportReason: decision === 'published' ? '' : r.lastReportReason,
                }
              : r
          )
          .filter((r) => (decision === 'removed' ? r.id !== selectedReview.id : true))
      );

      setModalOpen(false);
      setSelectedReview(null);
      setModerationReason('');
      onNotify(`Review moderation decision "${decision}" recorded with security audit log.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to execute moderation decision.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      if (filterStatus === 'flagged' && r.moderationStatus !== 'flagged') return false;
      if (filterStatus === 'hidden' && r.moderationStatus !== 'hidden') return false;
      if (filterStatus === 'published' && r.moderationStatus !== 'published') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCustomer = (r.customerName || '').toLowerCase().includes(q);
        const matchComment = (r.comment || '').toLowerCase().includes(q);
        const matchBusiness = (r.business_name || '').toLowerCase().includes(q);
        const matchProduct = (r.productName || '').toLowerCase().includes(q);
        if (!matchCustomer && !matchComment && !matchBusiness && !matchProduct) return false;
      }
      return true;
    });
  }, [reviews, filterStatus, searchQuery]);

  const flaggedCount = reviews.filter((r) => r.moderationStatus === 'flagged').length;
  const hiddenCount = reviews.filter((r) => r.moderationStatus === 'hidden').length;

  return (
    <div className="space-y-5 text-xs text-white">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#20202E] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <h2 className="font-luxury text-lg font-bold text-white">
              Global Customer Review Moderation Queue
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
              Super Admin Authority
            </span>
          </div>
          <p className="text-[#8E8EA2] mt-0.5">
            Audit reported and flagged customer reviews across all published business websites. Every decision is permanently logged to platform audit logs.
          </p>
        </div>

        <button
          type="button"
          onClick={loadModerationQueue}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181824] hover:bg-[#202030] text-[#A5A5B8] hover:text-white border border-[#2A2A3E] transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 rounded-xl border border-[#20202E] bg-[#0E0E14] p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[#8E8EA2] flex items-center gap-1 pl-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter Status:</span>
          </span>

          {[
            { id: 'flagged', label: `Flagged (${flaggedCount})` },
            { id: 'hidden', label: `Hidden (${hiddenCount})` },
            { id: 'published', label: 'Published' },
            { id: 'all', label: `All (${reviews.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id as typeof filterStatus)}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                filterStatus === tab.id
                  ? 'bg-[#D4AF37] text-[#08080A]'
                  : 'bg-[#161622] text-[#A5A5B8] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#6E6E82] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer, text, or business..."
            className="w-full md:w-64 rounded-md border border-[#252538] bg-[#161622] pl-8 pr-3 py-1 text-xs text-white placeholder-[#6E6E82] focus:border-[#D4AF37] focus:outline-none"
          />
        </div>
      </div>

      {/* Reviews Queue */}
      {filteredReviews.length === 0 ? (
        <div className="rounded-xl border border-[#20202E] bg-[#0D0D14] p-10 text-center space-y-2">
          <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto" />
          <p className="font-semibold text-white">No reviews in this moderation filter</p>
          <p className="text-xs text-[#8E8EA2]">All reported reviews have been resolved.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReviews.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border p-4 space-y-3 transition-colors ${
                r.moderationStatus === 'flagged'
                  ? 'border-amber-500/40 bg-[#16140D]'
                  : r.moderationStatus === 'hidden'
                  ? 'border-red-500/30 bg-[#140E0E]'
                  : 'border-[#20202E] bg-[#0D0D14]'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm">
                      {r.business_name || 'Business Tenant'}
                    </span>
                    <span className="text-[#8E8EA2]">·</span>
                    <span className="font-semibold text-white">{r.customerName}</span>

                    {r.verifiedPurchase && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        Verified Purchase
                      </span>
                    )}

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                        r.moderationStatus === 'flagged'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : r.moderationStatus === 'hidden'
                          ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {r.moderationStatus || 'published'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center text-[#ECC86A]">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3.5 h-3.5 ${
                            s <= r.rating ? 'fill-[#ECC86A] text-[#ECC86A]' : 'text-[#3E3E52]'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] text-[#8E8EA2]">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN') : ''}
                    </span>
                    {r.productName && (
                      <span className="text-[11px] text-[#ECC86A]">
                        Item: {r.productName}
                      </span>
                    )}
                  </div>
                </div>

                {/* Super Admin Action Buttons */}
                <div className="flex items-center gap-2 self-end sm:self-auto text-xs shrink-0">
                  {r.moderationStatus !== 'published' && (
                    <button
                      type="button"
                      onClick={() => openDecisionModal(r, 'published')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve / Publish</span>
                    </button>
                  )}

                  {r.moderationStatus !== 'hidden' && (
                    <button
                      type="button"
                      onClick={() => openDecisionModal(r, 'hidden')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#252538] hover:bg-[#32324A] text-amber-300 border border-amber-500/30"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Hide from Site</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openDecisionModal(r, 'removed')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-950 hover:bg-red-900 text-red-300 border border-red-500/30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>

              {/* Reported Reason Badge */}
              {r.lastReportReason && (
                <div className="rounded-lg bg-amber-500/15 border border-amber-500/30 p-2.5 text-[11px] text-amber-200 space-y-0.5">
                  <p className="font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Reported Reason ({r.reportedCount || 1} report):
                  </p>
                  <p className="pl-4">{r.lastReportReason}</p>
                </div>
              )}

              {/* Review Text */}
              <div className="space-y-1">
                {r.title && <p className="font-semibold text-white">{r.title}</p>}
                <p className="text-[#C8C8DC] leading-relaxed whitespace-pre-wrap">{r.comment}</p>
              </div>

              {/* Photos */}
              {r.photos && r.photos.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {r.photos.map((ph, idx) => (
                    <a
                      key={idx}
                      href={ph.photoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg overflow-hidden border border-[#252538] w-14 h-14 shrink-0 block"
                    >
                      <img src={ph.photoUrl} alt="Review photo" className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Moderation Decision Modal */}
      {modalOpen && selectedReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#2D2D42] bg-[#0F0F17] p-6 space-y-4 text-xs text-white">
            <div className="flex items-center justify-between border-b border-[#202030] pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="font-semibold text-sm text-white">
                  Execute Moderation Decision: <span className="uppercase text-[#ECC86A]">{decision}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-[#8E8EA2] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[#A5A5B8]">
              Target: <strong className="text-white">{selectedReview.customerName}</strong> on{' '}
              <strong className="text-white">{selectedReview.business_name || 'Business'}</strong>
            </p>

            <form onSubmit={handleExecuteModeration} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white">
                  Mandatory Audit Log Reason * (5+ chars)
                </label>
                <textarea
                  rows={3}
                  required
                  value={moderationReason}
                  onChange={(e) => setModerationReason(e.target.value)}
                  placeholder="State the regulatory, factual, or platform policy justification for this moderation decision..."
                  className="w-full rounded-lg border border-[#29293E] bg-[#14141E] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#181824] text-[#A5A5B8]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || moderationReason.trim().length < 5}
                  className={`px-4 py-1.5 rounded-lg font-bold text-white disabled:opacity-50 ${
                    decision === 'published'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : decision === 'hidden'
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : 'bg-red-600 hover:bg-red-500'
                  }`}
                >
                  {submitting ? 'Executing...' : `Confirm ${decision.toUpperCase()}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
