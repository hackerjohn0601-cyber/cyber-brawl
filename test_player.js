import { Player } from './client/src/game/Player.js';
console.log("Player imported");

global.window = { addEventListener: () => {}, removeEventListener: () => {} };

const ctx = {
  save: () => {}, restore: () => {},
  beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, fill: () => {},
  arc: () => {}, fillRect: () => {}, strokeRect: () => {},
  scale: () => {}, translate: () => {}, rotate: () => {},
  shadowBlur: 0
};

try {
  const p = new Player(100, 100, '#ffffff', {}, 1, 'Striker', false, 1, undefined, 'default');
  p.draw(ctx);
  console.log("Draw 1 success");
} catch (e) {
  console.error("ERROR:", e);
}
