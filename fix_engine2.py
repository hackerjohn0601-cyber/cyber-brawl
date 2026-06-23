import re
with open("client/src/game/GameEngine.js", "r") as f:
    text = f.read()

# Make sure gameLoop is correct
pattern = re.compile(r"  gameLoop\(currentTime\) \{\n    if \(this\.isGameOver\) return;\n    \n    const rawDeltaTime = \(currentTime \- this\.lastTime\) / 1000;\n    this\.lastTime = currentTime;\n    \n    // Prevent huge jumps\n    const gameDeltaTime = Math\.min\(rawDeltaTime, 0\.1\);\n\n    if \(this\.hitStopTimer > 0\) \{")

replacement = """  gameLoop(currentTime) {
    if (this.isGameOver) return;
    
    const rawDeltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    
    // Prevent huge jumps
    const gameDeltaTime = Math.min(rawDeltaTime, 0.1);

    if (this.countdown > 0) {
      this.countdown -= rawDeltaTime;
      this.draw();
      requestAnimationFrame((t) => this.gameLoop(t));
      return;
    }

    if (this.hitStopTimer > 0) {"""
text = re.sub(pattern, replacement, text)

with open("client/src/game/GameEngine.js", "w") as f:
    f.write(text)
