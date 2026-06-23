const { Jimp } = require('jimp');

async function slice() {
    const img = await Jimp.read("/Users/johnjohn/.gemini/antigravity-ide/brain/0ff42eb3-c036-42a6-9444-405c7c2422bb/media__1782084290702.jpg");
    const w = 1024;
    const h = 571;
    
    const cols = 7;
    const rows = 2;
    const cellW = Math.floor(w / cols);
    const cellH = Math.floor(h / rows);
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const piece = img.clone();
            // Crop cell, but reduce height by 50px at the bottom to remove Chinese text
            piece.crop({x: c * cellW, y: r * cellH, w: cellW, h: cellH - 40});
            
            // Remove background
            for (let y = 0; y < piece.bitmap.height; y++) {
                for (let x = 0; x < piece.bitmap.width; x++) {
                    const color = piece.getPixelColor(x, y);
                    const red = (color >> 24) & 255;
                    const green = (color >> 16) & 255;
                    const blue = (color >> 8) & 255;
                    
                    // Background is light cream/beige
                    if (red > 220 && green > 220 && blue > 200) {
                        piece.setPixelColor(0x00000000, x, y); // transparent
                    }
                }
            }
            await piece.write(`/Users/johnjohn/project/streetFighter/client/public/sprites/char_${r}_${c}.png`);
        }
    }
    console.log("Sliced the REAL image into 14 characters");
}
slice();
