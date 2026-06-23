import re

with open('client/src/game/GameEngine.js', 'r') as f:
    code = f.read()

# Fix getNetworkState to include effectColor
old_net_state = """      const projectiles = this.entities.filter(e => e.health === undefined).map(e => ({
        type: e.type || 'fireball',
        x: e.x,
        y: e.y,
        facing: e.facing,
        isUltimate: e.isUltimate"""
new_net_state = """      const projectiles = this.entities.filter(e => e.health === undefined).map(e => ({
        type: e.type || 'fireball',
        x: e.x,
        y: e.y,
        facing: e.facing,
        isUltimate: e.isUltimate,
        effectColor: e.effectColor"""
code = code.replace(old_net_state, new_net_state)

# Fix colors in applyNetworkState
replacements = [
    (
        "ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';",
        "ctx.fillStyle = this.effectColor ? `rgba(${parseInt(this.effectColor.slice(1,3),16)}, ${parseInt(this.effectColor.slice(3,5),16)}, ${parseInt(this.effectColor.slice(5,7),16)}, 0.3)` : 'rgba(0, 255, 255, 0.3)';"
    ),
    (
        "ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';",
        "ctx.strokeStyle = this.effectColor ? `rgba(${parseInt(this.effectColor.slice(1,3),16)}, ${parseInt(this.effectColor.slice(3,5),16)}, ${parseInt(this.effectColor.slice(5,7),16)}, 0.8)` : 'rgba(0, 255, 255, 0.8)';"
    ),
    (
        "ctx.fillStyle = '#8c7ae6';",
        "ctx.fillStyle = this.effectColor || '#8c7ae6';"
    ),
    (
        "ctx.fillStyle = '#ff4757';",
        "ctx.fillStyle = this.effectColor || '#ff4757';"
    ),
    (
        "ctx.fillStyle = `rgba(0, 255, 255, ${0.4 * alpha})`;",
        "ctx.fillStyle = this.effectColor ? `rgba(${parseInt(this.effectColor.slice(1,3),16)}, ${parseInt(this.effectColor.slice(3,5),16)}, ${parseInt(this.effectColor.slice(5,7),16)}, ${0.4 * alpha})` : `rgba(0, 255, 255, ${0.4 * alpha})`;"
    ),
    (
        "ctx.strokeStyle = `rgba(0, 255, 255, ${0.8 * alpha})`;",
        "ctx.strokeStyle = this.effectColor ? `rgba(${parseInt(this.effectColor.slice(1,3),16)}, ${parseInt(this.effectColor.slice(3,5),16)}, ${parseInt(this.effectColor.slice(5,7),16)}, ${0.8 * alpha})` : `rgba(0, 255, 255, ${0.8 * alpha})`;"
    ),
    (
        "ctx.fillStyle = '#e74c3c';",
        "ctx.fillStyle = this.effectColor || '#e74c3c';"
    ),
    (
        "ctx.fillStyle = '#fffa65';",
        "ctx.fillStyle = this.effectColor || '#fffa65';"
    )
]

for old, new in replacements:
    code = code.replace(old, new)

with open('client/src/game/GameEngine.js', 'w') as f:
    f.write(code)

