import React, { useCallback, useEffect, useState } from 'react';
import {
  Barcode,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  Lock,
  Package,
  Plus,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { StaffMemberRecord, SupplierRecord, TenantRecord, WarehouseRecord } from '../types/platform';

interface EnrichedProduct {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
  lowStockThreshold: number;
  skuCode: string;
  recordedUnitCost: number;
  retailValueInr: number;
}

interface PurchaseOrderRow {
  id: number;
  poNumber: string;
  supplierName: string;
  itemName: string;
  quantity: number;
  unitCostInr: number;
  totalCostInr: number;
  status: string;
  paymentStatus: string;
  expectedDate: string;
  createdAt: string;
}

interface StockMovementRow {
  id: number;
  productId: number;
  movementType: string;
  quantityDelta: number;
  skuBarcode: string;
  expiryDate: string;
  reason: string;
  actorEmail: string;
  createdAt: string;
}

interface StaffTaskRow {
  id: number;
  staffId: number | null;
  staffName: string;
  title: string;
  description: string;
  priority: string;
  dueDate: string;
  status: string;
  assignedBy: string;
}

interface InventoryAndHrOpsProps {
  tenant: TenantRecord;
  mode: 'inventory_po' | 'hr_tasks';
  onRefreshTenant: () => void;
  onNotify: (msg: string) => void;
}

export const InventoryAndHrOps: React.FC<InventoryAndHrOpsProps> = ({
  tenant,
  mode,
  onRefreshTenant,
  onNotify,
}) => {
  // Inventory & PO state
  const [products, setProducts] = useState<EnrichedProduct[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRow[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [valuation, setValuation] = useState({
    totalUnitsInStock: 0,
    retailValuationInr: 0,
    estimatedCostValuationInr: 0,
    productsWithRecordedCost: 0,
    totalProducts: 0,
    damagedUnitsRecorded: 0,
    supplierOutstandingInr: 0,
  });

  // Create PO form
  const [poSupplierId, setPoSupplierId] = useState<string>('');
  const [poSupplierName, setPoSupplierName] = useState('');
  const [poProductId, setPoProductId] = useState<string>('');
  const [poItemName, setPoItemName] = useState('');
  const [poQty, setPoQty] = useState(20);
  const [poUnitCost, setPoUnitCost] = useState(450);
  const [poExpectedDate, setPoExpectedDate] = useState('');

  // Stock Movement / Damaged / Transfer / Expiry form
  const [mvProductId, setMvProductId] = useState<string>('');
  const [mvWarehouseId, setMvWarehouseId] = useState<string>('');
  const [mvType, setMvType] = useState<'damaged' | 'transfer' | 'adjustment' | 'purchase_in'>('damaged');
  const [mvQty, setMvQty] = useState(1);
  const [mvDirection, setMvDirection] = useState<'in' | 'out'>('out');
  const [mvExpiry, setMvExpiry] = useState('');
  const [mvReason, setMvReason] = useState('');

  // Expanded Accounting Entry (Module 5)
  const [accType, setAccType] = useState<'income' | 'expense' | 'debit_note' | 'cash_bank'>('income');
  const [accParty, setAccParty] = useState('');
  const [accCategory, setAccCategory] = useState('Direct Cash / Bank');
  const [accAmount, setAccAmount] = useState(5000);
  const [accGst, setAccGst] = useState(18);
  const [accNotes, setAccNotes] = useState('');

  // HR Tasks & Backup state
  const [staff, setStaff] = useState<StaffMemberRecord[]>([]);
  const [tasks, setTasks] = useState<StaffTaskRow[]>([]);
  const [canViewPayroll, setCanViewPayroll] = useState(true);
  const [taskStaffId, setTaskStaffId] = useState<string>('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [taskDue, setTaskDue] = useState('');
  const [backupResult, setBackupResult] = useState<{
    verified: boolean;
    checksumSha256: string;
    versionNumber: number;
    infrastructureNotice: string;
  } | null>(null);
  const [verifyingBackup, setVerifyingBackup] = useState(false);

  const loadInventoryOps = useCallback(async () => {
    try {
      const res = await apiFetch<{
        products: EnrichedProduct[];
        purchaseOrders: PurchaseOrderRow[];
        stockMovements: StockMovementRow[];
        warehouses: WarehouseRecord[];
        suppliers: SupplierRecord[];
        valuation: typeof valuation;
      }>(`/api/owner/tenants/${tenant.id}/inventory-ops`);
      setProducts(res.products);
      setPurchaseOrders(res.purchaseOrders);
      setMovements(res.stockMovements);
      setWarehouses(res.warehouses);
      setSuppliers(res.suppliers);
      setValuation(res.valuation);
      if (res.products[0] && !mvProductId) {
        setMvProductId(String(res.products[0].id));
        setPoProductId(String(res.products[0].id));
        setPoItemName(res.products[0].name);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load inventory operations.');
    }
  }, [tenant.id, mvProductId, onNotify]);

  const loadHrOps = useCallback(async () => {
    try {
      const res = await apiFetch<{
        canViewPayroll: boolean;
        staff: StaffMemberRecord[];
        tasks: StaffTaskRow[];
      }>(`/api/owner/tenants/${tenant.id}/hr-ops`);
      setCanViewPayroll(res.canViewPayroll);
      setStaff(res.staff);
      setTasks(res.tasks);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to load HR task tracker.');
    }
  }, [tenant.id, onNotify]);

  useEffect(() => {
    if (mode === 'inventory_po') loadInventoryOps();
    if (mode === 'hr_tasks') loadHrOps();
  }, [mode, loadInventoryOps, loadHrOps]);

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenSupplier = suppliers.find((s) => String(s.id) === poSupplierId);
    const chosenProduct = products.find((p) => String(p.id) === poProductId);
    const finalSupplierName = chosenSupplier?.name || poSupplierName.trim();
    const finalItemName = poItemName.trim() || chosenProduct?.name || '';
    if (!finalSupplierName || !finalItemName) {
      onNotify('Enter supplier name and product/item name.');
      return;
    }
    try {
      await apiFetch(`/api/owner/tenants/${tenant.id}/purchase-orders`, {
        method: 'POST',
        body: JSON.stringify({
          supplierId: chosenSupplier ? chosenSupplier.id : null,
          supplierName: finalSupplierName,
          productId: chosenProduct ? chosenProduct.id : null,
          itemName: finalItemName,
          quantity: Number(poQty),
          unitCostInr: Number(poUnitCost),
          expectedDate: poExpectedDate,
        }),
      });
      setPoSupplierName('');
      await loadInventoryOps();
      onNotify('Purchase Order created.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to create Purchase Order.');
    }
  };

  const handleReceivePo = async (po: PurchaseOrderRow) => {
    try {
      await apiFetch(`/api/owner/purchase-orders/${po.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'received', recordExpense: true }),
      });
      await loadInventoryOps();
      onRefreshTenant();
      onNotify(`${po.poNumber} marked Received: stock updated and expense logged.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to update Purchase Order.');
    }
  };

  const handleMarkPoPaid = async (po: PurchaseOrderRow) => {
    try {
      await apiFetch(`/api/owner/purchase-orders/${po.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ paymentStatus: 'paid' }),
      });
      await loadInventoryOps();
      onNotify(`${po.poNumber} marked Paid.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to update payment status.');
    }
  };

  const handleLogStockMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mvProductId || !mvReason.trim()) {
      onNotify('Select a product and enter a clear reason.');
      return;
    }
    try {
      await apiFetch(`/api/owner/tenants/${tenant.id}/stock-movements`, {
        method: 'POST',
        body: JSON.stringify({
          productId: Number(mvProductId),
          warehouseId: mvWarehouseId ? Number(mvWarehouseId) : null,
          movementType: mvType,
          quantity: Number(mvQty),
          direction: mvDirection,
          expiryDate: mvExpiry,
          reason: mvReason.trim(),
        }),
      });
      setMvReason('');
      setMvExpiry('');
      await loadInventoryOps();
      onRefreshTenant();
      onNotify('Stock movement recorded and product stock updated.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to record stock movement.');
    }
  };

  const handleAddFinanceEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accParty.trim()) return;
    try {
      await apiFetch(`/api/owner/tenants/${tenant.id}/finance-entry`, {
        method: 'POST',
        body: JSON.stringify({
          recordType: accType,
          partyName: accParty.trim(),
          category: accCategory.trim(),
          amountInr: Number(accAmount),
          gstRatePct: Number(accGst),
          notes: accNotes.trim(),
        }),
      });
      setAccParty('');
      setAccNotes('');
      onNotify('Accounting entry saved to Finance Ledger.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to record accounting entry.');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    const assignedStaff = staff.find((s) => String(s.id) === taskStaffId);
    try {
      await apiFetch(`/api/owner/tenants/${tenant.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          staffId: assignedStaff ? assignedStaff.id : null,
          staffName: assignedStaff ? assignedStaff.name : 'Unassigned',
          title: taskTitle.trim(),
          priority: taskPriority,
          dueDate: taskDue,
        }),
      });
      setTaskTitle('');
      setTaskDue('');
      await loadHrOps();
      onNotify('Staff task assigned.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to assign task.');
    }
  };

  const handleUpdateTaskStatus = async (taskId: number, status: 'pending' | 'in_progress' | 'completed') => {
    try {
      await apiFetch(`/api/owner/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadHrOps();
      onNotify('Task status updated.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to update task.');
    }
  };

  const handleRunBackupVerify = async () => {
    setVerifyingBackup(true);
    try {
      const res = await apiFetch<{
        verified: boolean;
        checksumSha256: string;
        version: { versionNumber: number };
        infrastructureNotice: string;
      }>(`/api/owner/tenants/${tenant.id}/backup-verify`, { method: 'POST' });
      setBackupResult({
        verified: res.verified,
        checksumSha256: res.checksumSha256,
        versionNumber: res.version.versionNumber,
        infrastructureNotice: res.infrastructureNotice,
      });
      onNotify(`Snapshot v${res.version.versionNumber} backup & restore checksum verified.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Backup verification failed.');
    } finally {
      setVerifyingBackup(false);
    }
  };

  const handleDownloadFullExport = async () => {
    try {
      const data = await apiFetch<Record<string, unknown>>(`/api/owner/tenants/${tenant.id}/full-export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tenant.slug}-complete-bos-export.json`;
      a.click();
      URL.revokeObjectURL(url);
      onNotify('Full Business OS export downloaded.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  // ================= MODE 2: STAFF TASKS, PAYROLL GUARD & BACKUP VERIFY =================
  if (mode === 'hr_tasks') {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-4 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-white font-medium">Role-Based Payroll Protection:</span>
            <span className="text-[#9E9EB2]">
              {canViewPayroll
                ? 'Authorized as Business Owner / Super Admin — salary & payroll controls unlocked.'
                : 'Staff Role Detected — personal salary & payroll fields are restricted on server.'}
            </span>
          </div>
        </div>

        {/* Assign Staff Task */}
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-[#D4AF37]" />
            <span>Module 7 · Staff Work Assignments & Task Tracking</span>
          </h3>
          <form onSubmit={handleCreateTask} className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              type="text"
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Task title (e.g. Pack 10 bridal orders)"
              className="sm:col-span-2 rounded-md border border-[#2A2A3A] bg-[#08080C] px-3 py-2 text-xs text-white"
            />
            <select
              value={taskStaffId}
              onChange={(e) => setTaskStaffId(e.target.value)}
              className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-xs text-white"
            >
              <option value="">Assign Staff (Optional)</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.staffRole})
                </option>
              ))}
            </select>
            <select
              value={taskPriority}
              onChange={(e) => setTaskPriority(e.target.value as typeof taskPriority)}
              className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-xs text-white"
            >
              <option value="low">Low Priority</option>
              <option value="normal">Normal Priority</option>
              <option value="high">High Priority</option>
              <option value="urgent">Urgent</option>
            </select>
            <div className="flex gap-2">
              <input
                type="date"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
                className="flex-1 rounded-md border border-[#2A2A3A] bg-[#08080C] px-2 py-2 text-xs text-white"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </form>

          {tasks.length === 0 ? (
            <p className="text-xs text-[#8E8EA2]">No staff tasks assigned yet.</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border border-[#1F1F2C] bg-[#09090D] p-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <p className="font-semibold text-white">{t.title}</p>
                    <p className="text-[11px] text-[#9A9AAE]">
                      Assigned to: <span className="text-[#ECC86A]">{t.staffName}</span> · Priority: {t.priority}
                      {t.dueDate ? ` · Due: ${t.dueDate}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(['pending', 'in_progress', 'completed'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleUpdateTaskStatus(t.id, st)}
                        className={`px-2.5 py-1 rounded text-[11px] capitalize ${
                          t.status === st
                            ? 'bg-[#D4AF37] text-[#08080A] font-semibold'
                            : 'bg-[#161622] text-[#A3A3B5] hover:text-white'
                        }`}
                      >
                        {st.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Module 14: Verified Snapshot Backup & Multi-Table Export */}
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-[#D4AF37]" />
                <span>Module 14 · Backup Verification & Full Data Export</span>
              </h3>
              <p className="text-xs text-[#9E9EB2] mt-0.5">
                Test snapshot save-and-readback SHA-256 integrity in PostgreSQL or download all business records as JSON.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={verifyingBackup}
                onClick={handleRunBackupVerify}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold disabled:opacity-60"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{verifyingBackup ? 'Verifying...' : 'Run Snapshot Restore Check'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadFullExport}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[#D4AF37]/50 text-xs text-[#ECC86A]"
              >
                <Download className="w-4 h-4" />
                <span>Export All Tables (JSON)</span>
              </button>
            </div>
          </div>

          {backupResult && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/15 p-3.5 text-xs space-y-1">
              <p className="font-semibold text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  Snapshot v{backupResult.versionNumber} Integrity: {backupResult.verified ? 'VERIFIED PASS' : 'MISMATCH'}
                </span>
              </p>
              <p className="font-mono-tabular text-[11px] text-[#B8B8CA] break-all">
                SHA-256 Checksum: {backupResult.checksumSha256}
              </p>
              <p className="text-[11px] text-[#9A9AAE]">{backupResult.infrastructureNotice}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ================= MODE 1: INVENTORY, PURCHASE ORDERS, STOCK MOVEMENTS & VALUATION =================
  return (
    <div className="space-y-6">
      {/* Valuation KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3.5">
          <p className="text-[11px] text-[#8E8EA2]">Units in Stock</p>
          <p className="font-mono-tabular text-lg font-bold text-white mt-1">{valuation.totalUnitsInStock}</p>
        </div>
        <div className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3.5">
          <p className="text-[11px] text-[#8E8EA2]">Retail Stock Value</p>
          <p className="font-mono-tabular text-lg font-bold text-[#ECC86A] mt-1">
            ₹{valuation.retailValuationInr.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3.5">
          <p className="text-[11px] text-[#8E8EA2]">Est. Cost Valuation</p>
          <p className="font-mono-tabular text-lg font-bold text-emerald-400 mt-1">
            ₹{valuation.estimatedCostValuationInr.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3.5">
          <p className="text-[11px] text-[#8E8EA2]">Supplier Dues</p>
          <p className="font-mono-tabular text-lg font-bold text-amber-300 mt-1">
            ₹{valuation.supplierOutstandingInr.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="rounded-lg border border-[#222230] bg-[#0D0D13] p-3.5">
          <p className="text-[11px] text-[#8E8EA2]">Damaged Units</p>
          <p className="font-mono-tabular text-lg font-bold text-rose-400 mt-1">{valuation.damagedUnitsRecorded}</p>
        </div>
      </div>

      {/* Purchase Order Creation + List */}
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Truck className="w-4 h-4 text-[#D4AF37]" />
          <span>Module 4 · Supplier Purchase Orders (Auto-Updates Stock on Receipt)</span>
        </h3>
        <form onSubmit={handleCreatePo} className="grid sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <select
            value={poSupplierId}
            onChange={(e) => {
              setPoSupplierId(e.target.value);
              const s = suppliers.find((x) => String(x.id) === e.target.value);
              if (s) setPoSupplierName(s.name);
            }}
            className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-xs text-white"
          >
            <option value="">Select Supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={poSupplierName}
            onChange={(e) => setPoSupplierName(e.target.value)}
            placeholder="Or Supplier Name"
            className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-xs text-white"
          />
          <select
            value={poProductId}
            onChange={(e) => {
              setPoProductId(e.target.value);
              const p = products.find((x) => String(x.id) === e.target.value);
              if (p) setPoItemName(p.name);
            }}
            className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-xs text-white"
          >
            <option value="">Link Product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (Stock: {p.stock})
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={poQty}
            onChange={(e) => setPoQty(Number(e.target.value))}
            placeholder="Qty"
            className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-xs font-mono-tabular text-white"
          />
          <input
            type="number"
            min={1}
            value={poUnitCost}
            onChange={(e) => setPoUnitCost(Number(e.target.value))}
            placeholder="Unit Cost ₹"
            className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-xs font-mono-tabular text-white"
          />
          <button
            type="submit"
            className="rounded-md bg-gold-gradient text-[#08080A] text-xs font-semibold px-3 py-2"
          >
            + Create PO
          </button>
        </form>

        {purchaseOrders.length === 0 ? (
          <p className="text-xs text-[#8E8EA2]">No purchase orders created yet.</p>
        ) : (
          <div className="space-y-2">
            {purchaseOrders.map((po) => (
              <div
                key={po.id}
                className="rounded-lg border border-[#1E1E2B] bg-[#09090D] p-3 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <p className="font-semibold text-white">
                    <span className="font-mono-tabular text-[#ECC86A] mr-2">{po.poNumber}</span>
                    {po.itemName} × {po.quantity}
                  </p>
                  <p className="text-[11px] text-[#9A9AAE]">
                    Supplier: {po.supplierName} · Unit ₹{po.unitCostInr} · Total ₹{po.totalCostInr.toLocaleString('en-IN')} · Status:{' '}
                    <span className="text-white uppercase">{po.status}</span> · Payment:{' '}
                    <span className={po.paymentStatus === 'paid' ? 'text-emerald-400' : 'text-amber-300'}>
                      {po.paymentStatus}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {po.status === 'ordered' && (
                    <button
                      type="button"
                      onClick={() => handleReceivePo(po)}
                      className="px-2.5 py-1 rounded bg-emerald-600/90 text-white text-[11px] font-semibold hover:bg-emerald-500"
                    >
                      Mark Received (+Stock)
                    </button>
                  )}
                  {po.paymentStatus !== 'paid' && (
                    <button
                      type="button"
                      onClick={() => handleMarkPoPaid(po)}
                      className="px-2.5 py-1 rounded border border-[#D4AF37]/50 text-[#ECC86A] text-[11px]"
                    >
                      Mark Paid
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stock Movement: Damaged Stock, Warehouse Transfers & Expiry Tracking */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Package className="w-4 h-4 text-[#D4AF37]" />
            <span>Log Stock Movement / Damaged / Expiry / Transfer</span>
          </h3>
          <form onSubmit={handleLogStockMovement} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <select
                value={mvProductId}
                onChange={(e) => setMvProductId(e.target.value)}
                className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-white"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.stock})
                  </option>
                ))}
              </select>
              <select
                value={mvType}
                onChange={(e) => setMvType(e.target.value as typeof mvType)}
                className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-white"
              >
                <option value="damaged">Damaged Stock (-)</option>
                <option value="transfer">Warehouse Transfer</option>
                <option value="adjustment">Manual Stock Adjustment</option>
                <option value="purchase_in">Direct Stock-In (+)</option>
              </select>
              <input
                type="number"
                min={1}
                value={mvQty}
                onChange={(e) => setMvQty(Number(e.target.value))}
                placeholder="Qty"
                className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 font-mono-tabular text-white"
              />
              {mvType === 'adjustment' ? (
                <select
                  value={mvDirection}
                  onChange={(e) => setMvDirection(e.target.value as 'in' | 'out')}
                  className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-white"
                >
                  <option value="in">Add Stock (+)</option>
                  <option value="out">Deduct Stock (-)</option>
                </select>
              ) : (
                <select
                  value={mvWarehouseId}
                  onChange={(e) => setMvWarehouseId(e.target.value)}
                  className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-white"
                >
                  <option value="">Warehouse (Optional)</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.city})
                    </option>
                  ))}
                </select>
              )}
              <input
                type="date"
                value={mvExpiry}
                onChange={(e) => setMvExpiry(e.target.value)}
                title="Product batch expiry date (optional)"
                className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-white"
              />
              <input
                type="text"
                required
                value={mvReason}
                onChange={(e) => setMvReason(e.target.value)}
                placeholder="Reason (e.g. Transit damage / Shelf transfer)"
                className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 rounded-md bg-gold-gradient text-[#08080A] font-semibold"
            >
              Record Stock Movement
            </button>
          </form>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pt-2 border-t border-[#1E1E2B]">
            {movements.slice(0, 8).map((mv) => (
              <div key={mv.id} className="flex items-center justify-between text-[11px] py-1 border-b border-[#161620]">
                <span className="text-[#C8C8D8] truncate pr-2">
                  <strong className="uppercase text-[#ECC86A] mr-1.5">{mv.movementType}</strong>
                  {mv.skuBarcode} · {mv.reason}
                  {mv.expiryDate ? ` · Exp ${mv.expiryDate}` : ''}
                </span>
                <span
                  className={`font-mono-tabular font-semibold shrink-0 ${
                    mv.quantityDelta < 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {mv.quantityDelta > 0 ? `+${mv.quantityDelta}` : mv.quantityDelta}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Module 5: Quick Income, Debit Note & Cash/Bank Accounting Entry */}
        <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Module 5 · Cash, Bank, Income & Debit Note Entry</h3>
          <form onSubmit={handleAddFinanceEntry} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <select
                value={accType}
                onChange={(e) => setAccType(e.target.value as typeof accType)}
                className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-white"
              >
                <option value="income">Other Income</option>
                <option value="expense">Business Expense</option>
                <option value="cash_bank">Cash / Bank Record</option>
                <option value="debit_note">Debit Note</option>
              </select>
              <input
                type="text"
                required
                value={accParty}
                onChange={(e) => setAccParty(e.target.value)}
                placeholder="Customer / Bank / Vendor Name"
                className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-white"
              />
              <input
                type="text"
                value={accCategory}
                onChange={(e) => setAccCategory(e.target.value)}
                placeholder="Category (Rent, Bank Deposit, etc.)"
                className="rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-white"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={accAmount}
                  onChange={(e) => setAccAmount(Number(e.target.value))}
                  placeholder="Amount ₹"
                  className="flex-1 rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 font-mono-tabular text-white"
                />
                <input
                  type="number"
                  min={0}
                  max={28}
                  value={accGst}
                  onChange={(e) => setAccGst(Number(e.target.value))}
                  title="Configurable GST %"
                  className="w-16 rounded-md border border-[#2A2A3A] bg-[#08080C] px-2 py-2 font-mono-tabular text-white"
                />
              </div>
            </div>
            <input
              type="text"
              value={accNotes}
              onChange={(e) => setAccNotes(e.target.value)}
              placeholder="Reference note / bank transaction ID"
              className="w-full rounded-md border border-[#2A2A3A] bg-[#08080C] px-2.5 py-2 text-white"
            />
            <button
              type="submit"
              className="w-full py-2 rounded-md border border-[#D4AF37]/60 text-[#ECC86A] font-semibold hover:bg-[#19160E]"
            >
              Save Accounting Record
            </button>
          </form>
          <p className="text-[11px] text-[#8E8EA2]">
            Tax rates are configurable (0%–28%). Operational accounting exports assist bookkeeping and do not replace Chartered Accountant GST filing validation.
          </p>
        </div>
      </div>

      {/* SKU / Barcode & Valuation Table */}
      <div className="rounded-xl border border-[#222230] bg-[#0D0D13] p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Barcode className="w-4 h-4 text-[#D4AF37]" />
          <span>Product SKU / Barcode Registry & Valuation</span>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#1E1E2B] text-[#8E8EA2]">
                <th className="py-2 pr-3">SKU / Barcode</th>
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3">Stock</th>
                <th className="py-2 pr-3">Retail Price</th>
                <th className="py-2">Stock Value</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-[#161620]">
                  <td className="py-2 pr-3 font-mono-tabular text-[#ECC86A]">{p.skuCode}</td>
                  <td className="py-2 pr-3 text-white">{p.name}</td>
                  <td className="py-2 pr-3 font-mono-tabular">
                    <span className={p.stock <= p.lowStockThreshold ? 'text-amber-400 font-semibold' : 'text-white'}>
                      {p.stock}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono-tabular text-[#D0D0DF]">₹{p.price.toLocaleString('en-IN')}</td>
                  <td className="py-2 font-mono-tabular text-emerald-400">
                    ₹{p.retailValueInr.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
