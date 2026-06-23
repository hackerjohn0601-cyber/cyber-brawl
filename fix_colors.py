import re

with open('client/src/game/Player.js', 'r') as f:
    code = f.read()

# Replace hardcoded colors in draw functions of inline entities
# Let's find specific ones based on my previous grep.

replacements = [
    (
        "ctx.fillStyle = '#00ffff'; // Cyan fireball",
        "ctx.fillStyle = effectColor || '#00ffff';"
    ),
    (
        "ctx.fillStyle = 'rgba(0, 255, 255, 0.3)'; // Cyan translucent",
        "ctx.fillStyle = `rgba(${parseInt(effectColor.slice(1,3),16)}, ${parseInt(effectColor.slice(3,5),16)}, ${parseInt(effectColor.slice(5,7),16)}, 0.3)`;"
    ),
    (
        "ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';",
        "ctx.strokeStyle = `rgba(${parseInt(effectColor.slice(1,3),16)}, ${parseInt(effectColor.slice(3,5),16)}, ${parseInt(effectColor.slice(5,7),16)}, 0.8)`;"
    ),
    (
        "ctx.fillStyle = `rgba(0, 255, 255, ${0.1 + Math.random() * 0.1})`;",
        "ctx.fillStyle = `rgba(${parseInt(effectColor.slice(1,3),16)}, ${parseInt(effectColor.slice(3,5),16)}, ${parseInt(effectColor.slice(5,7),16)}, ${0.1 + Math.random() * 0.1})`;"
    ),
    (
        "ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';",
        "ctx.fillStyle = effectColor;"
    ),
    (
        "ctx.fillStyle = 'rgba(0, 255, 255, 0.4)';",
        "ctx.fillStyle = `rgba(${parseInt(effectColor.slice(1,3),16)}, ${parseInt(effectColor.slice(3,5),16)}, ${parseInt(effectColor.slice(5,7),16)}, 0.4)`;"
    ),
    (
        "ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';",
        "ctx.strokeStyle = `rgba(${parseInt(effectColor.slice(1,3),16)}, ${parseInt(effectColor.slice(3,5),16)}, ${parseInt(effectColor.slice(5,7),16)}, 0.5)`;"
    ),
    (
        "ctx.fillStyle = '#fffa65';",
        "ctx.fillStyle = effectColor || '#fffa65';"
    ),
    (
        "ctx.fillStyle = 'rgba(255, 60, 60, 0.5)';",
        "ctx.fillStyle = `rgba(${parseInt(effectColor.slice(1,3),16)}, ${parseInt(effectColor.slice(3,5),16)}, ${parseInt(effectColor.slice(5,7),16)}, 0.5)`;"
    ),
    (
        "ctx.strokeStyle = '#ff4757';",
        "ctx.strokeStyle = effectColor || '#ff4757';"
    ),
    (
        "ctx.fillStyle = 'cyan';",
        "ctx.fillStyle = effectColor || 'cyan';"
    )
]

for old, new in replacements:
    code = code.replace(old, new)

# Now we need to inject `const effectColor = this.getEffectColor();` before inline entities or pass it to `this.getEffectColor()` directly inside if `this` is correct.
# Wait, inside `draw: function(ctx)`, `this` refers to the inline entity!
# So we must ensure `const effectColor = ...` is captured in the closure, which means we must inject it at the top of executeSkill and executeUltimate.

inject = "const effectColor = this.getEffectColor();\n"

code = code.replace("executeSkill() {\n", "executeSkill() {\n    " + inject)
code = code.replace("executeUltimate() {\n", "executeUltimate() {\n    " + inject)
code = code.replace("executeAirPursuit(opponent) {\n", "executeAirPursuit(opponent) {\n    " + inject)

with open('client/src/game/Player.js', 'w') as f:
    f.write(code)

