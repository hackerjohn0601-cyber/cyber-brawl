from PIL import Image

img_path = '/Users/johnjohn/.gemini/antigravity-ide/brain/0ff42eb3-c036-42a6-9444-405c7c2422bb/media__1782004459988.png'
img = Image.open(img_path).convert('RGBA')
pixels = img.load()

# Shop background: rgba(15, 20, 30, 0.95) -> rgb(15, 20, 30) for simplicity
for y in range(img.height):
    for x in range(img.width):
        r, g, b, a = pixels[x, y]
        diff = max(r, g, b) - min(r, g, b)
        if diff < 30 and r > 170:
            # Replace checkerboard / white with transparent
            pixels[x, y] = (0, 0, 0, 0)

import os
os.makedirs('client/public/assets', exist_ok=True)
img.save('client/public/assets/shopkeeper.png')
print('Saved to client/public/assets/shopkeeper.png')
