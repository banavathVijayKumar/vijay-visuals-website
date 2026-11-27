// ============================================================================
// Shared live-location freshness rules for delivery GPS state.
// A stale ping is last-known data, never a live movement claim.
// ============================================================================

export const LIVE_LOCATION_MAX_AGE_MS = 5 * 60 * 1000;

/** Parse both SQLite `datetime('now')` and ISO-8601 timestamps as UTC. */
export function parseRecordedAt(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const sqliteUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text}Z` : text;
  const parsed = Date.parse(sqliteUtc);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isFreshLocation(
  recordedAt: string | null | undefined,
  now: number = Date.now()
): boolean {
  const recorded = parseRecordedAt(recordedAt);
  if (recorded == null) return false;
  const age = now - recorded;
  return age >= -60_000 && age <= LIVE_LOCATION_MAX_AGE_MS;
}
