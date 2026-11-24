const { Jimp } = require('jimp');
const path = require('path');

async function processImages() {
  const refPath = path.join(__dirname, '../src/assets/images/hero_reference_design.jpg');
  const founderPath = path.join(__dirname, '../src/assets/images/founder_original_portrait.jpg');

  const refImg = await Jimp.read(refPath);
  console.log('Ref img size:', refImg.bitmap.width, refImg.bitmap.height);

  // In the reference screenshot, the founder is on the left.
  // Let's crop x: 0 to 420, y: 70 to 576 (leaving out top nav)
  const refFounder = refImg.clone();
  refFounder.crop({ x: 0, y: 70, w: 420, h: 506 });
  await refFounder.write(path.join(__dirname, '../public/founder_ref_crop.png'));
  console.log('Cropped ref founder saved to public/founder_ref_crop.png');

  // Let's also check the original founder portrait
  const origImg = await Jimp.read(founderPath);
  console.log('Original founder size:', origImg.bitmap.width, origImg.bitmap.height);
}

processImages().catch(console.error);
