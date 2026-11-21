import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, Edit3, FolderPlus, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { apiFetch } from '../lib/api';

export interface CategoryItem {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  order: number;
  enabled: boolean;
  productCount?: number;
}

interface OwnerCategoryModalProps {
  tenantId: number;
  isOpen: boolean;
  onClose: () => void;
  onNotify: (msg: string) => void;
  onCategoriesChanged?: () => void;
}

export const OwnerCategoryModal: React.FC<OwnerCategoryModalProps> = ({
  tenantId,
  isOpen,
  onClose,
  onNotify,
  onCategoriesChanged,
}) => {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [addingCat, setAddingCat] = useState(false);

  // Rename state
  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Delete / Reassign state
  const [deletingCat, setDeletingCat] = useState<CategoryItem | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>('');
  const [deleting, setDeleting] = useState(false);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ categories: CategoryItem[] }>(`/api/owner/tenants/${tenantId}/categories`);
      setCategories(res.categories || []);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load categories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCategories();
    }
  }, [isOpen, tenantId]);

  if (!isOpen) return null;

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setAddingCat(true);
    try {
      await apiFetch(`/api/owner/tenants/${tenantId}/categories`, {
        method: 'POST',
        body: JSON.stringify({ name: newCatName.trim(), description: newCatDesc.trim() }),
      });
      setNewCatName('');
      setNewCatDesc('');
      onNotify(`Category "${newCatName.trim()}" created successfully.`);
      await loadCategories();
      onCategoriesChanged?.();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to create category.');
    } finally {
      setAddingCat(false);
    }
  };

  const handleRenameCategory = async (oldName: string) => {
    if (!renameVal.trim() || renameVal.trim() === oldName) {
      setEditingCatName(null);
      return;
    }
    setRenaming(true);
    try {
      await apiFetch(`/api/owner/tenants/${tenantId}/categories`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'rename', oldName, newName: renameVal.trim() }),
      });
      onNotify(`Category renamed to "${renameVal.trim()}" and products reassigned.`);
      setEditingCatName(null);
      await loadCategories();
      onCategoriesChanged?.();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to rename category.');
    } finally {
      setRenaming(false);
    }
  };

  const handleToggleCategory = async (cat: CategoryItem) => {
    try {
      await apiFetch(`/api/owner/tenants/${tenantId}/categories`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'toggle', name: cat.name, enabled: !cat.enabled }),
      });
      await loadCategories();
      onCategoriesChanged?.();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to toggle category.');
    }
  };

  const handleDeleteCategory = async () => {
    if (!deletingCat) return;
    setDeleting(true);
    try {
      const url = `/api/owner/tenants/${tenantId}/categories?name=${encodeURIComponent(deletingCat.name)}${
        reassignTarget ? `&reassignTo=${encodeURIComponent(reassignTarget)}` : ''
      }`;
      await apiFetch(url, { method: 'DELETE' });
      onNotify(
        reassignTarget
          ? `Category "${deletingCat.name}" removed and products moved to "${reassignTarget}".`
          : `Category "${deletingCat.name}" deleted.`
      );
      setDeletingCat(null);
      setReassignTarget('');
      await loadCategories();
      onCategoriesChanged?.();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to delete category.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-[#2B2B3C] bg-[#0E0E14] p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-[#1E1E2B] pb-3">
          <div className="flex items-center gap-2.5">
            <FolderPlus className="w-5 h-5 text-[#D4AF37]" />
            <h3 className="text-base font-semibold text-white">Store Category Management</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[#8E8EA2] hover:text-white"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Add Category Form */}
        <form onSubmit={handleAddCategory} className="rounded-xl border border-[#20202D] bg-[#12121B] p-3.5 space-y-2.5">
          <div className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Create New Category</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              required
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Category name (e.g. Sarees, Gourmet Meals)"
              className="rounded border border-[#2A2A38] bg-[#09090D] px-3 py-1.5 text-xs text-white placeholder:text-[#6E6E82]"
            />
            <input
              type="text"
              value={newCatDesc}
              onChange={(e) => setNewCatDesc(e.target.value)}
              placeholder="Short description (optional)"
              className="rounded border border-[#2A2A38] bg-[#09090D] px-3 py-1.5 text-xs text-white placeholder:text-[#6E6E82]"
            />
          </div>
          <button
            type="submit"
            disabled={addingCat || !newCatName.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-gold-gradient text-[#08080A] text-xs font-semibold disabled:opacity-50"
          >
            <span>{addingCat ? 'Creating...' : 'Add Category'}</span>
          </button>
        </form>

        {/* Category List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-[#8E8EA2]">
            <span>Configured Categories ({categories.length})</span>
            <button
              type="button"
              onClick={loadCategories}
              className="inline-flex items-center gap-1 text-[#ECC86A] hover:underline"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
            {categories.length === 0 ? (
              <p className="p-4 text-center text-xs text-[#8E8EA2]">No categories created yet.</p>
            ) : (
              categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between rounded-lg border border-[#20202E] bg-[#0B0B10] p-3 text-xs"
                >
                  <div className="flex-1 min-w-0 pr-3">
                    {editingCatName === cat.name ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={renameVal}
                          onChange={(e) => setRenameVal(e.target.value)}
                          className="rounded border border-[#D4AF37] bg-[#12121A] px-2 py-0.5 text-xs text-white"
                        />
                        <button
                          type="button"
                          disabled={renaming}
                          onClick={() => handleRenameCategory(cat.name)}
                          className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-semibold"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCatName(null)}
                          className="px-2 py-0.5 rounded border border-[#2A2A38] text-[10px] text-[#A5A5B8]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{cat.name}</span>
                        <span className="rounded-full bg-[#1A1A26] px-2 py-0.5 text-[10px] font-mono-tabular text-[#D4AF37]">
                          {cat.productCount ?? 0} {cat.productCount === 1 ? 'product' : 'products'}
                        </span>
                        {!cat.enabled && (
                          <span className="rounded bg-rose-950/60 border border-rose-800/40 px-1.5 py-0.5 text-[9px] text-rose-300">
                            Disabled
                          </span>
                        )}
                      </div>
                    )}
                    {cat.description && (
                      <p className="text-[11px] text-[#8E8EA2] mt-0.5 truncate">{cat.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleCategory(cat)}
                      className={`px-2 py-1 rounded text-[10px] font-medium border ${
                        cat.enabled
                          ? 'border-emerald-600/40 text-emerald-300 hover:bg-emerald-950/30'
                          : 'border-[#2A2A38] text-[#8E8EA2] hover:text-white'
                      }`}
                    >
                      {cat.enabled ? 'Active' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCatName(cat.name);
                        setRenameVal(cat.name);
                      }}
                      className="p-1 rounded text-[#9E9EB2] hover:text-white"
                      title="Rename category & reassign products"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeletingCat(cat);
                        setReassignTarget('');
                      }}
                      className="p-1 rounded text-rose-400 hover:text-rose-300"
                      title="Delete category"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Delete Confirmation & Dependency Reassignment Dialog */}
        {deletingCat && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-rose-300">
                  Delete Category: {deletingCat.name}?
                </p>
                {Number(deletingCat.productCount || 0) > 0 ? (
                  <p className="text-[11px] text-[#E0B4B4] mt-1">
                    Warning: <strong>{deletingCat.productCount} product(s)</strong> are assigned to this category. Choose a replacement category to safely reassign them:
                  </p>
                ) : (
                  <p className="text-[11px] text-[#E0B4B4] mt-1">
                    No active products are assigned to this category. It can be safely deleted.
                  </p>
                )}
              </div>
            </div>

            {Number(deletingCat.productCount || 0) > 0 && (
              <div>
                <label className="block text-[10px] text-[#C8C8D8] mb-1 font-medium">Reassign Products To:</label>
                <select
                  value={reassignTarget}
                  onChange={(e) => setReassignTarget(e.target.value)}
                  className="w-full rounded border border-[#2A2A38] bg-[#0A0A0E] px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="">Select target category...</option>
                  {categories
                    .filter((c) => c.name !== deletingCat.name)
                    .map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  <option value="General">General (Default)</option>
                </select>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingCat(null)}
                className="px-3 py-1 rounded border border-[#2A2A38] text-xs text-[#A5A5B8]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting || (Number(deletingCat.productCount || 0) > 0 && !reassignTarget)}
                onClick={handleDeleteCategory}
                className="px-3.5 py-1 rounded bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-[#1E1E2B]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded border border-[#2A2A38] bg-[#12121A] text-xs text-white hover:border-[#D4AF37]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
