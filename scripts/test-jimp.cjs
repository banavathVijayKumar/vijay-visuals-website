const jimpModule = require('jimp');
console.log('Keys:', Object.keys(jimpModule));
if (jimpModule.Jimp) {
  console.log('Jimp.read:', typeof jimpModule.Jimp.read);
}
