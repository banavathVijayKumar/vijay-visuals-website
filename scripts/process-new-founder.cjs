const { Jimp } = require('jimp');
const path = require('path');

async function processFounder() {
  const imgPath = 'C:/Users/vijay/.gemini/antigravity/brain/72261e4e-ed8e-4130-a6cb-9da8e7079dcf/.user_uploaded/media_1795530969171_506e096f.jpg';
  const img = await Jimp.read(imgPath);
  const w = img.bitmap.width;
  const h = img.bitmap.height;

  // Visited array for BFS flood fill
  const visited = new Uint8Array(w * h);
  const isBg = new Uint8Array(w * h);
  const queue = [];

  function isDark(idx) {
    const r = img.bitmap.data[idx];
    const g = img.bitmap.data[idx + 1];
    const b = img.bitmap.data[idx + 2];
    // Black studio background is pure black or very dark
    return Math.max(r, g, b) < 15;
  }

  // Push border pixels
  for (let x = 0; x < w; x++) {
    queue.push(x, 0);
    // don't push bottom edge as subject touches bottom
  }
  for (let y = 0; y < h; y++) {
    queue.push(0, y);
    queue.push(w - 1, y);
  }

  let head = 0;
  while (head < queue.length) {
    const x = queue[head++];
    const y = queue[head++];
    const pos = y * w + x;
    if (visited[pos]) continue;
    visited[pos] = 1;

    const idx = pos * 4;
    if (isDark(idx)) {
      isBg[pos] = 1;
      if (x > 0 && !visited[pos - 1]) queue.push(x - 1, y);
      if (x < w - 1 && !visited[pos + 1]) queue.push(x + 1, y);
      if (y > 0 && !visited[pos - w]) queue.push(x, y - 1);
      if (y < h - 1 && !visited[pos + w]) queue.push(x, y + 1);
    }
  }

  // Generate initial alpha mask (0 for bg, 255 for fg)
  const alphaMask = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    alphaMask[i] = isBg[i] ? 0 : 255;
  }

  // Smooth / anti-alias the alpha mask at the boundary with a 3x3 box blur (1 pass)
  const smoothedAlpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pos = y * w + x;
      // If interior or exterior deep, keep as is
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          sum += alphaMask[ny * w + nx];
          count++;
        }
      }
      smoothedAlpha[pos] = Math.round(sum / count);
    }
  }

  const out = img.clone();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pos = y * w + x;
      const idx = pos * 4;
      out.bitmap.data[idx + 3] = smoothedAlpha[pos];
    }
  }

  // Save to src/assets/images and public
  const outSrc = path.join(__dirname, '../src/assets/images/founder_hero_portrait.png');
  const outPublic = path.join(__dirname, '../public/founder_hero_portrait.png');
  const outSrcJpg = path.join(__dirname, '../src/assets/images/founder_hero_portrait.jpg');
  const outPublicJpg = path.join(__dirname, '../public/founder_hero_portrait.jpg');

  await out.write(outSrc);
  await out.write(outPublic);
  await img.write(outSrcJpg);
  await img.write(outPublicJpg);

  console.log('Saved founder_hero_portrait.png to src and public.');
}

processFounder().catch(console.error);
