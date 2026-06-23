import json

with open('client/src/game/SkinsDB.js', 'r') as f:
    content = f.read()

# Replace the closing bracket of each array with a comma and the new skin, then closing bracket
replacements = [
    ("  ],\n  Brawler:", "    { id: 'champion', name: '🏆 榮耀宗師 (Trophy Master)', color: '#ffffff', price: 'trophy' }\n  ],\n  Brawler:"),
    ("  ],\n  Assassin:", "    { id: 'champion', name: '🏆 榮耀宗師 (Trophy Master)', color: '#ffffff', price: 'trophy' }\n  ],\n  Assassin:"),
    ("  ],\n  Tank:", "    { id: 'champion', name: '🏆 榮耀宗師 (Trophy Master)', color: '#ffffff', price: 'trophy' }\n  ],\n  Tank:"),
    ("  ],\n  Ninja:", "    { id: 'champion', name: '🏆 榮耀宗師 (Trophy Master)', color: '#ffffff', price: 'trophy' }\n  ],\n  Ninja:"),
    ("  ],\n  Sniper:", "    { id: 'champion', name: '🏆 榮耀宗師 (Trophy Master)', color: '#ffffff', price: 'trophy' }\n  ],\n  Sniper:"),
    ("  ],\n  Mage:", "    { id: 'champion', name: '🏆 榮耀宗師 (Trophy Master)', color: '#ffffff', price: 'trophy' }\n  ],\n  Mage:"),
    ("  ]\n};", "    { id: 'champion', name: '🏆 榮耀宗師 (Trophy Master)', color: '#ffffff', price: 'trophy' }\n  ]\n};")
]

for old, new in replacements:
    content = content.replace(old, new)

# And for Striker, since it's the first one, the Brawler replacement already covers the first "  ],\n  Brawler:" which is the end of Striker.
# Wait, let's verify.
#   Striker: [ ... ],
#   Brawler: [ ... ],
# The first replacement looks for "  ],\n  Brawler:", so it replaces the end of Striker!
# The last replacement looks for "  ]\n};", so it replaces the end of Mage!

with open('client/src/game/SkinsDB.js', 'w') as f:
    f.write(content)
