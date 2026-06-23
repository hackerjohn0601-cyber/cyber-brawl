export class Fireball {
  constructor(x, y, facing, owner, effectColor) {
    this.x = x;
    this.y = y;
    this.width = 40;
    this.height = 20;
    this.facing = facing;
    this.speed = 600; // Fast moving
    this.owner = owner; // To prevent hitting the player who shot it
    this.effectColor = effectColor || '#ff9f43';
    this.isActive = true; // Set to false when it hits or goes off screen
  }

  update(deltaTime, canvasWidth, floorY) {
    if (!this.isActive) return;

    // Move horizontally
    this.x += this.speed * this.facing * deltaTime;

    // Destroy if it goes off screen
    if (this.x < 0 || this.x > canvasWidth) {
      this.isActive = false;
    }
  }

  draw(ctx) {
    if (!this.isActive) return;
    
    // Draw fireball
    ctx.fillStyle = this.effectColor;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    
    // Add inner glow
    ctx.fillStyle = '#ffffff'; // White inner glow
    ctx.fillRect(this.x + (this.facing === 1 ? 5 : 15), this.y + 5, this.width - 20, this.height - 10);
  }
}
