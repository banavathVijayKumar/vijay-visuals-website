import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  CornerDownRight,
  ExternalLink,
  Eye,
  Filter,
  Globe,
  Image as ImageIcon,
  MessageSquare,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Star,
  TrendingUp,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { ProductRecord, ReviewAnalytics, ReviewRecord, TenantRecord } from '../types/platform';

interface OwnerReviewsManagerProps {
  tenant: TenantRecord;
  products: ProductRecord[];
  onNotify: (msg: string) => void;
}

export function OwnerReviewsManager({
  tenant,
  products,
  onNotify,
}: OwnerReviewsManagerProps) {
  const [loading, setLoading] = useState(false);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [analytics, setAnalytics] = useState<ReviewAnalytics | null>(null);
  const [googleReviewsConfig, setGoogleReviewsConfig] = useState<{
    googleReviewUrl: string;
    googlePlaceId: string;
  }>({
    googleReviewUrl: tenant.googleReviewUrl || '',
    googlePlaceId: tenant.googlePlaceId || '',
  });
  const [savingGoogle, setSavingGoogle] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'flagged' | 'needs_reply' | 'verified'>('all');
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [productFilter, setProductFilter] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & form states
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<ReviewRecord | null>(null);
  const [replyText, setReplyText] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  const websiteId = tenant.websiteId || tenant.slug;

  const loadReviewsData = async () => {
    if (!websiteId) return;
    setLoading(true);
    try {
      const res = await apiFetch<{
        reviews: ReviewRecord[];
        analytics: ReviewAnalytics;
        googleReviews?: { googleReviewUrl: string; googlePlaceId: string };
      }>(`/api/platform/reviews?websiteId=${encodeURIComponent(websiteId)}&includeModerated=true&includeAnalytics=true`);

      setReviews(Array.isArray(res.reviews) ? res.reviews : []);
      if (res.analytics) setAnalytics(res.analytics);
      if (res.googleReviews) {
        setGoogleReviewsConfig({
          googleReviewUrl: res.googleReviews.googleReviewUrl || tenant.googleReviewUrl || '',
          googlePlaceId: res.googleReviews.googlePlaceId || tenant.googlePlaceId || '',
        });
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load reviews.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviewsData();
  }, [websiteId]);

  // Handle Save Google Reviews Config
  const handleSaveGoogleReviews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!websiteId) return;
    setSavingGoogle(true);
    try {
      await apiFetch('/api/platform/reviews', {
        method: 'POST',
        body: {
          action: 'update_google_reviews',
          websiteId,
          googleReviewUrl: googleReviewsConfig.googleReviewUrl.trim(),
          googlePlaceId: googleReviewsConfig.googlePlaceId.trim(),
        },
      });
      onNotify('Google Reviews integration settings saved successfully.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to update Google review settings.');
    } finally {
      setSavingGoogle(false);
    }
  };

  // Handle Submit Owner Reply
  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReview || replyText.trim().length < 2) {
      onNotify('Please write a reply of at least 2 characters.');
      return;
    }
    setSubmittingAction(true);
    try {
      await apiFetch('/api/platform/reviews', {
        method: 'POST',
        body: {
          action: 'owner_reply',
          reviewId: selectedReview.id,
          reply: replyText.trim(),
        },
      });

      setReviews((prev) =>
        prev.map((r) =>
          r.id === selectedReview.id
            ? {
                ...r,
                ownerReply: replyText.trim(),
                ownerRepliedAt: new Date().toISOString(),
              }
            : r
        )
      );
      setReplyModalOpen(false);
      setSelectedReview(null);
      setReplyText('');
      onNotify('Public response published to customer review.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to submit owner reply.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Report Review
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReview || reportReason.trim().length < 5) {
      onNotify('Please describe the issue in at least 5 characters.');
      return;
    }
    setSubmittingAction(true);
    try {
      await apiFetch('/api/platform/reviews', {
        method: 'POST',
        body: {
          action: 'report',
          reviewId: selectedReview.id,
          reason: reportReason.trim(),
        },
      });

      setReviews((prev) =>
        prev.map((r) =>
          r.id === selectedReview.id
            ? {
                ...r,
                moderationStatus: 'flagged',
                reportedCount: (r.reportedCount || 0) + 1,
                lastReportReason: reportReason.trim(),
              }
            : r
        )
      );
      setReportModalOpen(false);
      setSelectedReview(null);
      setReportReason('');
      onNotify('Review flagged and submitted to Super Admin moderation queue.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to report review.');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Filtered reviews
  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      if (statusFilter === 'published' && r.moderationStatus !== 'published') return false;
      if (statusFilter === 'flagged' && r.moderationStatus !== 'flagged') return false;
      if (statusFilter === 'needs_reply' && r.ownerReply) return false;
      if (statusFilter === 'verified' && !r.verifiedPurchase) return false;
      if (starFilter && Math.round(r.rating) !== starFilter) return false;
      if (productFilter !== null) {
        if (productFilter === 0 && r.productId !== 0 && r.productId !== null) return false;
        if (productFilter > 0 && r.productId !== productFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (r.customerName || '').toLowerCase().includes(q);
        const matchTitle = (r.title || '').toLowerCase().includes(q);
        const matchComment = (r.comment || '').toLowerCase().includes(q);
        const matchProduct = (r.productName || '').toLowerCase().includes(q);
        if (!matchName && !matchTitle && !matchComment && !matchProduct) return false;
      }
      return true;
    });
  }, [reviews, statusFilter, starFilter, productFilter, searchQuery]);

  const flaggedCount = useMemo(() => {
    return reviews.filter((r) => r.moderationStatus === 'flagged').length;
  }, [reviews]);

  const needsReplyCount = useMemo(() => {
    return reviews.filter((r) => !r.ownerReply && r.moderationStatus === 'published').length;
  }, [reviews]);

  return (
    <div className="space-y-6 text-xs text-white">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#20202E] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-luxury text-xl font-bold text-white">
              Customer Reviews & Ratings Management
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#D4AF37]/15 text-[#ECC86A] border border-[#D4AF37]/30">
              Module 15
            </span>
          </div>
          <p className="text-[#8E8EA2] mt-0.5">
            Monitor authentic reviews, reply to customers publicly, review rating trends, and manage Google Reviews for <strong className="text-white">{tenant.name}</strong>.
          </p>
        </div>

        <button
          type="button"
          onClick={loadReviewsData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181824] hover:bg-[#202030] text-[#A5A5B8] hover:text-white border border-[#2A2A3E] transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Analytics Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#222232] bg-[#0E0E15] p-4 space-y-1">
          <p className="text-[11px] text-[#8E8EA2] uppercase font-semibold">Average Store Rating</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white font-mono-tabular">
              {analytics?.averageRating ? analytics.averageRating.toFixed(1) : '0.0'}
            </span>
            <div className="flex items-center text-[#ECC86A]">
              <Star className="w-4 h-4 fill-[#ECC86A]" />
              <span className="text-[11px] text-[#8E8EA2] ml-1">/ 5.0</span>
            </div>
          </div>
          <p className="text-[11px] text-[#6E6E82]">Computed from authentic published reviews</p>
        </div>

        <div className="rounded-xl border border-[#222232] bg-[#0E0E15] p-4 space-y-1">
          <p className="text-[11px] text-[#8E8EA2] uppercase font-semibold">Total Reviews</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white font-mono-tabular">
              {analytics?.totalReviews ?? reviews.length}
            </span>
            <span className="text-[11px] text-[#8E8EA2]">submissions</span>
          </div>
          <p className="text-[11px] text-[#ECC86A]">{needsReplyCount} awaiting owner reply</p>
        </div>

        <div className="rounded-xl border border-[#222232] bg-[#0E0E15] p-4 space-y-1">
          <p className="text-[11px] text-[#8E8EA2] uppercase font-semibold">Verified Purchase Rate</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-400 font-mono-tabular">
              {analytics?.verifiedPurchasePercentage ?? 0}%
            </span>
            <span className="text-[11px] text-emerald-400/80 font-medium">
              ({analytics?.verifiedPurchaseCount ?? 0} orders)
            </span>
          </div>
          <p className="text-[11px] text-[#6E6E82]">Matched with paid or delivered orders</p>
        </div>

        <div className="rounded-xl border border-[#222232] bg-[#0E0E15] p-4 space-y-1">
          <p className="text-[11px] text-[#8E8EA2] uppercase font-semibold">Flagged / Moderation</p>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black font-mono-tabular ${flaggedCount > 0 ? 'text-amber-400' : 'text-white'}`}>
              {flaggedCount}
            </span>
            <span className="text-[11px] text-[#8E8EA2]">pending review</span>
          </div>
          <p className="text-[11px] text-[#6E6E82]">Reported for spam or violations</p>
        </div>
      </div>

      {/* Analytics Tabs / Sections (Distribution, Monthly Trends & Product Comparison) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Rating Distribution */}
        <div className="lg:col-span-5 rounded-2xl border border-[#222232] bg-[#0E0E15] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-[#D4AF37]" />
              <span>Rating Distribution (1 to 5 Stars)</span>
            </h3>
            {starFilter && (
              <button
                type="button"
                onClick={() => setStarFilter(null)}
                className="text-[11px] text-[#ECC86A] hover:underline"
              >
                Clear filter ({starFilter}★)
              </button>
            )}
          </div>

          {[5, 4, 3, 2, 1].map((stars) => {
            const count = analytics?.distribution?.[stars as 1 | 2 | 3 | 4 | 5] ?? 0;
            const total = analytics?.totalReviews ?? reviews.length;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const isSelected = starFilter === stars;
            return (
              <button
                key={stars}
                type="button"
                onClick={() => setStarFilter(isSelected ? null : stars)}
                className={`w-full flex items-center gap-3 text-xs py-1 px-2 rounded-md transition-colors ${
                  isSelected ? 'bg-[#D4AF37]/20 ring-1 ring-[#D4AF37]' : 'hover:bg-[#181824]'
                }`}
              >
                <span className="flex items-center gap-1 w-12 font-mono-tabular font-medium text-white">
                  {stars} <Star className="w-3 h-3 fill-[#ECC86A] text-[#ECC86A]" />
                </span>
                <div className="flex-1 h-2 rounded-full bg-[#1C1C28] overflow-hidden">
                  <div className="h-full rounded-full bg-[#ECC86A]" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 text-right font-mono-tabular text-[#8E8EA2]">{count}</span>
                <span className="w-10 text-right font-mono-tabular text-[11px] text-[#6E6E82]">{pct}%</span>
              </button>
            );
          })}
        </div>

        {/* Monthly Rating Trends & Product Comparisons */}
        <div className="lg:col-span-7 rounded-2xl border border-[#222232] bg-[#0E0E15] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-[#D4AF37]" />
              <span>Monthly Rating Trends</span>
            </h3>
            <span className="text-[11px] text-[#8E8EA2]">Last 12 Months</span>
          </div>

          {analytics?.monthlyTrends && analytics.monthlyTrends.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#20202E] text-[#8E8EA2]">
                    <th className="pb-2 font-medium">Month</th>
                    <th className="pb-2 font-medium text-right">Reviews</th>
                    <th className="pb-2 font-medium text-right">Average Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1C1C28]">
                  {analytics.monthlyTrends.slice(0, 6).map((t) => (
                    <tr key={t.month} className="hover:bg-[#161622]">
                      <td className="py-1.5 font-mono-tabular text-white">{t.month}</td>
                      <td className="py-1.5 text-right font-mono-tabular text-[#A5A5B8]">{t.count}</td>
                      <td className="py-1.5 text-right font-mono-tabular font-semibold text-[#ECC86A]">
                        {t.avgRating.toFixed(1)} ★
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-[#8E8EA2] py-4 text-center">
              Monthly review trends will appear as customers submit reviews.
            </p>
          )}

          {/* Product Comparison Snippet */}
          {analytics?.productComparisons && analytics.productComparisons.length > 0 && (
            <div className="pt-3 border-t border-[#1C1C28] space-y-2">
              <p className="text-xs font-semibold text-white">Product & Service Rating Performance</p>
              <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                {analytics.productComparisons.slice(0, 5).map((p) => (
                  <div key={p.productId} className="flex items-center justify-between text-[11px] p-1.5 rounded bg-[#14141E]">
                    <span className="font-medium text-white truncate max-w-[200px]">{p.productName}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[#8E8EA2]">{p.reviewCount} reviews</span>
                      <span className="font-semibold text-[#ECC86A]">{p.avgRating.toFixed(1)} ★</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Google Reviews Integration Card */}
      <div className="rounded-2xl border border-[#222232] bg-[#0E0E15] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#20202E] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-sm text-blue-600 shadow">
              G
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white">Official Google Reviews Integration</h3>
              <p className="text-[11px] text-[#8E8EA2]">
                Connect your official Google Business Profile / Google Maps review link
              </p>
            </div>
          </div>
          {googleReviewsConfig.googleReviewUrl && (
            <a
              href={googleReviewsConfig.googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#ECC86A] hover:underline"
            >
              <span>Test Google Link</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        <form onSubmit={handleSaveGoogleReviews} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-white">
                Official Google Review Link (Google Business Profile / Maps)
              </label>
              <input
                type="url"
                value={googleReviewsConfig.googleReviewUrl}
                onChange={(e) =>
                  setGoogleReviewsConfig((prev) => ({ ...prev, googleReviewUrl: e.target.value }))
                }
                placeholder="https://g.page/r/.../review or https://search.google.com/local/writereview?placeid=..."
                className="w-full rounded-lg border border-[#29293E] bg-[#14141E] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
              />
              <p className="text-[10px] text-[#8E8EA2]">
                Copy your "Ask for reviews" link from your Google Business Profile dashboard.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-white">
                Google Place ID (Optional)
              </label>
              <input
                type="text"
                value={googleReviewsConfig.googlePlaceId}
                onChange={(e) =>
                  setGoogleReviewsConfig((prev) => ({ ...prev, googlePlaceId: e.target.value }))
                }
                placeholder="e.g. ChIJN1t_tDeuEmsRUsoyG83frY4"
                className="w-full rounded-lg border border-[#29293E] bg-[#14141E] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
              />
              <p className="text-[10px] text-[#8E8EA2]">
                Used for official Google Maps Place API link generation.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-1.5 text-[11px] text-[#8E8EA2]">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Zero Fake Reviews Policy: Vijay Visuals never copies or fabricates external Google reviews. All links open official Google services directly.
              </span>
            </div>

            <button
              type="submit"
              disabled={savingGoogle}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#D4AF37] hover:bg-[#E5BF45] disabled:opacity-50 text-xs font-bold text-[#08080A] shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingGoogle ? 'Saving...' : 'Save Google Review Settings'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Review Management List & Filters */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 rounded-xl border border-[#20202E] bg-[#0E0E14] p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[#8E8EA2] flex items-center gap-1 pl-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Filter:</span>
            </span>

            {[
              { id: 'all', label: `All (${reviews.length})` },
              { id: 'needs_reply', label: `Needs Reply (${needsReplyCount})` },
              { id: 'verified', label: 'Verified Only' },
              { id: 'flagged', label: `Flagged (${flaggedCount})` },
              { id: 'published', label: 'Published' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-[#D4AF37] text-[#08080A]'
                    : 'bg-[#161622] text-[#A5A5B8] hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}

            {products.length > 0 && (
              <select
                value={productFilter ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setProductFilter(val === '' ? null : Number(val));
                }}
                className="rounded-md border border-[#252538] bg-[#161622] px-2.5 py-1 text-xs text-[#E8E8ED] focus:border-[#D4AF37] focus:outline-none"
              >
                <option value="">All Products & Services</option>
                <option value="0">Overall Business Reviews</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#6E6E82] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by customer or text..."
              className="w-full md:w-56 rounded-md border border-[#252538] bg-[#161622] pl-8 pr-3 py-1 text-xs text-white placeholder-[#6E6E82] focus:border-[#D4AF37] focus:outline-none"
            />
          </div>
        </div>

        {filteredReviews.length === 0 ? (
          <div className="rounded-xl border border-[#20202E] bg-[#0D0D14] p-8 text-center space-y-2">
            <p className="font-semibold text-white">No reviews found matching current filter</p>
            <p className="text-xs text-[#8E8EA2]">Try clearing filters or search query.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReviews.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-[#20202E] bg-[#0D0D14] p-4 space-y-3 hover:border-[#2C2C3E] transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{r.customerName}</span>
                      {r.verifiedPurchase && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          Verified Purchase
                        </span>
                      )}
                      {r.productName && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] bg-[#1C1C28] text-[#ECC86A] border border-[#2A2A3E]">
                          {r.productName}
                        </span>
                      )}
                      {r.moderationStatus === 'flagged' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          Flagged for Moderation
                        </span>
                      )}
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
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        }) : ''}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedReview(r);
                        setReplyText(r.ownerReply || '');
                        setReplyModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#ECC86A] border border-[#D4AF37]/30 font-medium"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{r.ownerReply ? 'Edit Reply' : 'Public Reply'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedReview(r);
                        setReportReason('');
                        setReportModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#181824] hover:bg-[#202030] text-[#8E8EA2] hover:text-red-400 border border-[#29293E]"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Report</span>
                    </button>
                  </div>
                </div>

                {/* Content */}
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
                        <img src={ph.photoUrl} alt="Customer upload" width={56} height={56} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}

                {/* Owner Reply Display */}
                {r.ownerReply && (
                  <div className="rounded-lg border border-[#D4AF37]/30 bg-[#16140D] p-3 text-xs space-y-1 ml-4 sm:ml-6">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#ECC86A] flex items-center gap-1">
                        <CornerDownRight className="w-3.5 h-3.5" />
                        Your Public Reply
                      </span>
                      {r.ownerRepliedAt && (
                        <span className="text-[10px] text-[#A59560]">
                          {new Date(r.ownerRepliedAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                    <p className="text-[#DFD7BE]">{r.ownerReply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reply Modal */}
      {replyModalOpen && selectedReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#2D2D42] bg-[#0F0F17] p-6 space-y-4 text-xs text-white">
            <div className="flex items-center justify-between border-b border-[#202030] pb-3">
              <div>
                <h3 className="font-luxury text-base font-bold text-white">Reply to Customer Review</h3>
                <p className="text-[11px] text-[#8E8EA2]">
                  Your reply will be displayed publicly under {selectedReview.customerName}'s review
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyModalOpen(false)}
                className="p-1 text-[#8E8EA2] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-lg bg-[#14141E] p-3 text-[#C8C8DC] space-y-1 border border-[#20202E]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">{selectedReview.customerName}</span>
                <span className="text-[#ECC86A]">{selectedReview.rating} ★</span>
              </div>
              <p className="line-clamp-3">{selectedReview.comment}</p>
            </div>

            <form onSubmit={handleSubmitReply} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white">Your Public Response *</label>
                <textarea
                  rows={4}
                  required
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Thank the customer for their feedback, address any concerns with professional courtesy, and share relevant store details..."
                  className="w-full rounded-lg border border-[#29293E] bg-[#14141E] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReplyModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#181824] text-[#A5A5B8]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction || replyText.trim().length < 2}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#D4AF37] hover:bg-[#E5BF45] disabled:opacity-50 text-[#08080A] font-bold"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submittingAction ? 'Publishing...' : 'Publish Public Reply'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportModalOpen && selectedReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#2D2D42] bg-[#0F0F17] p-6 space-y-4 text-xs text-white">
            <div className="flex items-center justify-between border-b border-[#202030] pb-3">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-4 h-4" />
                <h3 className="font-semibold text-sm text-white">Report Abusive or Fraudulent Review</h3>
              </div>
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="p-1 text-[#8E8EA2] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[#A5A5B8]">
              Flag review by <strong className="text-white">{selectedReview.customerName}</strong> for Super Admin moderation. Please provide factual details.
            </p>

            <form onSubmit={handleSubmitReport} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white">Reason for Moderation Request * (5+ chars)</label>
                <textarea
                  rows={3}
                  required
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="e.g. Fraudulent review, customer never visited, extortion attempt, harassment, competitor spam..."
                  className="w-full rounded-lg border border-[#29293E] bg-[#14141E] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReportModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#181824] text-[#A5A5B8]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction || reportReason.trim().length < 5}
                  className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold"
                >
                  {submittingAction ? 'Submitting...' : 'Flag for Admin Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
