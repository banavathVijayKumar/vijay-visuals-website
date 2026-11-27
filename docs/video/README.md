# VIJAY VISUALS promotional video production package

Status: **PRODUCTION-READY SCRIPTS / STORYBOARDS — VIDEO GENERATION BLOCKED**.

No MP4 was generated. No paid provider, paid credit, external API, or unverified local generator was called. The official website will show “video being prepared” until a real, approved generation method exists.

## Deliverables in this package

- `customer-demo.md` — 14-scene customer tutorial/advertisement.
- `shop-owner-demo.md` — 14-scene shop-owner tutorial/advertisement.
- `delivery-partner-demo.md` — 15-scene rider tutorial/advertisement.
- `public/video/subtitles/*.vtt` — matching subtitle files for every language actually implemented by the site. Each WebVTT holds **8 condensed narration cues** aligned to the `videoShowcase.ts` timings; declared subtitle durations are 100s (customer), 100s (shop owner) and 102s (delivery partner). The storyboards keep the full scene-by-scene timing (the customer storyboard ends at 95s) for visuals, not cue boundaries.
- `src/data/videoShowcase.ts` — machine-readable demos, languages, subtitle timing, and availability state.
- `src/components/VideoShowcaseSection.tsx` — official website integration with accessible controls.

## Hard production rules

1. Use the existing official assets only:
   - `public/official_logo.png`
   - `public/official_logo_circle.png`
   - `src/assets/images/official_vijay_visuals_logo.jpg`
   - `public/logo.svg`, `public/logo-icon.svg`
2. Do not redraw, distort, recolor, or replace the logo.
3. Every screen marked **REAL PRODUCT SCREEN** must be captured from local Preview with demo data only.
4. Every scene marked **AI ILLUSTRATIVE** must carry a small visible label: “Illustrative scene — not a product screen”.
5. Cashfree checkout must be sandbox or clearly labelled simulation. Never show a real payment.
6. Never show fake testimonials, ratings, customer counts, guaranteed delivery times, or guaranteed earnings.
7. Earned balance, pending payout, and provider-confirmed paid payout are different states. Never show a completed payout without provider evidence.
8. Customer-facing white-label websites must not show VIJAY VISUALS branding. These videos are for the official VIJAY VISUALS website and approved social channels only.

## Supported formats

| Version | Resolution | Use |
|---|---:|---|
| Website | 1920x1080 | Official site showcase section |
| Social | 1080x1920 | Reels/Shorts/Stories with large burnt-in captions |

## Voice-over policy

Telugu is the primary production language. Translated narration text and subtitle files are provided for every language implemented by the site, but **no voice-over audio exists for any language yet**. Every language is therefore labelled **subtitles only**. The player falls back to the verified English captions, with an on-screen notice, only for an **unsupported or unlisted language code**; missing subtitle asset files are not detected by this local implementation. Do not claim voice-over where none exists.

## Adding a language later

Add the language code to `VIDEO_LANGUAGES` in `src/data/videoShowcase.ts`, add translated lines to each demo script, add matching `.vtt` files, and run `scripts/test-video-showcase.ts`. No player rewrite is needed.

## Blocker for actual video generation

A trustworthy, already-approved non-paid generation/editing method was not confirmed during the local tooling audit. Generation remains BLOCKED until an approved method is available. Do not substitute a slideshow or blank/fake MP4.
