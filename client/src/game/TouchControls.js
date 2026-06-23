// TouchControls.js — Virtual joystick + buttons for mobile
export class TouchControls {
  constructor(canvas, keyBindings) {
    this.canvas = canvas;
    this.keyBindings = keyBindings;
    this.keys = {}; // Simulated key state
    this.active = false;
    this.joystick = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0, radius: 50 };
    this.buttons = [
      { id: 'attack', label: '👊', x: 0, y: 0, radius: 28, color: '#ff4757', pressed: false },
      { id: 'skill', label: '🔥', x: 0, y: 0, radius: 24, color: '#ffa502', pressed: false },
      { id: 'defend', label: '🛡️', x: 0, y: 0, radius: 24, color: '#3498db', pressed: false },
      { id: 'jump', label: '⬆️', x: 0, y: 0, radius: 24, color: '#2ecc71', pressed: false },
    ];
    this.touchIds = {}; // Track touch IDs

    // Detect mobile
    this.isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (this.isMobile) {
      this.active = true;
      this.setupTouchEvents();
      this.layoutButtons();
    }
  }

  layoutButtons() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    // Right side buttons in a diamond layout
    const bx = w - 80;
    const by = h - 100;
    this.buttons[0].x = bx; this.buttons[0].y = by;        // Attack (center)
    this.buttons[1].x = bx + 50; this.buttons[1].y = by - 20; // Skill (right)
    this.buttons[2].x = bx - 50; this.buttons[2].y = by - 20; // Defend (left)
    this.buttons[3].x = bx; this.buttons[3].y = by - 55;    // Jump (top)
  }

  setupTouchEvents() {
    const c = this.canvas;
    c.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    c.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    c.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    c.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
  }

  getCanvasPos(touch) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY
    };
  }

  onTouchStart(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const pos = this.getCanvasPos(touch);
      
      // Left half = joystick
      if (pos.x < this.canvas.width / 2) {
        this.joystick.active = true;
        this.joystick.startX = pos.x;
        this.joystick.startY = pos.y;
        this.joystick.currentX = pos.x;
        this.joystick.currentY = pos.y;
        this.touchIds[touch.identifier] = 'joystick';
      } else {
        // Check buttons
        for (const btn of this.buttons) {
          const dx = pos.x - btn.x;
          const dy = pos.y - btn.y;
          if (dx * dx + dy * dy < btn.radius * btn.radius * 2) {
            btn.pressed = true;
            this.touchIds[touch.identifier] = btn.id;
            this.onButtonPress(btn.id);
            break;
          }
        }
      }
    }
    this.updateKeys();
  }

  onTouchMove(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      if (this.touchIds[touch.identifier] === 'joystick') {
        const pos = this.getCanvasPos(touch);
        this.joystick.currentX = pos.x;
        this.joystick.currentY = pos.y;
      }
    }
    this.updateKeys();
  }

  onTouchEnd(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const id = this.touchIds[touch.identifier];
      if (id === 'joystick') {
        this.joystick.active = false;
      } else {
        const btn = this.buttons.find(b => b.id === id);
        if (btn) {
          btn.pressed = false;
          this.onButtonRelease(id);
        }
      }
      delete this.touchIds[touch.identifier];
    }
    this.updateKeys();
  }

  onButtonPress(id) {
    const kb = this.keyBindings;
    if (id === 'attack') this.keys[kb.attack] = true;
    if (id === 'skill') this.keys[kb.skill] = true;
    if (id === 'defend') this.keys[kb.defend] = true;
    if (id === 'jump') this.keys[kb.up] = true;
  }

  onButtonRelease(id) {
    const kb = this.keyBindings;
    if (id === 'attack') this.keys[kb.attack] = false;
    if (id === 'skill') this.keys[kb.skill] = false;
    if (id === 'defend') this.keys[kb.defend] = false;
    if (id === 'jump') this.keys[kb.up] = false;
  }

  updateKeys() {
    const kb = this.keyBindings;
    // Reset directional keys
    this.keys[kb.left] = false;
    this.keys[kb.right] = false;

    if (this.joystick.active) {
      const dx = this.joystick.currentX - this.joystick.startX;
      const dy = this.joystick.currentY - this.joystick.startY;
      const deadzone = 15;
      
      if (dx < -deadzone) this.keys[kb.left] = true;
      if (dx > deadzone) this.keys[kb.right] = true;
      if (dy < -deadzone * 1.5) this.keys[kb.up] = true;
    }
  }

  draw(ctx) {
    if (!this.active) return;
    ctx.save();

    // Draw joystick base
    const j = this.joystick;
    const jx = j.active ? j.startX : 120;
    const jy = j.active ? j.startY : this.canvas.height - 100;
    
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(jx, jy, j.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw joystick thumb
    if (j.active) {
      let dx = j.currentX - j.startX;
      let dy = j.currentY - j.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > j.radius) {
        dx = (dx / dist) * j.radius;
        dy = (dy / dist) * j.radius;
      }
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(j.startX + dx, j.startY + dy, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw buttons
    for (const btn of this.buttons) {
      ctx.globalAlpha = btn.pressed ? 0.6 : 0.3;
      ctx.fillStyle = btn.color;
      ctx.beginPath();
      ctx.arc(btn.x, btn.y, btn.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.globalAlpha = btn.pressed ? 1 : 0.7;
      ctx.font = `${btn.radius * 0.8}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, btn.x, btn.y);
    }

    ctx.restore();
  }
}
