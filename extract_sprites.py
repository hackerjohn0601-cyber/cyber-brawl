import cv2
import numpy as np
import os

# Load the image
image_path = "/Users/johnjohn/.gemini/antigravity-ide/brain/0ff42eb3-c036-42a6-9444-405c7c2422bb/media__1782083447051.png"
img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)

# Create output dir
out_dir = "/Users/johnjohn/project/streetFighter/client/public/sprites"
os.makedirs(out_dir, exist_ok=True)

# Convert to grayscale for thresholding
if len(img.shape) == 4:
    gray = cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
else:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# The background is mostly white/light yellow. Let's threshold it.
# Inverse binary threshold (objects become white, background becomes black)
_, thresh = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)

# Find contours
contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

# Filter contours by size to get characters
characters = []
for cnt in contours:
    x, y, w, h = cv2.boundingRect(cnt)
    area = w * h
    if area > 5000 and area < 200000: # heuristic size for characters
        characters.append((x, y, w, h))

# Sort characters left-to-right, top-to-bottom
# First sort by Y (rows), then group by row and sort by X
characters.sort(key=lambda b: b[1])

# Determine rows (assuming 2 rows based on the image description)
rows = []
current_row = []
last_y = -1
for box in characters:
    x, y, w, h = box
    if last_y == -1 or abs(y - last_y) < 100: # same row
        current_row.append(box)
    else:
        rows.append(sorted(current_row, key=lambda b: b[0]))
        current_row = [box]
    last_y = y
if current_row:
    rows.append(sorted(current_row, key=lambda b: b[0]))

# Flatten sorted
sorted_characters = []
for r in rows:
    sorted_characters.extend(r)

print(f"Found {len(sorted_characters)} characters.")

# Save each character
for i, (x, y, w, h) in enumerate(sorted_characters):
    # Add a little padding
    pad = 10
    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(img.shape[1], x + w + pad)
    y2 = min(img.shape[0], y + h + pad)
    
    char_img = img[y1:y2, x1:x2].copy()
    
    # Make background transparent
    # We can do a flood fill from corners or just key out the light background color
    if char_img.shape[2] == 3:
        char_img = cv2.cvtColor(char_img, cv2.COLOR_BGR2BGRA)
        
    mask = (char_img[:, :, 0] > 230) & (char_img[:, :, 1] > 230) & (char_img[:, :, 2] > 230)
    char_img[mask, 3] = 0 # set alpha to 0 for light pixels
    
    cv2.imwrite(f"{out_dir}/char_{i}.png", char_img)
    print(f"Saved char_{i}.png")

