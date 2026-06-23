import { createCanvas, Image } from 'canvas';
import fs from 'fs';
global.Image = Image;
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {}
};
import { Player } from './client/src/game/Player.js';

const canvas = createCanvas(1024, 576);
const ctx = canvas.getContext('2d');

ctx.fillStyle = '#1e1e2f';
ctx.fillRect(0, 0, 1024, 576);

const p1 = new Player(
  100, 426, '#e67e22', 
  { left: 'a', right: 'd', up: 'w', down: 's', attack: ' ', defense: 'Shift', skill: 'f', ultimate: 'e' }, 
  1, 'Striker', false, 1, { attack: 0, defense: 0, maxHp: 0 }, 'grandmaster', 2000
);
p1.isGrounded = true;
p1.draw(ctx);

const p2 = new Player(
  800, 426, '#e67e22', 
  { left: 'a', right: 'd', up: 'w', down: 's', attack: ' ', defense: 'Shift', skill: 'f', ultimate: 'e' }, 
  -1, 'Brawler', false, 1, { attack: 0, defense: 0, maxHp: 0 }, 'default', 0
);
p2.isGrounded = true;
p2.draw(ctx);

const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('test_draw_output.png', buffer);
console.log('Saved test_draw_output.png');
