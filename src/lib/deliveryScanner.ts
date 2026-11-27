// ============================================================================
// LOCAL DELIVERY SCANNER HELPERS
// No external QR/barcode service. SKU/barcode values already exist in D1.
// Batch state and offline events stay in the browser; no mutation is replayed.
// ============================================================================

export interface DeliveryProductLookup {
  id: number;
  name: string;
  sku: string;
  barcode: string;
  stock: number;
  active: boolean;
}

export interface ParsedOrderItem {
  productId: number;
  name: string;
  variant: string;
  quantity: number;
}

export type PickupScanStatus = 'ok' | 'wrong_product' | 'over_scan' | 'unknown_product';

export interface DeliveryScanEvent {
  dedupeKey: string;
  tenantId: string;
  orderId: number;
  productId: number | null;
  code: string;
  status: PickupScanStatus;
  createdAt: string;
  syncedAt?: string;
}

export interface PickupProgressItem {
  productId: number;
  name: string;
  expected: number;
  picked: number;
  sku: string;
  barcode: string;
}

const SCAN_QUEUE_KEY = 'vv_scan_queue_v1';
const MAX_QUEUED_SCANS = 200;

export function normalizeScanCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/^SKU:/, '')
    .replace(/^BARCODE:/, '')
    .replace(/\s+/g, '');
}

export function scanDedupeKey(
  tenantId: string,
  orderId: number,
  code: string,
  createdAt: string
): string {
  return `${tenantId}|${orderId}|${normalizeScanCode(code)}|${createdAt}`;
}

export function parseOrderItems(itemsJson: string): ParsedOrderItem[] {
  try {
    const parsed = JSON.parse(itemsJson || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: Record<string, any>) => ({
        productId: Number(item?.productId || 0),
        name: String(item?.name || ''),
        variant: String(item?.variant || ''),
        quantity: Math.max(1, Number(item?.quantity || 1)),
      }))
      .filter((item) => Number.isInteger(item.productId) && item.productId > 0);
  } catch {
    return [];
  }
}

export function buildPickupProgress(
  items: ParsedOrderItem[],
  products: DeliveryProductLookup[]
): PickupProgressItem[] {
  const catalog = new Map(products.map((p) => [p.id, p]));
  return items.map((item) => {
    const product = catalog.get(item.productId);
    return {
      productId: item.productId,
      name: product?.name || item.name || `Product #${item.productId}`,
      expected: item.quantity,
      picked: 0,
      sku: product?.sku || '',
      barcode: product?.barcode || '',
    };
  });
}

export function matchPickupCode(
  code: string,
  progress: PickupProgressItem[],
  tenantId = ''
): { item: PickupProgressItem | null; status: PickupScanStatus } {
  const normalized = normalizeScanCode(code);
  if (!normalized) return { item: null, status: 'unknown_product' };

  const exact = progress.find(
    (item) =>
      normalizeScanCode(item.sku) === normalized ||
      normalizeScanCode(item.barcode) === normalized ||
      (tenantId &&
        normalizeScanCode(buildLabelPayload(tenantId, item.productId)) === normalized)
  );
  if (!exact) return { item: null, status: 'wrong_product' };
  if (exact.picked >= exact.expected) return { item: exact, status: 'over_scan' };
  return { item: exact, status: 'ok' };
}

export function applyPickupScan(
  progress: PickupProgressItem[],
  code: string,
  tenantId = ''
): { progress: PickupProgressItem[]; status: PickupScanStatus; productId: number | null } {
  const match = matchPickupCode(code, progress, tenantId);
  if (!match.item || match.status !== 'ok') {
    return { progress, status: match.status, productId: match.item?.productId || null };
  }
  return {
    progress: progress.map((item) =>
      item.productId === match.item?.productId ? { ...item, picked: item.picked + 1 } : item
    ),
    status: 'ok',
    productId: match.item.productId,
  };
}

export function pickupComplete(progress: PickupProgressItem[]): boolean {
  return progress.length > 0 && progress.every((item) => item.picked >= item.expected);
}

export function buildLabelPayload(tenantId: string, productId: number): string {
  return `VV|${tenantId}|${productId}`;
}

// ---------------------------------------------------------------------------
// Offline scan queue: persistent, capped, deduped, and reconciliation-only.
// ---------------------------------------------------------------------------

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadScanQueue(): DeliveryScanEvent[] {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(SCAN_QUEUE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((event) => event && typeof event.dedupeKey === 'string')
      .slice(-MAX_QUEUED_SCANS) as DeliveryScanEvent[];
  } catch {
    return [];
  }
}

export function enqueueScan(event: DeliveryScanEvent): DeliveryScanEvent[] {
  const storage = safeStorage();
  if (!storage) return loadScanQueue();
  const existing = loadScanQueue();
  if (existing.some((item) => item.dedupeKey === event.dedupeKey)) return existing;
  const next = [...existing, event].slice(-MAX_QUEUED_SCANS);
  try {
    storage.setItem(SCAN_QUEUE_KEY, JSON.stringify(next));
  } catch {
    // Storage quota/privacy mode must never break live scanning.
  }
  return next;
}

export function markScansSynced(dedupeKeys: string[]): DeliveryScanEvent[] {
  const storage = safeStorage();
  if (!storage) return loadScanQueue();
  const keys = new Set(dedupeKeys);
  const next = loadScanQueue().map((event) =>
    keys.has(event.dedupeKey) ? { ...event, syncedAt: new Date().toISOString() } : event
  );
  try {
    storage.setItem(SCAN_QUEUE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage write failures; queue remains in memory for this session.
  }
  return next;
}

export async function reconcileScanQueue(
  verify: (event: DeliveryScanEvent) => Promise<boolean>
): Promise<{ verified: string[]; unresolved: string[] }> {
  const verified: string[] = [];
  const unresolved: string[] = [];
  for (const event of loadScanQueue()) {
    if (event.syncedAt) continue;
    try {
      if (await verify(event)) verified.push(event.dedupeKey);
      else unresolved.push(event.dedupeKey);
    } catch {
      unresolved.push(event.dedupeKey);
    }
  }
  if (verified.length) markScansSynced(verified);
  return { verified, unresolved };
}

// ---------------------------------------------------------------------------
// Dependency-free label generation. QR is byte-mode / ECC-L / mask 0, capped
// at version 5 so no version-information blocks are required.
// ---------------------------------------------------------------------------

const QR_CAPACITIES = [
  { version: 1, data: 19, ec: 7 },
  { version: 2, data: 34, ec: 10 },
  { version: 3, data: 55, ec: 15 },
  { version: 4, data: 80, ec: 20 },
  { version: 5, data: 108, ec: 26 },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
for (let i = 0; i < 255; i += 1) {
  let value = 1;
  for (let j = 0; j < i; j += 1) {
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  GF_EXP[i] = value & 0xff;
  GF_LOG[value & 0xff] = i;
}
for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];

function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function reedSolomonRemainder(data: number[], degree: number): number[] {
  let generator = [1];
  for (let i = 0; i < degree; i += 1) {
    const root = GF_EXP[i];
    const next = new Array(generator.length + 1).fill(0);
    for (let j = 0; j < generator.length; j += 1) {
      next[j] ^= generator[j];
      next[j + 1] ^= gfMultiply(generator[j], root);
    }
    generator = next;
  }
  const remainder = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let i = 0; i < degree; i += 1) {
      remainder[i] ^= gfMultiply(generator[i + 1], factor);
    }
  }
  return remainder;
}

export function qrFormatBits(eccBits: number, mask: number): number {
  let data = (eccBits << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

function alignmentCenters(version: number): number[] {
  return [6, 6 + version * 4];
}

export function qrIsFunctionModule(x: number, y: number, size: number): boolean {
  if (x < 0 || y < 0 || x >= size || y >= size) return false;
  if (x <= 8 && y <= 8) return true;
  if (x >= size - 8 && y <= 8) return true;
  if (x <= 8 && y >= size - 8) return true;
  if (x === 6 || y === 6) return true;

  const version = (size - 17) / 4;
  if (version >= 2) {
    const centers = alignmentCenters(version);
    for (const cx of centers) {
      for (const cy of centers) {
        if (
          (cx === 6 && cy === 6) ||
          (cx === 6 && cy === size - 7) ||
          (cx === size - 7 && cy === 6)
        ) {
          continue;
        }
        if (Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2) return true;
      }
    }
  }
  return false;
}

export function qrMatrix(payload: string): boolean[][] | null {
  const bytes = Array.from(new TextEncoder().encode(payload));
  const capacity = QR_CAPACITIES.find((c) => 4 + 8 + bytes.length * 8 <= c.data * 8);
  if (!capacity) return null;

  const size = 17 + capacity.version * 4;
  const matrix: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFunction = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    matrix[y][x] = dark;
    reserved[y][x] = true;
  };

  const drawFinder = (left: number, top: number) => {
    for (let dy = -1; dy <= 7; dy += 1) {
      for (let dx = -1; dx <= 7; dx += 1) {
        const x = left + dx;
        const y = top + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const inCore = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        const dark = inCore
          ? dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
          : false;
        setFunction(x, y, dark);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  for (let i = 8; i < size - 8; i += 1) {
    setFunction(i, 6, i % 2 === 0);
    setFunction(6, i, i % 2 === 0);
  }

  if (capacity.version >= 2) {
    const centers = alignmentCenters(capacity.version);
    for (const cx of centers) {
      for (const cy of centers) {
        if (
          (cx === 6 && cy === 6) ||
          (cx === 6 && cy === size - 7) ||
          (cx === size - 7 && cy === 6)
        ) {
          continue;
        }
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            const dark = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
            setFunction(cx + dx, cy + dy, dark);
          }
        }
      }
    }
  }

  const format = qrFormatBits(1, 0);
  for (let i = 0; i <= 5; i += 1) setFunction(8, i, ((format >>> i) & 1) === 1);
  setFunction(8, 7, ((format >>> 6) & 1) === 1);
  setFunction(8, 8, ((format >>> 7) & 1) === 1);
  setFunction(7, 8, ((format >>> 8) & 1) === 1);
  for (let i = 9; i <= 14; i += 1) setFunction(14 - i, 8, ((format >>> i) & 1) === 1);
  for (let i = 0; i <= 7; i += 1) setFunction(size - 1 - i, 8, ((format >>> i) & 1) === 1);
  for (let i = 8; i <= 14; i += 1) setFunction(8, size - 15 + i, ((format >>> i) & 1) === 1);
  setFunction(8, size - 8, true);

  const dataBits: number[] = [];
  const pushBits = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) dataBits.push((value >>> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const byte of bytes) pushBits(byte, 8);
  const terminator = Math.min(4, capacity.data * 8 - dataBits.length);
  for (let i = 0; i < terminator; i += 1) dataBits.push(0);
  while (dataBits.length % 8 !== 0) dataBits.push(0);
  const dataCodewords: number[] = [];
  for (let i = 0; i < dataBits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) value = (value << 1) | dataBits[i + j];
    dataCodewords.push(value);
  }
  for (let pad = 0xec; dataCodewords.length < capacity.data; pad = pad === 0xec ? 0x11 : 0xec) {
    dataCodewords.push(pad);
  }
  const codewords = [...dataCodewords, ...reedSolomonRemainder(dataCodewords, capacity.ec)];

  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - vertical : vertical;
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        if (reserved[y][x]) continue;
        let dark = false;
        if (bitIndex < codewords.length * 8) {
          dark = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) === 1;
        }
        if ((x + y) % 2 === 0) dark = !dark;
        matrix[y][x] = dark;
        bitIndex += 1;
      }
    }
  }

  return matrix;
}

export function qrSvg(payload: string): string {
  const matrix = qrMatrix(payload);
  if (!matrix) return '';
  const size = matrix.length;
  const withQuiet = size + 8;
  const rects: string[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (matrix[y][x]) rects.push(`<rect x="${x + 4}" y="${y + 4}" width="1" height="1"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${withQuiet} ${withQuiet}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects.join('')}</g></svg>`;
}

// The space is a real Code 39 character and must stay in this index table.
const CODE39_CHARACTERS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*';
const CODE39_ENCODINGS = [
  20957, 29783, 23639, 30485, 20951, 29813, 23669, 20855, 29789, 23645,
  29975, 23831, 30533, 22295, 30149, 24005, 21623, 29981, 23837, 22301,
  30023, 23879, 30545, 22343, 30161, 24017, 21959, 30065, 23921, 22385,
  29015, 18263, 29141, 17879, 29045, 18293, 17783, 29021, 18269, 17477,
  17489, 17681, 20753, 35770,
];

export function code39Pattern(raw: string): string | null {
  const value = normalizeScanCode(raw).toUpperCase();
  if (!value || !/^[0-9A-Z\-\.\ \$\/\+\%]+$/.test(value)) return null;
  const encode = (character: string) =>
    CODE39_ENCODINGS[CODE39_CHARACTERS.indexOf(character)].toString(2);
  return encode('*') + Array.from(value).map((character) => `${encode(character)}0`).join('') + encode('*');
}

export function code39Svg(raw: string): string {
  const pattern = code39Pattern(raw);
  if (!pattern) return '';
  const modules = Array.from(pattern).map((bit) => bit === '1');
  const width = modules.length;
  const bars: string[] = [];
  let x = 0;
  while (x < modules.length) {
    const dark = modules[x];
    let run = 1;
    while (x + run < modules.length && modules[x + run] === dark) run += 1;
    if (dark) bars.push(`<rect x="${x}" y="0" width="${run}" height="60"/>`);
    x += run;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 60" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars.join('')}</g></svg>`;
}

export interface CameraScanResult {
  supported: boolean;
  code: string | null;
  error?: string;
}

export async function scanFromCamera(video: HTMLVideoElement): Promise<CameraScanResult> {
  const detectorClass = (globalThis as any).BarcodeDetector;
  if (!detectorClass) {
    return { supported: false, code: null, error: 'Native camera barcode detection is unavailable.' };
  }
  try {
    const formats: string[] = await detectorClass.getSupportedFormats?.() || [];
    const preferred = [
      'qr_code',
      'code_128',
      'code_39',
      'ean_13',
      'ean_8',
      'upc_a',
      'upc_e',
    ].filter((format) => formats.length === 0 || formats.includes(format));
    const detector = new detectorClass(preferred.length ? { formats: preferred } : undefined);
    const codes = await detector.detect(video);
    return { supported: true, code: codes?.[0]?.rawValue ? String(codes[0].rawValue) : null };
  } catch (err: any) {
    return { supported: true, code: null, error: String(err?.message || 'Camera scan failed.') };
  }
}
