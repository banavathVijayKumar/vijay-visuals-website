// ============================================================================
// GET /api/owner/tenants/:tenantId/export
// Compatibility route for the export buttons in DomainManagementCenter and
// GrowthWorkspace. Delegates to the canonical full-export handler so both
// paths return the identical audited JSON payload on Cloudflare Pages.
// ============================================================================

export { onRequestOptions, onRequestGet } from './full-export';
