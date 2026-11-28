import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';

import { apiFetch } from '../lib/api';
import { ServiceRecord } from '../types/platform';

interface ServiceCatalogManagerProps {
  tenantSlug: string;
  onNotify: (message: string) => void;
}

const emptyForm = {
  name: '',
  description: '',
  category: 'General',
  price: '',
  durationMinutes: '60',
  sortOrder: '0',
  imageUrl: '',
  active: true,
};

export const ServiceCatalogManager: React.FC<ServiceCatalogManagerProps> = ({
  tenantSlug,
  onNotify,
}) => {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);

  const loadServices = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setMigrationRequired(false);
    try {
      const data = await apiFetch<{ services: ServiceRecord[] }>(
        `/api/tenants/${encodeURIComponent(tenantSlug)}/services`
      );
      setServices(Array.isArray(data.services) ? data.services : []);
    } catch (err: any) {
      if (String(err?.message || '').includes('migration 0027')) {
        setMigrationRequired(true);
        setServices([]);
      } else {
        onNotify(err instanceof Error ? err.message : 'Unable to load services.');
      }
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, onNotify]);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
  };

  const startEdit = (service: ServiceRecord) => {
    setEditingId(service.id);
    setForm({
      name: service.name,
      description: service.description,
      category: service.category,
      price: String(service.price),
      durationMinutes: String(service.durationMinutes),
      sortOrder: String(service.sortOrder),
      imageUrl: service.imageUrl,
      active: service.active,
    });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantSlug || saving) return;
    if (!form.name.trim() || Number(form.price) < 0) {
      onNotify('Enter a service name and a non-negative price.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category.trim() || 'General',
        price: Number(form.price),
        durationMinutes: Number(form.durationMinutes) || 0,
        sortOrder: Number(form.sortOrder) || 0,
        imageUrl: form.imageUrl.trim(),
        active: form.active,
      };
      if (editingId) {
        await apiFetch(`/api/services/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        onNotify('Service updated.');
      } else {
        await apiFetch(`/api/tenants/${encodeURIComponent(tenantSlug)}/services`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onNotify('Service added to your catalog.');
      }
      resetForm();
      await loadServices();
    } catch (err: any) {
      if (String(err?.message || '').includes('migration 0027')) setMigrationRequired(true);
      onNotify(err instanceof Error ? err.message : 'Unable to save service.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (service: ServiceRecord) => {
    if (!window.confirm(`Remove "${service.name}" from your service catalog?`)) return;
    try {
      await apiFetch(`/api/services/${service.id}?soft=true`, { method: 'DELETE' });
      onNotify('Service deactivated.');
      await loadServices();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to deactivate service.');
    }
  };

  return (
    <div className="space-y-5 text-xs">
      <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">Services &amp; Pricing</h3>
            <p className="mt-1 text-[11px] text-[#8E8EA2]">
              Tenant-specific service catalog. Prices are shown on your public storefront; payments are never processed here.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadServices()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded border border-[#2A2A38] px-2.5 py-1.5 text-[11px] text-[#B8B8C8] hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {migrationRequired && (
          <div className="mb-4 rounded border border-amber-500/40 bg-amber-950/20 p-3 text-[11px] text-amber-200">
            Service storage is not available on this database yet. Apply additive D1 migration 0027 before using this section.
          </div>
        )}

        <form onSubmit={handleSave} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-[#8E8EA2]">Service name</span>
            <input
              value={form.name}
              maxLength={160}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-xs text-white"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-[#8E8EA2]">Category</span>
            <input
              value={form.category}
              maxLength={80}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-xs text-white"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-[#8E8EA2]">Price (INR)</span>
            <input
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-xs text-white"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-[#8E8EA2]">Duration (minutes)</span>
            <input
              type="number"
              min={0}
              value={form.durationMinutes}
              onChange={(e) => setForm((prev) => ({ ...prev, durationMinutes: e.target.value }))}
              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-xs text-white"
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-[10px] uppercase tracking-wider text-[#8E8EA2]">Description</span>
            <textarea
              value={form.description}
              maxLength={1000}
              rows={2}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-xs text-white"
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-[10px] uppercase tracking-wider text-[#8E8EA2]">Image URL (optional, HTTPS only)</span>
            <input
              value={form.imageUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
              className="w-full rounded border border-[#2A2A38] bg-[#08080C] px-2.5 py-2 text-xs text-white"
            />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-[#B8B8C8]">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
              className="accent-[#D4AF37]"
            />
            Visible on storefront
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-10 items-center gap-1.5 rounded bg-gold-gradient px-3 font-semibold text-[#08080A]"
            >
              <Plus className="h-3.5 w-3.5" /> {saving ? 'Saving...' : editingId ? 'Update Service' : 'Add Service'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex min-h-10 items-center gap-1.5 rounded border border-[#2A2A38] px-3 text-[#A5A5B8]"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-[#20202D] bg-[#0D0D13] p-5">
        <h3 className="mb-3 text-sm font-semibold text-white">Catalog ({services.length})</h3>
        {services.length === 0 ? (
          <p className="text-[11px] text-[#8E8EA2]">No services stored yet. Add your first service above.</p>
        ) : (
          <div className="space-y-2">
            {services.map((service) => (
              <div
                key={service.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#1E1E2B] bg-[#09090D] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">
                    {service.name}{' '}
                    <span className="font-mono-tabular text-[#ECC86A]">₹{service.price.toLocaleString('en-IN')}</span>
                  </p>
                  <p className="text-[10px] text-[#8E8EA2]">
                    {service.category} · {service.durationMinutes || 0} min · {service.active ? 'Visible' : 'Hidden'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(service)}
                    className="inline-flex items-center gap-1 rounded border border-[#2A2A38] px-2 py-1 text-[10px] text-[#B8B8C8] hover:text-white"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(service)}
                    className="inline-flex items-center gap-1 rounded border border-rose-500/40 px-2 py-1 text-[10px] text-rose-300"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
