const { Jimp } = require('jimp');
const path = require('path');

async function createFeatheredFounder() {
  const refPath = path.join(__dirname, '../public/founder_ref_crop.png');
  const img = await Jimp.read(refPath);
  const w = img.bitmap.width;
  const h = img.bitmap.height;

  // Let's create an image with transparent gradient on the right edge
  // From x = 320 to x = w (420), fade alpha from 255 down to 0
  img.scan(0, 0, w, h, (x, y, idx) => {
    // If x > 300, fade alpha
    if (x > 300) {
      const factor = 1 - (x - 300) / (w - 300);
      const alpha = Math.max(0, Math.min(255, Math.round(255 * factor)));
      // current alpha
      const curA = img.bitmap.data[idx + 3];
      img.bitmap.data[idx + 3] = Math.min(curA, alpha);
    }
    // Also fade top edge slightly if needed (first 10px)
    if (y < 15) {
      const factor = y / 15;
      img.bitmap.data[idx + 3] = Math.round(img.bitmap.data[idx + 3] * factor);
    }
  });

  const outPath = path.join(__dirname, '../src/assets/images/founder_cinematic_cutout.png');
  const outPublic = path.join(__dirname, '../public/founder_cinematic_cutout.png');
  await img.write(outPath);
  await img.write(outPublic);
  console.log('Saved feathered cutout to', outPath);
}

createFeatheredFounder().catch(console.error);
