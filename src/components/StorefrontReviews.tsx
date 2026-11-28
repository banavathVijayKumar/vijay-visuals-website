import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Filter,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  X,
  Edit3,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { ProductRecord, ReviewPhoto, ReviewRecord } from '../types/platform';

interface StorefrontReviewsProps {
  websiteId: string;
  slug: string;
  businessName: string;
  products: ProductRecord[];
  initialReviews: ReviewRecord[];
  googleReviewUrl?: string;
  googlePlaceId?: string;
  isDemoStore?: boolean;
  onNotify: (msg: string) => void;
}

export function StorefrontReviews({
  websiteId,
  slug,
  businessName,
  products,
  initialReviews,
  googleReviewUrl,
  googlePlaceId,
  isDemoStore = false,
  onNotify,
}: StorefrontReviewsProps) {
  const { profile, openAuthModal } = useAuth();
  const [reviews, setReviews] = useState<ReviewRecord[]>(initialReviews);
  const [selectedStarFilter, setSelectedStarFilter] = useState<number | null>(null);
  const [selectedProductFilter, setSelectedProductFilter] = useState<number | null>(null);
  const [verifiedOnlyFilter, setVerifiedOnlyFilter] = useState(false);
  const [withPhotosFilter, setWithPhotosFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [writeModalOpen, setWriteModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [activeReviewForAction, setActiveReviewForAction] = useState<ReviewRecord | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // Form states
  const [formRating, setFormRating] = useState(5);
  const [formHoverRating, setFormHoverRating] = useState(0);
  const [formProductId, setFormProductId] = useState<number | null>(null);
  const [formName, setFormName] = useState(profile?.name || '');
  const [formTitle, setFormTitle] = useState('');
  const [formComment, setFormComment] = useState('');
  const [formPhotos, setFormPhotos] = useState<string[]>([]);
  const [photoInput, setPhotoInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Report form state
  const [reportReason, setReportReason] = useState('');
  const [reporting, setReporting] = useState(false);

  // Demo reviews are seeded illustrations; never write them back to any API.
  const blockDemoReviewWrite = (): boolean => {
    if (!isDemoStore) return false;
    onNotify('Sample reviews are read-only in this preview.');
    return true;
  };

  // Calculated aggregates
  const totalReviews = reviews.length;
  const averageRating = useMemo(() => {
    if (totalReviews === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    return Number((sum / totalReviews).toFixed(1));
  }, [reviews, totalReviews]);

  const verifiedCount = useMemo(() => {
    return reviews.filter((r) => r.verifiedPurchase).length;
  }, [reviews]);

  const verifiedPercentage = totalReviews > 0 ? Math.round((verifiedCount / totalReviews) * 100) : 0;

  const distribution = useMemo(() => {
    const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of reviews) {
      const s = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 5))) as 1 | 2 | 3 | 4 | 5;
      dist[s] = (dist[s] || 0) + 1;
    }
    return dist;
  }, [reviews]);

  // Filtered reviews list
  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      if (selectedStarFilter && Math.round(r.rating) !== selectedStarFilter) return false;
      if (selectedProductFilter !== null) {
        if (selectedProductFilter === 0 && r.productId !== 0 && r.productId !== null) return false;
        if (selectedProductFilter > 0 && r.productId !== selectedProductFilter) return false;
      }
      if (verifiedOnlyFilter && !r.verifiedPurchase) return false;
      if (withPhotosFilter && (!r.photos || r.photos.length === 0)) return false;
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
  }, [reviews, selectedStarFilter, selectedProductFilter, verifiedOnlyFilter, withPhotosFilter, searchQuery]);

  // Photo handlers
  const handleAddPhoto = () => {
    const trimmed = photoInput.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      onNotify('Photo URL must start with https:// or http://');
      return;
    }
    if (formPhotos.length >= 4) {
      onNotify('Maximum 4 photos allowed per review.');
      return;
    }
    setFormPhotos((prev) => [...prev, trimmed]);
    setPhotoInput('');
  };

  const handleRemovePhoto = (index: number) => {
    setFormPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  // Open Write Modal
  const openWriteModal = (preselectedProductId?: number) => {
    if (blockDemoReviewWrite()) return;
    if (!profile) {
      onNotify('Please sign in to share a verified customer review.');
      openAuthModal('signin');
      return;
    }
    setFormRating(5);
    setFormHoverRating(0);
    setFormProductId(preselectedProductId ?? null);
    setFormName(profile.name || '');
    setFormTitle('');
    setFormComment('');
    setFormPhotos([]);
    setPhotoInput('');
    setWriteModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (review: ReviewRecord) => {
    if (blockDemoReviewWrite()) return;
    setActiveReviewForAction(review);
    setFormRating(review.rating);
    setFormHoverRating(0);
    setFormTitle(review.title || '');
    setFormComment(review.comment || '');
    setFormPhotos((review.photos || []).map((p) => p.photoUrl));
    setPhotoInput('');
    setEditModalOpen(true);
  };

  // Submit Review
  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blockDemoReviewWrite()) return;
    if (!profile) {
      openAuthModal('signin');
      return;
    }
    if (formComment.trim().length < 5) {
      onNotify('Please write a review comment of at least 5 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<{
        review: ReviewRecord;
        verifiedPurchase: boolean;
      }>('/api/platform/reviews', {
        method: 'POST',
        body: {
          action: 'submit',
          websiteId: websiteId || slug,
          productId: formProductId && formProductId > 0 ? formProductId : null,
          rating: formRating,
          title: formTitle.trim(),
          comment: formComment.trim(),
          reviewerName: formName.trim() || profile.name,
          photos: formPhotos,
          requireVerifiedPurchase: false,
        },
      });

      if (res?.review) {
        setReviews((prev) => [res.review, ...prev]);
        setWriteModalOpen(false);
        onNotify(
          res.verifiedPurchase
            ? '✓ Thank you! Your verified purchase review has been published.'
            : 'Thank you! Your customer review has been published.'
        );
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  // Save Edited Review
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blockDemoReviewWrite()) return;
    if (!activeReviewForAction) return;
    if (formComment.trim().length < 5) {
      onNotify('Please write a review comment of at least 5 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/platform/reviews', {
        method: 'POST',
        body: {
          action: 'edit',
          reviewId: activeReviewForAction.id,
          rating: formRating,
          title: formTitle.trim(),
          comment: formComment.trim(),
          photos: formPhotos,
        },
      });

      setReviews((prev) =>
        prev.map((r) =>
          r.id === activeReviewForAction.id
            ? {
                ...r,
                rating: formRating,
                title: formTitle.trim(),
                comment: formComment.trim(),
                photos: formPhotos.map((url, i) => ({ id: i, photoUrl: url, caption: '' })),
                updatedAt: new Date().toISOString(),
              }
            : r
        )
      );
      setEditModalOpen(false);
      setActiveReviewForAction(null);
      onNotify('Your review has been updated successfully.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to update review.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Review
  const handleDeleteReview = async (reviewId: number) => {
    if (blockDemoReviewWrite()) return;
    if (!window.confirm('Are you sure you want to delete your review? This action cannot be undone.')) {
      return;
    }
    try {
      await apiFetch('/api/platform/reviews', {
        method: 'POST',
        body: {
          action: 'delete',
          reviewId,
        },
      });
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
      onNotify('Your review has been removed.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to delete review.');
    }
  };

  // Submit Report
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blockDemoReviewWrite()) return;
    if (!activeReviewForAction || reportReason.trim().length < 5) {
      onNotify('Please provide a reason of at least 5 characters.');
      return;
    }
    setReporting(true);
    try {
      await apiFetch('/api/platform/reviews', {
        method: 'POST',
        body: {
          action: 'report',
          reviewId: activeReviewForAction.id,
          reason: reportReason.trim(),
        },
      });
      setReportModalOpen(false);
      setActiveReviewForAction(null);
      setReportReason('');
      onNotify('Thank you. The review has been flagged for admin moderation.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to report review.');
    } finally {
      setReporting(false);
    }
  };

  return (
    <section id="store-reviews" className="max-w-7xl mx-auto scroll-mt-36 px-4 py-12 space-y-8 sm:px-6 md:scroll-mt-24">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#20202E] pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#D4AF37]/15 text-[#ECC86A] border border-[#D4AF37]/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              {isDemoStore ? 'Demo · sample reviews' : '100% Authentic Customer Reviews'}
            </span>
            <span className="text-xs text-[#8E8EA2]">
              {isDemoStore ? 'Illustrative data only' : 'Zero Fake Reviews Policy'}
            </span>
          </div>
          <h2 className="font-luxury text-2xl md:text-3xl font-bold text-white tracking-tight">
            {isDemoStore ? 'Sample Reviews & Ratings' : 'Customer Reviews & Ratings'}
          </h2>
          <p className="text-xs text-[#9E9EB2] mt-1">
            {isDemoStore
              ? 'Seeded preview content for this demo storefront; not feedback from real customers.'
              : `Real feedback from verified purchasers and customers of ${businessName}.`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => openWriteModal()}
          disabled={isDemoStore}
          className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all shadow-lg ${
            isDemoStore
              ? 'cursor-not-allowed border border-[#3A3A4E] bg-[#16161F] text-[#8E8EA2]'
              : 'bg-[#D4AF37] text-[#08080A] hover:bg-[#E5BF45] shadow-[#D4AF37]/10'
          }`}
        >
          <Plus className="w-4 h-4" />
          {isDemoStore ? 'Reviews Read-Only (Demo)' : 'Write a Review'}
        </button>
      </div>

      {/* Aggregate Overview & Google Reviews Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Rating Score Card */}
        <div className="lg:col-span-4 rounded-2xl border border-[#222232] bg-[#0E0E15] p-6 flex flex-col justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-[#8E8EA2] font-semibold">
              Overall Business Rating
            </span>
            <div className="flex items-baseline gap-3 mt-2">
              <span className="text-5xl font-black text-white font-mono-tabular">
                {averageRating > 0 ? averageRating.toFixed(1) : '5.0'}
              </span>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1 text-[#ECC86A]">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-4 h-4 ${
                        star <= Math.round(averageRating || 5)
                          ? 'fill-[#ECC86A] text-[#ECC86A]'
                          : 'text-[#3E3E52]'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-[#8E8EA2]">
                  Based on {totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#1C1C28] mt-6 flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{verifiedCount} Verified Purchases ({verifiedPercentage}%)</span>
            </span>
            <span className="text-[#8E8EA2]">{isDemoStore ? 'Demo data' : 'Anti-Fraud Active'}</span>
          </div>
        </div>

        {/* Rating Distribution Breakdown */}
        <div className="lg:col-span-5 rounded-2xl border border-[#222232] bg-[#0E0E15] p-6 space-y-2.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-white">Rating Distribution</span>
            {selectedStarFilter && (
              <button
                type="button"
                onClick={() => setSelectedStarFilter(null)}
                className="text-[11px] text-[#ECC86A] hover:underline"
              >
                Clear filter ({selectedStarFilter}★)
              </button>
            )}
          </div>

          {[5, 4, 3, 2, 1].map((stars) => {
            const count = distribution[stars as 1 | 2 | 3 | 4 | 5] || 0;
            const pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
            const isSelected = selectedStarFilter === stars;
            return (
              <button
                key={stars}
                type="button"
                onClick={() => setSelectedStarFilter(isSelected ? null : stars)}
                className={`w-full flex items-center gap-3 text-xs py-1 px-2 rounded-md transition-colors ${
                  isSelected ? 'bg-[#D4AF37]/15 ring-1 ring-[#D4AF37]' : 'hover:bg-[#181824]'
                }`}
              >
                <span className="flex items-center gap-1 w-12 font-mono-tabular font-medium text-white">
                  {stars} <Star className="w-3 h-3 fill-[#ECC86A] text-[#ECC86A]" />
                </span>
                <div className="flex-1 h-2 rounded-full bg-[#1C1C28] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#ECC86A] transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono-tabular text-[#8E8EA2]">{count}</span>
                <span className="w-10 text-right font-mono-tabular text-[11px] text-[#6E6E82]">{pct}%</span>
              </button>
            );
          })}
        </div>

        {/* Google Reviews Integration Card */}
        <div className="lg:col-span-3 rounded-2xl border border-[#222232] bg-[#0E0E15] p-6 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center font-bold text-xs text-blue-600 shadow">
                G
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Google Reviews</p>
                <p className="text-[10px] text-[#8E8EA2]">Google Business Profile</p>
              </div>
            </div>

            <p className="text-xs text-[#9E9EB2] leading-relaxed">
              Have you visited our branch or ordered online? Leave us an official review on Google Maps to help others discover our store.
            </p>
          </div>

          <div className="pt-4 border-t border-[#1C1C28] mt-4 space-y-2">
            {googleReviewUrl ? (
              <a
                href={googleReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg bg-[#181824] hover:bg-[#202030] text-xs font-semibold text-[#ECC86A] border border-[#2A2A3E] transition-colors"
              >
                <span>Review on Google</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : (
              <div className="rounded-lg bg-[#14141E] p-2.5 text-[11px] text-[#8E8EA2] text-center border border-[#222232]">
                Official Google Place link can be added by store owner in Settings.
              </div>
            )}
            <p className="text-[10px] text-[#6E6E82] text-center">
              External Google reviews are independently verified by Google.
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 rounded-xl border border-[#20202E] bg-[#0E0E14] p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[#8E8EA2] flex items-center gap-1 pl-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter:</span>
          </span>

          <button
            type="button"
            onClick={() => {
              setSelectedStarFilter(null);
              setSelectedProductFilter(null);
              setVerifiedOnlyFilter(false);
              setWithPhotosFilter(false);
            }}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              !selectedStarFilter && selectedProductFilter === null && !verifiedOnlyFilter && !withPhotosFilter
                ? 'bg-[#D4AF37] text-[#08080A]'
                : 'bg-[#161622] text-[#A5A5B8] hover:text-white'
            }`}
          >
            All ({totalReviews})
          </button>

          <button
            type="button"
            onClick={() => setVerifiedOnlyFilter((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
              verifiedOnlyFilter
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-[#161622] text-[#A5A5B8] hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Verified Purchases ({verifiedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setWithPhotosFilter((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition-colors ${
              withPhotosFilter
                ? 'bg-[#D4AF37]/20 text-[#ECC86A] border border-[#D4AF37]/40'
                : 'bg-[#161622] text-[#A5A5B8] hover:text-white'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>With Photos</span>
          </button>

          {products.length > 0 && (
            <select
              value={selectedProductFilter ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedProductFilter(val === '' ? null : Number(val));
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
            placeholder="Search reviews..."
            className="w-full md:w-56 rounded-md border border-[#252538] bg-[#161622] pl-8 pr-3 py-1 text-xs text-white placeholder-[#6E6E82] focus:border-[#D4AF37] focus:outline-none"
          />
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {filteredReviews.length === 0 ? (
          <div className="rounded-2xl border border-[#20202E] bg-[#0E0E15] p-12 text-center space-y-3">
            <MessageSquare className="w-8 h-8 text-[#6E6E82] mx-auto" />
            <h3 className="text-base font-semibold text-white">No reviews found</h3>
            <p className="text-xs text-[#8E8EA2] max-w-sm mx-auto">
              {reviews.length === 0
                ? `Be the first customer to share your experience with ${businessName}!`
                : 'No reviews match your current filters. Try resetting the filter pills.'}
            </p>
            <button
              type="button"
              onClick={() => openWriteModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#D4AF37] text-[#08080A] text-xs font-bold hover:bg-[#E5BF45]"
            >
              <Plus className="w-4 h-4" />
              Write First Review
            </button>
          </div>
        ) : (
          filteredReviews.map((review) => {
            const isOwnReview =
              profile &&
              (review.reviewerUserId === String(profile.id) ||
                review.reviewerUserId === profile.uid ||
                review.reviewerUserId === profile.email);
            return (
              <div
                key={review.id}
                className="rounded-2xl border border-[#222232] bg-[#0D0D14] p-6 space-y-4 transition-all hover:border-[#2D2D42]"
              >
                {/* Review Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2D2D42] to-[#151522] border border-[#3E3E58] flex items-center justify-center font-bold text-sm text-[#ECC86A]">
                      {(review.customerName || 'C').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-white">
                          {review.customerName}
                        </span>
                        {review.verifiedPurchase && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            Verified Purchase
                          </span>
                        )}
                        {review.productName && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] bg-[#1C1C28] text-[#ECC86A] border border-[#2A2A3E]">
                            {review.productName}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex items-center gap-0.5 text-[#ECC86A]">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-3.5 h-3.5 ${
                                s <= review.rating ? 'fill-[#ECC86A] text-[#ECC86A]' : 'text-[#3E3E52]'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[11px] text-[#7E7E92]">
                          {review.createdAt ? new Date(review.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          }) : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions (Report / Edit / Delete) */}
                  <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
                    {isOwnReview && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(review)}
                          className="inline-flex items-center gap-1 text-[#ECC86A] hover:underline"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <span className="text-[#3E3E52]">·</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteReview(review.id)}
                          className="inline-flex items-center gap-1 text-red-400 hover:underline"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                        <span className="text-[#3E3E52]">·</span>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveReviewForAction(review);
                        setReportReason('');
                        setReportModalOpen(true);
                      }}
                      className="text-[#6E6E82] hover:text-[#A5A5B8] inline-flex items-center gap-1 text-[11px]"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      <span>Report</span>
                    </button>
                  </div>
                </div>

                {/* Review Content */}
                <div className="space-y-2">
                  {review.title && (
                    <h4 className="font-semibold text-sm text-white">
                      {review.title}
                    </h4>
                  )}
                  <p className="text-xs text-[#C8C8DC] leading-relaxed whitespace-pre-wrap">
                    {review.comment}
                  </p>
                </div>

                {/* Photo Gallery */}
                {review.photos && review.photos.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {review.photos.map((ph, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setLightboxPhoto(ph.photoUrl)}
                        className="relative group rounded-lg overflow-hidden border border-[#29293E] bg-[#14141E] w-20 h-20 shrink-0"
                      >
                        <img
                          src={ph.photoUrl}
                          alt={ph.caption || 'Review photo'}
                          width={80}
                          height={80}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* Owner Reply */}
                {review.ownerReply && (
                  <div className="rounded-xl border border-[#D4AF37]/30 bg-[#16140D] p-4 text-xs space-y-1.5 ml-4 sm:ml-8">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#ECC86A] flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Response from {businessName}
                      </span>
                      {review.ownerRepliedAt && (
                        <span className="text-[10px] text-[#A59560]">
                          {new Date(review.ownerRepliedAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                    <p className="text-[#DFD7BE] leading-relaxed whitespace-pre-wrap">
                      {review.ownerReply}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Write Review Modal */}
      {writeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#2D2D42] bg-[#0F0F17] p-6 space-y-5 text-xs text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#202030] pb-3">
              <div>
                <h3 className="font-luxury text-base font-bold text-white">Write a Review</h3>
                <p className="text-[11px] text-[#8E8EA2]">Share your experience with {businessName}</p>
              </div>
              <button
                type="button"
                onClick={() => setWriteModalOpen(false)}
                className="p-1 text-[#8E8EA2] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitReview} className="space-y-4">
              {/* Star Rating Picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white">Your Rating *</label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFormRating(s)}
                        onMouseEnter={() => setFormHoverRating(s)}
                        onMouseLeave={() => setFormHoverRating(0)}
                        className="p-1 focus:outline-none"
                      >
                        <Star
                          className={`w-6 h-6 transition-colors ${
                            s <= (formHoverRating || formRating)
                              ? 'fill-[#ECC86A] text-[#ECC86A]'
                              : 'text-[#3E3E52]'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <span className="font-semibold text-[#ECC86A] pl-2">
                    {formHoverRating || formRating} of 5 Stars
                  </span>
                </div>
              </div>

              {/* Product selector */}
              {products.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-white">What are you reviewing?</label>
                  <select
                    value={formProductId ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormProductId(val === '' ? null : Number(val));
                    }}
                    className="w-full rounded-lg border border-[#29293E] bg-[#14141E] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                  >
                    <option value="">Overall Store & Shopping Experience</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        Product: {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Reviewer Name */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white">Your Display Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  className="w-full rounded-lg border border-[#29293E] bg-[#14141E] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              {/* Review Title */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white">Review Headline</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Excellent fabric quality and fast delivery!"
                  maxLength={140}
                  className="w-full rounded-lg border border-[#29293E] bg-[#14141E] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              {/* Written Comment */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white">Detailed Review * (5+ characters)</label>
                <textarea
                  rows={4}
                  required
                  value={formComment}
                  onChange={(e) => setFormComment(e.target.value)}
                  placeholder="Tell other shoppers about product fit, quality, packaging, delivery speed, and customer service..."
                  maxLength={1500}
                  className="w-full rounded-lg border border-[#29293E] bg-[#14141E] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              {/* Customer Photos (Optional) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white flex items-center justify-between">
                  <span>Customer Photos (Optional, max 4)</span>
                  <span className="text-[10px] text-[#8E8EA2]">{formPhotos.length} / 4</span>
                </label>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={photoInput}
                    onChange={(e) => setPhotoInput(e.target.value)}
                    placeholder="Paste image URL (https://...)"
                    className="flex-1 rounded-lg border border-[#29293E] bg-[#14141E] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddPhoto}
                    disabled={formPhotos.length >= 4 || !photoInput.trim()}
                    className="px-3 py-2 rounded-lg bg-[#252538] hover:bg-[#32324A] disabled:opacity-50 text-xs font-medium"
                  >
                    Add
                  </button>
                </div>

                {formPhotos.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {formPhotos.map((url, i) => (
                      <div key={i} className="relative rounded-lg overflow-hidden border border-[#29293E] w-16 h-16">
                        <img src={url} alt={`Upload ${i + 1}`} width={120} height={120} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(i)}
                          className="absolute top-1 right-1 p-0.5 rounded-full bg-black/80 text-white hover:text-red-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg bg-[#14141E] border border-[#20202E] p-3 text-[11px] text-[#A5A5B8] space-y-1">
                <p className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verified purchase badges where enabled
                </p>
                <p>
                  Reviews may receive a Verified Purchase badge when a completed order from this store matches the reviewer. The badge is not shown otherwise.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#202030]">
                <button
                  type="button"
                  onClick={() => setWriteModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-[#181824] hover:bg-[#202030] text-xs text-[#A5A5B8]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-[#D4AF37] hover:bg-[#E5BF45] disabled:opacity-50 text-xs font-bold text-[#08080A]"
                >
                  {submitting ? 'Submitting...' : 'Publish Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Review Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#2D2D42] bg-[#0F0F17] p-6 space-y-5 text-xs text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#202030] pb-3">
              <div>
                <h3 className="font-luxury text-base font-bold text-white">Edit Your Review</h3>
                <p className="text-[11px] text-[#8E8EA2]">Update your rating, written feedback or photos</p>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="p-1 text-[#8E8EA2] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white">Your Rating *</label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFormRating(s)}
                        onMouseEnter={() => setFormHoverRating(s)}
                        onMouseLeave={() => setFormHoverRating(0)}
                        className="p-1 focus:outline-none"
                      >
                        <Star
                          className={`w-6 h-6 transition-colors ${
                            s <= (formHoverRating || formRating)
                              ? 'fill-[#ECC86A] text-[#ECC86A]'
                              : 'text-[#3E3E52]'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <span className="font-semibold text-[#ECC86A] pl-2">
                    {formHoverRating || formRating} of 5 Stars
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-white">Review Headline</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  maxLength={140}
                  className="w-full rounded-lg border border-[#29293E] bg-[#14141E] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-white">Detailed Review *</label>
                <textarea
                  rows={4}
                  required
                  value={formComment}
                  onChange={(e) => setFormComment(e.target.value)}
                  maxLength={1500}
                  className="w-full rounded-lg border border-[#29293E] bg-[#14141E] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-white flex items-center justify-between">
                  <span>Customer Photos (max 4)</span>
                  <span className="text-[10px] text-[#8E8EA2]">{formPhotos.length} / 4</span>
                </label>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={photoInput}
                    onChange={(e) => setPhotoInput(e.target.value)}
                    placeholder="Paste image URL (https://...)"
                    className="flex-1 rounded-lg border border-[#29293E] bg-[#14141E] px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddPhoto}
                    disabled={formPhotos.length >= 4 || !photoInput.trim()}
                    className="px-3 py-2 rounded-lg bg-[#252538] hover:bg-[#32324A] disabled:opacity-50 text-xs font-medium"
                  >
                    Add
                  </button>
                </div>

                {formPhotos.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {formPhotos.map((url, i) => (
                      <div key={i} className="relative rounded-lg overflow-hidden border border-[#29293E] w-16 h-16">
                        <img src={url} alt={`Upload ${i + 1}`} width={120} height={120} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(i)}
                          className="absolute top-1 right-1 p-0.5 rounded-full bg-black/80 text-white hover:text-red-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#202030]">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-[#181824] hover:bg-[#202030] text-xs text-[#A5A5B8]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-[#D4AF37] hover:bg-[#E5BF45] disabled:opacity-50 text-xs font-bold text-[#08080A]"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportModalOpen && activeReviewForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#2D2D42] bg-[#0F0F17] p-6 space-y-4 text-xs text-white">
            <div className="flex items-center justify-between border-b border-[#202030] pb-3">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-4 h-4" />
                <h3 className="font-semibold text-sm text-white">Report Customer Review</h3>
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
              Reporting review by <strong className="text-white">{activeReviewForAction.customerName}</strong>. All reports are reviewed by the store administrator.
            </p>

            <form onSubmit={handleSubmitReport} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white">Reason for reporting * (5+ chars)</label>
                <textarea
                  rows={3}
                  required
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="e.g. Abusive language, fake review, promotional spam, or incorrect business..."
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
                  disabled={reporting || reportReason.trim().length < 5}
                  className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold"
                >
                  {reporting ? 'Reporting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setLightboxPhoto(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh]">
            <img src={lightboxPhoto} alt="Review enlarged" width={1200} height={900} loading="lazy" decoding="async" className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl" />
            <button
              type="button"
              onClick={() => setLightboxPhoto(null)}
              className="absolute -top-3 -right-3 p-2 rounded-full bg-black/80 text-white hover:text-[#ECC86A] border border-[#3E3E52]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
