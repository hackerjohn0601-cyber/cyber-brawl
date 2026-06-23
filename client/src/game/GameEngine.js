import { audioManager } from './AudioManager.js';
import { ReplayRecorder } from './ReplayRecorder.js';

export class GameEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.entities = [];
    this.lastTime = 0;
    this.isRunning = false;
    
    // Callbacks
    this.onHealthChange = null;
    this.onTimerChange = null;
    this.onGameOver = null;
    this.onRoundStartPhase = null; // Callback for "3, 2, 1, FIGHT!"
    this.onParry = null;
    this.onUltimateHit = null;

    // Combat Feel Effects
    this.hitStopTimer = 0;
    this.shakeTimer = 0;
    this.shakeMagnitude = 0;

    // Game State
    this.timer = 99;
    this.isGameOver = false;
    this.isRoundStarting = true; // Prevents movement at start
    this.timerInterval = null;

    // Networking
    this.isOnline = false;
    this.isHost = true;
    
    // Time Stop
    this.timeStopOwner = null;

    // Kill Cam
    this.killCamActive = false;
    this.killCamTimer = 0;
    this.killCamDuration = 1.8;
    this.killCamTarget = null;
    this.killCamAttacker = null;
    this.inkParticles = [];

    // Victory Celebration
    this.victoryTimer = 0;
    this.victoryWinner = null;
    this.celebrationParticles = [];

    // Replay
    this.replayRecorder = new ReplayRecorder();
  }

  addEntity(entity) {
    this.entities.push(entity);
  }

  start() {
    this.isRunning = true;
    this.isGameOver = false;

    // Start replay recording
    this.replayRecorder.startRecording({
      p1: this.entities[0]?.characterType,
      p2: this.entities[1]?.characterType
    });
    this.isRoundStarting = true;
    this.timer = 99;
    if (this.onTimerChange) this.onTimerChange(this.timer);

    // VS Screen phase
    if (this.onRoundStartPhase) this.onRoundStartPhase('VS_SCREEN');
    
    // Wait 3 seconds for VS screen, then start countdown
    setTimeout(() => {
      let countdown = 3;
      if (this.onRoundStartPhase) this.onRoundStartPhase(countdown.toString());
      import('./AudioManager.js').then(({ audioManager }) => audioManager.playCountdown());
      
      this.startInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
          if (this.onRoundStartPhase) this.onRoundStartPhase(countdown.toString());
          import('./AudioManager.js').then(({ audioManager }) => audioManager.playCountdown());
        } else if (countdown === 0) {
          if (this.onRoundStartPhase) this.onRoundStartPhase('FIGHT!');
          import('./AudioManager.js').then(({ audioManager }) => audioManager.playFight());
          this.isRoundStarting = false; // Allow movement
          
          // Start the actual match timer
          this.timerInterval = setInterval(() => {
            this.timer--;
            if (this.onTimerChange) this.onTimerChange(this.timer);
            if (this.timer <= 0) {
              this.timer = 0;
              this.endGame();
            }
          }, 1000);
        } else {
          if (this.onRoundStartPhase) this.onRoundStartPhase(''); // Clear text
          if (this.startInterval) clearInterval(this.startInterval);
        }
      }, 1000);
    }, 3000);

    requestAnimationFrame((t) => this.loop(t));
  }

  stop() {
    this.isRunning = false;
    if (this.startInterval) clearInterval(this.startInterval);
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  endGame() {
    this.isGameOver = true;
    if (this.timerInterval) clearInterval(this.timerInterval);
    
    // Stop replay recording
    this.replayRecorder.stopRecording('game_over');

    // Determine winner by finding players
    const players = this.entities.filter(e => e.health !== undefined);
    if (players.length >= 2) {
      const p1 = players[0];
      const p2 = players[1];
      let result = '';
      let winner = null;

      if (p1.health === p2.health) {
        result = 'TIE';
      } else if (p1.health > p2.health) {
        result = 'PLAYER 1 WINS';
        winner = p1;
      } else {
        result = 'PLAYER 2 WINS';
        winner = p2;
      }

      // Start victory celebration
      if (winner) {
        this.victoryWinner = winner;
        this.victoryTimer = 0;
        this.startVictoryCelebration(winner);
      }

      if (this.onGameOver) {
        this.onGameOver(result);
      }
    }
  }

  // ===== KILL CAM =====
  startKillCam(attacker, defender) {
    if (this.isGameOver || this.killCamActive) return; // Prevent double trigger
    this.killCamActive = true;
    this.killCamTimer = 0;
    this.killCamTarget = defender;
    this.killCamAttacker = attacker;
    this.timeScale = 0.12; // Dramatic slow-mo
    
    // Zoom to the hit point
    this.triggerZoom(defender, this.killCamDuration, 1.4);
    this.triggerScreenShake(0.5, 20);
    this.triggerHitStop(0.25);
    
    // Spawn ink splash particles at hit point
    const hitX = defender.x + defender.width / 2;
    const hitY = defender.y + defender.height / 2;
    for (let i = 0; i < 35; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 150 + Math.random() * 500;
      const size = 4 + Math.random() * 18;
      this.inkParticles.push({
        x: hitX, y: hitY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 200,
        size: size,
        alpha: 1,
        gravity: 400 + Math.random() * 300,
        life: 0.8 + Math.random() * 1.2,
        timer: 0,
        color: Math.random() > 0.3 ? '#111' : (Math.random() > 0.5 ? '#c23616' : '#222'),
        splat: false, splatY: 0
      });
    }
  }

  updateKillCam(rawDt) {
    if (!this.killCamActive) return;
    this.killCamTimer += rawDt;
    
    // Update ink particles
    for (const p of this.inkParticles) {
      p.timer += rawDt;
      if (!p.splat) {
        p.x += p.vx * rawDt;
        p.vy += p.gravity * rawDt;
        p.y += p.vy * rawDt;
        // Splat on floor
        if (p.y >= this.canvas.height - 55) {
          p.y = this.canvas.height - 55;
          p.splat = true;
          p.splatY = p.y;
          p.size *= 1.5;
        }
      }
      p.alpha = Math.max(0, 1 - p.timer / p.life);
    }
    this.inkParticles = this.inkParticles.filter(p => p.alpha > 0.01);
    
    // End kill cam
    if (this.killCamTimer >= this.killCamDuration) {
      this.killCamActive = false;
      this.timeScale = 1.0;
      this.zoomTimer = 0;
      this.zoomTarget = null;
      this.endGame();
    }
  }

  drawKillCam() {
    if (!this.killCamActive && this.inkParticles.length === 0) return;
    const ctx = this.ctx;
    
    // Draw ink particles
    for (const p of this.inkParticles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      if (p.splat) {
        // Splat shape (elongated ellipse on ground)
        ctx.beginPath();
        ctx.ellipse(p.x, p.splatY, p.size * 1.5, p.size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    
    // Vignette (dark edges)
    if (this.killCamActive) {
      const progress = Math.min(1, this.killCamTimer / 0.3);
      const gradient = ctx.createRadialGradient(
        this.canvas.width / 2, this.canvas.height / 2, this.canvas.width * 0.25,
        this.canvas.width / 2, this.canvas.height / 2, this.canvas.width * 0.7
      );
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, `rgba(0,0,0,${0.6 * progress})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      
      // "K.O." text
      if (this.killCamTimer > 0.5) {
        const textAlpha = Math.min(1, (this.killCamTimer - 0.5) / 0.3);
        ctx.save();
        ctx.globalAlpha = textAlpha;
        ctx.font = 'italic 900 80px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#c23616';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#c23616';
        ctx.fillText('K.O.', this.canvas.width / 2, this.canvas.height / 2 - 60);
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 3;
        ctx.strokeText('K.O.', this.canvas.width / 2, this.canvas.height / 2 - 60);
        ctx.restore();
      }
    }
  }

  // ===== VICTORY CELEBRATION =====
  startVictoryCelebration(winner) {
    // Spawn confetti/celebration particles
    for (let i = 0; i < 40; i++) {
      this.celebrationParticles.push({
        x: Math.random() * this.canvas.width,
        y: -20 - Math.random() * 100,
        vx: (Math.random() - 0.5) * 100,
        vy: 80 + Math.random() * 150,
        size: 3 + Math.random() * 6,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 10,
        color: ['#ffd32a', '#ff6b6b', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd'][Math.floor(Math.random() * 6)],
        alpha: 1, timer: 0, life: 3 + Math.random() * 2
      });
    }
  }

  updateVictoryCelebration(rawDt) {
    if (!this.victoryWinner) return;
    this.victoryTimer += rawDt;
    
    // Update confetti
    for (const p of this.celebrationParticles) {
      p.timer += rawDt;
      p.x += p.vx * rawDt;
      p.y += p.vy * rawDt;
      p.vx += Math.sin(p.timer * 3) * rawDt * 30;
      p.rotation += p.rotSpeed * rawDt;
      p.alpha = Math.max(0, 1 - p.timer / p.life);
    }
    this.celebrationParticles = this.celebrationParticles.filter(p => p.alpha > 0.01);
  }

  drawVictoryCelebration() {
    if (!this.victoryWinner && this.celebrationParticles.length === 0) return;
    const ctx = this.ctx;
    const w = this.victoryWinner;
    
    // Draw confetti
    for (const p of this.celebrationParticles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    
    if (!w) return;
    const cx = w.x + w.width / 2;
    const cy = w.y + w.height / 2;
    const t = this.victoryTimer;
    
    // Character-specific celebrations
    if (w.characterType === 'Ninja' && t > 0.5) {
      // Smoke bomb + disappear + reappear
      const phase = Math.min(1, (t - 0.5) / 0.5);
      if (phase < 0.5) {
        // Smoke cloud
        ctx.save();
        ctx.globalAlpha = 1 - phase * 2;
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = `rgba(100,100,100,${0.5 - phase})`;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(i) * 30 * phase, cy + Math.sin(i) * 25 * phase, 15 + phase * 20, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    } else if (w.characterType === 'Mage' && t > 0.3) {
      // Float up + magic circle
      const phase = Math.min(1, (t - 0.3) / 1.5);
      // Magic circle at feet
      ctx.save();
      ctx.strokeStyle = '#a29bfe';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#a29bfe';
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.ellipse(cx, w.y + w.height, 40 + phase * 20, 10 + phase * 5, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Inner rotating circle
      ctx.beginPath();
      ctx.ellipse(cx, w.y + w.height, 25 + phase * 10, 6, t * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (w.characterType === 'Tank' && t > 0.3) {
      // Ground pound cracks
      const phase = Math.min(1, (t - 0.3) / 0.8);
      if (t > 0.5 && t < 1.5) {
        ctx.save();
        ctx.strokeStyle = '#ffd32a';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1 - (t - 0.5);
        const groundY = w.y + w.height;
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI - Math.PI / 2;
          const len = phase * 60;
          ctx.beginPath();
          ctx.moveTo(cx, groundY);
          ctx.lineTo(cx + Math.cos(angle) * len, groundY + Math.sin(angle) * len * 0.3);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if (w.characterType === 'Striker' && t > 0.3) {
      // Fire spiral
      const phase = Math.min(1, (t - 0.3) / 1.5);
      ctx.save();
      ctx.globalAlpha = 0.6 * (1 - phase);
      for (let i = 0; i < 8; i++) {
        const angle = t * 4 + i * Math.PI / 4;
        const r = 20 + phase * 50;
        ctx.fillStyle = i % 2 === 0 ? '#ff6b35' : '#fffa65';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff9f43';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r * 0.6, 5 + phase * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (w.characterType === 'Brawler' && t > 0.5) {
      // Ground slam shockwave
      const phase = Math.min(1, (t - 0.5) / 0.6);
      ctx.save();
      ctx.globalAlpha = 1 - phase;
      ctx.strokeStyle = '#ff4757';
      ctx.lineWidth = 4 - phase * 3;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff4757';
      ctx.beginPath();
      ctx.ellipse(cx, w.y + w.height, phase * 80, phase * 15, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (w.characterType === 'Assassin' && t > 0.3) {
      // Blade flash
      const phase = Math.min(1, (t - 0.3) / 0.4);
      if (phase < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - phase;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#fff';
        ctx.beginPath();
        ctx.moveTo(cx - 30 + phase * 60, cy - 30);
        ctx.lineTo(cx + 30 - phase * 60, cy + 30);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 30 - phase * 60, cy - 30);
        ctx.lineTo(cx - 30 + phase * 60, cy + 30);
        ctx.stroke();
        ctx.restore();
      }
    } else if (w.characterType === 'Sniper' && t > 0.3) {
      // Scope glint
      const phase = Math.min(1, (t - 0.3) / 0.5);
      ctx.save();
      ctx.globalAlpha = (1 - phase) * 0.8;
      ctx.fillStyle = '#fff';
      ctx.shadowBlur = 30;
      ctx.shadowColor = '#48dbfb';
      ctx.beginPath();
      ctx.arc(cx + w.facing * 20, cy - 25, 4 + phase * 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawBackgroundShop() {
    this.ctx.save();
    
    const shopX = this.canvas.width / 2 - 150;
    const shopY = this.canvas.height - 50 - 200; // Floor is at canvas.height - 50
    const shopWidth = 300;
    const shopHeight = 200;

    // Building structure
    this.ctx.fillStyle = '#2f3640'; // Dark grey building
    this.ctx.fillRect(shopX, shopY, shopWidth, shopHeight);
    
    // Roof
    this.ctx.fillStyle = '#c23616'; // Red roof
    this.ctx.beginPath();
    this.ctx.moveTo(shopX - 20, shopY);
    this.ctx.lineTo(shopX + shopWidth + 20, shopY);
    this.ctx.lineTo(shopX + shopWidth, shopY - 40);
    this.ctx.lineTo(shopX, shopY - 40);
    this.ctx.fill();

    // Neon Sign Board
    this.ctx.fillStyle = '#192a56';
    this.ctx.fillRect(shopX + 50, shopY - 70, 200, 50);
    this.ctx.strokeStyle = '#e1b12c';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(shopX + 50, shopY - 70, 200, 50);

    // Neon Text "BELL'S SHOP"
    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = '#fbc531';
    this.ctx.fillStyle = '#fbc531';
    this.ctx.font = '900 24px "Impact", "Arial Black", sans-serif';
    this.ctx.textAlign = 'center';
    // Pulsing effect based on time
    const time = Date.now() / 200;
    this.ctx.globalAlpha = 0.8 + Math.sin(time) * 0.2;
    this.ctx.fillText("BELL'S SHOP", shopX + shopWidth / 2, shopY - 35);
    
    this.ctx.globalAlpha = 1.0;
    this.ctx.shadowBlur = 0;

    // Display Window
    this.ctx.fillStyle = 'rgba(116, 185, 255, 0.2)'; // Glass
    this.ctx.fillRect(shopX + 20, shopY + 50, 120, 100);
    this.ctx.strokeStyle = '#718093';
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(shopX + 20, shopY + 50, 120, 100);

    // Weapon silhouettes in window
    this.ctx.fillStyle = '#1e272e';
    // Sword
    this.ctx.fillRect(shopX + 40, shopY + 60, 5, 80);
    this.ctx.fillRect(shopX + 30, shopY + 120, 25, 5);
    // Shield
    this.ctx.beginPath();
    this.ctx.arc(shopX + 100, shopY + 100, 20, 0, Math.PI * 2);
    this.ctx.fill();

    // Door
    this.ctx.fillStyle = '#353b48';
    this.ctx.fillRect(shopX + 170, shopY + 80, 80, 120);
    this.ctx.strokeStyle = '#718093';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(shopX + 170, shopY + 80, 80, 120);
    
    // Door handle
    this.ctx.fillStyle = '#e1b12c';
    this.ctx.beginPath();
    this.ctx.arc(shopX + 180, shopY + 140, 4, 0, Math.PI * 2);
    this.ctx.fill();

    // Small glowing "OPEN" sign on door
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = '#4cd137';
    this.ctx.fillStyle = '#4cd137';
    this.ctx.font = 'bold 12px Arial';
    this.ctx.fillText("OPEN", shopX + 210, shopY + 110);

    this.ctx.restore();
  }

  triggerHitStop(duration) {
    this.hitStopTimer = Math.max(this.hitStopTimer, duration);
  }

  triggerScreenShake(duration, magnitude) {
    this.shakeTimer = Math.max(this.shakeTimer, duration);
    this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude);
  }

  triggerZoom(target, duration, scale) {
    this.zoomTarget = target;
    this.zoomTimer = duration;
    this.zoomTotalTime = duration;
    this.zoomScale = scale;
  }

  startBurstCinematic(hero, villain) {
    this.cinematicActive = true;
    this.cinematicTimer = 0;
    this.cinematicHero = hero;
    this.cinematicVillain = villain;
    
    // Total sequence is 7.5 seconds
    this.triggerZoom(villain, 7.5, 1.5);
    
    villain.velocity.y = -800; // Launch high
    villain.isKnockedDown = true;
    villain.knockedDownTimer = 7.5; // Stay invincible for the sequence
    villain.bounceCount = 2; // Bounce twice
    villain.shoutText = "怎麼會這樣!?";
    villain.shoutTimer = 2.5;
    
    hero.isCinematic = true;
    villain.isCinematic = true;
  }

  updateCinematic(deltaTime) {
    if (!this.cinematicActive) return;
    
    const t = this.cinematicTimer;
    this.cinematicTimer += deltaTime;
    const nt = this.cinematicTimer;
    
    const hero = this.cinematicHero;
    const villain = this.cinematicVillain;
    
    // Phase 1: 3.5s - Villain changes text to "可惡!"
    if (t < 3.5 && nt >= 3.5) {
      villain.shoutText = "可惡!";
      villain.shoutTimer = 2.0;
    }
    
    // Phase 2: 5.5s - Villain abruptly stands up and dashes in slow-mo!
    if (t < 5.5 && nt >= 5.5) {
      villain.isKnockedDown = false;
      villain.knockedDownTimer = 0;
      villain.y = this.canvas.height - 50 - villain.height; // Snap to floor
      villain.velocity.x = 0;
      villain.velocity.y = 0;
      
      villain.facing = hero.x > villain.x ? 1 : -1;
      villain.isAttacking = true;
      villain.attackType = 'heavy';
      villain.shoutText = "去死吧!!";
      villain.shoutTimer = 2.0;
      
      // TRIGGER SLOW MOTION
      this.timeScale = 0.1;
    }
    
    // Maintain dash velocity to overcome slow-mo and friction
    if (nt >= 5.5 && nt < 6.0) {
      villain.velocity.x = villain.facing * 5000;
    }
    
    // Phase 3: 6.0s - Villain reaches hero, hero effortlessly catches the punch!
    if (t < 6.0 && nt >= 6.0) {
      // RESTORE TIME
      this.timeScale = 1.0;
      
      // Snap villain right in front of hero
      villain.x = hero.x + (villain.facing * -60);
      villain.velocity.x = 0;
      villain.isAttacking = false;
      
      // Hero catches the attack (defending pose)
      hero.facing = -villain.facing;
      hero.isDefending = true;
      hero.shoutText = "太慢了...";
      hero.shoutTimer = 1.0;
    }
    
    // Phase 4: 6.5s - Hero throws the villain backwards! (Over-shoulder throw)
    if (t < 6.5 && nt >= 6.5) {
      hero.isDefending = false;
      
      // Villain flies backwards
      villain.velocity.y = -600;
      villain.velocity.x = hero.facing * 1200; // Thrown behind the hero
      villain.isKnockedDown = true;
      villain.knockedDownTimer = 1.0; // Exactly 1.0s left until 7.5s end
      villain.bounceCount = 1;
      
      // Deal 10 damage
      this.applyDamage(hero, villain, 10, 0);
      
      villain.shoutText = "什麼!?";
      villain.shoutTimer = 1.0;
      
      import('./AudioManager.js').then(({ audioManager }) => audioManager.playHeavyAttack());
    }
    
    // Phase 5: 7.5s - End cinematic
    if (t < 7.5 && nt >= 7.5) {
      this.cinematicActive = false;
      this.timeScale = 1.0; // Ensure time is restored
      hero.isCinematic = false;
      villain.isCinematic = false;
      hero.isDefending = false;
      // Force clear zoom to prevent lingering camera effects
      this.zoomTimer = 0;
      this.zoomTarget = null;
    }
  }

  loop(timestamp) {
    if (!this.isRunning) return;

    let rawDeltaTime = (timestamp - this.lastTime) / 1000;
    if (rawDeltaTime > 0.1) rawDeltaTime = 0.1; // Cap dt to prevent huge jumps
    this.lastTime = timestamp;
    
    let gameDeltaTime = rawDeltaTime * (this.timeScale !== undefined ? this.timeScale : 1.0);

    if (this.shakeTimer > 0) {
      this.shakeTimer -= rawDeltaTime;
      if (this.shakeTimer <= 0) this.shakeMagnitude = 0;
    }

    if (this.zoomTimer > 0) {
      this.zoomTimer -= rawDeltaTime;
      if (this.zoomTimer <= 0) this.zoomTarget = null;
    }

    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= rawDeltaTime;

      this.draw();
      requestAnimationFrame((t) => this.loop(t));
      return;
    }

    this.updateKillCam(rawDeltaTime);
    this.updateVictoryCelebration(rawDeltaTime);
    this.updateCinematic(rawDeltaTime);
    this.update(gameDeltaTime);

    // Record replay frame
    if (this.replayRecorder.isRecording && this.entities.length >= 2) {
      this.replayRecorder.recordFrame(
        this.entities[0].keys, this.entities[1].keys,
        { health: this.entities[0].health }, { health: this.entities[1].health }
      );
    }

    this.draw();

    requestAnimationFrame((t) => this.loop(t));
  }

  checkCollision(rect1, rect2) {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    );
  }

  isProtectedByBubble(defender) {
    const bubbles = this.entities.filter(e => e.type === 'shieldBubble' && e.isActive && e.owner === defender);
    for (const bubble of bubbles) {
      const dx = (defender.x + defender.width / 2) - bubble.x;
      const dy = (defender.y + defender.height / 2) - bubble.y;
      // Bubble radius is 80
      if (Math.sqrt(dx * dx + dy * dy) <= 80) {
        return true;
      }
    }
    return false;
  }

  applyDamage(attacker, defender, baseDamage, knockbackX, sourceEntity = null) {
    if (defender.health <= 0 || defender.isCounterAttacking || defender.isClone || defender.isKnockedDown) return;
    
    // Assassin passive: i-frames after skill
    if (defender.characterType === 'Assassin' && defender.assassinIFrames > 0) {
      return; // Dodge!
    }
    
    if (this.isProtectedByBubble(defender)) {
      import('./AudioManager.js').then(({ audioManager }) => audioManager.playDefend());
      return; // Take no damage, no knockback, no block accumulation
    }
    
    const isPerfectParry = defender.isDefending && (Date.now() - defender.defenseStartTime < 150);
    
    if (defender.isCounterStance || isPerfectParry) {
      defender.executeCounterAttack(attacker, isPerfectParry);
      if (this.onParry) this.onParry(defender);
      return; // Take no damage
    }

    if (attacker && attacker.damageBonus) {
      baseDamage += attacker.damageBonus;
    }
    
    let damage = baseDamage;
    let push = knockbackX;
    
    if (attacker && attacker.isBerserk) {
      damage *= 2; // Berserker deals double damage
      push *= 1.5;
    }
    
    // ===== PASSIVE: Attacker damage multiplier =====
    const realAttacker = (attacker && attacker.owner) ? attacker.owner : attacker;
    if (realAttacker && realAttacker.getPassiveDamageMultiplier) {
      damage = Math.floor(damage * realAttacker.getPassiveDamageMultiplier());
    }
    // Sniper passive: +50% damage when target < 20% HP
    if (realAttacker && realAttacker.characterType === 'Sniper' && defender.health < defender.maxHealth * 0.2) {
      damage = Math.floor(damage * 1.5);
    }
    
    // Apply equipment defense reduction
    if (defender.equipment && defender.equipment.defense) {
      damage -= defender.equipment.defense;
      if (damage < 1) damage = 1; // Minimum 1 damage if hit
    }

    if (defender.isDefending) {
      audioManager.playDefend();
      damage = Math.floor(damage / 5); // Take 20% damage if blocking
      if (damage < 1 && baseDamage > 0) damage = 1; // Minimum 1 damage through block if base damage was positive
      push = push / 2; // Less knockback
      
      // Phase 18: Ultimate Block Combo
      defender.blockCount++;
      if (defender.blockCount >= 3) {
        defender.ultimateReady = true;
      }
    } else {
      audioManager.playHit();
    }

    if (defender.isBerserk) {
      damage = Math.floor(damage / 2); // Take half damage
      defender.isStunned = false; // Super armor!
      push = push / 2;
    }

    defender.health -= damage;
    
    // ===== PASSIVE: Tank damage reflection (5%) =====
    if (defender.characterType === 'Tank' && realAttacker && realAttacker.health > 0) {
      const reflected = Math.max(1, Math.floor(damage * 0.05));
      realAttacker.health -= reflected;
      if (realAttacker.health < 0) realAttacker.health = 0;
    }
    // ===== PASSIVE: Mage CD reduction on skill hit =====
    if (realAttacker && realAttacker.characterType === 'Mage' && sourceEntity && sourceEntity.type === 'fireball') {
      if (realAttacker.cooldowns && realAttacker.cooldowns.skill) {
        realAttacker.cooldowns.skill.current = Math.max(0, realAttacker.cooldowns.skill.current - 2);
      }
    }
    
    // Trigger Combat Feel Effects (Screen Shake & Hit Stop)
    if (!defender.isDefending && damage > 0) {
      if (damage >= 40 || (attacker && attacker.isUltimate)) { // Ultimate or Heavy
        this.triggerHitStop(0.15);
        this.triggerScreenShake(0.3, 15);
      } else if (damage >= 15) { // Medium attack
        this.triggerHitStop(0.08);
        this.triggerScreenShake(0.15, 8);
      } else { // Light attack
        this.triggerHitStop(0.04);
        this.triggerScreenShake(0.08, 4);
      }

      // Trigger Combo Counter
      const actualAttacker = (attacker && attacker.owner) ? attacker.owner : attacker;
      if (actualAttacker && actualAttacker.comboCount !== undefined) {
        actualAttacker.comboCount++;
        actualAttacker.comboTimer = 2.0;
      }
    }

    if (defender.health <= 0) {
      defender.health = 0;
      // Trigger Kill Cam before ending the game
      const actualAttacker2 = (attacker && attacker.owner) ? attacker.owner : attacker;
      this.startKillCam(actualAttacker2, defender);
    }
    
    // Check Ultimate Hit
    if (attacker && (attacker.isUltimate || (attacker.isBerserk && attacker.type === 'player') || attacker.isClone)) {
      if (this.onUltimateHit) {
        this.onUltimateHit(attacker.owner || attacker);
      }
    }

    if (defender.isDiveKicking) {
      defender.endDiveKick();
    }

    defender.velocity.x = push;
    
    // Phase 19: If attacker used Aerial Pursuit or Ninja Smash, override knockback with a massive downward spike
    if (attacker && (attacker.attackType === 'pursuit' || attacker.attackType === 'ninjaSmash')) {
      defender.velocity.y = 1500; // Spike to the floor
      defender.isStunned = true;  // Temporary stun upon hitting the floor
      defender.stunTimer = 1.0;
      
      // Attacker instantly teleports to the ground to continue the combo
      const floorY = this.canvas ? this.canvas.height - 50 : 576;
      attacker.y = floorY - attacker.height;
      attacker.velocity.y = 0;
      attacker.isGrounded = true;
      attacker.isPursuing = false;
      attacker.isAttacking = false;
    } else if (attacker && attacker.attackType === 'launcher') {
      defender.velocity.y = -800; // Launch high into air
      defender.isGrounded = false;
    } else if (attacker && attacker.attackType === 'sweep') {
      defender.velocity.y = -300; // pop up slightly so they fall and bounce!
      defender.isKnockedDown = true; // Knocked down state (invincible)
      defender.knockedDownTimer = 1.0;
      defender.bounceCount = 1; // Bounce once
      defender.isStunned = false;
    } else if (sourceEntity && sourceEntity.type === 'sniperLaser') {
      // Continuous laser does not affect vertical velocity
    } else if (sourceEntity && sourceEntity.type === 'shockwave') {
      defender.velocity.y = defender.isDefending ? 0 : -1000;
    } else {
      defender.velocity.y = defender.isDefending ? 0 : -200;
    }

    if (this.onHealthChange) {
      this.onHealthChange();
    }
  }

  update(deltaTime) {
    if (this.isOnline && !this.isHost) {
      // Guest skips physics loop entirely, relies on applyNetworkState
      if (this.onUpdate) this.onUpdate();
      return;
    }

    if (this.onUpdate) this.onUpdate();

    this.updateCinematic(deltaTime);

    const floorY = this.canvas.height - 50;

    // Clean up inactive entities (like fireballs that hit or went off screen)
    this.entities = this.entities.filter(e => e.isActive !== false);

    for (let i = 0; i < this.entities.length; i++) {
      const entity = this.entities[i];

      // Time Stop Logic
      if (this.timeStopOwner && entity !== this.timeStopOwner && !entity.ignoreTimeStop) {
        continue;
      }
      
      // Stop accepting input if game over, round starting, or cinematic is active
      if ((this.isGameOver || this.isRoundStarting || entity.isCinematic || this.cinematicActive) && entity.keys) {
        for (let key in entity.keys) entity.keys[key] = false;
      }

      // AI Logic
      if (entity.updateAI && !this.isGameOver && !this.isRoundStarting && !entity.isCinematic) {
        entity.updateAI(this.entities, deltaTime);
      }

      if (entity.update) {
        // Even if round is starting, we want gravity to apply so they fall to the floor initially
        // but we override horizontal velocity to 0 to prevent moving early.
        if (this.isRoundStarting && entity.velocity !== undefined) {
          entity.velocity.x = 0;
        }
        
        let currentFloorY = floorY;
        if (entity.platformEntity && entity.platformEntity.isActive) {
          currentFloorY = entity.platformEntity.y;
        }
        
        entity.update(deltaTime, this.canvas.width, currentFloorY);
      }

      // Check attacks (Player Melee)
      if (entity.isAttacking && !this.isGameOver && !this.isRoundStarting && entity.attackBox) {
        for (let j = 0; j < this.entities.length; j++) {
          if (i === j) continue;
          const opponent = this.entities[j];
          
          if (opponent.health !== undefined && !opponent.isClone) {
            const isFriendly = (opponent === entity.owner) || (entity === opponent.owner) || (entity.owner && opponent.owner === entity.owner);
            
            if (!isFriendly && this.checkCollision(entity.attackBox, opponent)) {
              // Hit!
              entity.isAttacking = false;
              
              const isHeavy = entity.attackType === 'heavy';
              const isLauncher = entity.attackType === 'launcher';
              const isSweep = entity.attackType === 'sweep';
              const isDashPunch = entity.attackType === 'dashPunch';
              const isDiveKick = entity.attackType === 'divekick';
              const isPursuit = entity.attackType === 'pursuit';
              const isNinjaSmash = entity.attackType === 'ninjaSmash';
              const isCombo2 = entity.attackType === 'combo2';
              const isCombo3 = entity.attackType === 'combo3';
              
              let dmg = 5;
              let pushX = entity.facing === 1 ? 100 : -100;
              
              if (isHeavy) {
                dmg = 15;
                pushX = entity.facing === 1 ? 400 : -400;
              } else if (isLauncher) {
                dmg = 15;
                pushX = 0; // Vertical launch only
                import('./AudioManager.js').then(({ audioManager }) => audioManager.playHeavyAttack());
              } else if (isSweep) {
                dmg = 10;
                pushX = 0; // Sweep stuns instead of pushing
              } else if (isDashPunch) {
                dmg = 15;
                pushX = entity.facing === 1 ? 400 : -400;
                entity.velocity.x = 0; // Stop sliding when hitting!
                import('./AudioManager.js').then(({ audioManager }) => { if (audioManager.playDiveKickImpact) audioManager.playDiveKickImpact(); });
              } else if (isDiveKick) {
                dmg = 20;
                pushX = entity.facing === 1 ? 500 : -500;
                import('./AudioManager.js').then(({ audioManager }) => audioManager.playDiveKickImpact());
              } else if (isNinjaSmash) {
                dmg = 20;
                pushX = 0; // Vertical spike
                entity.velocity.x = 0;
                entity.velocity.y = -500; // Small bounce for the attacker
                import('./AudioManager.js').then(({ audioManager }) => audioManager.playDiveKickImpact()); // Reuse heavy impact sound
              } else if (isPursuit) {
                dmg = 25;
                pushX = 0; // Vertical spike
                entity.isPursuing = false; // End the dash
                entity.velocity.x = 0;
                entity.velocity.y = -500; // Small bounce for the attacker
                import('./AudioManager.js').then(({ audioManager }) => audioManager.playDiveKickImpact()); // Reuse heavy impact sound
              } else if (isCombo2) {
                dmg = 7;
                pushX = entity.facing === 1 ? 150 : -150;
              } else if (isCombo3) {
                dmg = 12;
                pushX = entity.facing === 1 ? 600 : -600;
              }
              
              // Striker Passive: Basic attacks deal more damage
              if (entity.characterType === 'Striker' && !isDiveKick && !isPursuit) {
                dmg = Math.floor(dmg * 1.5); // 50% more damage on basic attacks
              }
              
              this.applyDamage(entity, opponent, dmg, pushX);
            }
          }
        }
      }

      // Check projectiles (Fireball / Shockwave) — skip returning fireballs
      if (entity.owner && !entity.isClone && !this.isGameOver && entity.phase !== 'return' && entity.type !== 'visual_boomerang') {
        for (let j = 0; j < this.entities.length; j++) {
          const opponent = this.entities[j];
          // Don't hit owner, and only hit players (things with health), skip clones
          if (opponent.health !== undefined && !opponent.isClone) {
            const isFriendly = (opponent === entity.owner) || (opponent.owner === entity.owner) || (entity.owner === opponent);
            
            if (!isFriendly && this.checkCollision(entity, opponent)) {
              // Support returning fireballs (2000-trophy Striker)
              if (entity.phase === 'attack') {
                entity.phase = 'return';
                entity.damage = 0;
                entity.hasHit = true;
              } else if (entity.type !== 'boomerang') {
                entity.isActive = false; // Destroy projectile (unless it's an orbiting boomerang)
              }
              
              if (this.isProtectedByBubble(opponent)) {
                import('./AudioManager.js').then(({ audioManager }) => audioManager.playDefend());
                continue; // Bubble absorbs it!
              }
              
              if (entity.type === 'mindControlWave') {
                audioManager.playHit();
                opponent.isStunned = true;
                opponent.stunTimer = 3.0;
                opponent.velocity.x = 0;
                opponent.velocity.y = 0;
                if (opponent.isDiveKicking) opponent.endDiveKick();
              } else if (entity.type === 'shockwave') {
                this.applyDamage(entity.owner, opponent, 2, 0, entity);
              } else {
                let dmg = entity.damage !== undefined ? entity.damage : 15;
                let knockback = entity.knockback !== undefined ? entity.knockback : (entity.facing === 1 ? 150 : -150);
                this.applyDamage(entity.owner, opponent, dmg, knockback, entity);
              }
            }
          }
        }
      }

      // Physical check: players cannot enter opponent's shieldBubble
      if (entity.health !== undefined && !entity.isClone) {
        for (const bubble of this.entities) {
          if (bubble.type === 'shieldBubble' && bubble.isActive && bubble.owner !== entity) {
            // Find center of player
            const pX = entity.x + (entity.width / 2);
            const pY = entity.y + (entity.height / 2);
            
            // Treated as cylinder
            const dy = Math.abs(pY - bubble.y);
            const dx = Math.abs(pX - bubble.x);
            
            // If they are within 120 pixels horizontally and vertically near
            if (dy < 120 && dx < 120) {
               // Push them out horizontally
               if (pX >= bubble.x) {
                 entity.x = bubble.x + 120 - (entity.width / 2);
               } else {
                 entity.x = bubble.x - 120 - (entity.width / 2);
               }
            }
          } else if (bubble.type === 'platform' && bubble.owner !== entity) {
            // Enemy blocking for platform
            const plat = bubble;
            if (entity.x < plat.x + plat.width && entity.x + entity.width > plat.x) {
              // entity is horizontally inside platform column
              // Push them to the nearest edge
              if (entity.x + entity.width/2 < plat.x + plat.width/2) {
                 entity.x = plat.x - entity.width;
              } else {
                 entity.x = plat.x + plat.width;
              }
            }
          }
        }
      }
    }

    if (this.isOnline && this.isHost) {
      const state = this.serializeState();
      import('./NetworkManager').then(({ networkManager }) => {
        networkManager.sendGameState(state);
      });
    }
  }

  serializeState() {
    return {
      timer: this.timer,
      entities: this.entities.map(e => {
        if (e.health !== undefined) {
          return {
            type: 'player',
            x: e.x, y: e.y, facing: e.facing, health: e.health, maxHealth: e.maxHealth,
            skinId: e.skinId,
            isAttacking: e.isAttacking, attackType: e.attackType, attackProgress: e.attackProgress,
            isDefending: e.isDefending, isChargingAttack: e.isChargingAttack, chargeTimer: e.chargeTimer,
            isDiveKicking: e.isDiveKicking, diveKickState: e.diveKickState, isUsingSkill: e.isUsingSkill, skillReady: e.skillReady, diveKickReady: e.diveKickReady,
            isCounterStance: e.isCounterStance, isCounterAttacking: e.isCounterAttacking, counterCooldown: e.counterCooldown,
            blockCount: e.blockCount, ultimateReady: e.ultimateReady, isStunned: e.isStunned, stunTimer: e.stunTimer,
            isKnockedDown: e.isKnockedDown, knockedDownTimer: e.knockedDownTimer, bounceCount: e.bounceCount,
            isPursuing: e.isPursuing, isBerserk: e.isBerserk, berserkTimer: e.berserkTimer,
            damageBonus: e.damageBonus,
            cooldowns: {
              skill: { current: e.cooldowns.skill.current },
              diveKick: { current: e.cooldowns.diveKick.current },
              counter: { current: e.cooldowns.counter.current },
              pursuit: { current: e.cooldowns.pursuit.current }
            },
            isGrounded: e.isGrounded, velocity: { ...e.velocity }
          };
        } else if (e.owner) {
          return { type: e.type || 'fireball', x: e.x, y: e.y, facing: e.facing };
        } else if (e.type === 'shieldBubble') {
          return { type: 'shieldBubble', x: e.x, y: e.y };
        }
      }).filter(Boolean)
    };
  }

  applyNetworkState(state) {
    if (!state) return;
    this.timer = state.timer;
    if (this.onTimerChange) this.onTimerChange(this.timer);

    const players = state.entities.filter(e => e.type === 'player');
    const projectiles = state.entities.filter(e => e.type !== 'player');

    const mirrorPlayer = (pState) => {
      if (!pState) return null;
      return {
        ...pState,
        x: this.canvas.width - pState.x - 50,
        facing: -pState.facing,
        velocity: pState.velocity ? { x: -pState.velocity.x, y: pState.velocity.y } : undefined
      };
    };

    let mappedPlayers = players;
    if (!this.isHost && players.length >= 2) {
      mappedPlayers = [
        mirrorPlayer(players[1]), // Map Guest's state back to Guest's local p1
        mirrorPlayer(players[0])  // Map Host's state back to Guest's local p2
      ];
      // Map any additional players (like clones)
      for (let i = 2; i < players.length; i++) {
        mappedPlayers.push(mirrorPlayer(players[i]));
      }
    }

    let pIdx = 0;
    for (const e of this.entities) {
      if (e.health !== undefined && (e.type === 'player' || e.isClone)) {
        if (mappedPlayers[pIdx]) {
          Object.assign(e, mappedPlayers[pIdx]);
          if (mappedPlayers[pIdx].maxHealth !== undefined) e.maxHealth = mappedPlayers[pIdx].maxHealth;
          if (mappedPlayers[pIdx].skinId !== undefined) e.skinId = mappedPlayers[pIdx].skinId;
          if (mappedPlayers[pIdx].damageBonus !== undefined) e.damageBonus = mappedPlayers[pIdx].damageBonus;
          if (mappedPlayers[pIdx].skillReady !== undefined) e.skillReady = mappedPlayers[pIdx].skillReady;
          if (mappedPlayers[pIdx].diveKickReady !== undefined) e.diveKickReady = mappedPlayers[pIdx].diveKickReady;
          if (mappedPlayers[pIdx].counterCooldown !== undefined) e.counterCooldown = mappedPlayers[pIdx].counterCooldown;
          if (mappedPlayers[pIdx].isKnockedDown !== undefined) {
            e.isKnockedDown = mappedPlayers[pIdx].isKnockedDown;
            e.knockedDownTimer = mappedPlayers[pIdx].knockedDownTimer;
            e.bounceCount = mappedPlayers[pIdx].bounceCount;
          }
          if (mappedPlayers[pIdx].isBerserk !== undefined) {
            e.isBerserk = mappedPlayers[pIdx].isBerserk;
            e.berserkTimer = mappedPlayers[pIdx].berserkTimer;
          }
          if (mappedPlayers[pIdx].cooldowns) {
            e.cooldowns.skill.current = mappedPlayers[pIdx].cooldowns.skill.current;
            e.cooldowns.diveKick.current = mappedPlayers[pIdx].cooldowns.diveKick.current;
            e.cooldowns.counter.current = mappedPlayers[pIdx].cooldowns.counter.current;
            if (mappedPlayers[pIdx].cooldowns.pursuit) e.cooldowns.pursuit.current = mappedPlayers[pIdx].cooldowns.pursuit.current;
          }
          pIdx++;
        } else {
          e.health = -1; // Mark extra local clones as dead if they don't exist in network state
          e.isActive = false;
        }
      }
    }

    // Add any new clones from the network state
    while (pIdx < mappedPlayers.length) {
      const pState = mappedPlayers[pIdx];
      const templatePlayer = this.entities.find(e => e.type === 'player' || e.characterType);
      if (templatePlayer) {
        const newClone = new templatePlayer.constructor(
          pState.x, pState.y, pState.color || 'rgba(156, 136, 255, 0.6)', 
          {}, pState.facing, pState.characterType, true
        );
        Object.assign(newClone, pState);
        this.entities.push(newClone);
      }
      pIdx++;
    }
    
    if (this.onHealthChange) {
      this.onHealthChange();
    }
    
    // Replace non-player entities with synced projectiles
    this.entities = this.entities.filter(e => e.health !== undefined);
    for (const pState of projectiles) {
      let w = 30; // fireball diameter
      if (pState.type === 'mindControlWave') w = 60;
      if (pState.type === 'shieldBubble' || pState.type === 'shockwave' || pState.type === 'combo2' || pState.type === 'combo3' || pState.type === 'dashPunchHitbox') w = 0; // x is center
      if (pState.type === 'superWall') w = 40;
      
      const pX = !this.isHost ? this.canvas.width - pState.x - w : pState.x;
      const pFacing = !this.isHost ? -pState.facing : pState.facing;

      this.entities.push({
        ...pState,
        x: pX,
        facing: pFacing,
        isActive: true,
        draw: function(ctx) {
          if (this.type === 'shieldBubble') {
            ctx.fillStyle = this.effectColor ? `rgba(${parseInt(this.effectColor.slice(1,3),16)}, ${parseInt(this.effectColor.slice(3,5),16)}, ${parseInt(this.effectColor.slice(5,7),16)}, 0.3)` : 'rgba(0, 255, 255, 0.3)';
            ctx.strokeStyle = this.effectColor ? `rgba(${parseInt(this.effectColor.slice(1,3),16)}, ${parseInt(this.effectColor.slice(3,5),16)}, ${parseInt(this.effectColor.slice(5,7),16)}, 0.8)` : 'rgba(0, 255, 255, 0.8)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 80, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          } else if (this.type === 'mindControlWave') {
            ctx.fillStyle = 'rgba(255, 20, 147, 0.8)';
            ctx.beginPath();
            ctx.ellipse(this.x + 30, this.y + 50, 20, 50, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.ellipse(this.x + 30, this.y + 50, 10, 30, 0, 0, Math.PI * 2);
            ctx.fill();
          } else if (this.type === 'shockwave') {
            ctx.fillStyle = this.effectColor || '#8c7ae6';
            ctx.beginPath();
            ctx.rect(this.x - 25, this.y - 15, 50, 30);
            ctx.fill();
          } else if (this.type === 'combo2' || this.type === 'combo3') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.beginPath();
            ctx.arc(this.x + (this.facing === 1 ? 50 : 0), this.y + 50, 40, 0, Math.PI * 2);
            ctx.fill();
          } else if (this.type === 'dashPunchHitbox') {
            ctx.fillStyle = this.effectColor || '#ff4757';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 40, 0, Math.PI * 2);
            ctx.fill();
          } else if (this.type === 'superWall') {
            const alpha = this.lifeTimer > 7.0 ? 8.0 - this.lifeTimer : 1.0;
            ctx.fillStyle = this.effectColor ? `rgba(${parseInt(this.effectColor.slice(1,3),16)}, ${parseInt(this.effectColor.slice(3,5),16)}, ${parseInt(this.effectColor.slice(5,7),16)}, ${0.4 * alpha})` : `rgba(0, 255, 255, ${0.4 * alpha})`;
            ctx.strokeStyle = this.effectColor ? `rgba(${parseInt(this.effectColor.slice(1,3),16)}, ${parseInt(this.effectColor.slice(3,5),16)}, ${parseInt(this.effectColor.slice(5,7),16)}, ${0.8 * alpha})` : `rgba(0, 255, 255, ${0.8 * alpha})`;
            ctx.lineWidth = 4;
            ctx.fillRect(this.x, 0, this.width, 600);
            ctx.strokeRect(this.x, 0, this.width, 600);
            ctx.beginPath();
            ctx.moveTo(this.x + 20, 0);
            ctx.lineTo(this.x + 20, 600);
            ctx.stroke();
          } else if (this.type === 'fireball' && this.isUltimate) {
            // Homing bullets (Sniper)
            const glow = 0.8 + Math.random() * 0.2;
            ctx.fillStyle = `rgba(155, 89, 182, ${glow})`; 
            ctx.beginPath();
            ctx.arc(this.x + 10, this.y + 10, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(255, 255, 255, ${glow})`;
            ctx.beginPath();
            ctx.arc(this.x + 10, this.y + 10, 5, 0, Math.PI * 2);
            ctx.fill();
          } else if (this.type === 'fireball') {
            ctx.fillStyle = this.effectColor || '#e74c3c';
            ctx.fillRect(this.x, this.y, 15, 5);
          } else if (this.type === 'homingBulletSpawner' || this.type === 'bulletRainSpawner') {
            // Invisible
          } else {
            ctx.fillStyle = this.effectColor || '#fffa65';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 15, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
    }

    if (this.onHealthChange) this.onHealthChange();
  }

  draw() {
    this.ctx.save();
    
    // Apply Camera Zoom
    if (this.zoomTimer > 0 && this.zoomTarget) {
      const targetX = this.zoomTarget.x + (this.zoomTarget.width || 0) / 2;
      const targetY = this.zoomTarget.y + (this.zoomTarget.height || 0) / 2;
      
      // Slower, smooth zoom-in effect
      const elapsedTime = this.zoomTotalTime - this.zoomTimer;
      const currentScale = 1.0 + (this.zoomScale - 1.0) * Math.min(1, elapsedTime * 2);
      
      this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
      this.ctx.scale(currentScale, currentScale);
      this.ctx.translate(-targetX, -targetY);
    }

    // Apply Screen Shake
    if (this.shakeTimer > 0 && this.shakeMagnitude > 0) {
      const shakeX = (Math.random() - 0.5) * 2 * this.shakeMagnitude;
      const shakeY = (Math.random() - 0.5) * 2 * this.shakeMagnitude;
      this.ctx.translate(shakeX, shakeY);
    }

    this.ctx.fillStyle = '#1e1e2f';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw Background Decorations (Bell's Equipment Shop)
    this.drawBackgroundShop();

    this.ctx.fillStyle = '#2c2c40';
    this.ctx.fillRect(0, this.canvas.height - 50, this.canvas.width, 50);

    if (this.timeStopOwner) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    for (const entity of this.entities) {
      if (this.timeStopOwner && entity !== this.timeStopOwner && !entity.ignoreTimeStop) continue;
      if (entity.draw) {
        entity.draw(this.ctx);
      }
    }

    if (this.timeStopOwner) {
      for (const entity of this.entities) {
        if (entity === this.timeStopOwner || entity.ignoreTimeStop) {
          if (entity.draw) entity.draw(this.ctx);
        }
      }
      
      this.ctx.font = 'italic 900 60px "Arial Black", sans-serif';
      this.ctx.fillStyle = '#fffa65';
      this.ctx.strokeStyle = '#e056fd';
      this.ctx.lineWidth = 4;
      this.ctx.textAlign = 'center';
      this.ctx.fillText('宗師爆發！', this.canvas.width / 2, this.canvas.height / 2 - 100);
      this.ctx.strokeText('宗師爆發！', this.canvas.width / 2, this.canvas.height / 2 - 100);
      
      this.ctx.fillStyle = 'white';
      this.ctx.font = 'italic 900 30px "Arial Black", sans-serif';
      this.ctx.fillText('GRANDMASTER BURST', this.canvas.width / 2, this.canvas.height / 2 - 50);
    }

    // Draw Kill Cam effects (ink, vignette, KO text)
    this.drawKillCam();
    // Draw Victory Celebration
    this.drawVictoryCelebration();
    
    this.ctx.restore();
  }
}
