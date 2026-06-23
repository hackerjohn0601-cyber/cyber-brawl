const { Jimp } = require('jimp');

async function slice() {
    const img = await Jimp.read("/Users/johnjohn/project/streetFighter/client/public/sprites/characters.png");
    const w = img.bitmap.width;
    const h = img.bitmap.height;
    
    // Let's assume 7 columns, 2 rows based on typical Gemini outputs for 14 classes
    const cols = 7;
    const rows = 2;
    const cellW = Math.floor(w / cols);
    const cellH = Math.floor(h / rows);
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const piece = img.clone();
            piece.crop({x: c * cellW, y: r * cellH, w: cellW, h: cellH});
            // remove white background
            for (let y = 0; y < cellH; y++) {
                for (let x = 0; x < cellW; x++) {
                    const color = piece.getPixelColor(x, y);
                    const red = (color >> 24) & 255;
                    const green = (color >> 16) & 255;
                    const blue = (color >> 8) & 255;
                    if (red > 220 && green > 220 && blue > 220) {
                        piece.setPixelColor(0x00000000, x, y); // transparent
                    }
                }
            }
            await piece.write(`/Users/johnjohn/project/streetFighter/client/public/sprites/char_${r}_${c}.png`);
        }
    }
    console.log("Sliced into 14 characters");
}
slice();
