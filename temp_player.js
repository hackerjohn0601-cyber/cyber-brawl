import { Fireball } from './Fireball';
import { audioManager } from './AudioManager';

export class Player {
  constructor(x, y, color, controls, facing, characterType, isCPU = false, level = 1, equipment = { defense: 0, attack: 0, maxHp: 0 }, skinId = 'default') {
    this.x = x;
    this.y = y;
    this.width = 50;
    this.height = 100;
    this.color = color;
    this.skinId = skinId;
    this.velocity = { x: 0, y: 0 };
    this.speed = characterType === 'Ninja' ? 500 : (characterType === 'Assassin' ? 400 : 300);
    this.jumpForce = characterType === 'Assassin' ? -700 : -600;
    this.gravity = 1500;
    this.controls = controls;
    this.isGrounded = false;
    this.isWalkHopping = false;
    this.keys = {};

    this.level = level || 1;
    this.equipment = equipment;
    this.maxHealth = 500 + (this.level - 1) * 20 + this.equipment.maxHp;
    this.health = this.maxHealth;
    this.damageBonus = (this.level - 1) * 2 + this.equipment.attack;
    this.facing = facing || 1;
    this.isAttacking = false;
    this.attackCooldown = false;
    
    this.isDefending = false;

    this.type = 'player';
    this.characterType = characterType;
    this.isUsingSkill = false;
    this.skillCooldownTime = characterType === 'Assassin' ? 3000 : 2500;
    this.skillReady = true;

    this.isChargingAttack = false;
    this.chargeTimer = 0;
    this.attackType = 'light';
    this.comboStep = 1;
    this.comboTimer = null;

    this.isDiveKicking = false;
    this.diveKickState = 0; // 0=none, 1=launch, 2=hover, 3=dive
    this.diveKickReady = true;

    this.isCounterStance = false;
    this.isCounterAttacking = false;
    this.counterCooldown = false;
    this.counterOriginalX = 0;
    this.counterStanceTimer = 0;

    // Cooldown Timers
    this.cooldowns = {
      skill: { current: 0, max: 10.0 },
      diveKick: { current: 0, max: 1.5 },
      counter: { current: 0, max: 5.0 },
      pursuit: { current: 0, max: 5.0 },
      intercept: { current: 0, max: 5.0 },
      ultimate: { current: 0, max: 15.0 },
      defense: { current: 0, max: 5.0 },
      sweep: { current: 0, max: 7.0 }
    };
    this.defenseStartTime = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.currentEmote = null;
    
    // Phase 19: Aerial Pursuit
    this.isPursuing = false;
    
    // Reading quest board
    this.isReadingQuest = false;

    // Phase 18: Ultimate & Stun
    this.blockCount = 0;
    this.ultimateReady = false;
    this.isStunned = false;
    this.stunTimer = 0;
    this.isKnockedDown = false;
    this.knockedDownTimer = 0;
    this.bounceCount = 0;

    this.defenseDurationTimer = 0;

    this.engine = null;
    this.isCPU = isCPU;
    this.isOnline = false;
    this.isLocalPlayer = true;
    
    this.aiState = {
      reactionDelay: 0,
      state: 'idle' // 'idle', 'approach', 'retreat', 'attack'
    };

    this.animationTimer = 0;
    this.attackProgress = 0;

    this.attackBox = {
      x: 0,
      y: 0,
      width: 60,
      height: 20,
      offsetX: 0,
      offsetY: 20
    };

    if (!isCPU) {
      window.addEventListener('keydown', (e) => {
        if (!this.isLocalPlayer) return;
        
        let key = e.key.toLowerCase();
        const codeToKeyMap = { 'KeyW': 'w', 'KeyA': 'a', 'KeyS': 's', 'KeyD': 'd', 'KeyF': 'f', 'Space': ' ' };
        if (codeToKeyMap[e.code]) key = codeToKeyMap[e.code];
        
        if (this.isOnline && this.engine && !this.engine.isHost) {
          // Guest mode: send inputs to server, don't execute locally
          if (Object.values(this.controls).includes(key)) {
            import('./NetworkManager').then(({ networkManager }) => {
              let sendKey = key;
              if (key === this.controls.left) sendKey = this.controls.right;
              else if (key === this.controls.right) sendKey = this.controls.left;
              networkManager.sendInput(sendKey, true);
            });
          }
          return;
        }

        // Bug Fix: Prevent inputs before round starts or after game over
        if (this.engine && (this.engine.isGameOver || this.engine.isRoundStarting)) return;

        this.keys[key] = true;
        
        // Emote System (Only works in Lobby or when not moving)
        if (!this.engine) {
          if (key === 'z') this.currentEmote = 'sit';
          if (key === 'x') this.currentEmote = 'cheer';
          if (key === 'c') this.currentEmote = 'taunt';
        }
        
        // Cancel emote if player attacks or moves
        if (['w', 'a', 's', 'd', ' ', 'f'].includes(key) || Object.values(this.controls).includes(key)) {
          this.currentEmote = null;
        }
        
        if (key === this.controls.attack && !this.isAttacking && !this.attackCooldown && !this.isUsingSkill && !this.isChargingAttack && !this.isDiveKicking) {
          this.isChargingAttack = true;
          this.chargeTimer = 0;
        }
        
        if ((key === this.controls.skill || key === this.controls.up) && !this.isDefending && !this.isDiveKicking && !this.isStunned) {
          if (this.keys[this.controls.skill] && this.keys[this.controls.up] && this.cooldowns.pursuit.current <= 0) {
            let opponent = null;
            if (this.engine) opponent = this.engine.entities.find(e => e !== this && e.health !== undefined);
            
            const isOpponentHighAirborne = opponent && (!opponent.isGrounded && opponent.y < 400 || opponent.isDiveKicking);
            if (isOpponentHighAirborne) {
              if (this.isUsingSkill) {
                this.isUsingSkill = false; // cancel normal skill
              }
              this.executeAirPursuit(opponent);
            } else if (key === this.controls.skill && (this.skillReady || (this.characterType === 'Sniper' && this.platformEntity && this.platformEntity.isActive)) && !this.isUsingSkill) {
              this.executeSkill();
            }
          } else if (key === this.controls.skill && (this.skillReady || (this.characterType === 'Sniper' && this.platformEntity && this.platformEntity.isActive)) && !this.isUsingSkill) {
            this.executeSkill();
          }
        }

        if (key === this.controls.ultimate && this.ultimateReady && !this.isDefending && !this.isUsingSkill && !this.isDiveKicking && !this.isStunned) {
          this.executeUltimate();
        }
      });
      window.addEventListener('keyup', (e) => {
        if (!this.isLocalPlayer) return;
        
        let key = e.key.toLowerCase();
        const codeToKeyMap = { 'KeyW': 'w', 'KeyA': 'a', 'KeyS': 's', 'KeyD': 'd', 'KeyF': 'f', 'Space': ' ' };
        if (codeToKeyMap[e.code]) key = codeToKeyMap[e.code];
        
        if (this.isOnline && this.engine && !this.engine.isHost) {
          if (Object.values(this.controls).includes(key)) {
            import('./NetworkManager').then(({ networkManager }) => {
              let sendKey = key;
              if (key === this.controls.left) sendKey = this.controls.right;
              else if (key === this.controls.right) sendKey = this.controls.left;
              networkManager.sendInput(sendKey, false);
            });
          }
          return;
        }

        this.keys[key] = false;
        
        if (key === this.controls.attack && this.isChargingAttack) {
          this.releaseAttack();
        }
      });
    }
  }

  releaseAttack() {
    this.isChargingAttack = false;
    this.isAttacking = true;
    this.attackCooldown = true;
    this.attackProgress = 0;
    
    // Determine Light vs Heavy vs Directional based on charge time and keys
    if (this.chargeTimer >= 0.3) {
      if (this.keys[this.controls.up]) {
        this.attackType = 'launcher';
      } else {
        this.attackType = 'heavy';
      }
      this.comboStep = 1; // Resets combo
      if (this.comboTimer) clearTimeout(this.comboTimer);
    } else {
      if (this.comboTimer) clearTimeout(this.comboTimer);
      
      const isMovingForward = (this.facing === 1 && this.keys[this.controls.right]) || (this.facing === -1 && this.keys[this.controls.left]);
      
      if (this.keys[this.controls.up]) {
        // Tapped Up + Attack -> Dive Kick
        this.isAttacking = false;
        this.attackCooldown = false;
        if (this.diveKickReady) this.executeDiveKick();
        return; // Abort normal attack sequence
      } else if (this.keys[this.controls.defend]) {
        if (this.cooldowns.sweep && this.cooldowns.sweep.current <= 0) {
          this.attackType = 'sweep';
          this.comboStep = 1;
          this.cooldowns.sweep.current = this.cooldowns.sweep.max;
        } else {
          // Cooldown active, fallback to normal attack
          this.attackType = `combo${this.comboStep}`;
          this.comboStep++;
          if (this.comboStep > 3) this.comboStep = 1;
        }
      } else if (isMovingForward) {
        this.attackType = 'dashPunch';
        this.velocity.x = this.facing * 800; // Sudden burst
        this.comboStep = 1;
        import('./AudioManager').then(({ audioManager }) => { if (audioManager.playDash) audioManager.playDash(); });
      } else {
        this.attackType = `combo${this.comboStep}`;
        this.comboStep++;
        if (this.comboStep > 3) this.comboStep = 1;
      }
      
      // Give them 600ms to hit the next combo, otherwise it resets
      this.comboTimer = setTimeout(() => {
        this.comboStep = 1;
      }, 600);
    }
    
    // Play Sound
    if (this.attackType === 'heavy' || this.attackType === 'launcher' || this.attackType === 'combo3') {
      audioManager.playHeavyAttack();
    } else {
      audioManager.playLightAttack();
    }
    
    // Different timing for different attacks
    let step = 0.2;
    let holdTime = 50;
    let cooldown = 300;

    if (this.attackType === 'heavy' || this.attackType === 'launcher') {
      step = 0.08; holdTime = 200; cooldown = 800;
    } else if (this.attackType === 'dashPunch' || this.attackType === 'sweep') {
      step = 0.15; holdTime = 150; cooldown = 500;
    } else if (this.attackType === 'combo2') {
      step = 0.15; holdTime = 80; cooldown = 300;
    } else if (this.attackType === 'combo3') {
      step = 0.1; holdTime = 150; cooldown = 600;
    }

    let punchAnim = setInterval(() => {
      this.attackProgress += step;
      if (this.attackProgress >= 1) {
        clearInterval(punchAnim);
        setTimeout(() => {
          this.isAttacking = false;
          this.attackProgress = 0;
        }, holdTime);
      }
    }, 16);

    setTimeout(() => {
      this.attackCooldown = false;
    }, cooldown);
  }

  executeSkill() {
    this.isUsingSkill = true;
    if (this.engine && this.engine.onSkillUsed) this.engine.onSkillUsed(this);
    if (this.characterType === 'Assassin' && this.isSuperWallActive) {
      // No CD Fireball for Assassin during ultimate!
      import('./AudioManager').then(({ audioManager }) => audioManager.playFireball());
      if (this.engine) {
        const fireballX = this.facing === 1 ? this.x + this.width : this.x - 40;
        const fireball = {
          type: 'fireball',
          x: fireballX,
          y: this.y + 20,
          width: 30, height: 30,
          velocity: { x: this.facing * 800, y: 0 },
          owner: this,
          facing: this.facing,
          isActive: true,
          damage: 2,
          update: function(deltaTime) {
            this.x += this.velocity.x * deltaTime;
            if (this.x < -100 || this.x > 1200) this.isActive = false;
          },
          draw: function(ctx) {
            ctx.fillStyle = '#00ffff'; // Cyan fireball
            ctx.beginPath();
            ctx.arc(this.x, this.y, 15, 0, Math.PI * 2);
            ctx.fill();
          }
        };
        this.engine.addEntity(fireball);
      }
      setTimeout(() => { this.isUsingSkill = false; }, 200);
      return;
    }

    if (this.characterType === 'Sniper' && this.platformEntity && this.platformEntity.isActive) {
      // Do not reset the 10s skill cooldown when just shooting a bullet from the platform
    } else {
      this.skillReady = false;
      this.cooldowns.skill.current = this.cooldowns.skill.max;
    }

    if (this.characterType === 'Striker') {
      audioManager.playFireball();
      setTimeout(() => {
        if (this.engine) {
          const fireballX = this.facing === 1 ? this.x + this.width : this.x - 40;
          const fb1 = new Fireball(fireballX, this.y + 10, this.facing, this);
          const fb2 = new Fireball(fireballX, this.y + 50, this.facing, this);
          fb1.damage = 25;
          fb2.damage = 25;
          this.engine.addEntity(fb1);
          this.engine.addEntity(fb2);
        }
        this.isUsingSkill = false;
      }, 200);

    } else if (this.characterType === 'Assassin') {
      import('./AudioManager').then(({ audioManager }) => audioManager.playDefend());
      
      const shieldBubble = {
        type: 'shieldBubble',
        x: this.x + (this.width / 2), // Center on player
        y: this.y + (this.height / 2),
        owner: this,
        timer: 3.0,
        spikeTimer: 0.5, // Emits spikes every 0.5s
        isActive: true,
        update: function(deltaTime) {
          this.timer -= deltaTime;
          this.spikeTimer -= deltaTime;
          if (this.timer <= 0) this.isActive = false;
          
          if (this.spikeTimer <= 0 && this.owner && this.owner.engine) {
            this.spikeTimer = 0.5;
            // Create two spikes shooting outwards
            const spike1 = {
              type: 'fireball', damage: 5, knockback: 300,
              x: this.x + 120, y: this.y, width: 20, height: 10, facing: 1,
              velocity: { x: 800, y: 0 }, owner: this.owner, isActive: true,
              update: function(dt) { this.x += this.velocity.x * dt; if(this.x > 1200) this.isActive=false; },
              draw: function(ctx) { ctx.fillStyle='cyan'; ctx.fillRect(this.x, this.y, this.width, this.height); }
            };
            const spike2 = {
              type: 'fireball', damage: 5, knockback: -300,
              x: this.x - 140, y: this.y, width: 20, height: 10, facing: -1,
              velocity: { x: -800, y: 0 }, owner: this.owner, isActive: true,
              update: function(dt) { this.x += this.velocity.x * dt; if(this.x < -100) this.isActive=false; },
              draw: function(ctx) { ctx.fillStyle='cyan'; ctx.fillRect(this.x, this.y, this.width, this.height); }
            };
            this.owner.engine.addEntity(spike1);
            this.owner.engine.addEntity(spike2);
          }
        },
        draw: function(ctx) {
          ctx.fillStyle = 'rgba(0, 255, 255, 0.3)'; // Cyan translucent
          ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(this.x, this.y, 120, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          
          // Glow effect
          ctx.fillStyle = `rgba(0, 255, 255, ${0.1 + Math.random() * 0.1})`;
          ctx.beginPath();
          ctx.arc(this.x, this.y, 125 + Math.random() * 5, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      
      if (this.engine) {
        this.engine.addEntity(shieldBubble);
      }
      
      setTimeout(() => {
        this.isUsingSkill = false;
      }, 200);
    } else if (this.characterType === 'Ninja') {
      import('./AudioManager').then(({ audioManager }) => audioManager.playDash());
      
      let opponent = null;
      for (let i = 0; i < this.engine.entities.length; i++) {
        const e = this.engine.entities[i];
        if (e.health !== undefined && e !== this) {
          opponent = e;
          break;
        }
      }
      
      if (opponent) {
        // Teleport above opponent
        this.x = opponent.x;
        this.y = opponent.y - 400; // High in the air
        
        // Keep within bounds
        if (this.x < 50) this.x = 50;
        if (this.x > 974) this.x = 974;
        
        // Face opponent
        this.facing = opponent.facing * -1; // Face them
        
        // Smash down!
        this.isGrounded = false;
        this.isAttacking = true;
        this.attackType = 'ninjaSmash';
        this.velocity.x = 0;
        this.velocity.y = 1500; // Dive straight down
      }
    } else if (this.characterType === 'Tank') {
      import('./AudioManager').then(({ audioManager }) => audioManager.playSkill());
      const shockwave = {
        type: 'shockwave',
        x: this.x + (this.facing === 1 ? 50 : -50),
        y: 526 - 15, // Floor Y is canvas height (576) - 50 = 526. So 526 - 15 = 511.
        width: 50,
        height: 30,
        velocity: { x: this.facing * 600, y: 0 },
        owner: this,
        facing: this.facing,
        isActive: true,
        update: function(deltaTime) {
          this.x += this.velocity.x * deltaTime;
          if (this.x < -100 || this.x > 1200) this.isActive = false;
        },
        draw: function(ctx) {
          ctx.fillStyle = '#8c7ae6'; // Purple color for shockwave
          ctx.beginPath();
          ctx.rect(this.x - 25, this.y - 15, 50, 30);
          ctx.fill();
        }
      };
      this.engine.addEntity(shockwave);
      setTimeout(() => { this.isUsingSkill = false; }, 300);
    } else if (this.characterType === 'Brawler') {
      import('./AudioManager').then(({ audioManager }) => audioManager.playDash());
      // Dash Punch
      const dashDist = 300;
      this.x = Math.max(50, Math.min(this.x + this.facing * dashDist, 974));
      // Create a brief stationary hitbox at the destination
      const dashPunch = {
        type: 'dashPunchHitbox',
        x: this.x + (this.facing === 1 ? 50 : -50),
        y: this.y,
        width: 60,
        height: 60,
        owner: this,
        facing: this.facing,
        isActive: true,
        damage: 25,
        knockback: this.facing === 1 ? 600 : -600,
        update: function(deltaTime) {
          // Stationary
          this.isActive = false; // Only lasts 1 frame practically, or handled by collision
        },
        draw: function(ctx) {
          ctx.fillStyle = '#ff4757';
          ctx.beginPath();
          ctx.arc(this.x, this.y, 40, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      this.engine.addEntity(dashPunch);
      setTimeout(() => { this.isUsingSkill = false; }, 300);
    } else if (this.characterType === 'Sniper') {
      if (!this.platformEntity || !this.platformEntity.isActive) {
        import('./AudioManager').then(({ audioManager }) => audioManager.playDefend());
        const platform = {
          type: 'platform',
          x: this.x - 20,
          y: this.y + this.height,
          width: 90,
          height: 20,
          owner: this,
          isActive: true,
          timer: 5.0,
          shotsFired: 0,
          update: function(deltaTime, canvasWidth, floorY) {
            this.timer -= deltaTime;
            const targetY = floorY - 200;
            if (this.y > targetY) {
              this.y -= 300 * deltaTime;
            } else {
              this.y = targetY;
            }
            if (this.timer <= 0 || this.shotsFired >= 2) {
              this.isActive = false;
            }
          },
          draw: function(ctx) {
            ctx.fillStyle = '#2d3436';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.strokeStyle = '#00cec9';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
          }
        };
        if (this.engine) {
          this.engine.addEntity(platform);
          this.platformEntity = platform;
        }
        setTimeout(() => { this.isUsingSkill = false; }, 200);
      } else {
        import('./AudioManager').then(({ audioManager }) => audioManager.playFireball());
        // Fast straight projectile
        const bullet = {
          type: 'fireball',
          x: this.facing === 1 ? this.x + this.width : this.x - 40,
          y: this.y + 10,
          width: 15,
          height: 5,
          velocity: { x: this.facing * 1500, y: 0 },
          owner: this,
          facing: this.facing,
          isActive: true,
          damage: 5,
          knockback: this.facing * 800,
          update: function(deltaTime) {
            this.x += this.velocity.x * deltaTime;
            this.y += this.velocity.y * deltaTime;
            
            let opponent = null;
            if (this.owner && this.owner.engine) {
              for (let i = 0; i < this.owner.engine.entities.length; i++) {
                const e = this.owner.engine.entities[i];
                if (e.health !== undefined && e !== this.owner && !e.isClone) {
                  opponent = e; break;
                }
              }
            }
            if (opponent) {
              // Curving Homing (Steering) for Sniper Bullet
              const dx = opponent.x + (opponent.width/2) - this.x;
              const dy = opponent.y + (opponent.height/2) - this.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              if (dist > 0) {
                const speed = 1500; // Max bullet speed
                const desiredX = (dx / dist) * speed;
                const desiredY = (dy / dist) * speed;
                
                // Steer towards target to create a curved trajectory
                const turnSpeed = 6.0; // Higher = tighter curve
                this.velocity.x += (desiredX - this.velocity.x) * turnSpeed * deltaTime;
                this.velocity.y += (desiredY - this.velocity.y) * turnSpeed * deltaTime;
              }
            }
            if (this.x < -100 || this.x > 1200) this.isActive = false;
          },
          draw: function(ctx) {
            ctx.fillStyle = '#f1c40f';
            ctx.fillRect(this.x - 15, this.y - 2, 30, 4);
          }
        };
        this.engine.addEntity(bullet);
        this.platformEntity.shotsFired++;
        setTimeout(() => { this.isUsingSkill = false; }, 200);
      }
    } else if (this.characterType === 'Mage') {
      import('./AudioManager').then(({ audioManager }) => audioManager.playFireball());
      // Homing missile
      const spreadY = [-40, 0, 40];
      for (let j = 0; j < 3; j++) {
        const missile = {
          type: 'fireball',
          x: this.facing === 1 ? this.x + this.width : this.x - 40,
          y: this.y - 20 + spreadY[j],
          width: 20,
          height: 20,
          velocity: { x: this.facing * 400, y: -100 + (j * 50) },
          owner: this,
          facing: this.facing,
          isActive: true,
          damage: 5,
          knockback: this.facing * 1000, // Slightly reduced knockback per hit to allow comboing
          speed: 600 + j * 50, // Slightly stagger the speed so they don't perfectly overlap
          update: function(deltaTime) {
            this.x += this.velocity.x * deltaTime;
            this.y += this.velocity.y * deltaTime;
            
            let opponent = null;
            if (this.owner && this.owner.engine) {
              for (let i = 0; i < this.owner.engine.entities.length; i++) {
                const e = this.owner.engine.entities[i];
                if (e.health !== undefined && e !== this.owner && !e.isClone) {
                  opponent = e; break;
                }
              }
            }
            
            if (opponent) {
              // Perfect Homing
              const dx = opponent.x + (opponent.width/2) - this.x;
              const dy = opponent.y + (opponent.height/2) - this.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              if (dist > 0) {
                this.velocity.x = (dx / dist) * this.speed;
                this.velocity.y = (dy / dist) * this.speed;
              }
            }
          },
          draw: function(ctx) {
            ctx.fillStyle = '#a29bfe';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 10, 0, Math.PI * 2);
            ctx.fill();
          }
        };
        this.engine.addEntity(missile);
      }
      setTimeout(() => { this.isUsingSkill = false; }, 300);
    }

    if (this.characterType === 'Ninja') {
      this.isUsingSkill = false;
    }

    this.cooldowns.skill.current = this.cooldowns.skill.max;
    this.skillReady = false;
  }

  executeUltimate() {
    this.ultimateReady = false;
    this.blockCount = 0;
    this.isUsingSkill = true;

    if (this.characterType === 'Striker') {
       // Fireball Barrage
       let fireballsThrown = 0;
       
       let barrageInterval = setInterval(() => {
          if (!this.engine || this.engine.isGameOver) return clearInterval(barrageInterval);
          
          import('./AudioManager').then(({ audioManager }) => audioManager.playFireball());
          
          const fireballX = this.facing === 1 ? this.x + this.width : this.x - 40;
          const fireball = {
            type: 'fireball',
            x: fireballX,
            y: this.y + 20,
            width: 30, height: 30,
            velocity: { x: this.facing * 800, y: 0 },
            owner: this,
            facing: this.facing,
            isActive: true,
            isUltimate: true,
            damage: 5, // Lower damage for ultimate fireballs
            update: function(deltaTime) {
              this.x += this.velocity.x * deltaTime;
              if (this.x < -100 || this.x > 1200) this.isActive = false;
            },
            draw: function(ctx) {
              ctx.fillStyle = '#fffa65';
              ctx.beginPath();
              ctx.arc(this.x, this.y, 15, 0, Math.PI * 2);
              ctx.fill();
            }
          };
          this.engine.addEntity(fireball);
          
          fireballsThrown++;
          if (fireballsThrown >= 5) {
             clearInterval(barrageInterval);
             setTimeout(() => { this.isUsingSkill = false; }, 300);
          }
       }, 200); // 1 fireball every 200ms
    } 
    else if (this.characterType === 'Tank') {
       // Command Grab!
       let target = null;
       if (this.engine) target = this.engine.entities.find(e => e !== this && e.health !== undefined);
       
       // Check distance
       if (target && Math.abs(target.x - this.x) < 120) {
          // Grab successful!
          target.isStunned = true;
          target.stunTimer = 2.0; // Stunned during grab
          target.velocity.x = 0;
          target.velocity.y = 0;
          target.isBeingGrabbed = true;

          import('./AudioManager').then(({ audioManager }) => audioManager.playHeavyAttack());
          
          let ticks = 0;
          let grabInterval = setInterval(() => {
             if (!this.engine || this.engine.isGameOver) {
               if (target) target.isBeingGrabbed = false;
               return clearInterval(grabInterval);
             }
             
             ticks++;
             
             if (ticks <= 5) {
                target.y = this.y - (ticks * 20);
                target.x = this.x + (this.facing === 1 ? 50 : -50);
                target.velocity.y = 0;
             } 
             else if (ticks <= 8) {
                target.y = this.y - 100;
                target.velocity.y = 0;
             }
             else if (ticks === 9) {
                target.y = this.y; // Smash to floor
                
                if (this.engine.applyDamage) {
                   this.engine.applyDamage(this, target, 10, 0); 
                   if (this.engine.onUltimateHit) this.engine.onUltimateHit(this);
                } else {
                   target.health -= 10;
                }
                
                target.velocity.y = -400; // Bounce
                target.isBeingGrabbed = false;
                
                import('./AudioManager').then(({ audioManager }) => {
                  audioManager.playDiveKickImpact(); 
                });
             }
             else if (ticks > 12) {
                this.isUsingSkill = false;
                clearInterval(grabInterval);
             }
          }, 50);
       } else {
          // Whiff!
          import('./AudioManager').then(({ audioManager }) => audioManager.playDash());
          setTimeout(() => { this.isUsingSkill = false; }, 400);
       }
    }
    else if (this.characterType === 'Ninja') {
      import('./AudioManager').then(({ audioManager }) => audioManager.playDash());
      
      const clone = new this.constructor(
         this.x + (this.facing === 1 ? -100 : 100),
         this.y,
         '#9c88ff', // Solid purple color instead of rgba to avoid transparency bugs
         { left: 'clone_left', right: 'clone_right', up: 'clone_up', defend: 'clone_defend', attack: 'clone_attack', skill: 'clone_skill', ultimate: 'clone_ultimate' }, 
         this.facing,
         this.characterType,
         true, // isCPU
         this.level // level
      );
      clone.type = 'player';
      clone.health = this.health > 0 ? this.health : 100;
      clone.maxHealth = this.maxHealth || 100;
      clone.isClone = true;
      clone.owner = this;
      clone.lifeTimer = 0;
      clone.isActive = true; // explicitly set isActive to true!
      
      console.log("Ninja clone spawned!", clone);
      if (this.engine) this.engine.addEntity(clone);
      setTimeout(() => { this.isUsingSkill = false; }, 300);
    }
    else if (this.characterType === 'Assassin') {
      import('./AudioManager').then(({ audioManager }) => audioManager.playDefend());
      
      this.isSuperWallActive = true;
      
      const wallX = this.facing === 1 ? this.x + 100 : this.x - 100;
      const superWall = {
        type: 'superWall',
        x: wallX,
        y: 0, 
        width: 40,
        height: 600, 
        owner: this,
        isActive: true,
        lifeTimer: 0,
        update: function(deltaTime) {
          this.lifeTimer += deltaTime;
          if (this.lifeTimer > 8.0) {
             this.isActive = false;
             this.owner.isSuperWallActive = false;
          }
          
          if (this.owner.engine) {
             const target = this.owner.engine.entities.find(e => e !== this.owner && e.health !== undefined);
             if (target) {
                if (target.x + target.width > this.x && target.x < this.x + this.width) {
                   if (target.x + target.width / 2 < this.x + this.width / 2) {
                      target.x = this.x - target.width; 
                   } else {
                      target.x = this.x + this.width; 
                   }
                   
                   if (!this.damageCooldown) this.damageCooldown = 0;
                   if (this.damageCooldown <= 0) {
                       if (this.owner.engine.applyDamage) {
                          this.owner.engine.applyDamage(this.owner, target, 5, 0); 
                          if (this.owner.engine.onUltimateHit) this.owner.engine.onUltimateHit(this.owner);
                       } else {
                         target.health -= 5;
                      }
                      this.damageCooldown = 1.0; 
                   }
                }
             }
          }
          if (this.damageCooldown > 0) this.damageCooldown -= deltaTime;
        },
        draw: function(ctx) {
          const alpha = this.lifeTimer > 7.0 ? 8.0 - this.lifeTimer : 1.0;
          ctx.fillStyle = `rgba(0, 255, 255, ${0.4 * alpha})`;
          ctx.strokeStyle = `rgba(0, 255, 255, ${0.8 * alpha})`;
          ctx.lineWidth = 4;
          ctx.fillRect(this.x, 0, this.width, 600);
          ctx.strokeRect(this.x, 0, this.width, 600);
          ctx.beginPath();
          ctx.moveTo(this.x + 20, 0);
          ctx.lineTo(this.x + 20, 600);
          ctx.stroke();
        }
      };
      if (this.engine) this.engine.addEntity(superWall);
      setTimeout(() => { this.isUsingSkill = false; }, 300);
    } else if (this.characterType === 'Brawler') {
      import('./AudioManager').then(({ audioManager }) => audioManager.playDefend());
      this.isBerserk = true;
      this.berserkTimer = 8.0; // 8 seconds of berserk
      this.width = 60; // Get slightly bigger
      this.height = 110;
      setTimeout(() => { this.isUsingSkill = false; }, 300);
      // Homing Bullet Spawner (10 bullets, 20 damage each)
      const spawner = {
        type: 'homingBulletSpawner',
        x: 0, y: 0, width: 0, height: 0,
        owner: this,
        isActive: true,
        bulletsFired: 0,
        spawnTimer: 0,
        initialHealth: this.health,
        update: function(deltaTime) {
          try {
            // Cancel if key released, died, knocked down, stunned, or TOOK DAMAGE
            if (!this.owner.keys[this.owner.controls.ultimate] || this.owner.health <= 0 || this.owner.isKnockedDown || this.owner.isStunned || this.owner.health < this.initialHealth) {
              this.isActive = false;
              this.owner.isUsingSkill = false;
              return;
            }
            
            this.owner.velocity.x = 0;
            this.owner.isUsingSkill = true;
            
            this.spawnTimer -= deltaTime;
            if (this.spawnTimer <= 0) {
              this.spawnTimer = 0.1; // Spawn a bullet every 0.1s
              
              // Reuse the fireball type so GameEngine naturally handles collisions and damage!
              const bullet = {
                type: 'fireball',
                x: this.owner.x + (this.owner.width / 2) - 10,
                y: this.owner.y + 10,
                width: 20,
                height: 20,
                // Initial burst outwards in random directions
                velocity: { 
                  x: (Math.random() * 800 + 200) * this.owner.facing, 
                  y: Math.random() * -800 - 200 
                },
                owner: this.owner,
                facing: this.owner.facing,
                isActive: true,
                isUltimate: true,
                damage: 20, // 20 damage per bullet as requested
                knockback: 100 * this.owner.facing, // Small knockback
                update: function(dt, canvasW, floorY) {
                  // Find opponent
                  let opponent = null;
                  if (this.owner && this.owner.engine) {
                    for (let i = 0; i < this.owner.engine.entities.length; i++) {
                      const e = this.owner.engine.entities[i];
                      if (e.type === 'player' && e.health !== undefined && e !== this.owner && !e.isClone) {
                        opponent = e; break;
                      }
                    }
                  }
                  
                  if (opponent) {
                    // Steer towards opponent
                    const dx = (opponent.x + opponent.width/2) - (this.x + this.width/2);
                    const dy = (opponent.y + opponent.height/2) - (this.y + this.height/2);
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist > 0) {
                      const speed = 800; // Very fast homing
                      const targetVx = (dx / dist) * speed;
                      const targetVy = (dy / dist) * speed;
                      
                      // Interpolate velocity for smooth curving
                      this.velocity.x += (targetVx - this.velocity.x) * dt * 4;
                      this.velocity.y += (targetVy - this.velocity.y) * dt * 4;
                    }
                  }
                  
                  this.x += this.velocity.x * dt;
                  this.y += this.velocity.y * dt;
                  
                  // Destroy if it hits floor or goes way out of bounds
                  if (this.y > floorY + 50) this.isActive = false;
                  if (this.x < -1000 || this.x > canvasW + 1000) this.isActive = false;
                },
                draw: function(ctx) {
                  const glow = 0.8 + Math.random() * 0.2;
                  
                  // Draw homing bullet (glowing purple/blue sphere)
                  ctx.fillStyle = `rgba(155, 89, 182, ${glow})`; // Purple
                  ctx.beginPath();
                  ctx.arc(this.x + this.width/2, this.y + this.height/2, this.width/2, 0, Math.PI * 2);
                  ctx.fill();
                  
                  ctx.shadowColor = '#8e44ad';
                  ctx.shadowBlur = 15;
                  ctx.fill();
                  ctx.shadowBlur = 0;
                  
                  // Draw core
                  ctx.fillStyle = `rgba(255, 255, 255, ${glow})`;
                  ctx.beginPath();
                  ctx.arc(this.x + this.width/2, this.y + this.height/2, this.width/4, 0, Math.PI * 2);
                  ctx.fill();
                }
              };
              if (this.owner.engine) this.owner.engine.addEntity(bullet);
              
              // Play sound
              import('./AudioManager').then(({ audioManager }) => audioManager.playLightAttack());
              
              this.bulletsFired++;
              if (this.bulletsFired >= 10) {
                // Done firing 10 bullets
                this.isActive = false;
                this.owner.isUsingSkill = false;
              }
            }
          } catch (err) {
            this.isActive = false;
            if (this.owner) this.owner.isUsingSkill = false;
          }
        },
        draw: function(ctx) {
          // Invisible spawner
        }
      };
      if (this.engine) this.engine.addEntity(spawner);
    } else if (this.characterType === 'Mage') {
      import('./AudioManager').then(({ audioManager }) => audioManager.playFireball());
      // Meteor Storm
      let meteors = 0;
      let stormInterval = setInterval(() => {
        if (!this.engine || this.engine.isGameOver || meteors >= 10) return clearInterval(stormInterval);
        meteors++;
        const meteor = {
          type: 'fireball',
          x: Math.random() * 1024,
          y: -50,
          width: 40, height: 40,
          velocity: { x: (Math.random() - 0.5) * 200, y: 600 },
          owner: this,
          facing: 1,
          isActive: true,
          damage: 5,
          update: function(deltaTime) {
            this.x += this.velocity.x * deltaTime;
            this.y += this.velocity.y * deltaTime;
            if (this.y > 600) this.isActive = false;
            
            let opponent = null;
            if (this.owner && this.owner.engine) {
              for (let i = 0; i < this.owner.engine.entities.length; i++) {
                const e = this.owner.engine.entities[i];
                if (e.health !== undefined && e !== this.owner) {
                  opponent = e; break;
                }
              }
            }
            if (opponent && this.isActive && this.x < opponent.x + opponent.width && this.x + this.width > opponent.x && this.y < opponent.y + opponent.height && this.y + this.height > opponent.y) {
              this.isActive = false;
              if (this.owner.engine.applyDamage) this.owner.engine.applyDamage(this.owner, opponent, this.damage, 0);
              if (this.owner.engine.onUltimateHit) this.owner.engine.onUltimateHit(this.owner);
            }
          },
          draw: function(ctx) {
            ctx.fillStyle = '#ff7675';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 20, 0, Math.PI * 2);
            ctx.fill();
          }
        };
        this.engine.addEntity(meteor);
      }, 200);
      setTimeout(() => { this.isUsingSkill = false; }, 500);
    }
  }

  handleNetworkInput(key, isDown) {
    if (this.engine && (this.engine.isGameOver || this.engine.isRoundStarting)) return;

    // Only the Host will call this, applying Guest's input to the P2 character
    if (isDown) {
      this.keys[key] = true;
      if (key === this.controls.attack && !this.isAttacking && !this.attackCooldown && !this.isDefending && !this.isUsingSkill && !this.isChargingAttack && !this.isDiveKicking) {
        if (this.keys[this.controls.up]) {
          if (this.diveKickReady) this.executeDiveKick();
        } else {
          this.isChargingAttack = true;
          this.chargeTimer = 0;
        }
      }
      
      if ((key === this.controls.skill || key === this.controls.up) && !this.isDefending && !this.isDiveKicking && !this.isStunned) {
        if (this.keys[this.controls.skill] && this.keys[this.controls.up] && this.cooldowns.pursuit.current <= 0) {
          let opponent = null;
          if (this.engine) opponent = this.engine.entities.find(e => e !== this && e.health !== undefined);
          
          const isOpponentHighAirborne = opponent && (!opponent.isGrounded && opponent.y < 400 || opponent.isDiveKicking);
          if (isOpponentHighAirborne) {
            if (this.isUsingSkill) {
              this.isUsingSkill = false; // cancel normal skill
            }
            this.executeAirPursuit(opponent);
          } else if (key === this.controls.skill && this.skillReady && !this.isUsingSkill) {
            this.executeSkill();
          }
        } else if (key === this.controls.skill && this.skillReady && !this.isUsingSkill) {
          this.executeSkill();
        }
      }
      if (key === this.controls.ultimate && this.ultimateReady && !this.isDefending && !this.isUsingSkill && !this.isDiveKicking && !this.isStunned) {
        this.executeUltimate();
      }
    } else {
      this.keys[key] = false;
      if (key === this.controls.attack && this.isChargingAttack) {
        this.releaseAttack();
      }
    }
  }

  executeDiveKick() {
    this.isDiveKicking = true;
    this.diveKickState = 1; // Launch
    this.isGrounded = false;
    this.diveKickReady = false;
    this.velocity.y = -1000;
    this.velocity.x = 0;
    audioManager.playDiveKickLaunch();
    this.attackType = 'divekick';
    
    // Attack box for divekick is larger and below the player
    this.attackBox = {
      x: 0,
      y: 0,
      width: 80,
      height: 80,
      offsetX: 0,
      offsetY: 60
    };

    setTimeout(() => {
      if (!this.isDiveKicking) return; // Interrupted by getting hit
      this.diveKickState = 2; // Hover
      this.velocity.y = 0;
      this.velocity.x = 0;
      
      setTimeout(() => {
        if (!this.isDiveKicking) return; // Interrupted
        this.diveKickState = 3; // Dive
        
        let dx = 800;
        let dy = 1200;
        if (this.characterType === 'Assassin') {
          dx = 1200;
          dy = 1600;
        }
        
        this.velocity.y = dy;
        this.velocity.x = this.facing * dx;
        this.isAttacking = true; // Activate hitbox
      }, 200);
    }, 300); // 300ms to reach peak
  }

  endDiveKick() {
    this.isDiveKicking = false;
    this.isAttacking = false;
    this.diveKickState = 0;
    this.cooldowns.diveKick.current = this.cooldowns.diveKick.max;
    this.cooldowns.diveKick.current = this.cooldowns.diveKick.max;
    this.diveKickReady = false;
  }

  executeAirPursuit(opponent) {
    this.isPursuing = true;
    this.cooldowns.pursuit.current = this.cooldowns.pursuit.max;
    this.isGrounded = false;
    this.isAttacking = true;
    this.attackType = 'pursuit';
    
    // Calculate homing velocity
    const dx = opponent.x - this.x;
    const dy = opponent.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    const pursuitSpeed = 3000;
    this.velocity.x = (dx / dist) * pursuitSpeed;
    this.velocity.y = (dy / dist) * pursuitSpeed;
    
    // Stop pursuing if missed after 300ms
    setTimeout(() => {
      if (this.isPursuing) {
        this.isPursuing = false;
        this.isAttacking = false;
        this.velocity.x = 0;
        this.velocity.y = 0;
      }
    }, 300);
    
    import('./AudioManager').then(({ audioManager }) => audioManager.playDash());
  }

  updateAI(entities, deltaTime) {
    if (!this.isCPU) return;

    for (let k in this.controls) {
      this.keys[this.controls[k]] = false;
    }

    let opponent = null;
    let minDist = Infinity;
    for (const e of entities) {
      const isFriendly = (e === this.owner) || (this.owner && e.owner === this.owner) || (e.owner === this);
      if (e !== this && e.health !== undefined && e.health > 0 && !isFriendly) {
        const d = Math.abs(e.x - this.x);
        if (d < minDist) {
          minDist = d;
          opponent = e;
        }
      }
    }

    if (!opponent) return;

    this.aiState.reactionDelay -= deltaTime;
    if (this.aiState.reactionDelay > 0) return;

    const distX = opponent.x - this.x;
    const absDistX = Math.abs(distX);
    
    // Skill Priority
    if (this.skillReady && !this.isUsingSkill) {
      if (this.characterType === 'Striker' && absDistX > 300 && Math.random() < 0.005) {
        this.executeSkill();
        this.aiState.reactionDelay = 1.5;
        return;
      }
      if (this.characterType === 'Assassin' && absDistX > 150 && absDistX < 400 && Math.random() < 0.005) {
        this.facing = distX > 0 ? 1 : -1;
        this.executeSkill();
        this.aiState.reactionDelay = 1.5;
        return;
      }
    }

    // Melee Attack Priority
    if (absDistX < 70 && !this.attackCooldown && !this.isDiveKicking && !this.isChargingAttack) {
      this.facing = distX > 0 ? 1 : -1;
      
      if (Math.random() < 0.05) {
        // CPU decides to attack
        const isHeavy = Math.random() > 0.5;
        this.isChargingAttack = true;
        this.chargeTimer = 0;
        this.aiState.reactionDelay = isHeavy ? 0.5 : 0.1; 
        
        setTimeout(() => {
           if (this.engine && !this.engine.isGameOver && this.isChargingAttack) {
             this.chargeTimer = isHeavy ? 0.4 : 0;
             this.releaseAttack();
           }
        }, isHeavy ? 400 : 100);
      } else {
        if (Math.random() < 0.1) {
          this.keys[distX > 0 ? this.controls.left : this.controls.right] = true;
          this.aiState.reactionDelay = 0.5;
        }
      }
      return;
    }

    // Dive Kick Priority (when far)
    if (absDistX > 200 && absDistX < 400 && !this.attackCooldown && !this.isDiveKicking && this.diveKickReady) {
      if (Math.random() < 0.02) {
        this.facing = distX > 0 ? 1 : -1;
        this.executeDiveKick();
        this.aiState.reactionDelay = 2.0;
        return;
      }
    }

    // Movement Priority
    if (absDistX >= 70) {
      if (Math.random() < 0.3) {
        if (distX > 0) {
          this.keys[this.controls.right] = true;
        } else {
          this.keys[this.controls.left] = true;
        }
      }
    }
  }

  startPortalAnimation(callback) {
    this.isEnteringPortal = true;
    this.portalEnterProgress = 0;
    this.portalCallback = callback;
  }

  update(deltaTime, canvasWidth, floorY) {
    if (this.comboTimer > 0) {
      this.comboTimer -= deltaTime;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }
    
    // Safety check: clear emote if attacking, defending, stunned, reading, etc.
    if (this.isAttacking || this.isChargingAttack || this.isDefending || this.isStunned || this.isKnockedDown || this.isPursuing || this.isReadingQuest || !this.isGrounded) {
      this.currentEmote = null;
    }
    if (this.isEnteringPortal) {
      this.portalEnterProgress += deltaTime * 2; // 0.5s duration
      if (this.portalEnterProgress >= 1) {
        this.isEnteringPortal = false;
        this.portalEnterProgress = 0;
        if (this.portalCallback) {
          this.portalCallback();
          this.portalCallback = null;
        }
      }
      return; // Skip normal update
    }

    if (this.isDead || this.health <= 0) return;

    if (this.isBerserk) {
      this.berserkTimer -= deltaTime;
      if (this.berserkTimer <= 0) {
        this.isBerserk = false;
        this.width = 50;
        this.height = 100;
      }
    }

    if (this.isClone) {
      this.lifeTimer = (this.lifeTimer || 0) + deltaTime;
      if (this.lifeTimer > 10.0 || this.health <= 0) {
        this.health = -1; // Mark dead so it gets filtered
        this.isActive = false;
        return; // skip normal update entirely if dead
      }
    }

    this.animationTimer += deltaTime;

    // Handle Stun State
    if (this.isStunned) {
      this.stunTimer -= deltaTime;
      this.velocity.x = 0;
      this.isDefending = false;
      this.isCounterStance = false;
      this.isChargingAttack = false;
      this.isAttacking = false;
      if (this.stunTimer <= 0) {
        this.isStunned = false;
      }
    }
    
    // Handle Knocked Down State
    if (this.isKnockedDown) {
      this.knockedDownTimer -= deltaTime;
      this.velocity.x = 0;
      this.isDefending = false;
      this.isCounterStance = false;
      this.isChargingAttack = false;
      this.isAttacking = false;
      if (this.knockedDownTimer <= 0) {
        this.isKnockedDown = false;
      }
    }

    let isSkillActive = this.isUsingSkill;
    if (this.engine) {
      isSkillActive = isSkillActive || this.engine.entities.some(e => 
        e.owner === this && (e.type === 'shieldBubble' || e.type === 'fireball' || e.type === 'shockwave')
      );
    }

    // Cooldown Timers Update
    if (this.cooldowns.skill.current > 0 && !isSkillActive) {
      this.cooldowns.skill.current -= deltaTime;
      this.skillReady = this.cooldowns.skill.current <= 0;
    }
    if (this.cooldowns.diveKick.current > 0) {
      this.cooldowns.diveKick.current -= deltaTime;
      this.diveKickReady = this.cooldowns.diveKick.current <= 0;
    }
    if (this.cooldowns.counter.current > 0) {
      this.cooldowns.counter.current -= deltaTime;
      this.counterCooldown = this.cooldowns.counter.current > 0;
    }
    if (this.cooldowns.pursuit.current > 0) {
      this.cooldowns.pursuit.current -= deltaTime;
    }
    if (this.cooldowns.defense.current > 0) {
      this.cooldowns.defense.current -= deltaTime;
    }
    if (this.cooldowns.sweep.current > 0) {
      this.cooldowns.sweep.current -= deltaTime;
    }

    if (this.isPursuing) {
      this.isDefending = false;
      this.isChargingAttack = false;
    } else {
      const wantsToDefend = !this.isStunned && !this.isKnockedDown && this.keys[this.controls.defend] && this.isGrounded && !this.isAttacking && !this.isUsingSkill && !this.isChargingAttack && !this.isDiveKicking && !this.isCounterAttacking;
      if (wantsToDefend) {
        if (this.cooldowns.defense.current <= 0) {
          if (!this.isDefending) {
            this.defenseStartTime = Date.now();
          }
          this.isDefending = true;
          this.defenseDurationTimer += deltaTime;
          if (this.defenseDurationTimer >= 5.0) {
            // Block broken because of max duration
            this.isDefending = false;
            this.cooldowns.defense.current = this.cooldowns.defense.max;
            this.defenseDurationTimer = 0;
          }
        } else {
          this.isDefending = false;
          this.defenseDurationTimer = 0;
        }
      } else {
        if (this.defenseDurationTimer > 0) {
          // Released defend button! Trigger cooldown.
          this.cooldowns.defense.current = this.cooldowns.defense.max;
        }
        this.isDefending = false;
        this.defenseDurationTimer = 0;
      }
    }
    
    const backKey = this.facing === 1 ? this.controls.left : this.controls.right;
    const tryingToCounter = this.isDefending && this.keys[backKey] && !this.counterCooldown;
    
    if (tryingToCounter) {
      this.isCounterStance = true;
      this.counterStanceTimer += deltaTime;
      if (this.counterStanceTimer > 5.0) {
        // Exceeded 5 seconds! Force cooldown.
        this.cooldowns.counter.current = this.cooldowns.counter.max;
        this.counterCooldown = true;
        this.isCounterStance = false;
      }
    } else {
      this.isCounterStance = false;
      this.counterStanceTimer = 0;
    }

    if (this.isChargingAttack) {
      this.chargeTimer += deltaTime;
      // Auto-release if held for more than 1.5 seconds
      if (this.chargeTimer > 1.5) {
        this.releaseAttack();
      }
    }

    // Auto-Aim: Always face the opponent
    if (this.engine && !this.isStunned) {
      const opponent = this.engine.entities.find(e => e !== this && e.health !== undefined);
      if (opponent) {
        this.facing = opponent.x > this.x ? 1 : -1;
      }
    }

    if (this.isReadingQuest) {
      this.velocity.x = 0;
    } else if (!this.isDefending && !this.isUsingSkill && !this.isChargingAttack && !this.isDiveKicking && !this.isStunned && !this.isKnockedDown && !this.isPursuing && !this.isAttacking && !this.isCounterAttacking) {
      
      let isMoving = false;
      let currentSpeed = this.speed;
      if (!this.engine && this.keys['shift']) {
        currentSpeed *= 2; // Speed up in lobby
      }

      // Hopping Movement
      if (this.keys[this.controls.left]) {
        this.velocity.x = -currentSpeed;
        isMoving = true;
        if (!this.engine) this.facing = -1;
      } else if (this.keys[this.controls.right]) {
        this.velocity.x = currentSpeed;
        isMoving = true;
        if (!this.engine) this.facing = 1;
      } else {
        // Friction on ground
        if (this.isGrounded) {
          this.velocity.x = 0;
        }
      }

      // Large Jump (Battle only)
      if (this.engine && this.keys[this.controls.up] && (this.isGrounded || this.isWalkHopping)) {
        this.velocity.y = this.jumpForce;
        this.isGrounded = false;
        this.isWalkHopping = false;
      }

      if (isMoving || !this.isGrounded) {
        this.currentEmote = null;
      }

      // If moving on the ground (and not doing a large jump), trigger a small hop (Taekwondo style fast footwork - Battle only)
      if (this.engine && isMoving && this.isGrounded && !this.keys[this.controls.up]) {
        this.velocity.y = -100; // Small hop
        this.isGrounded = false;
        this.isWalkHopping = true;
      }
    } else if (this.isAttacking) {
      // Friction during attacks so dash punch slides smoothly
      if (this.isGrounded) {
        this.velocity.x *= 0.85;
        if (Math.abs(this.velocity.x) < 10) this.velocity.x = 0;
      } else {
        this.velocity.x *= 0.95;
      }
    } else if (this.isDefending || this.isChargingAttack) {
      if (this.isGrounded) this.velocity.x = 0;
    }

    // Apply gravity unless hover phase of dive kick or pursuing
    if (this.isDiveKicking && (this.diveKickState === 1 || this.diveKickState === 2)) {
      // No gravity during launch/hover
    } else if (this.isPursuing || this.isBeingGrabbed || this.isCounterAttacking) {
      // No gravity during pursuit dash, grab, or counter attack
    } else {
      this.velocity.y += this.gravity * deltaTime;
    }
    
    this.x += this.velocity.x * deltaTime;
    this.y += this.velocity.y * deltaTime;

    // Floor collision
    if (this.y + this.height >= floorY) {
      this.y = floorY - this.height;
      
      if (this.isKnockedDown && this.bounceCount > 0 && this.velocity.y > 0) {
        this.velocity.y = -250; // Bounce up
        this.bounceCount--;
        this.isGrounded = false;
      } else {
        this.velocity.y = 0;
        this.isGrounded = true;
        this.isWalkHopping = false;

        // Handle landing from dive kick
      if (this.isDiveKicking) {
        this.endDiveKick();
        this.velocity.x = 0;
      }
      if (this.isPursuing) {
        this.isPursuing = false;
        this.velocity.x = 0;
        
        // Ground slam AoE!
        this.attackType = 'pursuit';
        this.attackBox.width = 250;
        this.attackBox.height = 100;
        this.attackBox.offsetY = -50;
        this.isAttacking = true;
        
        setTimeout(() => {
          this.isAttacking = false;
          this.attackBox.width = 60;
          this.attackBox.height = 40;
          this.attackBox.offsetY = 0;
        }, 150);
        
        import('./AudioManager').then(({ audioManager }) => {
          if (audioManager.playDefend) audioManager.playDefend();
        });
      }
    }
  }

    if (this.x < 0) this.x = 0;
    if (this.x + this.width > canvasWidth) this.x = canvasWidth - this.width;
    
    // Ceiling check to prevent flying out of screen entirely
    if (this.y < -200) {
      this.y = -200;
      if (this.velocity.y < 0) this.velocity.y = 0;
      if (this.isPursuing) {
        this.isPursuing = false;
        this.isAttacking = false;
      }
    }

    this.attackBox.offsetX = this.facing === 1 ? this.width : -this.attackBox.width;
    if (this.attackBox.width === 250) {
      // If it's the AoE slam, center the attack box
      this.attackBox.offsetX = -125 + this.width / 2;
    }
    
    this.attackBox.x = this.x + this.attackBox.offsetX;
    this.attackBox.y = this.y + this.attackBox.offsetY;

    // Safety net: If we are grounded but somehow still in dive kick state, forcefully end it
    if (this.isGrounded && this.isDiveKicking) {
      this.endDiveKick();
    }
  }

  getEffectColor() {
    const skinId = this.skinId || 'default';
    switch (this.characterType) {
      case 'Striker':
        if (skinId === 'golden') return '#ffd32a';
        if (skinId === 'dark') return '#4a00e0';
        return '#ff4757'; // default red
      case 'Brawler':
        if (skinId === 'hulk') return '#2ed573';
        if (skinId === 'cyber') return '#1e90ff';
        return '#ffa502'; // default orange
      case 'Assassin':
        if (skinId === 'crimson') return '#ff4757';
        if (skinId === 'shadow') return '#2f3542';
        return '#2ed573'; // default green
      case 'Tank':
        if (skinId === 'obsidian') return '#8e44ad';
        if (skinId === 'magma') return '#ff6348';
        return '#747d8c'; // default grey
      case 'Ninja':
        if (skinId === 'ghost') return '#00d2d3';
        if (skinId === 'blood') return '#c23616';
        return '#5352ed'; // default blue
      case 'Sniper':
        if (skinId === 'specops') return '#10ac84';
        if (skinId === 'desert') return '#feca57';
        return '#eccc68'; // default yellow
      case 'Mage':
        if (skinId === 'archmage') return '#fbc531';
        if (skinId === 'darkmage') return '#273c75';
        return '#9c88ff'; // default purple
      default:
        return this.color;
    }
  }

  initAI() {
    if (this.comboCount > 1) {
      ctx.save();
      const scale = 1.0 + Math.max(0, (this.comboTimer - 1.8) * 2.5); // Pop effect
      ctx.translate(this.x + this.width / 2, this.y - 60);
      ctx.scale(scale, scale);
      
      ctx.font = '900 24px "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.comboCount >= 5 ? '#feca57' : '#ff4757'; // Gold for 5+, Red for normal
      ctx.shadowBlur = 15;
      ctx.shadowColor = ctx.fillStyle;
      ctx.fillText(`${this.comboCount} HITS!`, 0, 0);
      ctx.restore();
    }

    if (this.username) {
      ctx.save();
      ctx.font = 'bold 14px Inter, sans-serif';
      const textWidth = ctx.measureText(this.username).width;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(this.x + this.width / 2 - textWidth / 2 - 6, this.y - 28, textWidth + 12, 20);
      ctx.fillStyle = '#fbc531';
      ctx.textAlign = 'center';
      ctx.fillText(this.username, this.x + this.width / 2, this.y - 14);
      ctx.restore();
    }

    ctx.save();
    
    if (this.isKnockedDown) {
      const cx = this.x + this.width / 2;
      const cy = this.y + this.height; // pivot at feet
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 2 * -this.facing); // rotate 90 degrees to lie on back
      ctx.translate(-cx, -cy);
    }
    
    if (this.isEnteringPortal) {
      const scale = 1 - this.portalEnterProgress;
      ctx.translate(this.x + this.width / 2, this.y + this.height);
      ctx.scale(scale, scale);
      ctx.translate(-(this.x + this.width / 2), -(this.y + this.height));
      ctx.globalAlpha = scale;
      // Fade to black to simulate entering shadow (handled via strokeColor now)
    }

    if (this.isBerserk) {
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ff4757';
    }

    if (this.isCounterAttacking) {
      // Speed trail
      ctx.fillStyle = 'rgba(0, 168, 255, 0.4)';
      ctx.fillRect(this.x - (this.facing * 30), this.y, this.width, this.height);
      ctx.fillStyle = 'rgba(0, 168, 255, 0.2)';
      ctx.fillRect(this.x - (this.facing * 60), this.y, this.width, this.height);
    }

    let cx = this.x + this.width / 2;
    let cy = this.y + 25; // Base Head Center
    const f = this.facing;
    
    // Animation States
    const isWalking = this.velocity.x !== 0 && this.isGrounded && !this.isDefending;
    const isRunning = !this.engine && this.keys['shift'] && isWalking;
    const isIdle = this.velocity.x === 0 && this.isGrounded && !this.isDefending && !this.isAttacking && !this.isUsingSkill && !this.isChargingAttack;
    const isJumping = !this.isGrounded;

    // Bobbing and Bouncing offset
    let bob = 0;
    let swing = 0;
    let bounceX = 0;

    const bounceSpeed = isRunning ? 25 : 15; // Fast Taekwondo bounce

    if (isRunning) {
      bob = -Math.abs(Math.sin(this.animationTimer * bounceSpeed)) * 12; // Hop higher
      swing = Math.sin(this.animationTimer * bounceSpeed) * 1.5; // Swing wider
      bounceX = Math.cos(this.animationTimer * bounceSpeed) * 3 * f;
    } else if (isWalking) {
      bob = -Math.abs(Math.sin(this.animationTimer * bounceSpeed)) * 8; // Hop UP
      swing = Math.sin(this.animationTimer * bounceSpeed);
      bounceX = Math.cos(this.animationTimer * bounceSpeed) * 2 * f;
    } else if (isIdle) {
      if (this.engine) {
        bob = -Math.abs(Math.sin(this.animationTimer * bounceSpeed)) * 8; // Hop UP
        swing = Math.sin(this.animationTimer * bounceSpeed) * 0.2;
        bounceX = Math.cos(this.animationTimer * bounceSpeed) * 2 * f;
      }
    } else if (this.isDefending || this.isChargingAttack) {
      bob = 10; // Hunch down
    }

    cy += bob;
    cx += bounceX;

    // Joint Setup
    const headRadius = 15;
    let shoulderY = cy + headRadius + 2;
    let hipY = shoulderY + 30;
    
    if (this.currentEmote === 'sit') {
      cy += 30;
      shoulderY += 30;
      hipY += 30;
    }
    
    // Main Body Color (Darker for block/shadow)
    let strokeColor = this.isDefending ? '#7f8fa6' : this.color;
    if (this.isEnteringPortal) strokeColor = '#333';

    if (isRunning) {
      ctx.translate(cx, hipY);
      ctx.rotate(f * 0.25); // Lean forward
      ctx.translate(-cx, -hipY);
    }
    
    if (this.isStunned) {
      // Draw Stun Effect (Lightning / Mind Control)
      ctx.fillStyle = `rgba(255, 20, 147, ${0.5 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.arc(cx, cy - 20, 25, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- DRAW CHARGING AURA ---
    if (this.isChargingAttack) {
      const effectColor = this.getEffectColor();
      const chargeRatio = Math.min(this.chargeTimer / 0.3, 1);
      ctx.fillStyle = this.hexToRgba(effectColor, chargeRatio * 0.4);
      ctx.beginPath();
      ctx.arc(cx, cy + 15, 40 + Math.random() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // --- DRAW PARRY SHIELD ---
    if (this.isCounterStance) {
      const effectColor = this.getEffectColor();
      const timeRemaining = Math.max(0, 5.0 - this.counterStanceTimer);
      const intensity = timeRemaining > 1.0 ? 0.4 : (timeRemaining * 0.4); // Fade out at end
      ctx.fillStyle = this.hexToRgba(effectColor, intensity);
      ctx.fillRect(f === 1 ? this.x + 20 : this.x - 20, this.y - 10, 50, 120);
    }

    // --- DRAW BACK LIMBS (Behind Body) ---
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.darkenColor(strokeColor, 40); // Back limbs are darker

    // Back Leg
    ctx.beginPath();
    ctx.moveTo(cx, hipY);
    if (this.currentEmote === 'sit') {
      ctx.lineTo(cx + f * 15, hipY);
      ctx.lineTo(cx + f * 15, hipY + 25);
    } else if (this.isDiveKicking) {
      if (this.diveKickState === 1 || this.diveKickState === 2) {
        ctx.lineTo(cx - f * 10, hipY - 20); // Tucked
      } else {
        ctx.lineTo(cx - f * 20, hipY - 20); // Trailing behind
      }
    } else if (isWalking) {
      if (isRunning && swing < 0) {
        // Back leg swinging forward (knee bent)
        ctx.lineTo(cx - f * swing * 25, hipY + 15);
        ctx.lineTo(cx - f * swing * 15, hipY + 35);
      } else {
        ctx.lineTo(cx - f * swing * 20, hipY + 40); // Swing back
      }
    } else if (isJumping) {
      ctx.lineTo(cx - f * 10, hipY + 40); // Hang down
    } else {
      ctx.lineTo(cx - f * 15, hipY + 40); // Stand fighting stance back leg
    }
    ctx.stroke();

    // Back Arm
    ctx.beginPath();
    ctx.moveTo(cx, shoulderY);
    if (this.currentEmote === 'sit') {
      ctx.lineTo(cx, hipY);
    } else if (this.currentEmote === 'cheer') {
      ctx.lineTo(cx - f * 15, shoulderY - 30 + Math.sin(this.animationTimer * 20) * 10);
    } else if (this.currentEmote === 'taunt') {
      ctx.lineTo(cx - f * 20, hipY);
    } else if (this.isDiveKicking) {
      ctx.lineTo(cx - f * 20, shoulderY - 20);
    } else if (this.isReadingQuest) {
      ctx.lineTo(cx + f * 20, shoulderY + 10);
    } else if (this.isDefending) {
      ctx.lineTo(cx + f * 15, shoulderY - 10);
      ctx.lineTo(cx + f * 5, shoulderY - 20);
    } else if (this.isChargingAttack) {
      ctx.lineTo(cx - f * 20, shoulderY + 15); // Pull back arm to charge
    } else if (isWalking) {
      if (isRunning) {
        // Runner's bent arm (back arm swings with `swing`)
        ctx.lineTo(cx + f * swing * 12, shoulderY + 15); // Elbow
        ctx.lineTo(cx + f * swing * 25, shoulderY + (swing > 0 ? 0 : 20)); // Fist
      } else {
        ctx.lineTo(cx + f * swing * 20, shoulderY + 25);
      }
    } else if (isJumping) {
      ctx.lineTo(cx - f * 15, shoulderY - 15);
    } else if (this.isUsingSkill && this.characterType === 'Striker') {
      ctx.lineTo(cx - f * 15, shoulderY - 10); // Charging back
    } else {
      ctx.lineTo(cx + f * 10, shoulderY + 25);
    }
    ctx.stroke();

    // --- DRAW TORSO ---
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(cx, shoulderY);
    if (this.isDefending || this.isChargingAttack) {
      ctx.quadraticCurveTo(cx - f * 15, shoulderY + 15, cx, hipY); // Hunched back
    } else {
      ctx.lineTo(cx, hipY); // Straight back
    }
    ctx.stroke();

    // --- DRAW HEAD ---
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(cx + f * (this.isDefending || this.isChargingAttack ? -5 : 0), cy, headRadius, 0, Math.PI * 2);
    ctx.fill();

    // Character specific head details
    if (this.isDead || this.health <= 0) {
      // Draw a cross over dead characters' eyes
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + f * 10, cy - 5); ctx.lineTo(cx + f * 15, cy + 5);
      ctx.moveTo(cx + f * 15, cy - 5); ctx.lineTo(cx + f * 10, cy + 5);
      ctx.stroke();
    }

    if (this.isReadingQuest) {
      // Draw the paper being held
      ctx.fillStyle = '#f5f6fa';
      ctx.strokeStyle = '#2f3640';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const paperX = f === 1 ? cx + 15 : cx - 35;
      ctx.rect(paperX, shoulderY + 2, 20, 25);
      ctx.fill();
      ctx.stroke();
      
      // Some text lines on the paper
      ctx.strokeStyle = '#b2bec3';
      ctx.beginPath();
      ctx.moveTo(paperX + 3, shoulderY + 7); ctx.lineTo(paperX + 17, shoulderY + 7);
      ctx.moveTo(paperX + 3, shoulderY + 12); ctx.lineTo(paperX + 17, shoulderY + 12);
      ctx.moveTo(paperX + 3, shoulderY + 17); ctx.lineTo(paperX + 13, shoulderY + 17);
      ctx.stroke();
    }

    if (this.characterType === 'Assassin') {
      // Ninja Headband trails
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - f * headRadius, cy);
      ctx.lineTo(cx - f * (headRadius + 15) + (swing * 5), cy - 5 + bob);
      ctx.moveTo(cx - f * headRadius, cy);
      ctx.lineTo(cx - f * (headRadius + 20) + (swing * 5), cy + 5 + bob);
      ctx.stroke();
    } else if (this.characterType === 'Striker') {
      // Red/Blue Headband
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - headRadius, cy - 8, headRadius * 2, 6);
    }

    // --- DRAW FRONT LIMBS (Front of Body) ---
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 10;

    // Front Leg
    ctx.beginPath();
    ctx.moveTo(cx, hipY);
    if (this.currentEmote === 'sit') {
      ctx.lineTo(cx + f * 25, hipY - 5);
      ctx.lineTo(cx + f * 25, hipY + 25);
    } else if (this.isDiveKicking) {
      if (this.diveKickState === 1 || this.diveKickState === 2) {
        ctx.lineTo(cx + f * 20, hipY - 10); // Tucked high
      } else {
        // Diving! Leg fully extended forward and down
        ctx.lineTo(cx + f * 60, hipY + 50);
        ctx.stroke();
        // Add dive kick swoosh/glow
        ctx.fillStyle = 'rgba(255, 255, 100, 0.9)';
        ctx.beginPath();
        ctx.arc(cx + f * 60, hipY + 50, 15 + Math.random()*5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath(); // empty path to prevent breaking stroke below
      }
    } else if (isWalking) {
      if (isRunning && swing > 0) {
        // Front leg swinging forward (knee bent)
        ctx.lineTo(cx + f * swing * 25, hipY + 15);
        ctx.lineTo(cx + f * swing * 15, hipY + 35);
      } else {
        ctx.lineTo(cx + f * swing * 20, hipY + 40); // Swing forward
      }
    } else if (isJumping) {
      ctx.lineTo(cx + f * 15, hipY + 15); // Tucked up
      ctx.lineTo(cx + f * 5, hipY + 40);
    } else {
      ctx.lineTo(cx + f * 15, hipY + 40); // Stand fighting stance front leg
    }
    ctx.stroke();

    // Front Arm (The striking arm)
    ctx.beginPath();
    ctx.moveTo(cx, shoulderY);
    
    if (this.currentEmote === 'sit') {
      ctx.lineTo(cx + f * 15, hipY);
    } else if (this.currentEmote === 'cheer') {
      ctx.lineTo(cx + f * 15, shoulderY - 30 + Math.sin(this.animationTimer * 20 + Math.PI) * 10);
    } else if (this.currentEmote === 'taunt') {
      ctx.lineTo(cx + f * 15, hipY - 5);
    } else if (this.isReadingQuest) {
      ctx.lineTo(cx + f * 25, shoulderY + 15);
    } else if (this.isDiveKicking) {
      ctx.lineTo(cx - f * 10, shoulderY - 30); // Arms thrown back
    } else if (this.isAttacking) {
      // Punch Animation
      const effectColor = this.getEffectColor();
      const reach = (this.attackType === 'heavy' ? 50 : 40) * Math.sin(this.attackProgress * Math.PI);
      ctx.lineTo(cx + f * reach, shoulderY - 5);
      
      // Punch Swoosh Effect
      ctx.fillStyle = this.attackType === 'heavy' ? this.hexToRgba(effectColor, 0.9) : 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(cx + f * reach, shoulderY - 5, this.attackType === 'heavy' ? 12 : 8, 0, Math.PI * 2);
      ctx.fill();

    } else if (this.isChargingAttack) {
      // Pull fist way back
      ctx.lineTo(cx - f * 25, shoulderY + 5);
      ctx.lineTo(cx - f * 20, shoulderY - 10);
    } else if (this.isDefending) {
      ctx.lineTo(cx + f * 15, shoulderY + 5);
      ctx.lineTo(cx + f * 20, shoulderY - 15); // Guard up
    } else if (this.isUsingSkill && this.characterType === 'Striker') {
      ctx.lineTo(cx + f * 30, shoulderY - 10); // Hand outstretched casting fireball
      // Glow
      const effectColor = this.getEffectColor();
      ctx.fillStyle = this.hexToRgba(effectColor, 0.8);
      ctx.beginPath();
      ctx.arc(cx + f * 35, shoulderY - 10, 12 + Math.random() * 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (isWalking) {
      if (isRunning) {
        // Runner's bent arm (front arm swings with `-swing`)
        ctx.lineTo(cx - f * swing * 12, shoulderY + 15); // Elbow
        ctx.lineTo(cx - f * swing * 25, shoulderY + (swing < 0 ? 0 : 20)); // Fist
      } else {
        ctx.lineTo(cx - f * swing * 20, shoulderY + 25);
      }
    } else if (isJumping) {
      ctx.lineTo(cx + f * 15, shoulderY - 20); // Reach up
    } else {
      ctx.lineTo(cx - f * 5, shoulderY + 25); // Relaxed at side
    }
    ctx.stroke();
    
    this.drawAccessories(ctx, cx, cy, f);

    ctx.shadowBlur = 0; // Reset shadow for other drawing
    ctx.restore();
  }

  drawAccessories(ctx, cx, cy, f) {
    if (this.skinId === 'default' || !this.skinId) return;

    ctx.save();
    let headY = cy; // cy is Base Head Center
    let bob = 0;
    const isWalking = this.velocity.x !== 0 && this.isGrounded && !this.isDefending;
    if (isWalking) bob = Math.sin(Date.now() / 100) * 3;
    const isJumping = !this.isGrounded;
    if (isJumping) bob = -5;
    if (this.isDefending) bob = 5;
    
    headY += bob;
    
    if (this.characterType === 'Striker' && this.skinId === 'golden') {
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.moveTo(cx - 15, headY - 20);
      ctx.lineTo(cx - 10, headY - 35);
      ctx.lineTo(cx, headY - 20);
      ctx.lineTo(cx + 10, headY - 35);
      ctx.lineTo(cx + 15, headY - 20);
      ctx.fill();
    } else if (this.characterType === 'Striker' && this.skinId === 'dark') {
      ctx.fillStyle = '#ff4757';
      ctx.beginPath();
      ctx.arc(cx + f * 5, headY - 5, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.characterType === 'Assassin' && this.skinId === 'crimson') {
      ctx.strokeStyle = '#ff4757';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx - f * 10, headY + 10);
      ctx.quadraticCurveTo(cx - f * 30, headY + 5 + Math.sin(Date.now()/150)*10, cx - f * 40, headY + 20);
      ctx.stroke();
    } else if (this.characterType === 'Assassin' && this.skinId === 'shadow') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      for (let i=0; i<3; i++) {
        const px = cx + Math.cos(Date.now()/300 + i*2) * 20;
        const py = headY + Math.sin(Date.now()/300 + i*2) * 20;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI*2);
        ctx.fill();
      }
    } else if (this.characterType === 'Brawler' && this.skinId === 'hulk') {
      ctx.fillStyle = '#8e44ad';
      ctx.fillRect(cx - 15, headY + 30, 30, 20); 
    } else if (this.characterType === 'Brawler' && this.skinId === 'cyber') {
      ctx.fillStyle = '#1e90ff';
      ctx.fillRect(cx + f * 5, headY - 10, 15 * f, 6);
    } else if (this.characterType === 'Tank' && this.skinId === 'obsidian') {
      ctx.fillStyle = '#2f3640';
      ctx.beginPath();
      ctx.moveTo(cx - f * 15, headY + 20);
      ctx.lineTo(cx - f * 30, headY + 10);
      ctx.lineTo(cx - f * 15, headY + 40);
      ctx.fill();
    } else if (this.characterType === 'Tank' && this.skinId === 'magma') {
      ctx.fillStyle = '#ff6b81';
      ctx.shadowColor = '#ff4757';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(cx + f * 10, headY + 30, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (this.characterType === 'Ninja' && this.skinId === 'ghost') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(cx - f * 20, headY + 20 + Math.sin(Date.now()/200)*10, 5, 0, Math.PI*2);
      ctx.fill();
    } else if (this.characterType === 'Ninja' && this.skinId === 'blood') {
      ctx.strokeStyle = '#c23616';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - f * 10, headY + 10);
      ctx.lineTo(cx - f * 30, headY + 40);
      ctx.moveTo(cx - f * 15, headY + 10);
      ctx.lineTo(cx - f * 10, headY + 45);
      ctx.stroke();
    } else if (this.characterType === 'Sniper' && this.skinId === 'specops') {
      ctx.fillStyle = '#2ed573';
      ctx.beginPath();
      ctx.arc(cx + f * 10, headY - 5, 4, 0, Math.PI*2);
      ctx.arc(cx + f * 18, headY - 5, 4, 0, Math.PI*2);
      ctx.fill();
    } else if (this.characterType === 'Sniper' && this.skinId === 'desert') {
      ctx.fillStyle = '#d1ccc0';
      ctx.beginPath();
      ctx.arc(cx, headY - 10, 18, Math.PI, 0);
      ctx.fill();
    } else if (this.characterType === 'Mage' && this.skinId === 'archmage') {
      ctx.fillStyle = '#3742fa';
      ctx.beginPath();
      ctx.moveTo(cx - 20, headY - 15);
      ctx.lineTo(cx + 20, headY - 15); 
      ctx.lineTo(cx + 5, headY - 45); 
      ctx.lineTo(cx - 5, headY - 45);
      ctx.fill();
    } else if (this.characterType === 'Mage' && this.skinId === 'darkmage') {
      ctx.fillStyle = '#2f3542';
      ctx.shadowColor = '#57606f';
      ctx.shadowBlur = 10;
      const cy_orb = headY - 30 + Math.sin(Date.now()/200)*5;
      ctx.beginPath();
      ctx.moveTo(cx, cy_orb - 10);
      ctx.lineTo(cx + 8, cy_orb);
      ctx.lineTo(cx, cy_orb + 10);
      ctx.lineTo(cx - 8, cy_orb);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  executeCounterAttack(attacker, isPerfect = false) {
    if (this.counterCooldown) return;
    
    this.isCounterAttacking = true;
    this.isDefending = false;
    this.isCounterStance = false;
    this.counterOriginalX = this.x;
    
    // Start cooldown (5 seconds)
    this.cooldowns.counter.current = this.cooldowns.counter.max;
    this.counterCooldown = true;

    // Spawn PARRY! text effect
    const parryText = isPerfect ? 'PERFECT PARRY!' : 'PARRY!';
    const parryEffect = {
      x: this.x + (this.width / 2),
      y: this.y - 20,
      timer: 0,
      isActive: true,
      update: function(dt) {
        this.timer += dt;
        this.y -= 50 * dt;
        if (this.timer > 1.0) this.isActive = false;
      },
      draw: function(ctx) {
        const alpha = Math.max(0, 1 - this.timer);
        ctx.fillStyle = isPerfect ? `rgba(0, 210, 211, ${alpha})` : `rgba(0, 168, 255, ${alpha})`;
        ctx.font = '900 30px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(parryText, this.x, this.y);
      }
    };
    this.engine.addEntity(parryEffect);

    import('./AudioManager').then(({ audioManager }) => {
      audioManager.playDash(); 
    });

    // Make player invulnerable during counter attack (handled in GameEngine)
    this.velocity.x = 0;
    this.velocity.y = 0;

    // Dash to attacker
    const target = attacker.owner || attacker;
    const dashTargetX = target.x + (this.facing === 1 ? -60 : 60);
    this.x = Math.max(50, Math.min(dashTargetX, 974)); 
    
    // Perform Multi-hit (3 fast hits)
    let hits = 0;
    let hitInterval = setInterval(() => {
      if (!this.engine || this.engine.isGameOver) return clearInterval(hitInterval);
      
      const hitBox = {
        type: 'combo2', // Uses combo2 attack type in engine for small knockback
        x: this.x,
        y: this.y,
        attackBox: {
          x: this.x, y: this.y,
          width: this.width + 80, height: this.height,
          offsetX: 0, offsetY: 0
        },
        facing: this.facing,
        owner: this,
        isActive: true,
        isAttacking: true,
        damage: isPerfect ? 25 : 15,
        attackType: hits === 2 ? 'combo3' : 'combo2', // 3rd hit deals heavy knockback
        update: function() { this.isActive = false; }, // destroy next frame
        draw: function(ctx) {
          ctx.fillStyle = isPerfect ? 'rgba(0, 210, 211, 0.8)' : 'rgba(255, 255, 255, 0.8)';
          ctx.beginPath();
          ctx.arc(this.x + (this.facing === 1 ? 50 : 0), this.y + 50, 40, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      this.engine.addEntity(hitBox);
      
      import('./AudioManager').then(({ audioManager }) => {
        if (hits === 2) audioManager.playHeavyAttack();
        else audioManager.playLightAttack();
      });

      hits++;
      if (hits >= 3) {
        clearInterval(hitInterval);
        // Dash back
        setTimeout(() => {
          this.x = this.counterOriginalX;
          this.velocity.x = 0;
          this.velocity.y = 0;
          this.isCounterAttacking = false;
        }, 150);
      }
    }, 150);
  }

  hexToRgba(hex, alpha) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.substring(1, 3), 16);
      g = parseInt(hex.substring(3, 5), 16);
      b = parseInt(hex.substring(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Helper function to darken a hex color string
  darkenColor(hex, percent) {
    if (hex.startsWith('#')) hex = hex.slice(1);
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    let num = parseInt(hex, 16);
    let r = (num >> 16) - Math.round(255 * (percent / 100));
    let g = ((num >> 8) & 0x00FF) - Math.round(255 * (percent / 100));
    let b = (num & 0x0000FF) - Math.round(255 * (percent / 100));
    r = Math.max(Math.min(255, r), 0);
    g = Math.max(Math.min(255, g), 0);
    b = Math.max(Math.min(255, b), 0);
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
  }
}
