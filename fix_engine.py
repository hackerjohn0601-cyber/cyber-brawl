import re
with open("client/src/game/GameEngine.js", "r") as f:
    text = f.read()

# Fix the hitStopTimer block
pattern = re.compile(r"    if \(this\.hitStopTimer > 0\) \{\n      this\.hitStopTimer \-= rawDeltaTime;\n      \n      this\.draw\(\);\n      requestAnimationFrame\(\(t\) => this\.gameLoop\(t\)\);\n      return;\n    \}", re.MULTILINE)
replacement = """    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= rawDeltaTime;
      // Skip updates to freeze game, but keep drawing
      this.draw();
      requestAnimationFrame((t) => this.gameLoop(t));
      return;
    }"""
text = re.sub(pattern, replacement, text)

# Ensure countdown block is fine
if "if (this.countdown > 0)" not in text:
    print("WARNING: countdown block missing!")
    
with open("client/src/game/GameEngine.js", "w") as f:
    f.write(text)
