<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/db2616c2-2362-4788-b7fa-d00c0564f1ef

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Customer Website Publishing

Publishing is prepared but requires manual Supabase and Cloudflare setup:

1. Review `supabase/customer-website-publishing.sql`. Before applying it, confirm the live `customer_websites`, `profiles`, and publication schemas match its preflight assumptions. Apply the existing website, restaurant-menu, commerce-catalog, and private-storage migrations first if they are not already installed.
2. Apply the publishing SQL manually in the Supabase SQL Editor. This repository does not run migrations automatically.
3. Deploy `supabase/functions/customer-website-public-asset` with the Supabase CLI. Set `SUPABASE_SERVICE_ROLE_KEY` only as a Supabase Edge Function secret; never add it to frontend or Cloudflare Pages variables. The function is public by design, but serves only assets referenced by a currently published snapshot.
4. Configure the Cloudflare Pages runtime variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for the `functions/site/[[slug]].ts` route. The publishable key is public; do not use a service-role key here.
5. Deploy the site and Edge Function manually after reviewing the changes. Public customer websites use `/site/{slug}`.

Published external images are limited to HTTPS URLs without query strings or storage paths. Uploaded private assets are proxied only when referenced by a published snapshot.
