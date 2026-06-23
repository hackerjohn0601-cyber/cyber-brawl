import json

with open('client/src/game/SkinsDB.js', 'r') as f:
    content = f.read()

# I will just replace `    { id: 'champion'` with `,\n    { id: 'champion'` where needed, but wait, the previous line doesn't have a comma.
# Actually, I can just replace `price: 50 }\n    { id: 'champion'` with `price: 50 },\n    { id: 'champion'`
content = content.replace("price: 50 }\n    { id: 'champion'", "price: 50 },\n    { id: 'champion'")
content = content.replace("price: 0 }\n    { id: 'champion'", "price: 0 },\n    { id: 'champion'")

with open('client/src/game/SkinsDB.js', 'w') as f:
    f.write(content)
