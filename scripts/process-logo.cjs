const { Jimp } = require('jimp');
const path = require('path');

async function processLogo() {
  const logoPath = path.join(__dirname, '../src/assets/images/official_vijay_visuals_logo.jpg');
  const img = await Jimp.read(logoPath);
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  const cx = w / 2;
  const cy = h / 2;
  const maxR = 492; // outer gold circle boundary

  img.scan(0, 0, w, h, (x, y, idx) => {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > maxR) {
      if (dist >= maxR + 4) {
        img.bitmap.data[idx + 3] = 0; // completely transparent outside ring
      } else {
        const factor = 1 - (dist - maxR) / 4;
        img.bitmap.data[idx + 3] = Math.round(255 * factor); // anti-aliased edge
      }
    }
  });

  const outSrc = path.join(__dirname, '../src/assets/images/official_logo_circle.png');
  const outPublic = path.join(__dirname, '../public/official_logo_circle.png');
  await img.write(outSrc);
  await img.write(outPublic);
  console.log('Saved transparent circular logo to', outSrc);
}

processLogo().catch(console.error);
