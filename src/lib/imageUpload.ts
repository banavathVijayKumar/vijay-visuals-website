// ============================================================================
// VIJAY VISUALS — SAFE CLIENT-SIDE IMAGE UPLOAD & VALIDATION UTILITY
// Accepts PNG, JPEG, or WebP only (rejects SVG/HTML/executables).
// Automatically resizes large photos cleanly via HTML5 Canvas so stored assets
// stay compact (< 220 KB) inside Cloudflare D1 without requiring paid R2/S3.
// ============================================================================

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const MAX_INPUT_BYTES = 5 * 1024 * 1024; // 5 MB raw selection limit
const MAX_DATA_URL_LENGTH = 320_000; // ~240 KB binary payload

export async function readAndOptimizeImageFile(
  file: File,
  maxDimension = 960
): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type.toLowerCase())) {
    throw new Error('Only PNG, JPG, and WebP images are supported.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Image file is too large (maximum 5 MB).');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read selected image file.'));
    reader.readAsDataURL(file);
  });

  if (rawDataUrl.length <= MAX_DATA_URL_LENGTH) {
    return rawDataUrl;
  }

  // Downscale cleanly via Canvas when needed
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Invalid image file.'));
    el.src = rawDataUrl;
  });

  const scale = Math.min(1, maxDimension / Math.max(img.width || 1, img.height || 1));
  const targetW = Math.max(1, Math.round(img.width * scale));
  const targetH = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browser canvas is unavailable for image optimization.');
  ctx.drawImage(img, 0, 0, targetW, targetH);

  let quality = 0.82;
  let optimized = canvas.toDataURL('image/webp', quality);
  if (!optimized.startsWith('data:image/webp')) {
    optimized = canvas.toDataURL('image/jpeg', quality);
  }
  while (optimized.length > MAX_DATA_URL_LENGTH && quality > 0.35) {
    quality -= 0.15;
    optimized = canvas.toDataURL('image/jpeg', quality);
  }
  if (optimized.length > MAX_DATA_URL_LENGTH) {
    throw new Error('Image is still too large after compression. Please pick a smaller image.');
  }
  return optimized;
}

export const optimizeImageFileToDataUrl = readAndOptimizeImageFile;
