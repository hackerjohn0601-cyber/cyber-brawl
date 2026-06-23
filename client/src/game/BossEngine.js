// BossEngine.js - Boss Fight Game Engine
import { BossEntity } from './BossEntity.js';
import { audioManager } from './AudioManager.js';

export class BossEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.isRunning = false;
    this.lastTime = 0;
    
    // Players (max 2)
    this.players = [];
    this.boss = null;
    
    // Respawn system
    this.respawnTimers = new Map(); // playerId -> timer
    this.respawnDuration = 20;
    
    // Game state
    this.isVictory = false;
    this.isDefeat = false;
    this.gameTimer = 0;
    this.phaseAnnouncement = '';
    this.phaseAnnouncementTimer = 0;
    
    // Camera
    this.shakeTimer = 0;
    this.shakeMagnitude = 0;
    
    // Background particles
    this.bgParticles = [];
    for (let i = 0; i < 30; i++) {
      this.bgParticles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: 1 + Math.random() * 3,
        speed: 10 + Math.random() * 30,
        alpha: 0.1 + Math.random() * 0.3
      });
    }
    
    // Victory particles
    this.victoryParticles = [];
    
    // Callbacks
    this.onBossHealthChange = null;
    this.onPlayerHealthChange = null;
    this.onPhaseChange = null;
    this.onVictory = null;
    this.onDefeat = null;
    this.onRespawnTimerUpdate = null;
    
    // Floor
    this.floorY = canvas.height - 50;
    this.mapWidth = canvas.width;
    
    // Hit stop
    this.hitStopTimer = 0;

    // Engine reference for Player
    this.isHost = true;
    this.isGameOver = false;
    this.isRoundStarting = false;
    this.entities = [];
    this.cinematicActive = false;
    this.timeStopOwner = null;
    this.timeScale = 1.0;
    
    // Zoom/Camera
    this.zoomActive = false;
    this.zoomScale = 1;
    this.zoomTargetScale = 1;
    this.zoomX = 0;
    this.zoomY = 0;
    this.zoomTargetX = 0;
    this.zoomTargetY = 0;
    this.zoomSpeed = 5;
  }

  init(player1, player2, isNPC) {
    // Setup boss
    this.boss = new BossEntity(
      this.canvas.width / 2 - 90, 
      this.floorY - 280,
      this.canvas.width,
      this.canvas.height
    );
    this.boss.team = 2;
    
    // Setup players
    player1.x = 150;
    player1.y = this.floorY - player1.height;
    player1.engine = this;
    player1.facing = 1;
    player1.isDead = false;
    player1.isBossPlayer = true;
    player1.team = 1;
    this.players.push(player1);
    
    player2.x = this.canvas.width - 250;
    player2.y = this.floorY - player2.height;
    player2.engine = this;
    player2.facing = -1;
    player2.isDead = false;
    player2.isBossPlayer = true;
    player2.team = 1;
    if (isNPC) {
      player2.isCPU = true;
      player2.isBossNPC = true;
    }
    this.players.push(player2);
    
    this.entities = [...this.players];
    this.floatingTexts = [];
    this.comboCounter = 0;
    this.comboTimer = 0;
  }

  start() {
    this.isRunning = true;
    this.lastTime = performance.now();
    this.isRoundStarting = true;
    this.isGameOver = false;
    
    // Countdown and Cinematic
    this.cinematicActive = true;
    this.zoomActive = true;
    // Focus on boss face
    this.zoomTargetX = this.boss.x + this.boss.width / 2;
    this.zoomTargetY = this.boss.y + 100; // Boss head area
    this.zoomTargetScale = 1.8;
    this.zoomScale = 1.0;
    this.zoomX = this.canvas.width / 2;
    this.zoomY = this.canvas.height / 2;
    
    this.phaseAnnouncement = 'BOSS RAID';
    this.phaseAnnouncementTimer = 2.0;
    
    setTimeout(() => {
      this.phaseAnnouncement = '3';
      this.phaseAnnouncementTimer = 1.0;
      audioManager.playCountdown();
      // Zoom back out
      this.zoomTargetScale = 1.0;
      this.zoomTargetX = this.canvas.width / 2;
      this.zoomTargetY = this.canvas.height / 2;
    }, 2000);
    setTimeout(() => {
      this.phaseAnnouncement = '2';
      this.phaseAnnouncementTimer = 1.0;
      audioManager.playCountdown();
    }, 3000);
    setTimeout(() => {
      this.phaseAnnouncement = '1';
      this.phaseAnnouncementTimer = 1.0;
      audioManager.playCountdown();
    }, 4000);
    setTimeout(() => {
      this.phaseAnnouncement = 'FIGHT!';
      this.phaseAnnouncementTimer = 1.0;
      audioManager.playFight();
      this.isRoundStarting = false;
      this.cinematicActive = false;
      this.zoomActive = false;
    }, 5000);
    
    requestAnimationFrame((t) => this.loop(t));
  }

  stop() {
    this.isRunning = false;
  }

  loop(timestamp) {
    if (!this.isRunning) return;
    
    let dt = (timestamp - this.lastTime) / 1000;
    if (dt > 0.1) dt = 0.1;
    this.lastTime = timestamp;
    
    dt *= this.timeScale;
    
    // Hit stop
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      this.draw();
      requestAnimationFrame((t) => this.loop(t));
      return;
    }
    
    this.update(dt);
    this.draw();
    
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    this.gameTimer += dt;
    
    // Phase announcement
    if (this.phaseAnnouncementTimer > 0) {
      this.phaseAnnouncementTimer -= dt;
    }
    
    // Screen shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      if (this.shakeTimer <= 0) this.shakeMagnitude = 0;
    }

    // Zoom update
    if (this.zoomActive || this.zoomScale !== 1.0) {
      this.zoomScale += (this.zoomTargetScale - this.zoomScale) * this.zoomSpeed * dt;
      this.zoomX += (this.zoomTargetX - this.zoomX) * this.zoomSpeed * dt;
      this.zoomY += (this.zoomTargetY - this.zoomY) * this.zoomSpeed * dt;
    }
    
    // Combo & Texts
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCounter = 0;
    }
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.x += ft.vx * dt;
      ft.y += ft.vy * dt;
      ft.life -= dt;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
    
    // Update entities (projectiles, etc.)
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (e.isDead || (e.isActive === false)) {
        if (!this.players.includes(e)) {
          this.entities.splice(i, 1);
        }
        continue;
      }
      if (!this.players.includes(e)) {
        if (e.update) e.update(dt);
      }
    }
    
    if (this.isVictory || this.isDefeat || this.isRoundStarting) {
      // Update victory particles
      if (this.isVictory) {
        for (const p of this.victoryParticles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 200 * dt;
          p.rotation += p.rotSpeed * dt;
          p.life -= dt;
        }
        this.victoryParticles = this.victoryParticles.filter(p => p.life > 0);
        // Spawn more confetti
        if (Math.random() < 0.3) {
          this.victoryParticles.push(this.createConfetti());
        }
      }
      return;
    }
    
    // Update background particles
    for (const p of this.bgParticles) {
      p.y += p.speed * dt;
      if (p.y > this.canvas.height) {
        p.y = -5;
        p.x = Math.random() * this.canvas.width;
      }
    }
    
    // Update players
    for (const player of this.players) {
      if (player.isDead) continue;
      
      // NPC AI
      if (player.isBossNPC) {
        this.updateNPCAI(player, dt);
      }
      
      player.update(dt, this.mapWidth, this.floorY);
      
      // Bound check
      if (player.x < 0) player.x = 0;
      if (player.x + player.width > this.mapWidth) player.x = this.mapWidth - player.width;
    }
    
    // Update boss
    const alivePlayers = this.players.filter(p => !p.isDead);
    this.boss.update(dt, alivePlayers);
    
    // Ground slam detection
    if (this.boss._groundSlamPending && this.boss.isGrounded) {
      this.boss.onLand();
      this.triggerScreenShake(0.5, 15);
    }
    
    // Check collisions
    this.checkPlayerAttackBoss();
    this.checkBossAttackPlayers();
    
    // Respawn timers
    for (const player of this.players) {
      if (player.isDead) {
        const timer = this.respawnTimers.get(player) || this.respawnDuration;
        const newTimer = timer - dt;
        this.respawnTimers.set(player, newTimer);
        if (this.onRespawnTimerUpdate) {
          this.onRespawnTimerUpdate(player, Math.ceil(newTimer));
        }
        if (newTimer <= 0) {
          this.respawnPlayer(player);
        }
      }
    }
    
    // Boss phase change announcement
    const prevPhase = this.boss.phase;
    if (this.boss.phaseTransitioning && this.phaseAnnouncementTimer <= 0) {
      this.phaseAnnouncement = `Phase ${this.boss.phase}`;
      this.phaseAnnouncementTimer = 2.0;
      this.triggerScreenShake(1.0, 20);
      if (this.onPhaseChange) this.onPhaseChange(this.boss.phase);
    }
    
    // Victory/Defeat check
    if (this.boss.health <= 0 && !this.isVictory) {
      this.victory();
    }
    
    // All players dead = check if everyone is dead at once
    const allDead = this.players.every(p => p.isDead);
    // Don't end game - players will respawn after 20 sec
    
    // Health callbacks
    if (this.onBossHealthChange) {
      this.onBossHealthChange(this.boss.health, this.boss.maxHealth, this.boss.phase);
    }
  }

  updateNPCAI(npc, dt) {
    // Simple boss-fighting AI
    const boss = this.boss;
    const dist = Math.abs(npc.x + npc.width/2 - (boss.x + boss.width/2));
    
    // Face boss
    npc.facing = boss.x > npc.x ? 1 : -1;
    
    // Move toward boss
    if (dist > 150) {
      npc.keys[npc.controls.right] = boss.x > npc.x;
      npc.keys[npc.controls.left] = boss.x < npc.x;
    } else {
      npc.keys[npc.controls.right] = false;
      npc.keys[npc.controls.left] = false;
    }
    
    // Attack when close
    if (dist < 200) {
      // Random attacks
      if (Math.random() < 0.03) {
        npc.keys[npc.controls.attack] = true;
        setTimeout(() => { npc.keys[npc.controls.attack] = false; }, 100);
      }
      if (Math.random() < 0.01 && npc.skillReady) {
        npc.keys[npc.controls.skill] = true;
        setTimeout(() => { npc.keys[npc.controls.skill] = false; }, 100);
      }
    }
    
    // Jump to dodge bullets
    const nearbyBullet = boss.bullets.find(b => {
      const dx = b.x - npc.x;
      const dy = b.y - npc.y;
      return Math.sqrt(dx*dx + dy*dy) < 100;
    });
    if (nearbyBullet && npc.isGrounded && Math.random() < 0.1) {
      npc.keys[npc.controls.up] = true;
      setTimeout(() => { npc.keys[npc.controls.up] = false; }, 100);
    }
    
    // Dodge meteors
    const nearbyMeteor = boss.meteors.find(m => {
      return Math.abs(m.x - npc.x) < 60 && m.warningTimer <= 0.3;
    });
    if (nearbyMeteor) {
      npc.keys[npc.controls.right] = nearbyMeteor.x > npc.x ? false : true;
      npc.keys[npc.controls.left] = nearbyMeteor.x > npc.x ? true : false;
    }
  }

  checkPlayerAttackBoss() {
    for (const player of this.players) {
      if (player.isDead) continue;
      
      // Check player attack box vs boss hitbox
      if (player.isAttacking || player.isUsingSkill) {
        const attackBox = {
          x: player.x + player.attackBox.offsetX + (player.facing === 1 ? player.width : -player.attackBox.width),
          y: player.y + player.attackBox.offsetY,
          width: player.attackBox.width,
          height: player.attackBox.height
        };
        
        const bossBox = {
          x: this.boss.x + 20,
          y: this.boss.y + 20,
          width: this.boss.width - 40,
          height: this.boss.height - 40
        };
        
        if (this.checkCollision(attackBox, bossBox)) {
          if (!player._lastHitBoss || this.gameTimer - player._lastHitBoss > 0.3) {
            player._lastHitBoss = this.gameTimer;
            let damage = player.isUsingSkill ? 30 : (player.attackType === 'heavy' ? 25 : 15);
            
            // Equipment bonus
            if (player.equipment && player.equipment.attack) {
              damage += player.equipment.attack;
            }
            
            this.boss.takeDamage(damage);
            this.addFloatingText(damage, this.boss.x + this.boss.width/2, this.boss.y + this.boss.height/2, '#f1c40f', player.isUsingSkill);
            
            this.hitStopTimer = 0.05;
            this.triggerScreenShake(0.1, 3);
            audioManager.playHit();
          }
        }
      }
      
    }
    
    // Check all projectiles (fireballs) in entities vs boss
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (e.type === 'fireball' && e.isActive && e.owner && e.owner.team === 1) {
        const fbBox = {
          x: e.x,
          y: e.y,
          width: e.width || 20,
          height: e.height || 20
        };
        const bossBox = {
          x: this.boss.x + 20,
          y: this.boss.y + 20,
          width: this.boss.width - 40,
          height: this.boss.height - 40
        };
        if (this.checkCollision(fbBox, bossBox)) {
          const dmg = e.damage || 15;
          this.boss.takeDamage(dmg);
          this.addFloatingText(dmg, this.boss.x + this.boss.width/2, this.boss.y + this.boss.height/2, '#e74c3c');
          e.isActive = false;
          import('./AudioManager.js').then(({ audioManager }) => { if(audioManager.playHit) audioManager.playHit() });
        }
      }
    }
    
    // Players can also hit minions
    for (const player of this.players) {
      if (player.isDead || (!player.isAttacking && !player.isUsingSkill)) continue;
      
      const attackBox = {
        x: player.x + player.attackBox.offsetX + (player.facing === 1 ? player.width : -player.attackBox.width),
        y: player.y + player.attackBox.offsetY,
        width: player.attackBox.width,
        height: player.attackBox.height
      };
      
      for (const minion of this.boss.minions) {
        const minionBox = { x: minion.x, y: minion.y, width: minion.width, height: minion.height };
        if (this.checkCollision(attackBox, minionBox)) {
          minion.health -= 20;
          audioManager.playHit();
        }
      }
    }
  }

  checkBossAttackPlayers() {
    for (const player of this.players) {
      if (player.isDead || player.respawnInvincible) continue;
      
      const playerBox = {
        x: player.x,
        y: player.y,
        width: player.width,
        height: player.height
      };
      
      // Boss body collision (during charge)
      if (this.boss.currentAttack === 'charge') {
        const bossBox = {
          x: this.boss.x,
          y: this.boss.y,
          width: this.boss.width,
          height: this.boss.height
        };
        if (this.checkCollision(playerBox, bossBox)) {
          this.damagePlayer(player, 50);
        }
      }
      
      // Bullets
      for (let i = this.boss.bullets.length - 1; i >= 0; i--) {
        const b = this.boss.bullets[i];
        const dx = b.x - (player.x + player.width/2);
        const dy = b.y - (player.y + player.height/2);
        if (Math.sqrt(dx*dx + dy*dy) < b.radius + 20) {
          if (player.isDefending) {
            this.damagePlayer(player, Math.floor(b.damage / 5));
          } else {
            this.damagePlayer(player, b.damage);
          }
          this.boss.bullets.splice(i, 1);
          break;
        }
      }
      
      // Missiles
      for (let i = this.boss.missiles.length - 1; i >= 0; i--) {
        const m = this.boss.missiles[i];
        const dx = m.x - (player.x + player.width/2);
        const dy = m.y - (player.y + player.height/2);
        if (Math.sqrt(dx*dx + dy*dy) < m.radius + 20) {
          this.damagePlayer(player, m.damage);
          this.boss.missiles.splice(i, 1);
          this.triggerScreenShake(0.3, 8);
          break;
        }
      }
      
      // Meteors
      for (const m of this.boss.meteors) {
        if (m.landed && m.explosionTimer > 0.3) {
          const dx = m.x - (player.x + player.width/2);
          const dy = m.y - (player.y + player.height/2);
          if (Math.sqrt(dx*dx + dy*dy) < m.radius * 2) {
            this.damagePlayer(player, m.damage);
          }
        }
      }
      
      // Laser
      if (this.boss.laserActive) {
        if (Math.abs(player.y + player.height/2 - this.boss.laserY) < 25) {
          this.damagePlayer(player, 60);
        }
      }
      
      // Minions
      for (const minion of this.boss.minions) {
        const minionBox = { x: minion.x, y: minion.y, width: minion.width, height: minion.height };
        if (this.checkCollision(playerBox, minionBox)) {
          minion.attackCooldown -= 1;
          if (minion.attackCooldown <= 0) {
            this.damagePlayer(player, minion.damage);
            minion.attackCooldown = 60; // frames
          }
        }
      }
    }
  }

  damagePlayer(player, damage) {
    if (player.isDead || player.respawnInvincible) return;
    if (player._lastDamaged && this.gameTimer - player._lastDamaged < 0.5) return; // damage cooldown
    
    player._lastDamaged = this.gameTimer;
    
    if (player.isDefending) {
      damage = Math.floor(damage / 5);
    }
    
    // Equipment defense
    if (player.equipment && player.equipment.defense) {
      damage -= player.equipment.defense;
      if (damage < 1) damage = 1;
    }
    
    player.health -= damage;
    this.addFloatingText(damage, player.x + player.width/2, player.y, player.isDefending ? '#95a5a6' : '#ff4757');
    import('./AudioManager.js').then(({ audioManager }) => { if(audioManager.playHit) audioManager.playHit() });
    
    if (player.health <= 0) {
      player.health = 0;
      player.isDead = true;
      this.respawnTimers.set(player, this.respawnDuration);
    }
    
    if (this.onPlayerHealthChange) {
      this.onPlayerHealthChange(this.players.indexOf(player), player.health, player.maxHealth);
    }
  }

  respawnPlayer(player) {
    player.isDead = false;
    player.health = player.maxHealth;
    player.x = 100 + Math.random() * 200;
    player.y = this.floorY - player.height;
    player.velocity = { x: 0, y: 0 };
    player.respawnInvincible = true;
    this.respawnTimers.delete(player);
    
    // 3 seconds invincible
    setTimeout(() => {
      player.respawnInvincible = false;
    }, 3000);
    
    if (this.onPlayerHealthChange) {
      this.onPlayerHealthChange(this.players.indexOf(player), player.health, player.maxHealth);
    }
  }

  victory() {
    this.isVictory = true;
    this.isGameOver = true;
    this.phaseAnnouncement = '🎉 VICTORY!';
    this.phaseAnnouncementTimer = 5.0;
    
    // Spawn confetti
    for (let i = 0; i < 50; i++) {
      this.victoryParticles.push(this.createConfetti());
    }
    
    this.triggerScreenShake(1.0, 15);
    
    // Reward
    const goldReward = 500 + this.boss.phase * 200; // More reward if boss reached higher phase
    
    if (this.onVictory) {
      this.onVictory(goldReward);
    }
  }

  createConfetti() {
    return {
      x: Math.random() * this.canvas.width,
      y: -20 - Math.random() * 100,
      vx: (Math.random() - 0.5) * 150,
      vy: 50 + Math.random() * 200,
      size: 4 + Math.random() * 8,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 10,
      color: ['#ffd32a', '#ff6b6b', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd'][Math.floor(Math.random() * 6)],
      life: 3 + Math.random() * 3
    };
  }

  triggerScreenShake(duration, magnitude) {
    this.shakeTimer = Math.max(this.shakeTimer, duration);
    this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude);
  }

  checkCollision(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x &&
           a.y < b.y + b.height && a.y + a.height > b.y;
  }

  addFloatingText(text, x, y, color = '#fff', isCrit = false) {
    this.floatingTexts.push({
      text: text,
      x: x + (Math.random() * 40 - 20),
      y: y + (Math.random() * 40 - 20),
      vx: (Math.random() - 0.5) * 100,
      vy: -150 - Math.random() * 50,
      life: 1.0,
      color: color,
      isCrit: isCrit
    });
    this.comboCounter++;
    this.comboTimer = 2.0;
  }

  // Stub methods that Player.js might call
  applyDamage() {}
  
  addEntity(entity) {
    this.entities.push(entity);
  }
  
  triggerZoom(target, duration, scale) {
    this.zoomActive = true;
    this.zoomTargetScale = scale;
    this.zoomTargetX = target.x + target.width / 2;
    this.zoomTargetY = target.y + target.height / 2;
    setTimeout(() => {
      if (!this.cinematicActive) {
        this.zoomTargetScale = 1.0;
        this.zoomTargetX = this.canvas.width / 2;
        this.zoomTargetY = this.canvas.height / 2;
        setTimeout(() => { this.zoomActive = false; }, 500);
      }
    }, duration * 1000);
  }

  draw() {
    const ctx = this.ctx;
    ctx.save();
    
    // Camera Zoom
    if (this.zoomScale !== 1.0) {
      ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
      ctx.scale(this.zoomScale, this.zoomScale);
      ctx.translate(-this.zoomX, -this.zoomY);
    }
    
    // Screen shake
    if (this.shakeTimer > 0) {
      const sx = (Math.random() - 0.5) * this.shakeMagnitude;
      const sy = (Math.random() - 0.5) * this.shakeMagnitude;
      ctx.translate(sx, sy);
    }
    
    // === BACKGROUND ===
    // Dark arena gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    bgGrad.addColorStop(0, '#0a0a1a');
    bgGrad.addColorStop(0.5, '#1a0a2e');
    bgGrad.addColorStop(1, '#0d1117');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Background particles
    for (const p of this.bgParticles) {
      ctx.fillStyle = `rgba(139, 92, 246, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Floor
    ctx.fillStyle = '#1e1e3a';
    ctx.fillRect(0, this.floorY, this.canvas.width, 50);
    // Floor line
    ctx.strokeStyle = '#9b59b6';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#9b59b6';
    ctx.beginPath();
    ctx.moveTo(0, this.floorY);
    ctx.lineTo(this.canvas.width, this.floorY);
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Grid lines on floor
    ctx.strokeStyle = 'rgba(155, 89, 182, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < this.canvas.width; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, this.floorY);
      ctx.lineTo(i, this.floorY + 50);
      ctx.stroke();
    }
    
    // === DRAW BOSS ===
    if (this.boss.health > 0) {
      this.boss.draw(ctx);
    }
    
    // === DRAW PLAYERS ===
    for (const player of this.players) {
      if (player.isDead) {
        // Draw ghost
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#888';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('💀', player.x + player.width/2, player.y + player.height/2);
        const timer = this.respawnTimers.get(player) || 0;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`${Math.ceil(timer)}s`, player.x + player.width/2, player.y + player.height/2 + 25);
        ctx.restore();
        continue;
      }
      
      ctx.save();
      // Respawn invincibility flash
      if (player.respawnInvincible) {
        ctx.globalAlpha = 0.5 + Math.sin(this.gameTimer * 15) * 0.3;
      }
      player.draw(ctx);
      ctx.restore();
    }
    
    // === DRAW ENTITIES (PROJECTILES) ===
    for (const e of this.entities) {
      if (!this.players.includes(e) && e.draw) {
        e.draw(ctx);
      }
    }
    
    // === Phase 3 Darkness ===
    if (this.boss.darknessLevel > 0) {
      const grad = ctx.createRadialGradient(
        this.canvas.width / 2, this.canvas.height / 2, 150,
        this.canvas.width / 2, this.canvas.height / 2, this.canvas.width
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${this.boss.darknessLevel})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    ctx.restore();
    
    // UI draws OUTSIDE of camera zoom
    this.drawUI(ctx);
    
    // Floating damage texts
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.life);
      ctx.fillStyle = ft.color || '#fff';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      if (ft.isCrit) ctx.font = 'bold 36px Arial';
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#000';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
    
    // Combo Counter
    if (this.comboCounter > 1) {
      ctx.save();
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'italic bold 48px Arial';
      ctx.textAlign = 'left';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#e67e22';
      ctx.fillText(this.comboCounter + ' HITS!', 50, 150);
      
      // Combo text label
      ctx.fillStyle = '#fff';
      ctx.font = 'italic bold 24px Arial';
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#000';
      ctx.fillText('COMBO', 55, 110);
      ctx.restore();
    }
  }

  drawUI(ctx) {
    // === BOSS HEALTH BAR (top center) ===
    const barW = 500;
    const barH = 25;
    const barX = (this.canvas.width - barW) / 2;
    const barY = 20;
    
    // Boss name
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#9b59b6';
    ctx.fillText(`🐉 ${this.boss.name} — Phase ${this.boss.phase}`, this.canvas.width / 2, barY - 5);
    ctx.shadowBlur = 0;
    
    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.strokeStyle = '#9b59b6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 5);
    ctx.fill();
    ctx.stroke();
    
    // Health fill
    const hpRatio = this.boss.health / this.boss.maxHealth;
    const hpColor = this.boss.phase === 1 ? '#9b59b6' : 
                    this.boss.phase === 2 ? '#e74c3c' : '#ff0040';
    const hpGrad = ctx.createLinearGradient(barX, 0, barX + barW * hpRatio, 0);
    hpGrad.addColorStop(0, hpColor);
    hpGrad.addColorStop(1, '#c0392b');
    ctx.fillStyle = hpGrad;
    ctx.beginPath();
    ctx.roundRect(barX + 2, barY + 2, (barW - 4) * hpRatio, barH - 4, 3);
    ctx.fill();
    
    // HP text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(this.boss.health)} / ${this.boss.maxHealth}`, this.canvas.width / 2, barY + barH - 7);
    
    // Phase markers
    ctx.fillStyle = '#ffd32a';
    const p1x = barX + barW * 0.66;
    const p2x = barX + barW * 0.33;
    ctx.fillRect(p1x, barY, 2, barH);
    ctx.fillRect(p2x, barY, 2, barH);
    
    // === PLAYER HEALTH BARS (bottom) ===
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const pBarW = 180;
      const pBarH = 15;
      const pBarX = i === 0 ? 20 : this.canvas.width - pBarW - 20;
      const pBarY = this.canvas.height - 35;
      
      // Name
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = i === 0 ? 'left' : 'right';
      const name = p.username || (p.isBossNPC ? 'NPC' : `P${i+1}`);
      ctx.fillText(name, i === 0 ? pBarX : pBarX + pBarW, pBarY - 5);
      
      // Bar bg
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(pBarX, pBarY, pBarW, pBarH);
      ctx.strokeStyle = '#4a69bd';
      ctx.lineWidth = 1;
      ctx.strokeRect(pBarX, pBarY, pBarW, pBarH);
      
      // Health fill
      const ratio = Math.max(0, p.health / p.maxHealth);
      ctx.fillStyle = p.isDead ? '#555' : (ratio > 0.3 ? '#27ae60' : '#e74c3c');
      ctx.fillRect(pBarX + 1, pBarY + 1, (pBarW - 2) * ratio, pBarH - 2);
      
      // HP text
      ctx.fillStyle = '#fff';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.ceil(p.health)}`, pBarX + pBarW / 2, pBarY + pBarH - 3);
      
      // Respawn timer
      if (p.isDead) {
        const timer = this.respawnTimers.get(p) || 0;
        ctx.fillStyle = '#ff6b6b';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`復活: ${Math.ceil(timer)}s`, pBarX + pBarW / 2, pBarY - 20);
      }
    }
    
    // Timer
    ctx.fillStyle = '#888';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.floor(this.gameTimer / 60)}:${String(Math.floor(this.gameTimer % 60)).padStart(2, '0')}`, this.canvas.width / 2, barY + barH + 20);

    // Phase Announcement (Moved here to be outside camera transform)
    if (this.phaseAnnouncementTimer > 0) {
      const alpha = Math.min(1, this.phaseAnnouncementTimer);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'italic 900 60px "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.isVictory ? '#ffd32a' : '#fff';
      ctx.shadowBlur = 20;
      ctx.shadowColor = this.isVictory ? '#ffd32a' : '#9b59b6';
      ctx.fillText(this.phaseAnnouncement, this.canvas.width / 2, this.canvas.height / 2);
      ctx.restore();
    }
    
    // Victory confetti (Moved here)
    for (const p of this.victoryParticles) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life / 0.5);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size/2, -p.size/4, p.size, p.size/2);
      ctx.restore();
    }
  }
}
