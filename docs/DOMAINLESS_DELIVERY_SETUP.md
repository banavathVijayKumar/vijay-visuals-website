# Domainless customer delivery — external setup still required

This repository contains **code support** for resolving a published tenant slug from a default delivery host such as `<slug>.vijayvisuals.in` or `<slug>.vijay-visuals-site.pages.dev`. It does **not** prove that wildcard DNS or TLS has been configured. Until the external steps below are completed and verified, the app must continue to report:

- `deliverySubdomainStatus: 'requires_wildcard_dns_tls'`
- `status: 'requires_wildcard_dns_tls'` in domain resolution
- `sslStatus: 'pending'`

The honest fallback URL remains `/site/{slug}` on the unchanged official host `https://vijay-visuals-site.pages.dev`.

## External Cloudflare steps still required

1. **Choose the authoritative delivery parent.**
   - Recommended: a zone the account already controls, for example `vijayvisuals.in`.
   - `vijay-visuals-site.pages.dev` parent-host support exists in code only; do not assume a wildcard `pages.dev` certificate exists.

2. **Create the wildcard DNS record in the Cloudflare zone.**
   - Type: `CNAME`
   - Name: `*.vijayvisuals.in` (or the chosen delivery parent)
   - Target: the Cloudflare Pages project target, currently `vijay-visuals-site.pages.dev`
   - Proxy status: follow the Pages/custom-hostname instructions for the selected Cloudflare feature; do not guess.

3. **Provision wildcard HTTPS.**
   - Use Cloudflare for SaaS Custom Hostnames or Advanced Custom Hostnames, depending on the account plan.
   - Add the wildcard hostname pattern `*.vijayvisuals.in`.
   - Set the fallback origin to the `vijay-visuals-site` Pages project.
   - Complete Cloudflare's wildcard ownership/certificate validation.
   - Wait until the custom hostname and SSL certificate statuses are actually `active` in Cloudflare.

4. **Verify from Cloudflare, then from a client.**
   - Confirm the wildcard custom hostname shows `active` DNS and SSL/TLS status in the Cloudflare dashboard/API.
   - Confirm `dig <slug>.<parent>` resolves to the expected Pages target.
   - Confirm `https://<slug>.<parent>` presents a valid certificate and renders the published tenant.
   - Confirm an unpublished or unknown slug still stays on the platform shell rather than leaking another tenant.

5. **Only then update runtime truth.**
   - Change the hardcoded `'requires_wildcard_dns_tls'` / `'pending'` values only after real verification evidence exists.
   - Keep `/site/{slug}` available as a fallback.

## Out of scope for local changes

No domain purchase, DNS edit, Cloudflare for SaaS configuration, certificate provisioning, Production change, remote D1 migration, or deployment is performed by the repository commit. These are external operator steps and remain blockers for advertising domainless delivery.
