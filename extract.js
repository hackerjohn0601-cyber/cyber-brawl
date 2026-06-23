const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');

async function extract() {
    const imgPath = "/Users/johnjohn/.gemini/antigravity-ide/brain/0ff42eb3-c036-42a6-9444-405c7c2422bb/media__1782083447051.png";
    const img = await Jimp.read(imgPath);
    
    const w = img.bitmap.width;
    const h = img.bitmap.height;
    
    // Find the white bounding box
    let minX = w, minY = h, maxX = 0, maxY = 0;
    
    // We sample pixels. The background is dark (R<50), the box is light (R>200)
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const color = img.getPixelColor(x, y);
            const r = (color >> 24) & 255;
            const g = (color >> 16) & 255;
            const b = (color >> 8) & 255;
            
            if (r > 200 && g > 200 && b > 200) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    
    console.log("White box bounds:", minX, minY, maxX, maxY);
    
    if (minX < maxX && minY < maxY) {
        // Crop the image to the white box
        img.crop({x: minX, y: minY, w: maxX - minX, h: maxY - minY});
        
        // Save to public dir
        const outDir = "/Users/johnjohn/project/streetFighter/client/public/sprites";
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, {recursive: true});
        
        await img.write(`${outDir}/characters.png`);
        console.log("Saved cropped image.");
    }
}
extract();
