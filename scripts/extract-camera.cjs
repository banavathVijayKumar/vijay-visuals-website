const { Jimp } = require('jimp');
const path = require('path');

async function extractCameraAccent() {
  const refPath = path.join(__dirname, '../src/assets/images/hero_reference_design.jpg');
  const img = await Jimp.read(refPath);
  
  // Crop bottom-right camera gear area: x: 740 to 1024, y: 340 to 550
  const camera = img.clone();
  camera.crop({ x: 730, y: 340, w: 294, h: 210 });

  // Feather left and top edges
  const w = camera.bitmap.width;
  const h = camera.bitmap.height;

  camera.scan(0, 0, w, h, (x, y, idx) => {
    let alpha = 255;
    if (x < 60) {
      alpha = Math.min(alpha, Math.round(255 * (x / 60)));
    }
    if (y < 40) {
      alpha = Math.min(alpha, Math.round(255 * (y / 40)));
    }
    camera.bitmap.data[idx + 3] = alpha;
  });

  const outSrc = path.join(__dirname, '../src/assets/images/cinematic_camera_gear.png');
  const outPublic = path.join(__dirname, '../public/cinematic_camera_gear.png');
  await camera.write(outSrc);
  await camera.write(outPublic);
  console.log('Saved camera gear to', outSrc);
}

extractCameraAccent().catch(console.error);
