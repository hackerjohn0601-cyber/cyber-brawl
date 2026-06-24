// BossEntity.js - Shadow Dinosaur Boss (暗影恐龍)
export class BossEntity {
  constructor(x, y, canvasWidth, canvasHeight) {
    this.x = x;
    this.y = y;
    this.width = 180;
    this.height = 280;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    
    // Stats
    this.health = 500;
    this.maxHealth = 500;
    this.isBoss = true;
    this.name = '暗影恐龍';
    
    // CC (Crowd Control) states
    this.isStunned = false;
    this.stunTimer = 0;
    
    // Movement
    this.velocity = { x: 0, y: 0 };
    this.speed = 80;
    this.facing = -1;
    this.gravity = 1500;
    this.floorY = canvasHeight - 50;
    this.isGrounded = true;
    
    // Phase
    this.phase = 1;
    this.phaseTransitioning = false;
    this.phaseTransitionTimer = 0;
    
    // Attack system
    this.attackCooldown = 0;
    this.currentAttack = null;
    this.attackTimer = 0;
    this.bullets = [];
    this.minions = [];
    this.meteors = [];
    this.laserActive = false;
    this.laserY = 0;
    this.laserTimer = 0;
    
    // Animation
    this.animTimer = 0;
    this.mouthOpen = false;
    this.roarTimer = 0;
    this.hitFlashTimer = 0;
    this.tailAngle = 0;
    this.eyeGlow = 0;
    
    // Phase 3 darkness
    this.darknessLevel = 0;
    
    // Tracking missiles
    this.missiles = [];
  }

  get phase1Threshold() { return this.maxHealth * 0.66; }
  get phase2Threshold() { return this.maxHealth * 0.33; }

  getPhase() {
    if (this.health > this.phase1Threshold) return 1;
    if (this.health > this.phase2Threshold) return 2;
    return 3;
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health < 0) this.health = 0;
    this.hitFlashTimer = 0.15;
    
    // Check phase transition
    const newPhase = this.getPhase();
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.phaseTransitioning = true;
      this.phaseTransitionTimer = 2.0; // 2 sec transition
      this.roarTimer = 1.5;
      this.mouthOpen = true;
      
      // Phase speed boosts
      if (this.phase === 2) this.speed = 110;
      if (this.phase === 3) this.speed = 140;
    }
  }

  update(deltaTime, players) {
    this.animTimer += deltaTime;
    this.tailAngle = Math.sin(this.animTimer * 2) * 0.3;
    this.eyeGlow = 0.7 + Math.sin(this.animTimer * 4) * 0.3;
    
    if (this.hitFlashTimer > 0) this.hitFlashTimer -= deltaTime;
    if (this.roarTimer > 0) {
      this.roarTimer -= deltaTime;
      if (this.roarTimer <= 0) this.mouthOpen = false;
    }
    
    // Phase transition pause
    if (this.phaseTransitioning) {
      this.phaseTransitionTimer -= deltaTime;
      if (this.phaseTransitionTimer <= 0) {
        this.phaseTransitioning = false;
      }
      return;
    }
    
    // CC (Stun) handling
    if (this.isStunned) {
      this.stunTimer -= deltaTime;
      this.velocity.x = 0; // Boss cannot move while stunned
      if (this.stunTimer <= 0) {
        this.isStunned = false;
      }
      
      // Still apply gravity and move boss but skip attacking/AI
      if (!this.isGrounded) {
        this.velocity.y += this.gravity * deltaTime;
      }
      this.x += this.velocity.x * deltaTime;
      this.y += this.velocity.y * deltaTime;
      
      if (this.y >= this.floorY) {
        this.y = this.floorY;
        this.velocity.y = 0;
        this.isGrounded = true;
      }
      return; // Skip the rest of AI
    }
    
    // Phase 3 darkness
    if (this.phase === 3) {
      this.darknessLevel = Math.min(0.4, this.darknessLevel + deltaTime * 0.05);
    }
    
    // AI: Target closest alive player
    const alivePlayers = players.filter(p => p.health > 0 && !p.isDead);
    if (alivePlayers.length === 0) return;
    
    const target = alivePlayers.reduce((closest, p) => {
      const dist = Math.abs(p.x - this.x);
      return dist < Math.abs(closest.x - this.x) ? p : closest;
    }, alivePlayers[0]);
    
    // Face target
    this.facing = target.x < this.x ? -1 : 1;
    
    // Move toward target (but keep some distance)
    const dist = Math.abs(target.x + target.width/2 - (this.x + this.width/2));
    if (dist > 200) {
      this.velocity.x = this.facing * this.speed;
    } else if (dist < 100) {
      this.velocity.x = -this.facing * this.speed * 0.5; // Back away slightly
    } else {
      this.velocity.x = 0;
    }
    
    // Apply gravity
    if (!this.isGrounded) {
      this.velocity.y += this.gravity * deltaTime;
    }
    
    this.x += this.velocity.x * deltaTime;
    this.y += this.velocity.y * deltaTime;
    
    // Floor collision
    if (this.y + this.height >= this.floorY) {
      this.y = this.floorY - this.height;
      this.velocity.y = 0;
      this.isGrounded = true;
    }
    
    // Bounds
    if (this.x < 0) this.x = 0;
    if (this.x + this.width > this.canvasWidth) this.x = this.canvasWidth - this.width;
    
    // Attack AI
    this.attackCooldown -= deltaTime;
    if (this.attackCooldown <= 0 && !this.currentAttack) {
      this.chooseAttack(target);
    }
    
    // Update current attack
    if (this.currentAttack) {
      this.attackTimer -= deltaTime;
      if (this.attackTimer <= 0) {
        this.currentAttack = null;
      }
    }
    
    // Update bullets
    this.updateBullets(deltaTime);
    this.updateMissiles(deltaTime, players);
    this.updateMeteors(deltaTime);
    this.updateMinions(deltaTime, players);
    this.updateLaser(deltaTime);
  }

  chooseAttack(target) {
    const attacks = this.getAvailableAttacks();
    const chosen = attacks[Math.floor(Math.random() * attacks.length)];
    this.executeAttack(chosen, target);
  }

  getAvailableAttacks() {
    const attacks = ['charge', 'bullet_spread', 'ground_slam'];
    if (this.phase >= 2) {
      attacks.push('laser_sweep', 'summon_minions', 'bullet_hell');
    }
    if (this.phase >= 3) {
      attacks.push('tracking_missiles', 'meteor_storm');
    }
    return attacks;
  }

  executeAttack(type, target) {
    this.currentAttack = type;
    const cooldowns = { 1: 3.0, 2: 2.0, 3: 1.5 };
    this.attackCooldown = cooldowns[this.phase];
    
    switch(type) {
      case 'charge':
        this.attackTimer = 0.8;
        this.velocity.x = this.facing * 600;
        break;
        
      case 'bullet_spread':
        this.attackTimer = 0.5;
        this.mouthOpen = true;
        this.roarTimer = 0.5;
        const bulletCount = this.phase >= 2 ? 16 : 8;
        for (let i = 0; i < bulletCount; i++) {
          const angle = (i / bulletCount) * Math.PI * 2;
          this.bullets.push({
            x: this.x + this.width / 2,
            y: this.y + this.height * 0.3,
            vx: Math.cos(angle) * 300,
            vy: Math.sin(angle) * 300,
            radius: 8,
            damage: 20,
            life: 3.0,
            color: this.phase === 3 ? '#e74c3c' : '#9b59b6'
          });
        }
        break;
        
      case 'ground_slam':
        this.attackTimer = 1.0;
        this.velocity.y = -600;
        this.isGrounded = false;
        // Shockwave will be created on landing
        this._groundSlamPending = true;
        break;
        
      case 'laser_sweep':
        this.attackTimer = 3.0;
        this.laserActive = true;
        this.laserY = 0;
        this.laserTimer = 3.0;
        this.laserIsWarning = true;
        this.mouthOpen = true;
        this.roarTimer = 2.0;
        break;
        
      case 'summon_minions':
        this.attackTimer = 1.0;
        this.roarTimer = 1.0;
        this.mouthOpen = true;
        for (let i = 0; i < 2; i++) {
          this.minions.push({
            x: this.x + (i === 0 ? -80 : this.width + 30),
            y: this.floorY - 60,
            width: 40,
            height: 60,
            health: 100,
            maxHealth: 100,
            speed: 150,
            attackCooldown: 0,
            damage: 15,
            facing: this.facing,
            animTimer: 0
          });
        }
        break;
        
      case 'bullet_hell':
        this.attackTimer = 1.5;
        this.mouthOpen = true;
        this.roarTimer = 1.5;
        // Multiple waves
        for (let wave = 0; wave < 3; wave++) {
          setTimeout(() => {
            for (let i = 0; i < 12; i++) {
              const angle = (i / 12) * Math.PI * 2 + wave * 0.2;
              this.bullets.push({
                x: this.x + this.width / 2,
                y: this.y + this.height * 0.3,
                vx: Math.cos(angle) * 250,
                vy: Math.sin(angle) * 250,
                radius: 6,
                damage: 15,
                life: 4.0,
                color: '#e74c3c'
              });
            }
          }, wave * 400);
        }
        break;
        
      case 'tracking_missiles':
        this.attackTimer = 1.0;
        this.mouthOpen = true;
        this.roarTimer = 0.8;
        for (let i = 0; i < 4; i++) {
          this.missiles.push({
            x: this.x + this.width / 2,
            y: this.y + 50 + i * 30,
            vx: this.facing * 100,
            vy: -50 + i * 25,
            speed: 200,
            damage: 30,
            life: 5.0,
            radius: 10,
            target: target
          });
        }
        break;
        
      case 'meteor_storm':
        this.attackTimer = 2.0;
        this.roarTimer = 1.0;
        this.mouthOpen = true;
        for (let i = 0; i < 6; i++) {
          this.meteors.push({
            x: Math.random() * this.canvasWidth,
            y: -100 - i * 80,
            vy: 300 + Math.random() * 200,
            radius: 25 + Math.random() * 15,
            damage: 80,
            warning: true,
            warningTimer: 0.8 + i * 0.3,
            landed: false
          });
        }
        break;
    }
  }

  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -50 || b.x > this.canvasWidth + 50 || b.y > this.floorY + 50) {
        this.bullets.splice(i, 1);
      }
    }
  }

  updateMissiles(dt, players) {
    const alivePlayers = players.filter(p => p.health > 0 && !p.isDead);
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      // Re-target if current target is dead
      if (!m.target || m.target.health <= 0 || m.target.isDead) {
        m.target = alivePlayers[0] || null;
      }
      if (m.target) {
        const tx = m.target.x + m.target.width / 2;
        const ty = m.target.y + m.target.height / 2;
        const angle = Math.atan2(ty - m.y, tx - m.x);
        m.vx += Math.cos(angle) * m.speed * dt * 3;
        m.vy += Math.sin(angle) * m.speed * dt * 3;
        // Limit speed
        const spd = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
        if (spd > m.speed * 2) {
          m.vx = (m.vx / spd) * m.speed * 2;
          m.vy = (m.vy / spd) * m.speed * 2;
        }
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt;
      if (m.life <= 0 || m.x < -50 || m.x > this.canvasWidth + 50) {
        this.missiles.splice(i, 1);
      }
    }
  }

  updateMeteors(dt) {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      if (m.warningTimer > 0) {
        m.warningTimer -= dt;
        continue;
      }
      m.y += m.vy * dt;
      if (m.y + m.radius >= this.floorY && !m.landed) {
        m.landed = true;
        m.y = this.floorY - m.radius;
        m.explosionTimer = 0.5;
      }
      if (m.landed) {
        m.explosionTimer -= dt;
        if (m.explosionTimer <= 0) {
          this.meteors.splice(i, 1);
        }
      }
    }
  }

  updateMinions(dt, players) {
    const alivePlayers = players.filter(p => p.health > 0 && !p.isDead);
    for (let i = this.minions.length - 1; i >= 0; i--) {
      const m = this.minions[i];
      m.animTimer += dt;
      if (m.health <= 0) {
        this.minions.splice(i, 1);
        continue;
      }
      // Simple AI: move toward closest player
      if (alivePlayers.length > 0) {
        const target = alivePlayers[0];
        m.facing = target.x < m.x ? -1 : 1;
        m.x += m.facing * m.speed * dt;
      }
      // Bounds
      if (m.x < 0) m.x = 0;
      if (m.x + m.width > this.canvasWidth) m.x = this.canvasWidth - m.width;
    }
  }

  updateLaser(dt) {
    if (!this.laserActive) return;
    this.laserTimer -= dt;
    
    // Total 3 seconds. First 1.5 seconds is warning sweep, last 1.5s is active damage sweep
    if (this.laserTimer > 1.5) {
      // Warning phase: sweep down to track player roughly, or just sweep down slowly
      this.laserY = (1 - (this.laserTimer - 1.5) / 1.5) * this.floorY;
      this.laserIsWarning = true;
    } else {
      // Damage phase: sweeps down again faster, or stays at bottom?
      // Let's make the damage sweep happen now
      this.laserY = (1 - this.laserTimer / 1.5) * this.floorY;
      this.laserIsWarning = false;
    }
    
    if (this.laserTimer <= 0) {
      this.laserActive = false;
    }
  }

  // Called by BossEngine when boss lands after ground slam
  onLand() {
    if (this._groundSlamPending) {
      this._groundSlamPending = false;
      // Create shockwave bullets along the ground
      for (let i = 0; i < 6; i++) {
        this.bullets.push({
          x: this.x + this.width / 2 - 150 + i * 60,
          y: this.floorY - 20,
          vx: (i - 2.5) * 200,
          vy: -100,
          radius: 12,
          damage: 40,
          life: 1.5,
          color: '#f39c12',
          isShockwave: true
        });
      }
    }
  }

  draw(ctx) {
    ctx.save();
    
    const cx = this.x + this.width / 2;
    const by = this.y + this.height; // Bottom Y
    
    if (this.isStunned) {
      // Make the dinosaur fall over!
      ctx.translate(cx, by);
      ctx.rotate(-Math.PI / 2 * this.facing);
      ctx.translate(-cx, -by);
      
      // Draw stun stars
      ctx.save();
      ctx.translate(cx, by - 200);
      for (let i = 0; i < 3; i++) {
        const angle = (Date.now() / 200) + (i * Math.PI * 2 / 3);
        const sx = Math.cos(angle) * 30;
        const sy = Math.sin(angle) * 10;
        ctx.fillStyle = '#f1c40f';
        ctx.font = '24px Arial';
        ctx.fillText('⭐', sx - 12, sy + 8);
      }
      ctx.restore();
    }
    
    // Hit flash
    if (this.hitFlashTimer > 0) {
      ctx.globalAlpha = 0.6 + Math.sin(this.hitFlashTimer * 40) * 0.4;
    }
    
    // Phase color
    const bodyColor = this.phase === 1 ? '#2c3e50' : 
                      this.phase === 2 ? '#4a1a2e' : '#1a0a1e';
    const accentColor = this.phase === 1 ? '#8e44ad' :
                        this.phase === 2 ? '#e74c3c' : '#c0392b';
    const eyeColor = this.phase === 1 ? '#e74c3c' :
                     this.phase === 2 ? '#f39c12' : '#ff0040';
    
    // === TAIL ===
    ctx.save();
    ctx.translate(cx + this.facing * -60, by - 40);
    ctx.rotate(this.tailAngle * this.facing);
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(this.facing * -60, -20, this.facing * -120, 10);
    ctx.quadraticCurveTo(this.facing * -70, 10, 0, 15);
    ctx.fill();
    // Spikes on tail
    ctx.fillStyle = accentColor;
    for (let i = 0; i < 4; i++) {
      const tx = this.facing * -(20 + i * 25);
      ctx.beginPath();
      ctx.moveTo(tx - 4, 0);
      ctx.lineTo(tx, -12 - i * 2);
      ctx.lineTo(tx + 4, 0);
      ctx.fill();
    }
    ctx.restore();
    
    // === BODY ===
    ctx.fillStyle = bodyColor;
    // Torso
    ctx.beginPath();
    ctx.ellipse(cx, by - 130, 65, 100, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Belly (lighter)
    ctx.fillStyle = this.phase === 3 ? '#2c1a30' : '#3d566e';
    ctx.beginPath();
    ctx.ellipse(cx + this.facing * 5, by - 110, 35, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // === LEGS ===
    ctx.fillStyle = bodyColor;
    // Left leg
    ctx.fillRect(cx - 40, by - 50, 25, 50);
    // Right leg
    ctx.fillRect(cx + 15, by - 50, 25, 50);
    // Feet (claws)
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.moveTo(cx - 45, by);
    ctx.lineTo(cx - 50, by + 5);
    ctx.lineTo(cx - 10, by);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 10, by);
    ctx.lineTo(cx + 45, by + 5);
    ctx.lineTo(cx + 45, by);
    ctx.fill();
    
    // === ARMS ===
    ctx.fillStyle = bodyColor;
    const armY = by - 160;
    // Front arm
    ctx.save();
    ctx.translate(cx + this.facing * 40, armY);
    ctx.rotate(this.facing * (0.3 + Math.sin(this.animTimer * 3) * 0.15));
    ctx.fillRect(-8, 0, 16, 55);
    // Claws
    ctx.fillStyle = '#1a1a2e';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-6 + i * 6, 55);
      ctx.lineTo(-4 + i * 6, 65);
      ctx.lineTo(-2 + i * 6, 55);
      ctx.fill();
    }
    ctx.restore();
    
    // Back arm
    ctx.fillStyle = bodyColor;
    ctx.save();
    ctx.translate(cx + this.facing * -30, armY + 10);
    ctx.rotate(this.facing * (-0.2 + Math.sin(this.animTimer * 3 + 1) * 0.1));
    ctx.fillRect(-7, 0, 14, 45);
    ctx.restore();
    
    // === HEAD ===
    ctx.fillStyle = bodyColor;
    const headX = cx + this.facing * 20;
    const headY = by - 230;
    
    // Neck
    ctx.fillRect(cx - 15, by - 200, 30, 40);
    
    // Head shape
    ctx.beginPath();
    ctx.ellipse(headX, headY, 40, 30, this.facing * 0.2, 0, Math.PI * 2);
    ctx.fill();
    
    // Snout
    ctx.beginPath();
    ctx.ellipse(headX + this.facing * 35, headY + 5, 25, 18, this.facing * 0.3, 0, Math.PI * 2);
    ctx.fill();
    
    // Jaw (mouth)
    if (this.mouthOpen) {
      ctx.fillStyle = '#8b0000';
      ctx.beginPath();
      ctx.ellipse(headX + this.facing * 40, headY + 15, 22, 12, this.facing * 0.3, 0, Math.PI);
      ctx.fill();
      
      // Teeth
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) {
        const tx = headX + this.facing * (22 + i * 8);
        ctx.beginPath();
        ctx.moveTo(tx - 2, headY + 8);
        ctx.lineTo(tx, headY + 18);
        ctx.lineTo(tx + 2, headY + 8);
        ctx.fill();
      }
    }
    
    // Eyes (glowing)
    ctx.fillStyle = eyeColor;
    ctx.shadowBlur = 15;
    ctx.shadowColor = eyeColor;
    ctx.globalAlpha = this.eyeGlow;
    ctx.beginPath();
    ctx.ellipse(headX + this.facing * 15, headY - 8, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Pupil
    ctx.fillStyle = '#000';
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.ellipse(headX + this.facing * 17, headY - 8, 3, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Horns
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.moveTo(headX - 15, headY - 25);
    ctx.lineTo(headX - 25, headY - 55);
    ctx.lineTo(headX - 5, headY - 25);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headX + 10, headY - 25);
    ctx.lineTo(headX + 5, headY - 55);
    ctx.lineTo(headX + 20, headY - 25);
    ctx.fill();
    
    // Back spines
    ctx.fillStyle = accentColor;
    for (let i = 0; i < 5; i++) {
      const sx = cx + this.facing * (-15 + i * 3);
      const sy = by - 200 + i * 25;
      ctx.beginPath();
      ctx.moveTo(sx - 5, sy);
      ctx.lineTo(sx + this.facing * -5, sy - 20 + i * 2);
      ctx.lineTo(sx + 5, sy);
      ctx.fill();
    }
    
    // Phase aura
    if (this.phase >= 2) {
      ctx.globalAlpha = 0.15 + Math.sin(this.animTimer * 5) * 0.1;
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.ellipse(cx, by - 130, 90 + Math.sin(this.animTimer * 3) * 10, 
                  130 + Math.sin(this.animTimer * 2) * 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    
    ctx.restore();
    
    // Draw projectiles
    this.drawBullets(ctx);
    this.drawMissiles(ctx);
    this.drawMeteors(ctx);
    this.drawMinions(ctx);
    this.drawLaser(ctx);
  }

  drawBullets(ctx) {
    for (const b of this.bullets) {
      ctx.save();
      ctx.fillStyle = b.color || '#9b59b6';
      ctx.shadowBlur = 10;
      ctx.shadowColor = b.color || '#9b59b6';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      // Inner glow
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawMissiles(ctx) {
    for (const m of this.missiles) {
      ctx.save();
      const angle = Math.atan2(m.vy, m.vx);
      ctx.translate(m.x, m.y);
      ctx.rotate(angle);
      // Missile body
      ctx.fillStyle = '#e74c3c';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#e74c3c';
      ctx.fillRect(-12, -5, 24, 10);
      // Nose cone
      ctx.beginPath();
      ctx.moveTo(12, -5);
      ctx.lineTo(18, 0);
      ctx.lineTo(12, 5);
      ctx.fill();
      // Trail
      ctx.fillStyle = '#f39c12';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(-12, -3);
      ctx.lineTo(-22, 0);
      ctx.lineTo(-12, 3);
      ctx.fill();
      ctx.restore();
    }
  }

  drawMeteors(ctx) {
    for (const m of this.meteors) {
      ctx.save();
      if (m.warningTimer > 0) {
        // Warning indicator on ground
        ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 100) * 0.2;
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.ellipse(m.x, this.floorY, m.radius * 1.5, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        // Warning text
        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('⚠', m.x, this.floorY - 15);
      } else if (!m.landed) {
        // Falling meteor
        ctx.fillStyle = '#c0392b';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#e74c3c';
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
        ctx.fill();
        // Fire trail
        ctx.fillStyle = '#f39c12';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(m.x, m.y - m.radius, m.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Explosion
        const t = 1 - m.explosionTimer / 0.5;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = '#e74c3c';
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#f39c12';
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.radius * (1 + t * 2), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawMinions(ctx) {
    for (const m of this.minions) {
      ctx.save();
      const mx = m.x + m.width / 2;
      const my = m.y;
      
      // Body
      ctx.fillStyle = '#3d1a50';
      ctx.fillRect(m.x, m.y, m.width, m.height);
      
      // Eyes
      ctx.fillStyle = '#e74c3c';
      ctx.shadowBlur = 5;
      ctx.shadowColor = '#e74c3c';
      ctx.beginPath();
      ctx.arc(mx - 8, my + 15, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(mx + 8, my + 15, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Health bar
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#333';
      ctx.fillRect(m.x, m.y - 8, m.width, 4);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(m.x, m.y - 8, m.width * (m.health / m.maxHealth), 4);
      
      ctx.restore();
    }
  }

  drawLaser(ctx) {
    if (!this.laserActive) return;
    ctx.save();
    const beamX = this.x + this.width / 2 + this.facing * 60;
    
    if (this.laserIsWarning) {
      // Warning phase: thin, highly transparent line
      ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 100) * 0.2; // pulse
      ctx.fillStyle = '#ff9ff3';
      ctx.fillRect(beamX - 5, this.laserY - 2, this.canvasWidth, 4);
    } else {
      // Damage phase: full thick beam
      ctx.globalAlpha = 0.8 + Math.sin(Date.now() / 50) * 0.2;
      ctx.fillStyle = '#ff0000';
      ctx.shadowBlur = 30;
      ctx.shadowColor = '#ff0000';
      // Main beam
      ctx.fillRect(beamX - 5, this.laserY - 15, this.canvasWidth, 30);
      // Glow
      ctx.globalAlpha = 0.4;
      ctx.fillRect(beamX - 5, this.laserY - 35, this.canvasWidth, 70);
    }
    
    ctx.restore();
  }
}
