const { Jimp } = require('jimp');

async function getDim() {
    const img = await Jimp.read("/Users/johnjohn/.gemini/antigravity-ide/brain/0ff42eb3-c036-42a6-9444-405c7c2422bb/media__1782084290702.jpg");
    console.log(`Dimensions: ${img.bitmap.width}x${img.bitmap.height}`);
}
getDim();
