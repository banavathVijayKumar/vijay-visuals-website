# VIJAY VISUALS — Future AI Video & Photo Editing Roadmap

**Status:** `FUTURE ROADMAP`  
**Current release scope:** Not implemented in the VIJAY VISUALS website platform.  
**Date:** 2026-11-28

This document keeps the AI video/photo editing vision separate from the current website, builder, storefront and payment platform. No editing product, render pipeline, model provider, native app or paid media job is activated by this document.

## 1. Scope boundary

The current platform must not present itself as a media-editing agency or claim that these capabilities are live. Existing generic AI text helpers remain separate from this future product.

Deferred product ideas:

- AI video editing.
- AI photo editing and retouching.
- Prompt-based editing.
- Wedding cinematic trailer creation.
- Automatic titles for generated videos and trailers.
- Advanced creator tools.
- Future desktop/mobile applications, including any Android release.

## 2. Phase 0 — Discovery and owner decisions

Required before any implementation:

- Confirm target users: internal creative team, customers, or both.
- Confirm platforms: browser-only first, then desktop/mobile only if approved.
- Confirm budget, provider/model, per-render cost ceiling and abuse controls.
- Confirm media rights, upload consent, retention/deletion policy and output ownership.
- Confirm whether customer media may be used for model training: default is **no**.
- Confirm moderation, copyright and third-party asset rules.
- Confirm whether any promotional MP4s are allowed before a render pipeline exists.

## 3. Phase 1 — Safe foundations

Planned only after Phase 0 approval:

- Isolated media storage with signed upload/download URLs.
- Per-tenant quota and atomic credit reservation.
- Server-side job queue with idempotency keys.
- Audit log for prompts, model calls, costs and outputs without logging private media.
- Redaction of secrets, OTPs, payment data and personal documents from logs.
- No browser-exposed provider keys.

## 4. Phase 2 — Editing MVP

Candidate capabilities, not current commitments:

- Photo enhancement and background cleanup.
- Short-clip trimming, captions and title overlays.
- Prompt-based style presets with approved asset libraries.
- Human review before publish or delivery.
- Draft/preview/export lifecycle.

## 5. Phase 3 — Cinematic and wedding workflows

Candidate capabilities, not current commitments:

- Wedding trailer templates with client-approved footage only.
- Automatic title suggestion from approved names, date and style preferences.
- Timeline review, revision requests and final approval gates.
- Delivery manifests with rights and usage terms.

## 6. Phase 4 — Native applications

No native Android or desktop source exists in this repository today. Any future app needs separate scope, signing, store policy, update and support planning.

## 7. Explicit non-goals for the current launch

- No AI video editor in the current website launch.
- No fake or storyboard-only MP4 represented as a delivered product.
- No automatic Instagram DM API automation without approved credentials and permissions.
- No real rider payouts, Cashfree Live activation, Easy Split activation or Production migration as part of this roadmap.
- No use of customer media for training without explicit, separate written consent.

## 8. Current evidence boundaries

Existing `docs/video/*` files are storyboards/subtitles only. `src/data/videoShowcase.ts` and `VideoShowcaseSection.tsx` are presentation assets, not a render pipeline. `functions/api/ai/*` contains generic text-oriented AI helpers, not media editing.

This roadmap is documentation only. It does not authorize implementation, provider spend, external API access or Production changes.
