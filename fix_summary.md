I have identified and fixed the root causes for both issues you reported:

1. **"為什麼連一般人也有" (Why do normal people have the Grandmaster appearance)**:
   - Previously, the condition for showing the Grandmaster appearance was `if (this.trophies >= 2000)`. Because trophies were not synced properly for all players, it caused normal players to inadvertently trigger the Grandmaster visual effects. I have changed the condition to strictly check `if (this.skinId === 'grandmaster')` so only those who actively equip the skin will have the effects.

2. **"遊戲時間永遠停在99秒，也沒有人出現" (Training game stuck at 99 seconds and characters disappeared)**:
   - There was a crash in the game engine loop that happened on the very first frame (`this.loop` was called instead of `this.gameLoop`). This crash stopped the game completely, freezing the time at 99 seconds. Because the physics update hadn't run yet, the players were positioned completely off-screen, making them "invisible".
   - I have fixed the loop logic and corrected the syntax errors in `GameEngine.js`. The loop now runs continuously, updating and drawing the players correctly.

Everything should be working now! You can refresh your browser and enter Training Mode to verify. Let me know if you encounter any other issues!
