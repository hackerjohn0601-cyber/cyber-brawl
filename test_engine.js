global.window = { addEventListener: () => {} };
global.requestAnimationFrame = () => {};
global.setInterval = () => {};
global.setTimeout = () => {};
global.clearInterval = () => {};
global.Image = class {};
global.performance = { now: () => 10000 };

import { GameEngine } from './client/src/game/GameEngine.js';
import { Player } from './client/src/game/Player.js';

class MockContext {
  save() {}
  restore() {}
  translate() {}
  scale() {}
  fillStyle() {}
  fillRect() {}
  strokeRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  rotate() {}
  fill() {}
  stroke() {}
  arc() {}
  fillText() {}
  measureText() { return { width: 10 }; }
}

const mockCanvas = {
  width: 1024,
  height: 576,
  getContext: () => new MockContext()
};

try {
  const engine = new GameEngine(mockCanvas);
  
  const p1Controls = { up: 'w', down: 's', left: 'a', right: 'd', attack: 'f', skill: 'q', defend: 'e' };
  const p1 = new Player(100, 100, '#ffffff', p1Controls, 1, 'Sniper', false, 1, { defense: 0, attack: 0, maxHp: 0 }, 'default', 0);
  
  const p2Controls = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', attack: 'k', skill: 'u', defend: 'j' };
  const p2 = new Player(800, 100, '#ffffff', p2Controls, -1, 'Mage', true, 1, { defense: 0, attack: 0, maxHp: 0 }, 'default', 0);
  
  engine.addEntity(p1);
  engine.addEntity(p2);
  
  engine.start();
  
  // manually trigger loop
  engine.loop(10050); // simulate 50ms later
  
  console.log("SUCCESS! No crash.");
} catch (e) {
  console.error("CRASH:", e);
}
