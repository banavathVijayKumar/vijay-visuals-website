import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, LockKeyhole, RefreshCw, Save } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { TEMPLATES_DATA } from '../lib/templatesData';

interface PricingRow {
  templateId: string;
  code: string;
  name: string;
  priceInr: number;
  active: boolean;
  category: 'template' | string;
  billingCycle: 'one_time' | string;
  updatePeriodMonths: number;
  supportPeriodMonths: number;
  paidMaintenanceAfterSupport: boolean;
  included: string[];
  excluded: string[];
  maintenanceTerms: string;
  disclosures: string[];
  renewal: string;
  updatedAt: string | null;
}

interface Draft {
  priceInr: string;
  active: boolean;
  updatePeriodMonths: string;
  supportPeriodMonths: string;
  paidMaintenanceAfterSupport: boolean;
  includedText: string;
  excludedText: string;
  maintenanceTerms: string;
  disclosuresText: string;
}

interface Props {
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const FORBIDDEN_PROMISE = /\b(lifetime|unlimited|free forever|guaranteed ranking|guaranteed results|permanent|never expire)\b/i;

const asLines = (items: string[]): string => (Array.isArray(items) ? items : []).join('\n');

const fromLines = (value: string): string[] =>
  String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);

const draftFromRow = (row: PricingRow): Draft => ({
  priceInr: String(row.priceInr),
  active: Boolean(row.active),
  updatePeriodMonths: String(row.updatePeriodMonths),
  supportPeriodMonths: String(row.supportPeriodMonths),
  paidMaintenanceAfterSupport: Boolean(row.paidMaintenanceAfterSupport),
  includedText: asLines(row.included),
  excludedText: asLines(row.excluded),
  maintenanceTerms: String(row.maintenanceTerms || ''),
  disclosuresText: asLines(row.disclosures),
});

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/**
 * Owner-only pricing workspace. It uses the same server-authoritative endpoint
 * for GET and PATCH. Every save is followed by a fresh GET so the visible
 * values always come from the server rather than a local-only draft.
 */
export const OwnerTemplatePricing: React.FC<Props> = ({ onNotify }) => {
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [savedAt, setSavedAt] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ templates: PricingRow[] }>('/api/platform-owner/template-pricing');
      const loaded = Array.isArray(res.templates) ? res.templates : [];
      setRows(loaded);
      setDrafts(Object.fromEntries(loaded.map((row) => [row.templateId, draftFromRow(row)])));
      return loaded;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load template pricing.';
      setError(message);
      onNotify(`Owner template pricing could not be loaded: ${message}`, 'error');
      return [];
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void load();
  }, [load]);

  const configuredCount = rows.length;
  const activeCount = useMemo(() => rows.filter((row) => row.active).length, [rows]);

  const saveRow = useCallback(
    async (row: PricingRow) => {
      const draft = drafts[row.templateId] || draftFromRow(row);
      const priceInr = Number(draft.priceInr);
      const updatePeriodMonths = Number(draft.updatePeriodMonths);
      const supportPeriodMonths = Number(draft.supportPeriodMonths);
      const included = fromLines(draft.includedText);
      const excluded = fromLines(draft.excludedText);
      const disclosures = fromLines(draft.disclosuresText);
      const maintenanceTerms = String(draft.maintenanceTerms || '').trim();

      const validationError =
        !Number.isInteger(priceInr) || priceInr < 0 || priceInr > 5_000_000
          ? 'Enter a whole INR price from 0 to 50,00,000.'
          : !Number.isInteger(updatePeriodMonths) || updatePeriodMonths < 0 || updatePeriodMonths > 120
            ? 'Update period must be 0–120 months.'
            : !Number.isInteger(supportPeriodMonths) || supportPeriodMonths < 0 || supportPeriodMonths > 120
              ? 'Support period must be 0–120 months.'
              : included.length === 0
                ? 'Add at least one included feature.'
                : excluded.length === 0
                  ? 'Add at least one exclusion.'
                  : !maintenanceTerms
                    ? 'Maintenance terms are required.'
                    : [...included, maintenanceTerms, ...disclosures].some((item) =>
                        FORBIDDEN_PROMISE.test(item)
                      )
                      ? 'Lifetime, unlimited, free-forever or guaranteed promises are not allowed.'
                      : null;

      if (validationError) {
        setErrors((prev) => ({ ...prev, [row.templateId]: validationError }));
        onNotify(validationError, 'error');
        return;
      }

      setSaving((prev) => ({ ...prev, [row.templateId]: true }));
      setErrors((prev) => ({ ...prev, [row.templateId]: null }));
      try {
        await apiFetch<{ ok: boolean; template: PricingRow }>('/api/platform-owner/template-pricing', {
          method: 'PATCH',
          body: {
            templateId: row.templateId,
            priceInr,
            active: draft.active,
            updatePeriodMonths,
            supportPeriodMonths,
            paidMaintenanceAfterSupport: draft.paidMaintenanceAfterSupport,
            included,
            excluded,
            maintenanceTerms,
            disclosures,
          },
        });
        await load();
        setSavedAt((prev) => ({
          ...prev,
          [row.templateId]: new Date().toLocaleTimeString('en-IN', { hour12: false }),
        }));
        onNotify(`${row.name} pricing saved and reloaded from the server.`, 'success');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to save template pricing.';
        setErrors((prev) => ({ ...prev, [row.templateId]: message }));
        onNotify(`${row.name}: ${message}`, 'error');
      } finally {
        setSaving((prev) => ({ ...prev, [row.templateId]: false }));
      }
    },
    [drafts, load, onNotify]
  );

  return (
    <section className="rounded-2xl border border-[#242433] bg-[#0D0D14]/95 p-4 sm:p-6 shadow-[0_18px_60px_rgba(0,0,0,0.35)] lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-luxury text-lg sm:text-xl text-[#F5E2AC]">
            {TEMPLATES_DATA.length} Website Templates — Pricing Manager
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-[#8E8EA2]">
            One-time template prices are separate from the one-time website package plans and any
            recurring SaaS plans above. Every SKU below is an independent <code>tpl-*</code> row
            managed by the Owner only.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-[#3A3A4A] px-3 py-1.5 text-xs text-[#D5D5E2] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[#242433] bg-[#101019] p-3">
          <p className="text-[11px] text-[#8E8EA2]">Catalogue templates</p>
          <p className="mt-1 text-lg font-semibold text-white">{TEMPLATES_DATA.length}</p>
        </div>
        <div className="rounded-lg border border-[#242433] bg-[#101019] p-3">
          <p className="text-[11px] text-[#8E8EA2]">Configured SKUs</p>
          <p className="mt-1 text-lg font-semibold text-white">{configuredCount}</p>
        </div>
        <div className="rounded-lg border border-[#242433] bg-[#101019] p-3">
          <p className="text-[11px] text-[#8E8EA2]">Active for purchase</p>
          <p className="mt-1 text-lg font-semibold text-white">{activeCount}</p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-100">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <span>
          Owner-only API. A save updates only the selected template SKU and reloads from the server.
          Domain fees, hosting overages, gateway approval/MDR, refunds, payouts, delivery and paid
          maintenance after support remain separate charges. Super Admins and Customers are denied.
        </span>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-4 text-xs text-[#8E8EA2]">Loading configured template SKUs from the server…</p>
      ) : configuredCount === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-[#333344] p-4 text-xs text-[#A3A3B5]">
          No <code>tpl-*</code> SKUs are available. Migration 0029 must be applied before prices can be
          configured. The marketplace will not invent a price.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => {
            const draft = drafts[row.templateId] || draftFromRow(row);
            const rowSaving = Boolean(saving[row.templateId]);
            const rowError = errors[row.templateId];
            const rowSavedAt = savedAt[row.templateId];
            return (
              <article key={row.code} className="rounded-xl border border-[#242433] bg-[#101019] p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{row.name}</p>
                    <p className="font-mono text-[10px] text-[#7E7E92]">{row.code}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#F5E2AC]">
                      {row.active ? `${inr.format(row.priceInr)} one-time` : 'Not available yet'}
                    </p>
                    <span
                      className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] ${
                        row.active
                          ? 'bg-emerald-500/10 text-emerald-200'
                          : 'bg-amber-500/10 text-amber-200'
                      }`}
                    >
                      {row.active ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <AlertCircle className="h-3 w-3" />
                      )}
                      {row.active ? 'Active' : 'Inactive · setup pending'}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid gap-x-4 gap-y-1 text-[11px] leading-relaxed text-[#A3A3B5] md:grid-cols-2">
                  <p>
                    <span className="font-semibold text-[#D5D5E2]">Included:</span>{' '}
                    {row.included.join(' · ') || 'None stated'}
                  </p>
                  <p>
                    <span className="font-semibold text-[#D5D5E2]">Not included:</span>{' '}
                    {row.excluded.join(' · ') || 'None stated'}
                  </p>
                  <p>
                    <span className="font-semibold text-[#D5D5E2]">Updates:</span>{' '}
                    {row.updatePeriodMonths} months
                  </p>
                  <p>
                    <span className="font-semibold text-[#D5D5E2]">Support:</span>{' '}
                    {row.supportPeriodMonths} months
                  </p>
                  <p className="md:col-span-2">
                    <span className="font-semibold text-[#D5D5E2]">Maintenance:</span>{' '}
                    {row.paidMaintenanceAfterSupport
                      ? row.maintenanceTerms
                      : 'No paid maintenance after support'}
                  </p>
                </div>

                <details className="mt-3 rounded-lg border border-[#2A2A38] bg-[#0B0B11] p-3">
                  <summary className="cursor-pointer text-[11px] font-semibold text-[#D5D5E2]">
                    Edit one-time price, status and terms
                  </summary>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-[10px] text-[#8E8EA2]">
                      One-time price (INR)
                      <input
                        type="number"
                        min={0}
                        max={5000000}
                        step={1}
                        value={draft.priceInr}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.templateId]: { ...draft, priceInr: event.target.value },
                          }))
                        }
                        aria-label={`One-time INR price for ${row.name}`}
                        className="mt-1 w-full rounded border border-[#2A2A38] bg-[#08080C] px-2 py-1 text-[11px] text-white"
                      />
                    </label>
                    <label className="flex items-center gap-2 self-end text-[11px] text-[#C5C5D6]">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.templateId]: { ...draft, active: event.target.checked },
                          }))
                        }
                        aria-label={`Active state for ${row.name}`}
                      />
                      Active for purchase
                    </label>
                    <label className="text-[10px] text-[#8E8EA2]">
                      Update period (months)
                      <input
                        type="number"
                        min={0}
                        max={120}
                        step={1}
                        value={draft.updatePeriodMonths}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.templateId]: { ...draft, updatePeriodMonths: event.target.value },
                          }))
                        }
                        aria-label={`Update period in months for ${row.name}`}
                        className="mt-1 w-full rounded border border-[#2A2A38] bg-[#08080C] px-2 py-1 text-[11px] text-white"
                      />
                    </label>
                    <label className="text-[10px] text-[#8E8EA2]">
                      Support period (months)
                      <input
                        type="number"
                        min={0}
                        max={120}
                        step={1}
                        value={draft.supportPeriodMonths}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.templateId]: { ...draft, supportPeriodMonths: event.target.value },
                          }))
                        }
                        aria-label={`Support period in months for ${row.name}`}
                        className="mt-1 w-full rounded border border-[#2A2A38] bg-[#08080C] px-2 py-1 text-[11px] text-white"
                      />
                    </label>
                  </div>

                  <label className="mt-3 flex items-center gap-2 text-[11px] text-[#C5C5D6]">
                    <input
                      type="checkbox"
                      checked={draft.paidMaintenanceAfterSupport}
                      onChange={(event) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.templateId]: {
                            ...draft,
                            paidMaintenanceAfterSupport: event.target.checked,
                          },
                        }))
                      }
                      aria-label={`Paid maintenance after support for ${row.name}`}
                    />
                    Paid maintenance available after the support period
                  </label>

                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <label className="text-[10px] text-[#8E8EA2]">
                      Included features — one per line
                      <textarea
                        rows={3}
                        value={draft.includedText}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.templateId]: { ...draft, includedText: event.target.value },
                          }))
                        }
                        aria-label={`Included features for ${row.name}`}
                        className="mt-1 w-full rounded border border-[#2A2A38] bg-[#08080C] px-2 py-1 text-[11px] text-white"
                      />
                    </label>
                    <label className="text-[10px] text-[#8E8EA2]">
                      Exclusions — one per line
                      <textarea
                        rows={3}
                        value={draft.excludedText}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.templateId]: { ...draft, excludedText: event.target.value },
                          }))
                        }
                        aria-label={`Exclusions for ${row.name}`}
                        className="mt-1 w-full rounded border border-[#2A2A38] bg-[#08080C] px-2 py-1 text-[11px] text-white"
                      />
                    </label>
                    <label className="text-[10px] text-[#8E8EA2] lg:col-span-2">
                      Paid maintenance terms
                      <textarea
                        rows={2}
                        value={draft.maintenanceTerms}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.templateId]: { ...draft, maintenanceTerms: event.target.value },
                          }))
                        }
                        aria-label={`Maintenance terms for ${row.name}`}
                        className="mt-1 w-full rounded border border-[#2A2A38] bg-[#08080C] px-2 py-1 text-[11px] text-white"
                      />
                    </label>
                    <label className="text-[10px] text-[#8E8EA2] lg:col-span-2">
                      Additional disclosures — one per line, optional
                      <textarea
                        rows={2}
                        value={draft.disclosuresText}
                        onChange={(event) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.templateId]: { ...draft, disclosuresText: event.target.value },
                          }))
                        }
                        aria-label={`Additional disclosures for ${row.name}`}
                        className="mt-1 w-full rounded border border-[#2A2A38] bg-[#08080C] px-2 py-1 text-[11px] text-white"
                      />
                    </label>
                  </div>

                  {rowError ? (
                    <p className="mt-3 rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1 text-[10px] text-rose-200">
                      {rowError}
                    </p>
                  ) : null}
                  {rowSavedAt ? (
                    <p className="mt-3 flex items-center gap-1 text-[10px] text-emerald-200">
                      <CheckCircle2 className="h-3 w-3" />
                      Saved and reloaded from server at {rowSavedAt}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void saveRow(row)}
                    disabled={rowSaving || loading}
                    className="mt-3 inline-flex items-center gap-2 rounded-md bg-[#F5E2AC] px-3 py-1.5 text-[11px] font-semibold text-[#12121A] disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {rowSaving ? 'Saving…' : 'Save template pricing'}
                  </button>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default OwnerTemplatePricing;
