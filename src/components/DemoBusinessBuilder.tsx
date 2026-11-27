// ============================================================================
// Customer Demo Business Builder — internal builder shell only.
// The rendered website preview is customer-branded only. Drafts stay unpublished;
// server persistence uses the existing owner-scoped /api/tenants routes.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  LayoutTemplate,
  MapPin,
  Monitor,
  Package,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  ShoppingCart,
  Smartphone,
  Store,
  Tablet,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { readAndOptimizeImageFile } from '../lib/imageUpload';
import { useAuth } from '../hooks/useAuth';
import { TEMPLATES_DATA } from '../lib/templatesData';
import type { TenantRecord } from '../types/platform';
import {
  BUSINESS_CATEGORIES,
  DEMO_CATEGORY_PROFILES,
  DEMO_SECTION_LABELS,
  TEMPLATE_TO_DEMO_CATEGORY,
  buildTenantDraftPayload,
  categoryForTemplate,
  categoryLabel,
  createDefaultDraft,
  createDraftFromTemplate,
  draftFromTenantRecord,
  templatesForCategory,
  type DemoBusinessDraft,
  type DemoCategoryId,
  type DemoItem,
  type DemoSectionId,
} from '../data/demoBuilder';

const DRAFT_STORAGE_KEY = 'vv_demo_builder_drafts_v1';

type Stage = 'categories' | 'templates' | 'customize' | 'preview';
type EditorTab = 'identity' | 'design' | 'content' | 'items' | 'sections';
type PreviewDevice = 'desktop' | 'tablet' | 'mobile';

interface DemoBusinessBuilderProps {
  onOpenProposal: (secureToken: string) => void;
  onNotify?: (message: string) => void;
}

function readStoredDrafts(): DemoBusinessDraft[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item === 'object' && item.id && item.categoryId)
      : [];
  } catch {
    return [];
  }
}

function upsertStoredDraft(draft: DemoBusinessDraft): DemoBusinessDraft[] {
  const current = readStoredDrafts().filter((item) => item.id !== draft.id);
  const next = [draft, ...current].slice(0, 20);
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Browser storage may be unavailable or full; caller reports persistence state.
  }
  return next;
}

function removeStoredDraft(id: string): DemoBusinessDraft[] {
  const next = readStoredDrafts().filter((item) => item.id !== id);
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore local storage failures; in-memory list is still updated.
  }
  return next;
}

const sectionClasses = (spacing: DemoBusinessDraft['design']['spacing']) =>
  spacing === 'compact' ? 'space-y-6 py-6' : spacing === 'spacious' ? 'space-y-14 py-14' : 'space-y-9 py-9';

const buttonRadius = (style: DemoBusinessDraft['design']['buttonStyle']) =>
  style === 'pill' ? '9999px' : style === 'square' ? '0px' : '10px';

function DemoWebsitePreview({ draft, device }: { draft: DemoBusinessDraft; device: PreviewDevice }) {
  const profile = DEMO_CATEGORY_PROFILES[draft.categoryId];
  const { design } = draft;
  const visibleSections = draft.sections.filter((section) => section.visible);
  const catalogSection = visibleSections.find((section) => section.id === 'catalog');
  const galleryImages = draft.content.galleryImages.length
    ? draft.content.galleryImages
    : [draft.content.bannerImage].filter(Boolean);
  const isCommerce =
    profile.mode === 'commerce' ||
    profile.mode === 'food' ||
    draft.categoryId === 'real_estate' ||
    draft.categoryId === 'automobile';

  const sectionBlock = (id: DemoSectionId, content: React.ReactNode) => {
    if (!visibleSections.some((section) => section.id === id)) return null;
    return <section>{content}</section>;
  };

  return (
    <div
      className={`mx-auto w-full overflow-hidden rounded-xl border border-white/10 shadow-2xl ${
        device === 'mobile' ? 'max-w-[375px]' : device === 'tablet' ? 'max-w-[768px]' : 'max-w-none'
      }`}
      style={{ background: design.background, color: '#F8FAFC' }}
      data-testid="demo-website-preview"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-8 sm:py-4" style={{ background: design.accentColor }}>
        <div className="flex min-w-0 items-center gap-3">
          {draft.identity.logoImage ? (
            <img src={draft.identity.logoImage} alt={`${draft.identity.businessName} logo`} width={36} height={36} loading="lazy" decoding="async" className="h-9 w-9 rounded object-contain" />
          ) : (
            <span
              className="flex h-9 w-9 items-center justify-center text-xs font-black"
              style={{ borderRadius: buttonRadius(design.buttonStyle), background: design.primaryColor, color: '#0B0B10' }}
            >
              {(draft.identity.businessName || 'DB').slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold" style={{ color: design.primaryColor }}>{draft.identity.businessName || 'Your Business Name'}</p>
            <p className="truncate text-[10px] text-white/60">{draft.identity.tagline || 'Add a tagline in Customize'}</p>
          </div>
        </div>
        <div className={`hidden gap-4 text-[10px] text-white/70 sm:flex ${design.headerStyle === 'minimal' ? 'font-normal' : 'font-semibold'}`}>
          <span>{profile.itemLabel}</span>
          <span>Gallery</span>
          <span>About</span>
          <span>Contact</span>
        </div>
      </div>

      <div className={sectionClasses(design.spacing)}>
        {sectionBlock('hero', (
          <div className="relative mx-3 overflow-hidden sm:mx-6" style={{ borderRadius: buttonRadius(design.buttonStyle) }}>
            {draft.content.bannerImage && (
              <img src={draft.content.bannerImage} alt="Business banner" width={1200} height={420} loading="lazy" decoding="async" className="h-44 w-full object-cover opacity-70 sm:h-64" />
            )}
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 sm:p-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: design.primaryColor }}>{categoryLabel(draft.categoryId)}</p>
              <h3 className="max-w-2xl text-xl font-black leading-tight sm:text-3xl">{draft.content.heroHeadline || 'Your headline appears here'}</h3>
              <p className="mt-2 max-w-xl text-[11px] text-white/80 sm:text-xs">{draft.content.heroSubheadline || 'Add a short introduction in Customize.'}</p>
              <span
                className="mt-4 inline-flex w-fit px-3 py-1.5 text-[10px] font-bold text-black"
                style={{ background: design.primaryColor, borderRadius: buttonRadius(design.buttonStyle) }}
              >
                {profile.actionLabel}
              </span>
            </div>
          </div>
        ))}

        {sectionBlock('catalog', (
          <div className="mx-4 sm:mx-8">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: design.primaryColor }}>Browse</p>
                <h4 className="text-lg font-bold">{catalogSection?.title || profile.itemLabel}</h4>
              </div>
              {isCommerce && (
                <div className="flex items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1 text-[10px] text-white/70">
                  <ShoppingCart className="h-3 w-3" /> Demo cart
                </div>
              )}
            </div>
            <div
              className={
                catalogSection?.layout === 'list'
                  ? 'space-y-3'
                  : `grid gap-3 ${device === 'mobile' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`
              }
            >
              {draft.items.map((entry) => (
                <article
                  key={entry.id}
                  className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]"
                  style={{ borderRadius: buttonRadius(design.buttonStyle) }}
                >
                  {entry.image && <img src={entry.image} alt={entry.name} width={400} height={280} loading="lazy" decoding="async" className="h-28 w-full object-cover" />}
                  <div className="space-y-1.5 p-3">
                    <p className="text-[9px] uppercase tracking-wider" style={{ color: design.primaryColor }}>{entry.category}</p>
                    <h5 className="text-xs font-bold">{entry.name || 'Sample listing'}</h5>
                    <p className="text-[10px] text-white/60">{entry.description}</p>
                    <p className="text-xs font-black" style={{ color: design.primaryColor }}>{entry.price}</p>
                    {(entry.sizes.length > 0 || entry.colors.length > 0 || entry.options.length > 0) && (
                      <p className="text-[9px] text-white/50">
                        {[entry.sizes.join('/'), entry.colors.join('/'), entry.options.join('/')].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <span
                      className="mt-1 inline-block w-full px-2 py-1.5 text-center text-[10px] font-bold text-black"
                      style={{ background: design.primaryColor, borderRadius: buttonRadius(design.buttonStyle) }}
                    >
                      {profile.actionLabel}
                    </span>
                  </div>
                </article>
              ))}
            </div>
            {isCommerce && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] text-white/60">
                <span>Demo checkout preview — no payment is processed.</span>
                <span className="font-semibold" style={{ color: design.primaryColor }}>Continue (disabled in preview)</span>
              </div>
            )}
          </div>
        ))}

        {sectionBlock('gallery', (
          <div className="mx-4 sm:mx-8">
            <h4 className="mb-3 text-lg font-bold">Gallery</h4>
            <div className={`grid gap-2 ${device === 'mobile' ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
              {galleryImages.map((src, idx) => (
                <img key={`${src}-${idx}`} src={src} alt={`Gallery sample ${idx + 1}`} width={320} height={200} loading="lazy" decoding="async" className="h-20 w-full rounded object-cover sm:h-24" />
              ))}
            </div>
          </div>
        ))}

        {sectionBlock('about', (
          <div className="mx-4 sm:mx-8">
            <h4 className="mb-2 text-lg font-bold">About</h4>
            <p className="max-w-3xl whitespace-pre-wrap text-[11px] leading-relaxed text-white/70">{draft.content.aboutText || 'Add your business story in Customize.'}</p>
          </div>
        ))}

        {sectionBlock('process', (
          <div className="mx-4 sm:mx-8">
            <h4 className="mb-3 text-lg font-bold">How it works</h4>
            <div className="grid gap-2 sm:grid-cols-3">
              {['Send an enquiry', 'Confirm the details', 'Review the proposal'].map((label, idx) => (
                <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[10px] text-white/70">
                  <span className="mr-2 font-black" style={{ color: design.primaryColor }}>{idx + 1}.</span>{label}
                </div>
              ))}
            </div>
          </div>
        ))}

        {sectionBlock('booking', (
          <div className="mx-4 rounded-lg border border-white/10 bg-white/[0.03] p-4 sm:mx-8">
            <h4 className="text-lg font-bold">{profile.mode === 'commerce' || profile.mode === 'food' ? 'Order demo' : 'Booking & enquiry demo'}</h4>
            <p className="mt-1 text-[10px] text-white/60">Preview only — requests are not submitted from this preview.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded border border-white/10 px-3 py-2 text-[10px] text-white/50">Your name</div>
              <div className="rounded border border-white/10 px-3 py-2 text-[10px] text-white/50">Contact detail</div>
            </div>
            <span
              className="mt-3 inline-block px-3 py-1.5 text-[10px] font-bold text-black"
              style={{ background: design.primaryColor, borderRadius: buttonRadius(design.buttonStyle) }}
            >
              {profile.actionLabel} (preview only)
            </span>
          </div>
        ))}

        {sectionBlock('faq', (
          <div className="mx-4 sm:mx-8">
            <h4 className="mb-2 text-lg font-bold">Helpful notes</h4>
            <div className="space-y-2 text-[10px] text-white/60">
              <p>• Replace all sample listings with your own catalogue in Customize.</p>
              <p>• Add verified business hours and contact details before sharing publicly.</p>
            </div>
          </div>
        ))}

        {sectionBlock('contact', (
          <div className="mx-4 grid gap-3 sm:mx-8 sm:grid-cols-2">
            <div>
              <h4 className="mb-2 text-lg font-bold">Contact</h4>
              <p className="text-[10px] text-white/70">{draft.identity.address || 'Add your business address in Customize.'}</p>
              <p className="mt-1 text-[10px] text-white/70">{draft.identity.phone || 'Add a phone number in Customize.'}</p>
              <p className="mt-1 text-[10px] text-white/70">{draft.identity.email || 'Add an email address in Customize.'}</p>
              <p className="mt-1 text-[10px] text-white/50">{draft.identity.businessHours || 'Add verified business hours.'}</p>
            </div>
            {draft.identity.mapUrl.startsWith('https://') && (
              <a
                href={draft.identity.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-28 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] text-[10px]"
                style={{ color: design.primaryColor }}
              >
                <MapPin className="h-4 w-4" /> Open configured location
              </a>
            )}
          </div>
        ))}

        {sectionBlock('map', (
          <div className="mx-4 sm:mx-8">
            <h4 className="mb-2 text-lg font-bold">Location</h4>
            <div className="flex h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 text-[10px] text-white/50">
              <MapPin className="h-4 w-4" /> {draft.identity.address || 'Map appears here once an address is added.'}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-5 sm:px-8" style={{ background: design.accentColor }}>
        <div className={`flex flex-wrap items-center justify-between gap-2 ${design.footerStyle === 'minimal' ? 'text-[9px]' : 'text-[10px]'}`}>
          <p className="font-bold" style={{ color: design.primaryColor }}>{draft.identity.businessName || 'Your Business Name'}</p>
          {design.footerStyle === 'detailed' && <p className="text-white/50">{draft.identity.tagline}</p>}
          <p className="text-white/40">Demo preview · not published</p>
        </div>
      </div>
    </div>
  );
}

export const DemoBusinessBuilder: React.FC<DemoBusinessBuilderProps> = ({ onOpenProposal, onNotify }) => {
  const { profile, ownedTenants, openAuthModal, refreshProfile } = useAuth();
  const [stage, setStage] = useState<Stage>('categories');
  const [editorTab, setEditorTab] = useState<EditorTab>('identity');
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [selectedCategoryId, setSelectedCategoryId] = useState<DemoCategoryId>('clothing');
  const [draft, setDraft] = useState<DemoBusinessDraft>(() => createDefaultDraft());
  const [previewOnlyTemplateId, setPreviewOnlyTemplateId] = useState<string | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<DemoBusinessDraft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [proposalBusy, setProposalBusy] = useState(false);
  const historyRef = useRef<DemoBusinessDraft[]>([]);
  const lastSavedRef = useRef('');

  const notify = useCallback((message: string) => onNotify?.(message), [onNotify]);

  useEffect(() => {
    setSavedDrafts(readStoredDrafts());
    setSelectedCategoryId(draft.categoryId);
    lastSavedRef.current = JSON.stringify(draft);
    // Initial draft is intentionally created once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profileConfig = DEMO_CATEGORY_PROFILES[draft.categoryId];
  const currentTemplate = TEMPLATES_DATA.find((entry) => entry.id === draft.templateId);
  const selectedTemplates = useMemo(() => templatesForCategory(selectedCategoryId), [selectedCategoryId]);

  const previewDraft = useMemo(() => {
    if (!previewOnlyTemplateId) return draft;
    const template = TEMPLATES_DATA.find((entry) => entry.id === previewOnlyTemplateId);
    if (!template) return draft;
    const categoryId = categoryForTemplate(template.id);
    const previewProfile = DEMO_CATEGORY_PROFILES[categoryId];
    return {
      ...draft,
      categoryId,
      templateId: template.id,
      templateName: template.name,
      design: { ...draft.design, primaryColor: template.accent_color || previewProfile.defaultPrimary },
      content: {
        ...draft.content,
        heroHeadline: previewProfile.heroHeadline,
        heroSubheadline: previewProfile.heroSubheadline,
        bannerImage: previewProfile.banner,
      },
      items: previewProfile.items.map((sample) => ({ ...sample })),
      sections: previewProfile.sections.map((id) => ({
        id,
        title: id === 'catalog' ? previewProfile.itemLabel : DEMO_SECTION_LABELS[id],
        visible: true,
        layout: 'grid' as const,
      })),
    };
  }, [draft, previewOnlyTemplateId]);

  const mutateDraft = useCallback((updater: (current: DemoBusinessDraft) => DemoBusinessDraft) => {
    setDraft((current) => {
      const next = updater(current);
      historyRef.current = [...historyRef.current.slice(-29), current];
      return { ...next, updatedAt: new Date().toISOString() };
    });
    setDirty(true);
  }, []);

  const undo = () => {
    const previous = historyRef.current.pop();
    if (!previous) {
      notify('Nothing to undo yet.');
      return;
    }
    setDraft(previous);
    setDirty(true);
  };

  const replaceDraft = (next: DemoBusinessDraft, markClean: boolean = false) => {
    historyRef.current = [...historyRef.current.slice(-29), draft];
    setDraft(next);
    setSelectedCategoryId(next.categoryId);
    setPreviewOnlyTemplateId(null);
    setDirty(!markClean);
    if (markClean) lastSavedRef.current = JSON.stringify(next);
  };

  const chooseTemplate = (templateId: string) => {
    const template = TEMPLATES_DATA.find((entry) => entry.id === templateId);
    if (!template) return;
    if (dirty && !window.confirm('Apply this template? Your current unsaved demo edits will be replaced.')) return;
    replaceDraft(createDraftFromTemplate(template));
    setStage('customize');
  };

  const previewTemplate = (templateId: string) => {
    setPreviewOnlyTemplateId(templateId);
    setStage('preview');
  };

  const persistDraftLocally = (next: DemoBusinessDraft) => {
    setSavedDrafts(upsertStoredDraft(next));
  };

  const saveLocalDraft = () => {
    const next = { ...draft, updatedAt: new Date().toISOString() };
    const beforeLength = readStoredDrafts().length;
    const updated = upsertStoredDraft(next);
    setSavedDrafts(updated);
    setDraft(next);
    lastSavedRef.current = JSON.stringify(next);
    setDirty(false);
    if (updated.length < beforeLength || !updated.some((entry) => entry.id === next.id)) {
      notify('Local browser storage is unavailable; use Save to account while signed in.');
      return;
    }
    notify('Draft saved on this device. It remains unpublished.');
  };

  const saveAccountDraft = async () => {
    if (!profile) {
      openAuthModal('signin');
      notify('Sign in to save this draft to your account.');
      return;
    }
    const owned = ownedTenants.find((tenant) => tenant.id === draft.serverTenantId);
    if (owned?.published) {
      notify('This website is published. Use the full Website Builder to edit a live site.');
      return;
    }
    setSaving(true);
    try {
      const next: DemoBusinessDraft = { ...draft, updatedAt: new Date().toISOString() };
      const payload = buildTenantDraftPayload(next);
      const result = owned
        ? await apiFetch<{ tenant: TenantRecord }>(`/api/tenants/${owned.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ tenant: TenantRecord }>('/api/tenants', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      const persisted: DemoBusinessDraft = {
        ...next,
        slug: result.tenant.slug,
        serverTenantId: result.tenant.id,
      };
      setDraft(persisted);
      persistDraftLocally(persisted);
      lastSavedRef.current = JSON.stringify(persisted);
      setDirty(false);
      await refreshProfile();
      notify('Draft saved to your account as unpublished. No website was published.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to save the account draft.');
    } finally {
      setSaving(false);
    }
  };

  const openDraft = (next: DemoBusinessDraft) => {
    if (dirty && !window.confirm('Discard current unsaved changes and open this draft?')) return;
    replaceDraft(next, true);
    setStage('customize');
  };

  const deleteDraft = (id: string) => {
    if (!window.confirm('Remove this saved demo draft from this device?')) return;
    setSavedDrafts(removeStoredDraft(id));
    notify('Draft removed from this device. Published websites are not affected.');
  };

  const openServerDraft = (tenant: TenantRecord) => {
    const restored = draftFromTenantRecord(tenant as unknown as Record<string, any>);
    if (!restored) return;
    openDraft(restored);
  };

  const uploadImage = async (
    file: File | undefined,
    target: { kind: 'logo' } | { kind: 'banner' } | { kind: 'gallery' } | { kind: 'item'; id: string }
  ) => {
    if (!file) return;
    try {
      const dataUrl = await readAndOptimizeImageFile(
        file,
        target.kind === 'banner' ? 1280 : target.kind === 'gallery' ? 1080 : 640
      );
      mutateDraft((current) => {
        if (target.kind === 'logo') return { ...current, identity: { ...current.identity, logoImage: dataUrl } };
        if (target.kind === 'banner') return { ...current, content: { ...current.content, bannerImage: dataUrl } };
        if (target.kind === 'gallery') {
          return { ...current, content: { ...current.content, galleryImages: [...current.content.galleryImages, dataUrl].slice(0, 18) } };
        }
        return {
          ...current,
          items: current.items.map((entry) => (entry.id === target.id ? { ...entry, image: dataUrl } : entry)),
        };
      });
      notify('Image added to the live preview.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Image could not be added.');
    }
  };

  const updateItem = (id: string, patch: Partial<DemoItem>) => {
    mutateDraft((current) => ({
      ...current,
      items: current.items.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    }));
  };

  const addItem = () => {
    mutateDraft((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          id: `${current.categoryId}-${Date.now()}`,
          name: `New ${profileConfig.itemSingularLabel}`,
          description: 'Sample description. Replace with your own detail.',
          price: '₹0',
          category: 'General',
          image: profileConfig.banner,
          sizes: [],
          colors: [],
          options: [],
        },
      ],
    }));
  };

  const removeItem = (id: string) => {
    mutateDraft((current) => ({ ...current, items: current.items.filter((entry) => entry.id !== id) }));
  };

  const updateSection = (id: DemoSectionId, patch: Partial<DemoBusinessDraft['sections'][number]>) => {
    mutateDraft((current) => ({
      ...current,
      sections: current.sections.map((section) => (section.id === id ? { ...section, ...patch } : section)),
    }));
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.sections.length) return;
    mutateDraft((current) => {
      const sections = [...current.sections];
      const [moved] = sections.splice(index, 1);
      sections.splice(nextIndex, 0, moved);
      return { ...current, sections };
    });
  };

  const addSection = (id: DemoSectionId) => {
    mutateDraft((current) => {
      if (current.sections.some((section) => section.id === id)) return current;
      return {
        ...current,
        sections: [
          ...current.sections,
          { id, title: id === 'catalog' ? profileConfig.itemLabel : DEMO_SECTION_LABELS[id], visible: true, layout: 'grid' },
        ],
      };
    });
  };

  const requestProposal = async () => {
    if (!profile) {
      openAuthModal('signin');
      notify('Sign in to send a proposal request.');
      return;
    }
    if (!profile.email) {
      notify('Your account needs an email address before a proposal can be created.');
      return;
    }
    setProposalBusy(true);
    try {
      const result = await apiFetch<{ secureToken: string }>('/api/proposals', {
        method: 'POST',
        body: JSON.stringify({
          customerName: profile.name || profile.email,
          customerEmail: profile.email,
          customerPhone: profile.phone || draft.identity.phone,
          businessName: draft.identity.businessName || 'Demo Business',
          businessCategory: categoryLabel(previewDraft.categoryId),
          products: previewDraft.items.map((entry) => ({
            name: entry.name,
            price: Number(String(entry.price).replace(/[^0-9.]/g, '')) || 0,
            category: entry.category,
            description: entry.description,
          })),
          preferredColors: {
            primary: previewDraft.design.primaryColor,
            accent: previewDraft.design.accentColor,
            theme: 'demo_builder_selection',
          },
        }),
      });
      if (result.secureToken) onOpenProposal(result.secureToken);
      notify('Proposal request created. No payment or publication was performed.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to create the proposal request.');
    } finally {
      setProposalBusy(false);
    }
  };

  const templatePreviewImage = (templateId: string) => {
    const id = categoryForTemplate(templateId);
    return DEMO_CATEGORY_PROFILES[id].banner;
  };

  const inputClass =
    'w-full min-h-11 rounded-lg border border-[#2A2A3A] bg-[#0E0E15] px-3 py-2 text-xs text-[#E8E8ED] outline-none focus:border-[#D4AF37]';
  const labelClass = 'mb-1 block text-[11px] font-semibold text-[#A7A7BA]';
  const chipClass = (active: boolean) =>
    `min-h-11 inline-flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
      active ? 'bg-[#D4AF37] text-[#08080A]' : 'border border-[#2A2A3A] text-[#C4C4D4] hover:border-[#D4AF37]/60'
    }`;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-3 py-5 sm:px-6">
      <header className="rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-r from-[#12100A] via-[#0C0C12] to-[#111827] p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ECC86A]">Demo Business</p>
            <h1 className="font-luxury text-2xl font-black text-white sm:text-4xl">Build a professional demo website</h1>
            <p className="mt-2 max-w-3xl text-xs text-[#B7B7C6]">
              Choose a category, preview a complete sample website, then customize it live. Drafts stay unpublished until you explicitly publish through the existing builder.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={saveLocalDraft} className={`${chipClass(false)}`}>
              <Save className="h-3.5 w-3.5" /> Save draft on device
            </button>
            <button type="button" onClick={saveAccountDraft} disabled={saving} className={`${chipClass(true)} disabled:opacity-60`}>
              <Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save to account'}
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          {dirty ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-300"><AlertCircle className="h-3.5 w-3.5" /> Unsaved changes</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Draft state saved</span>
          )}
          <button type="button" onClick={undo} className={chipClass(false)}><Undo2 className="h-3.5 w-3.5" /> Undo</button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('Reset this demo to the selected template defaults?')) return;
              const template = currentTemplate || TEMPLATES_DATA[0];
              replaceDraft(createDraftFromTemplate(template));
            }}
            className={chipClass(false)}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
          <button type="button" onClick={requestProposal} disabled={proposalBusy} className={chipClass(false)}>
            <FileText className="h-3.5 w-3.5" /> {proposalBusy ? 'Creating…' : 'Request proposal'}
          </button>
        </div>
      </header>

      <nav className="no-scrollbar flex gap-2 overflow-x-auto rounded-xl border border-[#1E1E28] bg-[#0B0B11] p-2" aria-label="Demo builder steps">
        {([
          ['categories', Store, '1. Category'],
          ['templates', LayoutTemplate, '2. Templates'],
          ['customize', Settings2, '3. Customize'],
          ['preview', Eye, '4. Full preview'],
        ] as const).map(([value, Icon, label]) => (
          <button key={value} type="button" onClick={() => setStage(value)} className={chipClass(stage === value)}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </nav>

      <section className="grid gap-4 rounded-xl border border-[#1E1E28] bg-[#0B0B11] p-3 sm:p-4 lg:grid-cols-[300px_1fr]">
        <div>
          <label className={labelClass} htmlFor="saved-draft-select">Saved drafts on this device</label>
          <select
            id="saved-draft-select"
            className={inputClass}
            defaultValue=""
            onChange={(event) => {
              const found = savedDrafts.find((entry) => entry.id === event.target.value);
              if (found) openDraft(found);
              event.target.value = '';
            }}
          >
            <option value="">Choose a saved draft…</option>
            {savedDrafts.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.identity.businessName} · {categoryLabel(entry.categoryId)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="account-draft-select">Unpublished account drafts</label>
          <select
            id="account-draft-select"
            className={inputClass}
            defaultValue=""
            onChange={(event) => {
              const tenant = ownedTenants.find((entry) => String(entry.id) === event.target.value && !entry.published);
              if (tenant) openServerDraft(tenant);
              event.target.value = '';
            }}
          >
            <option value="">{profile ? 'Choose an account draft…' : 'Sign in to reopen account drafts'}</option>
            {profile &&
              ownedTenants
                .filter((tenant) => !tenant.published)
                .map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.slug}</option>
                ))}
          </select>
          {savedDrafts.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const target = savedDrafts[0];
                if (target) deleteDraft(target.id);
              }}
              className="mt-2 inline-flex min-h-9 items-center gap-1 text-[11px] text-rose-300 hover:text-rose-200"
            >
              <Trash2 className="h-3 w-3" /> Delete most recent local draft
            </button>
          )}
        </div>
      </section>

      {stage === 'categories' && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {BUSINESS_CATEGORIES.map((category) => {
            const count = templatesForCategory(category.id as DemoCategoryId).length;
            const demoProfile = DEMO_CATEGORY_PROFILES[category.id as DemoCategoryId];
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setSelectedCategoryId(category.id as DemoCategoryId);
                  setStage('templates');
                }}
                className="group overflow-hidden rounded-xl border border-[#1E1E28] bg-[#0B0B11] text-left transition-colors hover:border-[#D4AF37]/60"
              >
                <img src={demoProfile.banner} alt="" width={640} height={180} loading="lazy" decoding="async" className="h-24 w-full object-cover opacity-70 group-hover:opacity-90" />
                <div className="space-y-1 p-3">
                  <p className="text-sm font-bold text-white">{category.label}</p>
                  <p className="text-[10px] text-[#8E8EA2]">{count} professional template{count === 1 ? '' : 's'} · {demoProfile.mode} layout</p>
                </div>
              </button>
            );
          })}
        </section>
      )}

      {stage === 'templates' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#ECC86A]">{categoryLabel(selectedCategoryId)}</p>
              <h2 className="text-xl font-bold text-white">Choose a professional template</h2>
            </div>
            <button type="button" onClick={() => setStage('categories')} className={chipClass(false)}>Change category</button>
          </div>
          {selectedTemplates.length === 0 ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-200">
              No templates are mapped to this category yet. Choose another supported category.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {selectedTemplates.map((template) => (
                <article key={template.id} className="overflow-hidden rounded-xl border border-[#1E1E28] bg-[#0B0B11]">
                  <img src={templatePreviewImage(template.id)} alt={`${template.name} preview`} width={480} height={270} loading="lazy" decoding="async" className="h-36 w-full object-cover" />
                  <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-white">{template.name}</p>
                      <span className="rounded-full border border-[#D4AF37]/40 px-2 py-0.5 text-[9px] text-[#ECC86A]">{template.badge}</span>
                    </div>
                    <p className="text-[10px] text-[#8E8EA2]">{template.category}</p>
                    <p className="line-clamp-2 text-[11px] text-[#B7B7C6]">{template.description}</p>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => previewTemplate(template.id)} className={`${chipClass(false)} flex-1 justify-center`}>
                        <Eye className="h-3.5 w-3.5" /> Preview
                      </button>
                      <button type="button" onClick={() => chooseTemplate(template.id)} className={`${chipClass(true)} flex-1 justify-center`}>
                        Customize <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {stage === 'customize' && (
        <section className="grid gap-4 lg:grid-cols-[minmax(320px,420px)_1fr]">
          <div className="space-y-3 rounded-xl border border-[#1E1E28] bg-[#0B0B11] p-3 sm:p-4">
            <div className="flex flex-wrap gap-1.5">
              {([
                ['identity', Store, 'Identity'],
                ['design', Palette, 'Design'],
                ['content', FileText, 'Content'],
                ['items', Package, profileConfig.itemLabel],
                ['sections', LayoutTemplate, 'Sections'],
              ] as const).map(([value, Icon, label]) => (
                <button key={value} type="button" onClick={() => setEditorTab(value)} className={chipClass(editorTab === value)}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>

            {editorTab === 'identity' && (
              <div className="space-y-3">
                <div>
                  <label className={labelClass} htmlFor="biz-name">Business name</label>
                  <input id="biz-name" className={inputClass} value={draft.identity.businessName} onChange={(e) => mutateDraft((d) => ({ ...d, identity: { ...d.identity, businessName: e.target.value } }))} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="logo-upload">Logo image</label>
                  <label htmlFor="logo-upload" className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#3A3A4C] text-xs text-[#C4C4D4]">
                    <Upload className="h-3.5 w-3.5" /> Upload PNG, JPG or WebP
                    <input id="logo-upload" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void uploadImage(e.target.files?.[0], { kind: 'logo' })} />
                  </label>
                  {draft.identity.logoImage && <img src={draft.identity.logoImage} alt="Selected logo" width={64} height={64} loading="lazy" decoding="async" className="mt-2 h-16 w-16 rounded object-contain" />}
                </div>
                <div>
                  <label className={labelClass} htmlFor="biz-tagline">Tagline</label>
                  <input id="biz-tagline" className={inputClass} value={draft.identity.tagline} onChange={(e) => mutateDraft((d) => ({ ...d, identity: { ...d.identity, tagline: e.target.value } }))} />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div><label className={labelClass} htmlFor="biz-phone">Phone</label><input id="biz-phone" className={inputClass} value={draft.identity.phone} onChange={(e) => mutateDraft((d) => ({ ...d, identity: { ...d.identity, phone: e.target.value } }))} /></div>
                  <div><label className={labelClass} htmlFor="biz-whatsapp">WhatsApp</label><input id="biz-whatsapp" className={inputClass} value={draft.identity.whatsapp} onChange={(e) => mutateDraft((d) => ({ ...d, identity: { ...d.identity, whatsapp: e.target.value } }))} /></div>
                </div>
                <div><label className={labelClass} htmlFor="biz-email">Email</label><input id="biz-email" type="email" className={inputClass} value={draft.identity.email} onChange={(e) => mutateDraft((d) => ({ ...d, identity: { ...d.identity, email: e.target.value } }))} /></div>
                <div><label className={labelClass} htmlFor="biz-address">Address</label><textarea id="biz-address" className={inputClass} rows={2} value={draft.identity.address} onChange={(e) => mutateDraft((d) => ({ ...d, identity: { ...d.identity, address: e.target.value } }))} /></div>
                <div><label className={labelClass} htmlFor="biz-hours">Business hours (verified only)</label><input id="biz-hours" className={inputClass} value={draft.identity.businessHours} onChange={(e) => mutateDraft((d) => ({ ...d, identity: { ...d.identity, businessHours: e.target.value } }))} /></div>
                {profileConfig.sections.includes('map') && (
                  <div><label className={labelClass} htmlFor="biz-map">Map link (https)</label><input id="biz-map" className={inputClass} placeholder="https://…" value={draft.identity.mapUrl} onChange={(e) => mutateDraft((d) => ({ ...d, identity: { ...d.identity, mapUrl: e.target.value } }))} /></div>
                )}
              </div>
            )}

            {editorTab === 'design' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div><label className={labelClass} htmlFor="primary-color">Primary color</label><input id="primary-color" type="color" className="h-11 w-full" value={draft.design.primaryColor} onChange={(e) => mutateDraft((d) => ({ ...d, design: { ...d.design, primaryColor: e.target.value } }))} /></div>
                  <div><label className={labelClass} htmlFor="accent-color">Accent color</label><input id="accent-color" type="color" className="h-11 w-full" value={draft.design.accentColor} onChange={(e) => mutateDraft((d) => ({ ...d, design: { ...d.design, accentColor: e.target.value } }))} /></div>
                </div>
                <div><label className={labelClass} htmlFor="background-color">Background</label><input id="background-color" type="color" className="h-11 w-full" value={draft.design.background} onChange={(e) => mutateDraft((d) => ({ ...d, design: { ...d.design, background: e.target.value } }))} /></div>
                {([
                  ['fontFamily', 'Font', ['Cinzel', 'Plus Jakarta Sans', 'Inter', 'Georgia']],
                  ['buttonStyle', 'Buttons', ['rounded', 'pill', 'square']],
                  ['headerStyle', 'Header', ['standard', 'minimal', 'bold']],
                  ['footerStyle', 'Footer', ['simple', 'detailed', 'minimal']],
                  ['spacing', 'Spacing', ['compact', 'comfortable', 'spacious']],
                  ['sectionLayout', 'Default layout', ['grid', 'list', 'cards']],
                ] as const).map(([key, label, options]) => (
                  <div key={key}>
                    <label className={labelClass} htmlFor={`design-${key}`}>{label}</label>
                    <select
                      id={`design-${key}`}
                      className={inputClass}
                      value={draft.design[key]}
                      onChange={(e) => mutateDraft((d) => ({ ...d, design: { ...d.design, [key]: e.target.value } }))}
                    >
                      {options.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {editorTab === 'content' && (
              <div className="space-y-3">
                <div><label className={labelClass} htmlFor="hero-headline">Banner headline</label><input id="hero-headline" className={inputClass} value={draft.content.heroHeadline} onChange={(e) => mutateDraft((d) => ({ ...d, content: { ...d.content, heroHeadline: e.target.value } }))} /></div>
                <div><label className={labelClass} htmlFor="hero-subheadline">Banner description</label><textarea id="hero-subheadline" rows={2} className={inputClass} value={draft.content.heroSubheadline} onChange={(e) => mutateDraft((d) => ({ ...d, content: { ...d.content, heroSubheadline: e.target.value } }))} /></div>
                <div>
                  <label className={labelClass} htmlFor="banner-upload">Banner image</label>
                  <label htmlFor="banner-upload" className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#3A3A4C] text-xs text-[#C4C4D4]">
                    <Upload className="h-3.5 w-3.5" /> Upload banner
                    <input id="banner-upload" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void uploadImage(e.target.files?.[0], { kind: 'banner' })} />
                  </label>
                </div>
                <div>
                  <label className={labelClass} htmlFor="gallery-upload">Gallery images</label>
                  <label htmlFor="gallery-upload" className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#3A3A4C] text-xs text-[#C4C4D4]">
                    <Upload className="h-3.5 w-3.5" /> Add gallery image
                    <input id="gallery-upload" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void uploadImage(e.target.files?.[0], { kind: 'gallery' })} />
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {draft.content.galleryImages.map((src, idx) => (
                      <div key={`${src}-${idx}`} className="relative">
                        <img src={src} alt={`Gallery ${idx + 1}`} width={56} height={56} loading="lazy" decoding="async" className="h-14 w-14 rounded object-cover" />
                        <button
                          type="button"
                          aria-label={`Remove gallery image ${idx + 1}`}
                          onClick={() => mutateDraft((d) => ({ ...d, content: { ...d.content, galleryImages: d.content.galleryImages.filter((_, i) => i !== idx) } }))}
                          className="absolute -right-1 -top-1 rounded-full bg-[#111] p-0.5 text-rose-300"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div><label className={labelClass} htmlFor="about-text">About section</label><textarea id="about-text" rows={4} className={inputClass} value={draft.content.aboutText} onChange={(e) => mutateDraft((d) => ({ ...d, content: { ...d.content, aboutText: e.target.value } }))} /></div>
              </div>
            )}

            {editorTab === 'items' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#A7A7BA]">Edit {profileConfig.itemLabel.toLowerCase()} shown in the preview.</p>
                  <button type="button" onClick={addItem} className={chipClass(false)}><Plus className="h-3.5 w-3.5" /> Add</button>
                </div>
                {draft.items.map((entry, idx) => (
                  <div key={entry.id} className="space-y-2 rounded-lg border border-[#232332] bg-[#0E0E15] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-bold text-white">{profileConfig.itemSingularLabel} {idx + 1}</p>
                      <button type="button" aria-label={`Remove ${entry.name}`} onClick={() => removeItem(entry.id)} className="text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <input aria-label={`${profileConfig.itemSingularLabel} name`} className={inputClass} value={entry.name} onChange={(e) => updateItem(entry.id, { name: e.target.value })} />
                    <textarea aria-label={`${profileConfig.itemSingularLabel} description`} rows={2} className={inputClass} value={entry.description} onChange={(e) => updateItem(entry.id, { description: e.target.value })} />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input aria-label="Price" className={inputClass} value={entry.price} onChange={(e) => updateItem(entry.id, { price: e.target.value })} />
                      <input aria-label="Category" className={inputClass} value={entry.category} onChange={(e) => updateItem(entry.id, { category: e.target.value })} />
                    </div>
                    {(profileConfig.mode === 'commerce' || draft.categoryId === 'real_estate' || draft.categoryId === 'automobile') && (
                      <>
                        <input aria-label="Options (comma separated)" className={inputClass} placeholder="Sizes / options" value={entry.sizes.join(', ')} onChange={(e) => updateItem(entry.id, { sizes: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} />
                        <input aria-label="Colors (comma separated)" className={inputClass} placeholder="Colors" value={entry.colors.join(', ')} onChange={(e) => updateItem(entry.id, { colors: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} />
                      </>
                    )}
                    <input aria-label="Extra options (comma separated)" className={inputClass} placeholder="Available options" value={entry.options.join(', ')} onChange={(e) => updateItem(entry.id, { options: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} />
                    <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#3A3A4C] text-[11px] text-[#C4C4D4]">
                      <Upload className="h-3.5 w-3.5" /> Change image
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void uploadImage(e.target.files?.[0], { kind: 'item', id: entry.id })} />
                    </label>
                  </div>
                ))}
              </div>
            )}

            {editorTab === 'sections' && (
              <div className="space-y-2">
                {draft.sections.map((section, idx) => (
                  <div key={section.id} className="rounded-lg border border-[#232332] bg-[#0E0E15] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-[11px] font-semibold text-white">
                        <input type="checkbox" checked={section.visible} onChange={(e) => updateSection(section.id, { visible: e.target.checked })} />
                        {DEMO_SECTION_LABELS[section.id]}
                      </label>
                      <div className="flex gap-1">
                        <button type="button" aria-label={`Move ${section.id} up`} onClick={() => moveSection(idx, -1)} className="text-[#A7A7BA]"><ChevronUp className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label={`Move ${section.id} down`} onClick={() => moveSection(idx, 1)} className="text-[#A7A7BA]"><ChevronDown className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    <input aria-label={`${section.id} title`} className={`${inputClass} mt-2`} value={section.title} onChange={(e) => updateSection(section.id, { title: e.target.value })} />
                    <select aria-label={`${section.id} layout`} className={`${inputClass} mt-2`} value={section.layout} onChange={(e) => updateSection(section.id, { layout: e.target.value as DemoBusinessDraft['sections'][number]['layout'] })}>
                      <option value="grid">Grid</option>
                      <option value="list">List</option>
                      <option value="cards">Cards</option>
                    </select>
                  </div>
                ))}
                <div>
                  <label className={labelClass} htmlFor="add-section">Add supported section</label>
                  <select
                    id="add-section"
                    className={inputClass}
                    defaultValue=""
                    onChange={(event) => {
                      const id = event.target.value as DemoSectionId;
                      if (id) addSection(id);
                      event.target.value = '';
                    }}
                  >
                    <option value="">Choose a section…</option>
                    {profileConfig.sections
                      .filter((id) => !draft.sections.some((section) => section.id === id))
                      .map((id) => <option key={id} value={id}>{DEMO_SECTION_LABELS[id]}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#1E1E28] bg-[#0B0B11] p-2">
              <p className="px-2 text-[11px] font-semibold text-[#C4C4D4]">Live preview · {currentTemplate?.name || draft.templateName}</p>
              <div className="flex gap-1">
                {([
                  ['desktop', Monitor, 'Desktop'],
                  ['tablet', Tablet, 'Tablet'],
                  ['mobile', Smartphone, 'Mobile'],
                ] as const).map(([value, Icon, label]) => (
                  <button key={value} type="button" aria-label={`${label} preview`} onClick={() => setDevice(value)} className={chipClass(device === value)}>
                    <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <DemoWebsitePreview draft={previewDraft} device={device} />
          </div>
        </section>
      )}

      {stage === 'preview' && (
        <section className="space-y-3">
          {previewOnlyTemplateId && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#D4AF37]/30 bg-[#12100A] p-3 text-xs text-[#F2DC9B]">
              <span>Previewing a template before selecting it. Your current draft is unchanged.</span>
              <button type="button" onClick={() => chooseTemplate(previewOnlyTemplateId)} className={chipClass(true)}>Customize this template <ArrowRight className="h-3.5 w-3.5" /></button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#1E1E28] bg-[#0B0B11] p-2">
            <p className="px-2 text-[11px] font-semibold text-[#C4C4D4]">Full website preview · {previewDraft.identity.businessName}</p>
            <div className="flex gap-1">
              {([
                ['desktop', Monitor, 'Desktop'],
                ['tablet', Tablet, 'Tablet'],
                ['mobile', Smartphone, 'Mobile'],
              ] as const).map(([value, Icon, label]) => (
                <button key={value} type="button" aria-label={`${label} preview`} onClick={() => setDevice(value)} className={chipClass(device === value)}>
                  <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>
          <DemoWebsitePreview draft={previewDraft} device={device} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setStage('customize')} className={chipClass(true)}><Settings2 className="h-3.5 w-3.5" /> Edit this preview</button>
            <button type="button" onClick={saveLocalDraft} className={chipClass(false)}><Save className="h-3.5 w-3.5" /> Save draft</button>
          </div>
        </section>
      )}

      <footer className="rounded-xl border border-[#1E1E28] bg-[#0B0B11] p-3 text-[10px] text-[#8E8EA2]">
        Drafts and previews are separate from public publishing. {TEMPLATE_TO_DEMO_CATEGORY[currentTemplate?.id || ''] ? currentTemplate?.name : ''} · {Object.keys(DEMO_CATEGORY_PROFILES).length} supported categories · {TEMPLATES_DATA.length} mapped templates.
      </footer>
    </div>
  );
};
