// Seeded preview storefronts from src/db/seed.ts. These are demo catalogs,
// not verified live businesses. Keep sample data clearly labeled in the UI.
export const DEMO_STORE_SLUGS = new Set([
  'deccan-royal-couture',
  'nocturne-audio-tech',
  'nizam-heritage-kitchen',
  'telangana-harvest-organics',
]);

export const isDemoStoreSlug = (slug: string | null | undefined): boolean =>
  Boolean(slug && DEMO_STORE_SLUGS.has(slug));
