import { Fireball } from './Fireball.js';
import { audioManager } from './AudioManager.js';

export class Player {
  constructor(x, y, color, controls, facing, characterType, isCPU = false, level = 1, equipment = { defense: 0, attack: 0, maxHp: 0 }, skinId = 'default', trophies = 0) {
    this.x = x;
    this.y = y;
    this.z = 0; // Added for 3D Lobby
    this.width = 50;
    this.height = 100;
    this.color = color;
    this.skinId = skinId;
    this.trophies = trophies;
    
    this.useImageSprite = false;
    this.spriteImage = new Image();
    this.spriteImage.src = this.getSpriteUrl();
    
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
    this.comboResetTimeout = null;

    this.isDiveKicking = false;
    this.diveKickState = 0; // 0=none, 1=launch, 2=hover, 3=dive
    this.diveKickReady = true;

    this.isCounterStance = false;
    this.isCounterAttacking = false;
    this.counterCooldown = false;
    this.counterOriginalX = 0;
    this.counterStanceTimer = 0;
    this.isBursting = false;
    
    this.chatMessage = null;
    this.chatTimer = 0;
    this.isActive = true;
    this.burstTimer = 0;

    // Cooldown Timers
    this.cooldowns = {
      skill: { current: 0, max: 10.0 },
      diveKick: { current: 0, max: 1.5 },
      counter: { current: 0, max: 5.0 },
      pursuit: { current: 0, max: 5.0 },
      intercept: { current: 0, max: 5.0 },
      ultimate: { current: 0, max: 15.0 },
      defense: { current: 0, max: 5.0 },
      sweep: { current: 0, max: 7.0 },
      burst: { current: 0, max: 45.0 }
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

    // 2000-trophy skill visual states
    this.floatingOrbs = 3; // Striker: fireballs behind, Mage: swords behind
    this.orbRefillTimer = 0;
    this.ninjaBoomerangs = []; // Active boomerang entities
    this.ninjaSkillActive = false; // Whether ninja is in red-boomerang mode

    // Afterimage trail system
    this.afterImages = []; // Array of {x, y, alpha, color, facing, width, height}
    this.afterImageTimer = 0;
    this.afterImageInterval = 0.04; // Spawn every 40ms when moving fast

    // Passive ability state
    this.passiveActive = false;
    this.passiveTimer = 0;
    this.assassinIFrames = 0; // Invincibility frames after skill

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

        // Bug Fix: Prevent inputs before round starts, after game over, or during cinematic
        if (this.engine && (this.engine.isGameOver || this.engine.isRoundStarting || this.isCinematic || this.engine.cinematicActive)) return;

        this.keys[key] = true;
        
        // Emote System (Only works in Lobby or when not moving)
        if (!this.engine) {
          if (key === 'z') this.currentEmote = 'sit';
          if (key === 'x') this.currentEmote = 'cheer';
          if (key === 'c') this.currentEmote = 'taunt';
          if (key === '1') this.currentEmote = 'sit';
          if (key === '2') this.currentEmote = 'dance';
          if (key === '3') this.currentEmote = 'firework';
          if (key === '4') this.currentEmote = 'wave';
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
        
        if (key === this.controls.burst) {
          if (this.trophies >= 2000 && this.cooldowns.burst && this.cooldowns.burst.current <= 0 && !this.isBursting && !this.isStunned && !this.isKnockedDown && this.engine) {
            this.executeGrandmasterBurst();
          }
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

        if (this.engine && (this.engine.isGameOver || this.engine.isRoundStarting || this.isCinematic)) return;

        this.keys[key] = false;
        
        if (key === this.controls.attack && this.isChargingAttack) {
          this.releaseAttack();
        }
      });
    }
  }

  setChatMessage(msg) {
    this.chatMessage = msg;
    this.chatTimer = 5.0; // Show for 5 seconds
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
      if (this.comboResetTimeout) clearTimeout(this.comboResetTimeout);
    } else {
      if (this.comboResetTimeout) clearTimeout(this.comboResetTimeout);
      
      const isMovingForward = (this.facing === 1 && this.keys[this.controls.right]) || (this.facing === -1 && this.keys[this.controls.left]);
      
      if (this.keys[this.controls.up]) {
        // Tapped Up + Attack -> Dive Kick
        this.isAttacking = false;
        this.attackCooldown = false;
        if (this.diveKickReady) this.executeDiveKick();
        return; // Abort normal attack sequence
      } else if (this.keys[this.controls.defend] || (this.controls.down && this.keys[this.controls.down])) {
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
        import('./AudioManager.js').then(({ audioManager }) => { if (audioManager.playDash) audioManager.playDash(); });
      } else {
        this.attackType = `combo${this.comboStep}`;
        this.comboStep++;
        if (this.comboStep > 3) this.comboStep = 1;
      }
      
      // Give them 600ms to hit the next combo, otherwise it resets
      this.comboResetTimeout = setTimeout(() => {
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
    const effectColor = this.getEffectColor();
    this.isUsingSkill = true;
    if (this.engine && this.engine.onSkillUsed) this.engine.onSkillUsed(this);
    if (this.characterType === 'Assassin' && this.isSuperWallActive) {
      // No CD Fireball for Assassin during ultimate!
      import('./AudioManager.js').then(({ audioManager }) => audioManager.playFireball());
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
            ctx.fillStyle = effectColor || '#00ffff';
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
          
          if (this.trophies >= 2000 && this.floatingOrbs >= 3) {
            // 2000杯: Shoot 2 fireballs from the 3 floating orbs, 1 remains
            this.floatingOrbs = 1;
            for (let i = 0; i < 2; i++) {
              const playerRef = this;
              const fb = {
                type: 'fireball', x: fireballX, y: this.y + 15 + i * 35,
                width: 30, height: 30, facing: this.facing, owner: this, isActive: true,
                damage: 25, knockback: this.facing * 600,
                velocity: { x: this.facing * 700, y: 0 },
                phase: 'attack', // 'attack' or 'return'
                lifeTimer: 0, maxLife: 1.5, hasHit: false, returned: false,
                update: function(dt) {
                  this.lifeTimer += dt;
                  
                  if (this.phase === 'attack') {
                    // Fly forward
                    this.x += this.velocity.x * dt;
                    // Switch to return after maxLife or going off screen
                    if (this.lifeTimer >= this.maxLife || this.x < -50 || this.x > 1100) {
                      this.phase = 'return';
                      this.damage = 0; // No damage on return
                    }
                  } else {
                    // Return to owner
                    const targetX = playerRef.x + playerRef.width / 2 - playerRef.facing * 35;
                    const targetY = playerRef.y + 30;
                    const dx = targetX - this.x;
                    const dy = targetY - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist < 20) {
                      // Arrived! Restore orb
                      this.isActive = false;
                      if (!this.returned) {
                        this.returned = true;
                        playerRef.floatingOrbs = Math.min(playerRef.floatingOrbs + 1, 3);
                      }
                    } else {
                      // Fly toward owner
                      const speed = 900;
                      this.x += (dx / dist) * speed * dt;
                      this.y += (dy / dist) * speed * dt;
                    }
                  }
                },
                draw: function(ctx) {
                  ctx.save();
                  ctx.shadowBlur = 12;
                  ctx.shadowColor = '#ff9f43';
                  // Outer glow
                  ctx.fillStyle = this.phase === 'return' ? '#ffa502' : '#ff6b35';
                  ctx.beginPath();
                  ctx.arc(this.x, this.y, 12, 0, Math.PI * 2);
                  ctx.fill();
                  // Inner core
                  ctx.fillStyle = '#fffa65';
                  ctx.beginPath();
                  ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
                  ctx.fill();
                  ctx.restore();
                }
              };
              this.engine.addEntity(fb);
            }
          } else if (this.trophies >= 2000) {
            // Not enough orbs yet (still returning), skip
          } else {
            const fb1 = new Fireball(fireballX, this.y + 10, this.facing, this);
            const fb2 = new Fireball(fireballX, this.y + 50, this.facing, this);
            fb1.damage = 25;
            fb2.damage = 25;
            this.engine.addEntity(fb1);
            this.engine.addEntity(fb2);
          }
        }
        this.isUsingSkill = false;
      }, 200);

    } else if (this.characterType === 'Assassin') {
      import('./AudioManager.js').then(({ audioManager }) => audioManager.playDefend());
      
      // Passive: Grant 1s of i-frames after skill use
      this.assassinIFrames = 1.0;
      
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
            const is2000 = this.owner.trophies >= 2000;
            // Create two spikes shooting outwards
            const makeSpike = (xOff, face, kb) => ({
              type: 'fireball', damage: 5, knockback: kb,
              x: this.x + xOff, y: this.y, width: 20, height: 10, facing: face,
              velocity: { x: face * 800, y: 0 }, owner: this.owner, isActive: true, is2000: is2000, spinAngle: 0,
              update: function(dt) {
                this.x += this.velocity.x * dt;
                this.spinAngle += dt * 12;
                if (this.x > 1200 || this.x < -100) this.isActive = false;
              },
              draw: function(ctx) {
                if (this.is2000) {
                  // Meteor hammer: chain + spinning ball
                  ctx.save();
                  ctx.translate(this.x + 10, this.y + 5);
                  ctx.rotate(this.spinAngle);
                  // Chain
                  ctx.strokeStyle = '#888';
                  ctx.lineWidth = 2;
                  ctx.beginPath();
                  ctx.moveTo(-15, 0);
                  ctx.lineTo(15, 0);
                  ctx.stroke();
                  // Ball
                  ctx.fillStyle = '#555';
                  ctx.beginPath();
                  ctx.arc(15 * this.facing, 0, 8, 0, Math.PI * 2);
                  ctx.fill();
                  ctx.fillStyle = '#888';
                  ctx.beginPath();
                  ctx.arc(15 * this.facing, 0, 4, 0, Math.PI * 2);
                  ctx.fill();
                  ctx.restore();
                } else {
                  ctx.fillStyle = 'cyan';
                  ctx.fillRect(this.x, this.y, this.width, this.height);
                }
              }
            });
            this.owner.engine.addEntity(makeSpike(120, 1, 300));
            this.owner.engine.addEntity(makeSpike(-140, -1, -300));
          }
        },
        draw: function(ctx) {
          ctx.fillStyle = `rgba(${parseInt(effectColor.slice(1,3),16)}, ${parseInt(effectColor.slice(3,5),16)}, ${parseInt(effectColor.slice(5,7),16)}, 0.3)`;
          ctx.strokeStyle = `rgba(${parseInt(effectColor.slice(1,3),16)}, ${parseInt(effectColor.slice(3,5),16)}, ${parseInt(effectColor.slice(5,7),16)}, 0.8)`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(this.x, this.y, 120, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          
          // Glow effect
          ctx.fillStyle = `rgba(${parseInt(effectColor.slice(1,3),16)}, ${parseInt(effectColor.slice(3,5),16)}, ${parseInt(effectColor.slice(5,7),16)}, ${0.1 + Math.random() * 0.1})`;
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
      import('./AudioManager.js').then(({ audioManager }) => audioManager.playDash());
      
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
        
        // 2000杯: Spawn 4 red boomerangs that follow the ninja down
        if (this.trophies >= 2000) {
          this.ninjaSkillActive = true;
          this.color = '#ff4444'; // Turn red
          const offsets = [
            { ox: -30, oy: -20 }, { ox: 30, oy: -20 },
            { ox: -40, oy: 10 }, { ox: 40, oy: 10 }
          ];
          this.ninjaBoomerangs = [];
          for (let i = 0; i < 4; i++) {
            const boomerang = {
              type: 'boomerang', owner: this, isActive: true,
              ox: offsets[i].ox, oy: offsets[i].oy,
              x: this.x + offsets[i].ox, y: this.y + offsets[i].oy,
              spinAngle: i * Math.PI / 2, damage: 8,
              width: 20, height: 20,
              update: function(dt) {
                if (!this.owner || !this.owner.ninjaSkillActive) { this.isActive = false; return; }
                this.x = this.owner.x + this.owner.width / 2 + this.ox;
                this.y = this.owner.y + this.owner.height / 2 + this.oy;
                this.spinAngle += dt * 15;
              },
              draw: function(ctx) {
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.spinAngle);
                // Boomerang shape: V shape
                ctx.strokeStyle = '#ff2222';
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(-10, -5);
                ctx.lineTo(0, 5);
                ctx.lineTo(10, -5);
                ctx.stroke();
                // Glow
                ctx.shadowBlur = 8;
                ctx.shadowColor = '#ff0000';
                ctx.stroke();
                ctx.restore();
              }
            };
            if (this.engine) this.engine.addEntity(boomerang);
            this.ninjaBoomerangs.push(boomerang);
          }
          // Revert color when landing (check in update)
          const checkLanding = setInterval(() => {
            if (this.isGrounded || !this.isAttacking) {
              this.ninjaSkillActive = false;
              this.color = '#2ecc71'; // Back to green
              this.ninjaBoomerangs.forEach(b => b.isActive = false);
              this.ninjaBoomerangs = [];
              clearInterval(checkLanding);
            }
          }, 50);
        }
      }
      setTimeout(() => { this.isUsingSkill = false; }, 300);
    } else if (this.characterType === 'Tank') {
      import('./AudioManager.js').then(({ audioManager }) => audioManager.playSkill());
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
          this.floatTimer = (this.floatTimer || 0) + deltaTime;
          if (this.x < -100 || this.x > 1200) this.isActive = false;
        },
        draw: function(ctx) {
          if (this.owner && this.owner.trophies >= 2000) {
            // Soul/ghost projectile
            ctx.save();
            const floatY = Math.sin((this.floatTimer || 0) * 6) * 5;
            ctx.globalAlpha = 0.7 + Math.sin((this.floatTimer || 0) * 4) * 0.15;
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#a29bfe';
            // Ghost body
            ctx.fillStyle = '#a29bfe';
            ctx.beginPath();
            ctx.arc(this.x, this.y + floatY - 5, 18, Math.PI, 0); // Head
            ctx.lineTo(this.x + 18, this.y + floatY + 10);
            // Wavy bottom
            ctx.quadraticCurveTo(this.x + 12, this.y + floatY + 5, this.x + 6, this.y + floatY + 12);
            ctx.quadraticCurveTo(this.x, this.y + floatY + 7, this.x - 6, this.y + floatY + 12);
            ctx.quadraticCurveTo(this.x - 12, this.y + floatY + 5, this.x - 18, this.y + floatY + 10);
            ctx.fill();
            // Eyes
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(this.x - 6, this.y + floatY - 5, 3, 0, Math.PI * 2);
            ctx.arc(this.x + 6, this.y + floatY - 5, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#2d3436';
            ctx.beginPath();
            ctx.arc(this.x - 5, this.y + floatY - 5, 1.5, 0, Math.PI * 2);
            ctx.arc(this.x + 7, this.y + floatY - 5, 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else {
            ctx.fillStyle = '#8c7ae6';
            ctx.beginPath();
            ctx.rect(this.x - 25, this.y - 15, 50, 30);
            ctx.fill();
          }
        }
      };
      this.engine.addEntity(shockwave);
      setTimeout(() => { this.isUsingSkill = false; }, 300);
    } else if (this.characterType === 'Brawler') {
      import('./AudioManager.js').then(({ audioManager }) => audioManager.playDash());
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
      
      // 2000杯: Ground ring explosion after dash
      if (this.trophies >= 2000) {
        const groundRing = {
          type: 'groundRing', isActive: true, timer: 0, maxTimer: 0.6,
          x: this.x + this.width / 2,
          y: this.y + this.height, // Feet level
          owner: this,
          update: function(dt) {
            this.timer += dt;
            if (this.timer >= this.maxTimer) this.isActive = false;
          },
          draw: function(ctx) {
            const progress = this.timer / this.maxTimer;
            const radius = 20 + progress * 100;
            ctx.save();
            ctx.globalAlpha = 1 - progress;
            // Outer ring
            ctx.strokeStyle = '#ff4757';
            ctx.lineWidth = 4 - progress * 3;
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#ff4757';
            ctx.beginPath();
            ctx.ellipse(this.x, this.y, radius, radius * 0.3, 0, 0, Math.PI * 2);
            ctx.stroke();
            // Inner ring
            ctx.strokeStyle = '#fffa65';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(this.x, this.y, radius * 0.6, radius * 0.18, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        };
        this.engine.addEntity(groundRing);
      }
      
      setTimeout(() => { this.isUsingSkill = false; }, 300);
    } else if (this.characterType === 'Sniper') {
      if (!this.platformEntity || !this.platformEntity.isActive) {
        import('./AudioManager.js').then(({ audioManager }) => audioManager.playDefend());
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
        import('./AudioManager.js').then(({ audioManager }) => audioManager.playFireball());
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
            if (this.owner && this.owner.trophies >= 2000) {
              // Arrow visual that rotates based on velocity
              ctx.save();
              ctx.translate(this.x, this.y);
              const angle = Math.atan2(this.velocity.y, this.velocity.x);
              ctx.rotate(angle);
              // Arrow shaft
              ctx.strokeStyle = '#8B4513';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(-18, 0);
              ctx.lineTo(12, 0);
              ctx.stroke();
              // Arrow head (triangle)
              ctx.fillStyle = '#c0c0c0';
              ctx.beginPath();
              ctx.moveTo(18, 0);
              ctx.lineTo(10, -5);
              ctx.lineTo(10, 5);
              ctx.closePath();
              ctx.fill();
              // Feathers
              ctx.strokeStyle = '#ff6b6b';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(-18, 0); ctx.lineTo(-22, -4);
              ctx.moveTo(-16, 0); ctx.lineTo(-20, 4);
              ctx.stroke();
              ctx.restore();
            } else {
              ctx.fillStyle = '#f1c40f';
              ctx.fillRect(this.x - 15, this.y - 2, 30, 4);
            }
          }
        };
        this.engine.addEntity(bullet);
        this.platformEntity.shotsFired++;
        setTimeout(() => { this.isUsingSkill = false; }, 200);
      }
    } else if (this.characterType === 'Mage') {
      import('./AudioManager.js').then(({ audioManager }) => audioManager.playFireball());
      
      if (this.trophies >= 2000) {
        // 2000杯: Shoot 3 swords from behind, then auto-refill
        const count = Math.min(this.floatingOrbs, 3);
        const spreadY = [-40, 0, 40];
        for (let j = 0; j < count; j++) {
          const sword = {
            type: 'fireball',
            x: this.facing === 1 ? this.x + this.width : this.x - 40,
            y: this.y - 20 + spreadY[j],
            width: 30, height: 15,
            velocity: { x: this.facing * 400, y: -100 + (j * 50) },
            owner: this, facing: this.facing, isActive: true,
            damage: 5, knockback: this.facing * 1000,
            speed: 600 + j * 50, spinAngle: 0,
            update: function(deltaTime) {
              this.x += this.velocity.x * deltaTime;
              this.y += this.velocity.y * deltaTime;
              let opponent = null;
              if (this.owner && this.owner.engine) {
                for (let i = 0; i < this.owner.engine.entities.length; i++) {
                  const e = this.owner.engine.entities[i];
                  if (e.health !== undefined && e !== this.owner && !e.isClone) { opponent = e; break; }
                }
              }
              if (opponent) {
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
              ctx.save();
              ctx.translate(this.x, this.y);
              const angle = Math.atan2(this.velocity.y, this.velocity.x);
              ctx.rotate(angle);
              // Sword blade
              ctx.fillStyle = '#c0c0c0';
              ctx.shadowBlur = 8;
              ctx.shadowColor = '#a29bfe';
              ctx.beginPath();
              ctx.moveTo(18, 0);   // tip
              ctx.lineTo(-8, -3);  // back top
              ctx.lineTo(-8, 3);   // back bottom
              ctx.closePath();
              ctx.fill();
              // Handle/guard
              ctx.fillStyle = '#8B4513';
              ctx.fillRect(-10, -4, 4, 8);
              ctx.fillStyle = '#fbc531';
              ctx.fillRect(-8, -5, 2, 10);
              ctx.restore();
            }
          };
          this.engine.addEntity(sword);
        }
        this.floatingOrbs = 0;
        // Auto-refill after 1 second
        setTimeout(() => { this.floatingOrbs = Math.min(this.floatingOrbs + 2, 3); }, 1000);
      } else {
        // Original homing missiles
        const spreadY = [-40, 0, 40];
        for (let j = 0; j < 3; j++) {
          const missile = {
            type: 'fireball',
            x: this.facing === 1 ? this.x + this.width : this.x - 40,
            y: this.y - 20 + spreadY[j],
            width: 20, height: 20,
            velocity: { x: this.facing * 400, y: -100 + (j * 50) },
            owner: this, facing: this.facing, isActive: true,
            damage: 5, knockback: this.facing * 1000,
            speed: 600 + j * 50,
            update: function(deltaTime) {
              this.x += this.velocity.x * deltaTime;
              this.y += this.velocity.y * deltaTime;
              let opponent = null;
              if (this.owner && this.owner.engine) {
                for (let i = 0; i < this.owner.engine.entities.length; i++) {
                  const e = this.owner.engine.entities[i];
                  if (e.health !== undefined && e !== this.owner && !e.isClone) { opponent = e; break; }
                }
              }
              if (opponent) {
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
      }
      setTimeout(() => { this.isUsingSkill = false; }, 300);
    }

    if (this.characterType === 'Ninja') {
      this.isUsingSkill = true;
      const visualKnives = {
        type: 'visual_boomerang', owner: this, isActive: true,
        x: this.x + this.width/2, y: this.y + this.height/2,
        orbitAngle: 0, damage: 0, knockback: 0,
        width: 1, height: 1,
        createdAt: Date.now(),
        update: function(dt) {
          if (!this.owner) { this.isActive = false; return; }
          if (Date.now() - this.createdAt > 5000) { this.isActive = false; return; }
          this.orbitAngle += dt * 6; // Rotation speed
          // Keep centered on player
          this.x = this.owner.x + this.owner.width/2;
          this.y = this.owner.y + this.owner.height/2;
        },
        draw: function(ctx) {
          ctx.save();
          ctx.translate(this.x, this.y);
          ctx.rotate(this.orbitAngle);
          
          const orbitRadius = 65;
          // Draw 4 small knives
          for (let i = 0; i < 4; i++) {
            ctx.save();
            ctx.rotate((Math.PI / 2) * i);
            ctx.translate(orbitRadius, 0);
            // Knife shape (pointing outward or tangent)
            ctx.rotate(Math.PI / 4); // Angle the knife a bit
            ctx.fillStyle = '#a29bfe'; // Ninja purple/blue metal color
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#0abde3';
            ctx.beginPath();
            ctx.moveTo(15, 0);   // Blade tip
            ctx.lineTo(0, -4);   // Blade top back
            ctx.lineTo(0, 4);    // Blade bottom back
            ctx.fill();
            // Handle
            ctx.fillStyle = '#2d3436';
            ctx.fillRect(-6, -2, 6, 4);
            ctx.restore();
          }
          
          ctx.restore();
        }
      };
      if (this.engine) this.engine.addEntity(visualKnives);
      setTimeout(() => { this.isUsingSkill = false; }, 300);
    }

    this.cooldowns.skill.current = this.cooldowns.skill.max;
    this.skillReady = false;
  }
  
  executeGrandmasterBurst() {
    this.isBursting = true;
    this.burstTimer = 0;
    if (this.cooldowns.burst) this.cooldowns.burst.current = this.cooldowns.burst.max;
    this.isAttacking = false;
    this.isDefending = false;
    this.isChargingAttack = false;
    this.isCounterStance = false;
    this.velocity.x = 0;
    this.velocity.y = 0;
    
    if (this.engine) {
      this.engine.timeStopOwner = this;
      import('./AudioManager.js').then(({ audioManager }) => audioManager.playDefend());
    }
  }

  executeUltimate() {
    const effectColor = this.getEffectColor();
    this.ultimateReady = false;
    this.blockCount = 0;
    this.isUsingSkill = true;

    if (this.characterType === 'Striker') {
       // Fireball Barrage
       let fireballsThrown = 0;
       
       let barrageInterval = setInterval(() => {
          if (!this.engine || this.engine.isGameOver) return clearInterval(barrageInterval);
          
          import('./AudioManager.js').then(({ audioManager }) => audioManager.playFireball());
          
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
              ctx.fillStyle = effectColor || '#fffa65';
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

          import('./AudioManager.js').then(({ audioManager }) => audioManager.playHeavyAttack());
          
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
                
                import('./AudioManager.js').then(({ audioManager }) => {
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
          import('./AudioManager.js').then(({ audioManager }) => audioManager.playDash());
          setTimeout(() => { this.isUsingSkill = false; }, 400);
       }
    }
    else if (this.characterType === 'Ninja') {
      import('./AudioManager.js').then(({ audioManager }) => audioManager.playDash());
      
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
      import('./AudioManager.js').then(({ audioManager }) => audioManager.playDefend());
      
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
      import('./AudioManager.js').then(({ audioManager }) => audioManager.playDefend());
      this.isBerserk = true;
      this.berserkTimer = 8.0; // 8 seconds of berserk
      this.width = 60; // Get slightly bigger
      this.height = 110;
      setTimeout(() => { this.isUsingSkill = false; }, 300);
    } else if (this.characterType === 'Sniper') {
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
              import('./AudioManager.js').then(({ audioManager }) => audioManager.playLightAttack());
              
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
      import('./AudioManager.js').then(({ audioManager }) => audioManager.playFireball());
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
      if (key === this.controls.burst) {
        if (this.trophies >= 2000 && this.cooldowns.burst && this.cooldowns.burst.current <= 0 && !this.isBursting && !this.isStunned && !this.isKnockedDown && this.engine) {
          this.executeGrandmasterBurst();
        }
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
    const effectColor = this.getEffectColor();
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
    
    import('./AudioManager.js').then(({ audioManager }) => audioManager.playDash());
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
      if (this.characterType === 'Striker' && absDistX > 200 && Math.random() < 0.02) {
        this.executeSkill();
        this.aiState.reactionDelay = 1.0;
        return;
      }
      if (this.characterType === 'Assassin' && absDistX > 150 && absDistX < 400 && Math.random() < 0.02) {
        this.facing = distX > 0 ? 1 : -1;
        this.executeSkill();
        this.aiState.reactionDelay = 1.0;
        return;
      }
    }

    // CPU Defense (Parry chance)
    if (opponent.isChargingAttack && absDistX < 100 && Math.random() < 0.3 && !this.attackCooldown) {
      this.keys[this.controls.defend] = true;
      this.aiState.reactionDelay = 0.3;
      setTimeout(() => { this.keys[this.controls.defend] = false; }, 300);
      return;
    }

    // Melee Attack Priority
    if (absDistX < 80 && !this.attackCooldown && !this.isDiveKicking && !this.isChargingAttack) {
      this.facing = distX > 0 ? 1 : -1;
      
      if (Math.random() < 0.15) {
        // CPU decides to attack
        const isHeavy = Math.random() > 0.6;
        this.isChargingAttack = true;
        this.chargeTimer = 0;
        this.aiState.reactionDelay = isHeavy ? 0.3 : 0.05; 
        
        setTimeout(() => {
           if (this.engine && !this.engine.isGameOver && this.isChargingAttack) {
             this.chargeTimer = isHeavy ? 0.4 : 0;
             this.releaseAttack();
           }
        }, isHeavy ? 400 : 50);
      } else {
        if (Math.random() < 0.05) {
          this.keys[distX > 0 ? this.controls.left : this.controls.right] = true;
          this.aiState.reactionDelay = 0.3;
        }
      }
      return;
    }

    // Dive Kick Priority (when far)
    if (absDistX > 200 && absDistX < 400 && !this.attackCooldown && !this.isDiveKicking && this.diveKickReady) {
      if (Math.random() < 0.05) {
        this.facing = distX > 0 ? 1 : -1;
        this.executeDiveKick();
        this.aiState.reactionDelay = 1.0;
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
    if (this.shoutTimer > 0) {
      this.shoutTimer -= deltaTime;
      if (this.shoutTimer <= 0) this.shoutText = null;
    }
    
    if (this.chatTimer > 0) {
      this.chatTimer -= deltaTime;
      if (this.chatTimer <= 0) this.chatMessage = null;
    }

    if (this.cooldowns.burst && this.cooldowns.burst.current > 0) {
      this.cooldowns.burst.current -= deltaTime;
    }

    if (this.isBursting) {
      this.burstTimer += deltaTime;
      if (this.burstTimer >= 1.5) {
        this.isBursting = false;
        if (this.engine) {
          this.engine.timeStopOwner = null;
          import('./AudioManager.js').then(({ audioManager }) => audioManager.playFight());
          
          const explosion = {
            type: 'shockwave',
            x: this.x + this.width / 2,
            y: this.y + this.height / 2,
            radius: 10,
            maxRadius: 3000, // Global range!
            duration: 0.5,
            timer: 0,
            damage: 80,
            owner: this,
            isActive: true,
            ignoreTimeStop: true,
            update: function(dt) {
              this.timer += dt;
              this.radius = this.maxRadius * (this.timer / this.duration);
              if (this.timer >= this.duration) {
                this.isActive = false;
              }
            },
            draw: function(ctx) {
              ctx.beginPath();
              ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
              const gradient = ctx.createRadialGradient(this.x, this.y, this.radius * 0.2, this.x, this.y, this.radius);
              gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
              gradient.addColorStop(0.5, 'rgba(224, 86, 253, 0.8)');
              gradient.addColorStop(1, 'rgba(224, 86, 253, 0)');
              ctx.fillStyle = gradient;
              ctx.fill();
            }
          };
          this.engine.addEntity(explosion);
          
          for (const opponent of this.engine.entities) {
            if (opponent !== this && opponent.health !== undefined && !opponent.isClone) {
              const face = explosion.x < opponent.x + opponent.width/2 ? 1 : -1;
              this.engine.applyDamage(this, opponent, 80, face * 1800, this);
              // Start the cinematic cutscene!
              if (this.engine.startBurstCinematic) {
                this.engine.startBurstCinematic(this, opponent);
              }
            }
          }
        }
      }
      return; // Skip normal update while bursting
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= deltaTime;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }

    // ===== AFTERIMAGE TRAIL =====
    if (this.engine) {
      this.afterImageTimer += deltaTime;
      const speed = Math.abs(this.velocity.x) + Math.abs(this.velocity.y) * 0.5;
      const movingFast = speed > 200;
      const interval = movingFast ? 0.03 : 0.08;
      
      if (speed > 100 && this.afterImageTimer >= interval) {
        this.afterImageTimer = 0;
        this.afterImages.push({
          x: this.x, y: this.y,
          width: this.width, height: this.height,
          alpha: movingFast ? 0.4 : 0.2,
          color: this.color,
          facing: this.facing,
          timer: 0, life: movingFast ? 0.25 : 0.15
        });
      }
      // Update existing afterimages
      for (let i = this.afterImages.length - 1; i >= 0; i--) {
        this.afterImages[i].timer += deltaTime;
        this.afterImages[i].alpha = Math.max(0, (1 - this.afterImages[i].timer / this.afterImages[i].life) * 0.35);
        if (this.afterImages[i].timer >= this.afterImages[i].life) {
          this.afterImages.splice(i, 1);
        }
      }
      // Cap afterimages
      if (this.afterImages.length > 8) {
        this.afterImages = this.afterImages.slice(-8);
      }
    }

    // ===== PASSIVE ABILITIES =====
    if (this.engine) {
      // Assassin: i-frames after skill use
      if (this.assassinIFrames > 0) {
        this.assassinIFrames -= deltaTime;
      }
      
      // Mage: reduce skill CD on hit (handled in applyDamage callback)
      // Others are checked in getPassiveDamageMultiplier() / getPassiveSpeedMultiplier()
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

    if (this.isCinematic) {
      // Completely bypass all AI, input, friction, and gravity.
      // GameEngine.js will strictly control velocity during this time.
      this.x += this.velocity.x * deltaTime;
      this.y += this.velocity.y * deltaTime;
      
      // Floor collision
      if (this.y + this.height >= floorY) {
        this.y = floorY - this.height;
        if (this.isKnockedDown && this.bounceCount > 0 && this.velocity.y > 0) {
          this.velocity.y = -250;
          this.bounceCount--;
          this.isGrounded = false;
        } else {
          this.velocity.y = 0;
          this.isGrounded = true;
        }
      }
      return;
    }

    if (this.isPursuing) {
      this.isDefending = false;
      this.isChargingAttack = false;
      this.isCounterStance = false;
    } else {
      const wantsToDefend = this.engine && !this.isStunned && !this.isKnockedDown && this.keys[this.controls.defend] && this.isGrounded && !this.isAttacking && !this.isUsingSkill && !this.isChargingAttack && !this.isDiveKicking && !this.isCounterAttacking;
      const backKey = this.facing === 1 ? this.controls.left : this.controls.right;
      const tryingToCounter = wantsToDefend && this.keys[backKey] && !this.counterCooldown;

      if (tryingToCounter) {
        this.isCounterStance = true;
        this.isDefending = false; // Override normal defending
        this.counterStanceTimer += deltaTime;
        if (this.counterStanceTimer > 5.0) {
          // Exceeded 5 seconds! Force cooldown.
          this.cooldowns.counter.current = this.cooldowns.counter.max;
          this.counterCooldown = true;
          this.isCounterStance = false;
        }
      } else {
        if (this.counterStanceTimer > 0) {
          // Released parry button! Trigger cooldown.
          this.cooldowns.counter.current = this.cooldowns.counter.max;
          this.counterCooldown = true;
        }
        this.isCounterStance = false;
        this.counterStanceTimer = 0;
        
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
    } else if (!this.isDefending && !this.isCounterStance && !this.isUsingSkill && !this.isChargingAttack && !this.isDiveKicking && !this.isStunned && !this.isKnockedDown && !this.isPursuing && !this.isAttacking && !this.isCounterAttacking) {
      
      let isMoving = false;
      let currentSpeed = this.speed;
      if (!this.engine && this.keys['shift']) {
        currentSpeed *= 2; // Speed up in lobby
      }
      // Passive: Ninja speed boost when low HP
      currentSpeed *= this.getPassiveSpeedMultiplier();

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
        
        // Lobby Sitting via Joystick or Down key
        if (!this.engine && this.isGrounded) {
          if (this.keys[this.controls.down]) {
            if (!this.wasDownPressed) {
              this.wasDownPressed = true;
              if (this.currentEmote === 'sit') {
                this.currentEmote = null;
              } else {
                this.currentEmote = 'sit';
              }
            }
          } else {
            this.wasDownPressed = false;
          }
        }
      }

      // Large Jump (Battle only)
      if (this.engine && this.keys[this.controls.up] && (this.isGrounded || this.isWalkHopping)) {
        this.velocity.y = this.jumpForce;
        this.isGrounded = false;
        this.isWalkHopping = false;
      }

      if (isMoving || !this.isGrounded || (this.engine && this.keys[this.controls.down])) {
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
    } else if (this.isDefending || this.isChargingAttack || this.isCounterStance) {
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
      if (this.attackType === 'ninjaSmash' && this.isAttacking) {
        this.velocity.x = 0;
        import('./AudioManager.js').then(({ audioManager }) => {
          if (audioManager.playDefend) audioManager.playDefend();
        });
        setTimeout(() => {
          if (this.attackType === 'ninjaSmash') {
            this.isAttacking = false;
            this.attackType = 'none';
          }
        }, 150);
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
        
        import('./AudioManager.js').then(({ audioManager }) => {
          if (audioManager.playDefend) audioManager.playDefend();
        });
      }
       if (!this.engine) {
      // 3D LOBBY MOVEMENT
      const moveSpeed = this.speed * deltaTime;
      if (this.keys[this.controls.left]) this.velocity.x = -moveSpeed;
      else if (this.keys[this.controls.right]) this.velocity.x = moveSpeed;
      else this.velocity.x = 0;

      if (this.keys[this.controls.up]) this.z -= moveSpeed * 0.8;
      else if (this.keys[this.controls.down]) this.z += moveSpeed * 0.8;

      this.x += this.velocity.x;
      
      // Simple bound limits for 3D lobby
      if (this.z < -400) this.z = -400; // Back wall
      if (this.z > 200) this.z = 200;   // Front wall

      if (this.velocity.x !== 0 || this.keys[this.controls.up] || this.keys[this.controls.down]) {
        this.isWalkHopping = true;
        this.y = floorY - this.height - Math.abs(Math.sin(Date.now() / 100) * 10);
        if (this.velocity.x > 0) this.facing = 1;
        else if (this.velocity.x < 0) this.facing = -1;
      } else {
        this.isWalkHopping = false;
        this.y = floorY - this.height;
      }
      
      if (this.x < 0) this.x = 0;
      if (this.x > mapWidth - this.width) this.x = mapWidth - this.width;
      
      return;
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
        return '#e67e22'; // Orange
      case 'Brawler':
        if (skinId === 'hulk') return '#2ed573';
        if (skinId === 'cyber') return '#1e90ff';
        return '#2ecc71'; // Dark green (Orc)
      case 'Assassin':
        if (skinId === 'crimson') return '#c0392b';
        if (skinId === 'shadow') return '#2f3542';
        return '#e74c3c'; // Red
      case 'Tank':
        if (skinId === 'obsidian') return '#2c3e50';
        if (skinId === 'magma') return '#ff6348';
        return '#8e44ad'; // Purple body
      case 'Ninja':
        if (skinId === 'ghost') return '#00d2d3';
        if (skinId === 'blood') return '#c23616';
        return '#27ae60'; // Camo Green
      case 'Sniper':
        if (skinId === 'specops') return '#10ac84';
        if (skinId === 'desert') return '#feca57';
        return '#2980b9'; // Blue (Ranger)
      case 'Mage':
        if (skinId === 'archmage') return '#fbc531';
        if (skinId === 'darkmage') return '#273c75';
        return '#00b894'; // Greenish cloak base
      default:
        return this.color;
    }
  }

  getSpriteUrl() {
    switch(this.characterType) {
      case 'Striker': return '/sprites/char_0_5.png';
      case 'Assassin': return '/sprites/char_0_2.png';
      case 'Tank': return '/sprites/char_0_3.png';
      case 'Ninja': return '/sprites/char_0_4.png';
      case 'Sniper': return '/sprites/char_0_1.png';
      case 'Mage': return '/sprites/char_0_6.png';
      case 'Brawler': return '/sprites/char_1_4.png';
      default: return '/sprites/char_0_0.png';
    }
  }

  // ===== PASSIVE ABILITIES =====
  getPassiveDamageMultiplier() {
    if (!this.engine) return 1.0;
    switch (this.characterType) {
      case 'Striker':
        // Combo bonus: +15% when combo >= 5
        if (this.comboCount >= 5) { this.passiveActive = true; return 1.15; }
        break;
      case 'Brawler':
        // Rage: +25% damage when HP < 30%
        if (this.health < this.maxHealth * 0.3) { this.passiveActive = true; return 1.25; }
        break;
      case 'Sniper':
        // Execute: +50% crit damage when target < 20% HP
        // (checked at damage application against target)
        break;
      default: break;
    }
    return 1.0;
  }

  getPassiveSpeedMultiplier() {
    if (!this.engine) return 1.0;
    if (this.characterType === 'Ninja' && this.health < this.maxHealth * 0.3) {
      this.passiveActive = true;
      return 1.3; // +30% move speed
    }
    return 1.0;
  }

  getPassiveName() {
    switch (this.characterType) {
      case 'Striker': return '🔥 鬥志燃燒';
      case 'Brawler': return '💢 狂戰士之怒';
      case 'Assassin': return '👤 影遁';
      case 'Tank': return '🛡️ 鐵壁';
      case 'Ninja': return '⚡ 忍者之道';
      case 'Sniper': return '🎯 精準射擊';
      case 'Mage': return '✨ 魔力湧動';
      default: return '';
    }
  }

  isPassiveConditionMet() {
    if (!this.engine) return false;
    switch (this.characterType) {
      case 'Striker': return this.comboCount >= 5;
      case 'Brawler': return this.health < this.maxHealth * 0.3;
      case 'Assassin': return this.assassinIFrames > 0;
      case 'Tank': return true; // Always active (reflected on hit)
      case 'Ninja': return this.health < this.maxHealth * 0.3;
      case 'Sniper': return false; // Conditional on target HP
      case 'Mage': return false; // Triggered on skill hit
      default: return false;
    }
  }

  draw(ctx) {
    // ===== AFTERIMAGE TRAIL (draw before main body) =====
    if (this.engine && this.afterImages.length > 0) {
      for (const img of this.afterImages) {
        ctx.save();
        ctx.globalAlpha = img.alpha;
        ctx.fillStyle = img.color || this.color;
        // Simple body silhouette
        ctx.fillRect(img.x + 10, img.y, img.width - 20, img.height);
        // Head
        ctx.beginPath();
        ctx.arc(img.x + img.width / 2, img.y - 2, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    if (this.comboCount > 1 && !(this.engine && this.engine.cinematicActive)) {
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

    // 2000杯: Draw floating orbs/swords behind the player
    if (this.trophies >= 2000 && this.engine && (this.characterType === 'Striker' || this.characterType === 'Mage')) {
      const cx = this.x + this.width / 2;
      const cy = this.y + 20;
      const behindX = cx - this.facing * 35;
      
      for (let i = 0; i < this.floatingOrbs; i++) {
        const orbY = cy - 15 + i * 25;
        const bobY = Math.sin(Date.now() / 300 + i * 1.2) * 4;
        
        ctx.save();
        if (this.characterType === 'Striker') {
          // Floating fireballs
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#ff9f43';
          ctx.fillStyle = '#ff6b35';
          ctx.beginPath();
          ctx.arc(behindX, orbY + bobY, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fffa65';
          ctx.beginPath();
          ctx.arc(behindX, orbY + bobY, 4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Floating swords (Mage)
          ctx.translate(behindX, orbY + bobY);
          ctx.rotate(-this.facing * 0.5 + Math.sin(Date.now() / 400 + i) * 0.2);
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#a29bfe';
          ctx.fillStyle = '#c0c0c0';
          ctx.beginPath();
          ctx.moveTo(0, -12);  // tip
          ctx.lineTo(-3, 5);
          ctx.lineTo(3, 5);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#fbc531';
          ctx.fillRect(-4, 5, 8, 3); // guard
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(-2, 8, 4, 5); // handle
        }
        ctx.restore();
      }
    }

    if (this.username) {
      ctx.save();
      
      let title = '';
      let titleColor = '';
      if (this.trophies >= 2000) {
        title = '【榮耀宗師】';
        titleColor = '#e056fd'; // Purple
      } else if (this.trophies >= 1000) {
        title = '【榮耀大師】';
        titleColor = '#fbc531'; // Gold
      } else if (this.trophies >= 900) {
        title = '【鑽石】';
        titleColor = '#00d2d3'; // Diamond
      } else if (this.trophies >= 500) {
        title = '【銀牌】';
        titleColor = '#bdc3c7'; // Silver
      } else if (this.trophies >= 200) {
        title = '【銅牌】';
        titleColor = '#cd6133'; // Bronze
      }

      if (!(this.engine && this.engine.cinematicActive)) {
        if (title) {
          ctx.font = 'bold 12px "Arial Black", sans-serif';
          const titleWidth = ctx.measureText(title).width;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(this.x + this.width / 2 - titleWidth / 2 - 6, this.y - 52, titleWidth + 12, 18);
          ctx.fillStyle = titleColor;
          ctx.textAlign = 'center';
          ctx.shadowBlur = 10;
          ctx.shadowColor = titleColor;
          ctx.fillText(title, this.x + this.width / 2, this.y - 39);
          ctx.shadowBlur = 0;
        }

        const displayUsername = this.username + (this.trophies !== undefined ? ' 🏆' + this.trophies : '');
        ctx.font = 'bold 14px Inter, sans-serif';
        const textWidth = ctx.measureText(displayUsername).width;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(this.x + this.width / 2 - textWidth / 2 - 6, this.y - 28, textWidth + 12, 20);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(displayUsername, this.x + this.width / 2, this.y - 14);
      }

      // --- SHOUT TEXT ---
      if (this.shoutTimer > 0 && this.shoutText) {
        ctx.font = 'bold 24px "Arial Black", sans-serif';
        const bounce = Math.sin(this.shoutTimer * 10) * 5;
        ctx.fillStyle = '#ff4757'; // Red panic text
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 8;
        ctx.fillText(this.shoutText, this.x + this.width / 2, this.y - 40 + bounce);
        ctx.shadowBlur = 0;
      }

      // --- CHAT BUBBLE ---
      if (this.chatTimer > 0 && this.chatMessage) {
        ctx.font = 'bold 16px Inter, sans-serif';
        const textWidth = ctx.measureText(this.chatMessage).width;
        const boxWidth = textWidth + 20;
        const boxHeight = 30;
        const cx = this.x + this.width / 2;
        const cy = this.y - 50;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 10;
        
        // Draw bubble tail
        ctx.beginPath();
        ctx.moveTo(cx, cy + 5);
        ctx.lineTo(cx - 5, cy - 5);
        ctx.lineTo(cx + 5, cy - 5);
        ctx.fill();

        // Draw bubble box
        ctx.beginPath();
        ctx.roundRect(cx - boxWidth / 2, cy - boxHeight - 5, boxWidth, boxHeight, 8);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(this.chatMessage, cx, cy - 14);
      }

      ctx.restore();
    }

    // ===== PASSIVE ABILITY INDICATOR =====
    if (this.engine && this.isPassiveConditionMet()) {
      ctx.save();
      const passiveName = this.getPassiveName();
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#feca57';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#feca57';
      ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 200) * 0.3;
      ctx.fillText(passiveName, this.x + this.width / 2, this.y + this.height + 14);
      ctx.restore();
    }

    // ===== EMOTE VISUAL EFFECTS =====
    if (this.currentEmote === 'dance') {
      ctx.save();
      ctx.font = '16px serif';
      ctx.textAlign = 'center';
      const t = Date.now() / 300;
      for (let i = 0; i < 3; i++) {
        const offsetY = ((t + i * 2) % 3) * -15;
        const offsetX = Math.sin(t + i * 1.5) * 12;
        ctx.globalAlpha = 1 - ((t + i * 2) % 3) / 3;
        ctx.fillText(['♪', '♫', '🎵'][i], this.x + this.width / 2 + offsetX, this.y - 15 + offsetY);
      }
      ctx.restore();
    } else if (this.currentEmote === 'wave') {
      ctx.save();
      ctx.font = '18px serif';
      ctx.textAlign = 'center';
      ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 200) * 0.3;
      ctx.fillText('👋', this.x + this.width / 2 + this.facing * 25, this.y - 25);
      ctx.restore();
    } else if (this.currentEmote === 'firework') {
      ctx.save();
      const t = (Date.now() % 2000) / 2000;
      const cx = this.x + this.width / 2;
      const launchY = this.y - 40;
      if (t < 0.4) {
        // Launch trail
        const progress = t / 0.4;
        ctx.fillStyle = '#ffd32a';
        ctx.globalAlpha = 1 - progress;
        ctx.beginPath();
        ctx.arc(cx, launchY - progress * 80, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Burst
        const burstT = (t - 0.4) / 0.6;
        const burstY = launchY - 150; // Launch much higher
        const colors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff'];
        
        // Outer big burst
        for (let i = 0; i < 16; i++) {
          const angle = (i / 16) * Math.PI * 2;
          const r = burstT * 120; // HUGE burst radius
          ctx.globalAlpha = 1 - burstT;
          ctx.fillStyle = colors[i % colors.length];
          ctx.beginPath();
          ctx.arc(cx + Math.cos(angle) * r, burstY + Math.sin(angle) * r, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        
        // Inner smaller burst
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const r = burstT * 60; // Inner burst radius
          ctx.globalAlpha = 1 - burstT;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(cx + Math.cos(angle) * r, burstY + Math.sin(angle) * r, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    if (this.useImageSprite && this.spriteImage && this.spriteImage.complete && this.spriteImage.naturalWidth > 0) {
      this.drawImageSprite(ctx);
      return;
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

    if (this.isBursting) {
      ctx.shadowBlur = 30 + Math.sin(Date.now() / 50) * 10;
      ctx.shadowColor = '#e056fd';
      ctx.fillStyle = 'rgba(224, 86, 253, 0.4)';
      ctx.fillRect(this.x - 10, this.y - 10, this.width + 20, this.height + 20);
    } else if (this.isBerserk) {
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ff4757';
    }

    let strokeColor = this.color;
    if (this.skinId === 'default' || !this.skinId) {
      if (this.characterType === 'Striker') strokeColor = '#e67e22'; // Orange
      if (this.characterType === 'Assassin') strokeColor = '#c0392b'; // Dark Red
      if (this.characterType === 'Tank') strokeColor = '#9b59b6'; // Purple head (armor is yellow)
      if (this.characterType === 'Ninja') strokeColor = '#27ae60'; // Green
      if (this.characterType === 'Sniper') strokeColor = '#2980b9'; // Blue
      if (this.characterType === 'Mage') strokeColor = '#00cec9'; // Cyan
      if (this.characterType === 'Brawler') strokeColor = '#16a085'; // Dark Green
    }

    if (this.isHit) {
      strokeColor = '#ffffff';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ffffff';
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
    
    if (this.currentEmote === 'sit') {
      cy += 25; // Lower body when sitting so hips touch the floor
    }
    
    let shoulderY = cy + headRadius + 2;
    let hipY = cy + 30;
    
    // Main Body Color (Darker for block/shadow)
    const effectColor = this.getEffectColor();
    if (this.isDefending) strokeColor = '#7f8fa6';
    else if (effectColor !== this.color) strokeColor = effectColor;
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
      const intensity = timeRemaining > 1.0 ? 0.8 : (timeRemaining * 0.8); // Fade out at end
      
      ctx.save();
      ctx.globalAlpha = intensity;
      
      const shieldX = f === 1 ? cx + 25 : cx - 25;
      const shieldY = cy + 20;
      
      ctx.beginPath();
      // Draw a curved half-circle shield
      if (f === 1) {
        ctx.arc(shieldX, shieldY, 60, -Math.PI/2, Math.PI/2, false);
      } else {
        ctx.arc(shieldX, shieldY, 60, Math.PI/2, Math.PI*1.5, false);
      }
      
      ctx.lineWidth = 6;
      ctx.strokeStyle = effectColor;
      ctx.stroke();
      
      // Inner core
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      
      ctx.fillStyle = this.hexToRgba(effectColor, 0.2);
      ctx.fill();
      
      ctx.restore();
    }

    const torsoWidth = this.skinId === 'grandmaster' ? 17 : 14;
    const armWidth = this.skinId === 'grandmaster' ? 20 : 14;
    const legWidth = 14;

    // --- DRAW CAPE AND ORBITS (If Grandmaster) ---
    if (this.skinId === 'grandmaster') {
      ctx.save();
      const effectColor = this.getEffectColor();
      const t = this.animationTimer;
      
      const trailX = (this.velocity.x * -0.1) || (-f * 15);
      const trailY = (this.velocity.y * -0.02) || 0;

      if (this.characterType === 'Striker') {
        // Fireballs on Cape
        const drawTail = (offsetY, length, phase, width) => {
          const sway = Math.sin(t * 10 + phase) * 15;
          const expand = Math.abs(Math.sin(t * 5 + phase)) * 8;
          ctx.beginPath();
          ctx.moveTo(cx, shoulderY - 2 + offsetY);
          const bX = cx - f * length * 0.5 + trailX + sway;
          const bY = hipY + length + trailY;
          ctx.quadraticCurveTo(cx - f * (length * 0.3) + trailX, shoulderY + 10 + trailY, bX - expand, bY);
          ctx.lineTo(bX + expand + width, bY - 5);
          ctx.quadraticCurveTo(cx - f * (length * 0.2) + trailX, shoulderY + 10 + trailY, cx, shoulderY - 2 + offsetY);
          ctx.fillStyle = effectColor;
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#fbc531';
          ctx.stroke();
        };
        drawTail(0, 55, 0, 8);
        drawTail(3, 45, Math.PI, 6);

        // HUGE Fireballs on the cape
        for (let i = 0; i < 3; i++) {
          const sway = Math.sin(t * 10 + i * 2) * 20;
          const fx = cx - f * 25 + trailX + sway;
          const fy = shoulderY + 5 + i * 20 + trailY;
          
          // Outer Flame
          ctx.beginPath();
          ctx.arc(fx, fy, 12 + Math.random() * 6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 71, 87, 0.6)';
          ctx.shadowColor = '#ff4757';
          ctx.shadowBlur = 25;
          ctx.fill();
          
          // Mid Flame
          ctx.beginPath();
          ctx.arc(fx, fy - 2, 8 + Math.random() * 3, 0, Math.PI * 2);
          ctx.fillStyle = '#ffa502';
          ctx.shadowBlur = 10;
          ctx.fill();
          
          // Inner Core
          ctx.beginPath();
          ctx.arc(fx, fy - 4, 4 + Math.random() * 2, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.shadowBlur = 0;
          ctx.fill();
        }
      } else if (this.characterType === 'Assassin') {
        // Massive Morning Star (Flail)
        const mx = cx - f * 60 + Math.sin(t * 4) * 15;
        const my = cy - 20 + Math.cos(t * 5) * 15;
        
        // Heavy Chain
        ctx.beginPath();
        ctx.moveTo(cx, shoulderY);
        ctx.quadraticCurveTo(cx - f * 30, my + 20, mx, my);
        ctx.strokeStyle = '#7f8fa6';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = '#2f3640';
        ctx.lineWidth = 1.5;
        ctx.stroke(); // Chain details
        
        // Massive Spiked Ball
        ctx.beginPath();
        ctx.arc(mx, my, 18, 0, Math.PI * 2);
        ctx.fillStyle = '#1e272e';
        ctx.fill();
        // Huge Spikes
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI * 2 / 8) * i + t;
          ctx.beginPath();
          ctx.moveTo(mx + Math.cos(a) * 18, my + Math.sin(a) * 18);
          ctx.lineTo(mx + Math.cos(a) * 28, my + Math.sin(a) * 28);
          ctx.strokeStyle = '#dcdde1';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      } else if (this.characterType === 'Brawler') {
        // Massive Aura under feet
        ctx.beginPath();
        ctx.ellipse(cx, cy + 40, 50 + Math.sin(t * 8) * 8, 15, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 165, 2, 0.5)';
        ctx.shadowColor = '#ff4757';
        ctx.shadowBlur = 25;
        ctx.fill();
        
        // Inner intense ring
        ctx.beginPath();
        ctx.ellipse(cx, cy + 40, 30 + Math.sin(t * 12) * 5, 8, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff200';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Upward energy particles
        for(let i=0; i<5; i++) {
           const px = cx - 30 + Math.random() * 60;
           const py = cy + 40 - ((t * 50 + i * 20) % 60);
           ctx.fillStyle = '#fffa65';
           ctx.fillRect(px, py, 3, 8);
        }
      } else if (this.characterType === 'Tank') {
        // Massive Strong Soul above head
        const sx = cx + Math.sin(t * 2) * 15;
        const sy = shoulderY - 65 + Math.cos(t * 3) * 8;
        
        // Soul Body
        ctx.beginPath();
        ctx.moveTo(sx, sy - 25);
        ctx.quadraticCurveTo(sx + 25, sy - 10, sx + 10, sy + 25);
        ctx.quadraticCurveTo(sx, sy + 40, sx - 10, sy + 25);
        ctx.quadraticCurveTo(sx - 25, sy - 10, sx, sy - 25);
        ctx.fillStyle = 'rgba(140, 122, 230, 0.9)';
        ctx.shadowColor = '#9c88ff';
        ctx.shadowBlur = 30;
        ctx.fill();
        
        // Soul Flame details
        ctx.fillStyle = 'rgba(156, 136, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(sx, sy + 5, 15, 0, Math.PI*2);
        ctx.fill();
        
        // Angry Glowing Eyes
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.ellipse(sx - 6, sy - 8, 4, 6, Math.PI/6, 0, Math.PI * 2);
        ctx.ellipse(sx + 6, sy - 8, 4, 6, -Math.PI/6, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.characterType === 'Ninja') {
        // Massive Floating Shuriken
        const nx = cx - f * 45;
        const ny = shoulderY - 20 + Math.sin(t * 6) * 10;
        ctx.save();
        ctx.translate(nx, ny);
        ctx.rotate(t * 15); // Fast spin
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          ctx.lineTo(0, -30); // Huge blades
          ctx.lineTo(8, -8);
          ctx.rotate(Math.PI / 2);
        }
        ctx.fillStyle = '#48dbfb';
        ctx.shadowColor = '#0abde3';
        ctx.shadowBlur = 25;
        ctx.fill();
        
        // Inner hole
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI*2);
        ctx.fillStyle = '#222f3e';
        ctx.fill();
        ctx.restore();
      } else if (this.characterType === 'Sniper') {
        // Massive White Wings
        const drawWing = (side) => {
          const flap = Math.sin(t * 4) * 15;
          ctx.beginPath();
          ctx.moveTo(cx, shoulderY);
          ctx.quadraticCurveTo(cx - f * 30 * side, shoulderY - 60 - flap, cx - f * 90 * side, shoulderY - 50 - flap);
          ctx.quadraticCurveTo(cx - f * 60 * side, shoulderY - 10, cx - f * 15 * side, shoulderY + 30);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.shadowColor = '#fff';
          ctx.shadowBlur = 20;
          ctx.fill();
          
          // Feathers detail
          ctx.strokeStyle = '#dcdde1';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(cx - f * 10 * side, shoulderY - 10);
          ctx.lineTo(cx - f * 50 * side, shoulderY - 20 - flap * 0.5);
          ctx.stroke();
        };
        drawWing(1); // Back wing
        drawWing(-0.4); // Front wing offset
      } else if (this.characterType === 'Mage') {
        // Floating Weapons (Telekinesis) - Massive Glowing Swords
        for (let i = 0; i < 3; i++) {
          const mx = cx - f * 45 + Math.cos(t * 2 + i * 2) * 20;
          const my = cy - 20 + Math.sin(t * 3 + i * 2) * 20;
          ctx.save();
          ctx.translate(mx, my);
          ctx.rotate(f === 1 ? Math.PI / 3 : -Math.PI / 3);
          
          ctx.shadowColor = '#9c88ff';
          ctx.shadowBlur = 20;
          // Glowing Sword Blade
          ctx.fillStyle = '#f5f6fa';
          ctx.beginPath();
          ctx.moveTo(0, -35); // Sharp tip
          ctx.lineTo(4, -10);
          ctx.lineTo(4, 15);
          ctx.lineTo(-4, 15);
          ctx.lineTo(-4, -10);
          ctx.fill();
          
          // Crossguard and Hilt
          ctx.fillStyle = '#fbc531';
          ctx.fillRect(-8, 15, 16, 4); // Crossguard
          ctx.fillStyle = '#8c7ae6';
          ctx.fillRect(-2, 19, 4, 10); // Handle
          
          ctx.restore();
        }
      }

      ctx.restore();
    }

    // --- DRAW BACK LIMBS (Behind Body) ---
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.darkenColor(strokeColor, 40); // Back limbs are darker

    // Back Leg
    ctx.lineWidth = legWidth;
    ctx.beginPath();
    ctx.moveTo(cx, hipY);
    if (this.currentEmote === 'sit') {
      // Back leg extended straight forward
      ctx.lineTo(cx + f * 20, hipY);
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
    ctx.lineWidth = armWidth;
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
    ctx.lineWidth = torsoWidth;
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

    // Front Leg
    ctx.lineWidth = legWidth;
    ctx.beginPath();
    ctx.moveTo(cx, hipY);
    if (this.currentEmote === 'sit') {
      // Front leg extended straight forward
      ctx.lineTo(cx + f * 35, hipY);
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
    ctx.lineWidth = armWidth;
    ctx.beginPath();
    ctx.moveTo(cx, shoulderY);
    
    if (this.currentEmote === 'sit') {
      ctx.lineTo(cx + f * 15, hipY);
    } else if (this.currentEmote === 'cheer') {
      ctx.lineTo(cx + f * 15, shoulderY - 30 + Math.sin(this.animationTimer * 20 + Math.PI) * 10);
    } else if (this.currentEmote === 'taunt') {
      ctx.lineTo(cx + f * 15, hipY - 5);
    } else if (this.currentEmote === 'dance') {
      ctx.lineTo(cx + f * 25, shoulderY - 20 + Math.sin(this.animationTimer * 12) * 15);
    } else if (this.currentEmote === 'wave') {
      ctx.lineTo(cx + f * 20, shoulderY - 35 + Math.sin(this.animationTimer * 8) * 10);
    } else if (this.currentEmote === 'firework') {
      ctx.lineTo(cx + f * 5, shoulderY - 40);
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
    
    this.drawAccessories(ctx, cx, cy, f, swing, isWalking, isRunning, isJumping, shoulderY, hipY);

    ctx.shadowBlur = 0; // Reset shadow for other drawing
    ctx.restore();
  }

  drawImageSprite(ctx) {
    ctx.save();
    
    // Animation States
    const isWalking = this.velocity.x !== 0 && this.isGrounded && !this.isDefending;
    const isRunning = !this.engine && this.keys['shift'] && isWalking;
    const isIdle = this.velocity.x === 0 && this.isGrounded && !this.isDefending && !this.isAttacking && !this.isUsingSkill && !this.isChargingAttack;
    const isJumping = !this.isGrounded;

    // Bobbing and Bouncing offset
    let bob = 0;
    let tilt = 0;

    const bounceSpeed = isRunning ? 25 : 15;

    if (isRunning) {
      bob = -Math.abs(Math.sin(this.animationTimer * bounceSpeed)) * 12;
      tilt = Math.sin(this.animationTimer * bounceSpeed) * 0.2;
    } else if (isWalking) {
      bob = -Math.abs(Math.sin(this.animationTimer * bounceSpeed)) * 8;
      tilt = Math.sin(this.animationTimer * bounceSpeed) * 0.1;
    }

    if (this.isAttacking || this.isChargingAttack || this.isUsingSkill) {
      tilt = 0.3; // Lean forward when attacking
    }
    if (this.isDefending) {
      bob = 10;
    }
    
    if (this.isKnockedDown) {
      ctx.translate(this.x + this.width / 2, this.y + this.height);
      ctx.rotate(Math.PI / 2 * -this.facing);
      ctx.translate(-(this.x + this.width / 2), -(this.y + this.height));
    }
    
    if (this.isEnteringPortal) {
      const scale = 1 - this.portalEnterProgress;
      ctx.translate(this.x + this.width / 2, this.y + this.height);
      ctx.scale(scale, scale);
      ctx.translate(-(this.x + this.width / 2), -(this.y + this.height));
      ctx.globalAlpha = scale;
    }

    if (this.isBerserk) {
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ff4757';
    }

    if (this.isCounterAttacking) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.spriteImage, this.x - (this.facing * 30) - 20, this.y - 20, this.width + 40, this.height + 40);
      ctx.globalAlpha = 0.2;
      ctx.drawImage(this.spriteImage, this.x - (this.facing * 60) - 20, this.y - 20, this.width + 40, this.height + 40);
      ctx.globalAlpha = 1.0;
    }

    let cx = this.x + this.width / 2;
    let cy = this.y + this.height; // pivot at feet
    
    ctx.translate(cx, cy);
    if (this.facing === -1) {
      ctx.scale(-1, 1);
    }
    ctx.rotate(tilt);
    ctx.translate(0, bob);
    
    // Scale image
    const drawHeight = 150;
    const drawWidth = drawHeight * (this.spriteImage.width / this.spriteImage.height);
    
    // Create an off-canvas to apply the skin color tint
    const offCanvas = document.createElement('canvas');
    offCanvas.width = this.spriteImage.width || 146;
    offCanvas.height = this.spriteImage.height || 245;
    const offCtx = offCanvas.getContext('2d');
    
    // Draw the original image
    offCtx.drawImage(this.spriteImage, 0, 0, offCanvas.width, offCanvas.height);
    
    // Tint with skin color only if it's not default
    if (this.skinId && this.skinId !== 'default') {
      offCtx.globalCompositeOperation = 'source-atop';
      offCtx.fillStyle = this.color;
      offCtx.globalAlpha = 0.5; // Apply color overlay
      offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
    }
    
    ctx.drawImage(offCanvas, -drawWidth / 2, -drawHeight + 10, drawWidth, drawHeight);

    // Shield/Charge Aura
    if (this.isChargingAttack) {
      const effectColor = this.getEffectColor();
      const chargeRatio = Math.min(this.chargeTimer / 0.3, 1);
      ctx.fillStyle = this.hexToRgba(effectColor, chargeRatio * 0.4);
      ctx.beginPath();
      ctx.arc(0, -50, 60 + Math.random() * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Parry Shield
    if (this.isCounterStance) {
      const effectColor = this.getEffectColor();
      const timeRemaining = Math.max(0, 5.0 - this.counterStanceTimer);
      const intensity = timeRemaining > 1.0 ? 0.8 : (timeRemaining * 0.8);
      
      ctx.globalAlpha = intensity;
      ctx.beginPath();
      ctx.arc(25, -50, 70, -Math.PI/2, Math.PI/2, false);
      ctx.lineWidth = 6;
      ctx.strokeStyle = effectColor;
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = this.hexToRgba(effectColor, 0.2);
      ctx.fill();
    }

    ctx.restore();
  }

  drawAccessories(ctx, cx, cy, f, swing, isWalking, isRunning, isJumping, shoulderY, hipY) {
    ctx.save();
    let headY = cy; 
    let bob = 0;
    if (isWalking) bob = Math.sin(Date.now() / 100) * 3;
    if (isJumping) bob = -5;
    if (this.isDefending) bob = 5;
    headY += bob;
    
    // Calculate hand positions for weapons
    const frontHand = this.getFrontHandPos(cx, shoulderY, hipY, f, swing, isWalking, isRunning, isJumping);
    const backHand = this.getBackHandPos(cx, shoulderY, hipY, f, swing, isWalking, isRunning, isJumping);

    // --- BASE CLASS PROPS (Applied to all skins) ---
    if (this.characterType === 'Striker') {
      // Orange Headband
      ctx.fillStyle = '#d35400';
      ctx.fillRect(cx - 16, headY - 8, 32, 6);
      ctx.strokeStyle = '#d35400'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cx - f*16, headY - 5); ctx.lineTo(cx - f*25, headY + 5 + bob); ctx.stroke();
      // Nunchucks in front hand
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(frontHand.x, frontHand.y); ctx.lineTo(frontHand.x + f*10, frontHand.y + 15); ctx.stroke();
      ctx.fillStyle = '#e67e22'; 
      ctx.fillRect(frontHand.x - 3, frontHand.y - 12, 6, 12);
      ctx.fillRect(frontHand.x + f*10 - 3, frontHand.y + 15, 6, 12);
    } else if (this.characterType === 'Assassin') {
      // Red Hood
      ctx.fillStyle = '#c0392b';
      ctx.beginPath(); ctx.arc(cx, headY, 17, Math.PI, 0); 
      ctx.lineTo(cx + f*10, headY + 15); ctx.lineTo(cx - f*12, headY + 15); ctx.fill();
      // Red Cape
      ctx.fillStyle = '#922b21';
      ctx.beginPath(); ctx.moveTo(cx - f*10, shoulderY);
      ctx.quadraticCurveTo(cx - f*30, hipY, cx - f*45, hipY + 15 + bob);
      ctx.lineTo(cx - f*20, hipY + 5); ctx.fill();
      // Dual Daggers
      ctx.fillStyle = '#bdc3c7';
      ctx.beginPath(); ctx.moveTo(frontHand.x - f*4, frontHand.y + 4); ctx.lineTo(frontHand.x + f*18, frontHand.y - 12); ctx.lineTo(frontHand.x + f*4, frontHand.y - 4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(backHand.x - f*4, backHand.y + 4); ctx.lineTo(backHand.x + f*18, backHand.y - 12); ctx.lineTo(backHand.x + f*4, backHand.y - 4); ctx.fill();
    } else if (this.characterType === 'Tank') {
      // Shield (Back Hand)
      ctx.fillStyle = '#7f8c8d';
      ctx.beginPath(); ctx.arc(backHand.x, backHand.y, 22, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#2c3e50'; ctx.beginPath(); ctx.arc(backHand.x, backHand.y, 16, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(backHand.x, backHand.y, 6, 0, Math.PI*2); ctx.fill();
      // Spiked Mace (Front Hand)
      ctx.strokeStyle = '#95a5a6'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(frontHand.x, frontHand.y + 10); ctx.lineTo(frontHand.x + f*20, frontHand.y - 25); ctx.stroke();
      ctx.fillStyle = '#34495e';
      ctx.beginPath(); ctx.arc(frontHand.x + f*20, frontHand.y - 25, 12, 0, Math.PI*2); ctx.fill();
    } else if (this.characterType === 'Ninja') {
      // Green Tactical Gear / Camo
      ctx.fillStyle = '#1e8449';
      ctx.fillRect(cx - 14, shoulderY + 5, 28, 22); // Vest
      ctx.fillStyle = '#27ae60'; ctx.beginPath(); ctx.arc(cx, headY, 16, Math.PI, 0); ctx.fill(); // Mask top
      // Gun/Sniper (Front Hand)
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(frontHand.x + (f==1?0:-35), frontHand.y - 6, 35, 8); // Barrel
      ctx.fillRect(frontHand.x + (f==1?-6:0), frontHand.y, 8, 14); // Grip
      ctx.fillStyle = '#7f8c8d'; ctx.fillRect(frontHand.x + (f==1?5:-15), frontHand.y - 10, 10, 4); // Scope
    } else if (this.characterType === 'Sniper') {
      // Blue Cape
      ctx.fillStyle = '#2980b9';
      ctx.beginPath(); ctx.moveTo(cx - f*10, shoulderY);
      ctx.quadraticCurveTo(cx - f*25, hipY, cx - f*35, hipY + 25 + bob);
      ctx.lineTo(cx - f*15, hipY + 15); ctx.fill();
      // Quiver
      ctx.fillStyle = '#8e44ad';
      ctx.save(); ctx.translate(cx - f*8, shoulderY+12); ctx.rotate(f*Math.PI/5);
      ctx.fillRect(-6, -18, 12, 36);
      ctx.fillStyle = '#ecf0f1'; ctx.fillRect(-4, -25, 2, 10); ctx.fillRect(2, -22, 2, 10); // Arrows
      ctx.restore();
      // Bow (Front Hand)
      ctx.strokeStyle = '#d35400'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(frontHand.x + f*12, frontHand.y, 28, Math.PI/2, Math.PI*1.5, f === -1); ctx.stroke();
      ctx.strokeStyle = '#bdc3c7'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(frontHand.x + f*12, frontHand.y - 28); ctx.lineTo(frontHand.x + f*12, frontHand.y + 28); ctx.stroke();
    } else if (this.characterType === 'Mage') {
      // Green Cloak
      ctx.fillStyle = '#00b894';
      ctx.beginPath(); ctx.arc(cx, headY, 17, Math.PI, 0); ctx.lineTo(cx+f*12, headY+16); ctx.lineTo(cx-f*12, headY+16); ctx.fill();
      ctx.fillStyle = 'rgba(0, 184, 148, 0.85)';
      ctx.beginPath(); ctx.moveTo(cx-f*8, shoulderY); ctx.lineTo(cx-f*30, hipY+35+bob); ctx.lineTo(cx+f*15, hipY+25+bob); ctx.fill();
      // Magic Staff (Front Hand)
      ctx.strokeStyle = '#8e44ad'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(frontHand.x - f*12, frontHand.y + 25); ctx.lineTo(frontHand.x + f*18, frontHand.y - 35); ctx.stroke();
      ctx.fillStyle = '#55efc4';
      ctx.shadowColor = '#55efc4'; ctx.shadowBlur = 15;
      ctx.beginPath(); ctx.arc(frontHand.x + f*18, frontHand.y - 35, 10, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
    } else if (this.characterType === 'Brawler') {
      // Orc Bulky Green Body
      ctx.fillStyle = '#27ae60';
      ctx.beginPath(); ctx.arc(cx, shoulderY + 5, 20, 0, Math.PI*2); ctx.fill();
      // Fur Shoulders
      ctx.fillStyle = '#8d6e63';
      ctx.beginPath(); ctx.arc(cx, shoulderY - 4, 16, 0, Math.PI*2); ctx.fill();
      // Dual Axes
      ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(frontHand.x, frontHand.y+15); ctx.lineTo(frontHand.x, frontHand.y-25); ctx.stroke();
      ctx.fillStyle = '#bdc3c7';
      ctx.beginPath(); ctx.moveTo(frontHand.x-2, frontHand.y-15); ctx.lineTo(frontHand.x+f*18, frontHand.y-22); ctx.lineTo(frontHand.x+f*18, frontHand.y-2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(backHand.x, backHand.y+15); ctx.lineTo(backHand.x, backHand.y-25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(backHand.x-2, backHand.y-15); ctx.lineTo(backHand.x+f*18, backHand.y-22); ctx.lineTo(backHand.x+f*18, backHand.y-2); ctx.fill();
    }

    // --- SKIN SPECIFIC OVERRIDES ---
    if (this.skinId && this.skinId !== 'default') {
      if (this.characterType === 'Striker' && this.skinId === 'golden') {
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.moveTo(cx - 15, headY - 20); ctx.lineTo(cx - 10, headY - 35); ctx.lineTo(cx, headY - 20); ctx.lineTo(cx + 10, headY - 35); ctx.lineTo(cx + 15, headY - 20); ctx.fill();
      } else if (this.characterType === 'Striker' && this.skinId === 'dark') {
        ctx.fillStyle = '#ff4757'; ctx.beginPath(); ctx.arc(cx + f * 5, headY - 5, 3, 0, Math.PI * 2); ctx.fill();
      } else if (this.characterType === 'Assassin' && this.skinId === 'crimson') {
        ctx.strokeStyle = '#ff4757'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(cx - f * 10, headY + 10); ctx.quadraticCurveTo(cx - f * 30, headY + 5 + Math.sin(Date.now()/150)*10, cx - f * 40, headY + 20); ctx.stroke();
      } else if (this.characterType === 'Assassin' && this.skinId === 'shadow') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        for (let i=0; i<3; i++) {
          const px = cx + Math.cos(Date.now()/300 + i*2) * 20; const py = headY + Math.sin(Date.now()/300 + i*2) * 20;
          ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI*2); ctx.fill();
        }
      } else if (this.characterType === 'Brawler' && this.skinId === 'hulk') {
        ctx.fillStyle = '#8e44ad'; ctx.fillRect(cx - 15, headY + 30, 30, 20); 
      } else if (this.characterType === 'Brawler' && this.skinId === 'cyber') {
        ctx.fillStyle = '#1e90ff'; ctx.fillRect(cx + f * 5, headY - 10, 15 * f, 6);
      } else if (this.characterType === 'Tank' && this.skinId === 'obsidian') {
        ctx.fillStyle = '#2f3640'; ctx.beginPath(); ctx.moveTo(cx - f * 15, headY + 20); ctx.lineTo(cx - f * 30, headY + 10); ctx.lineTo(cx - f * 15, headY + 40); ctx.fill();
      } else if (this.characterType === 'Tank' && this.skinId === 'magma') {
        ctx.fillStyle = '#ff6b81'; ctx.shadowColor = '#ff4757'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(cx + f * 10, headY + 30, 8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      } else if (this.characterType === 'Ninja' && this.skinId === 'ghost') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; ctx.beginPath(); ctx.arc(cx - f * 20, headY + 20 + Math.sin(Date.now()/200)*10, 5, 0, Math.PI*2); ctx.fill();
      } else if (this.characterType === 'Ninja' && this.skinId === 'blood') {
        ctx.strokeStyle = '#c23616'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - f * 10, headY + 10); ctx.lineTo(cx - f * 30, headY + 40); ctx.moveTo(cx - f * 15, headY + 10); ctx.lineTo(cx - f * 10, headY + 45); ctx.stroke();
      } else if (this.characterType === 'Sniper' && this.skinId === 'specops') {
        ctx.fillStyle = '#2ed573'; ctx.beginPath(); ctx.arc(cx + f * 10, headY - 5, 4, 0, Math.PI*2); ctx.arc(cx + f * 18, headY - 5, 4, 0, Math.PI*2); ctx.fill();
      } else if (this.characterType === 'Sniper' && this.skinId === 'desert') {
        ctx.fillStyle = '#d1ccc0'; ctx.beginPath(); ctx.arc(cx, headY - 10, 18, Math.PI, 0); ctx.fill();
      } else if (this.characterType === 'Mage' && this.skinId === 'archmage') {
        ctx.fillStyle = '#3742fa'; ctx.beginPath(); ctx.moveTo(cx - 20, headY - 15); ctx.lineTo(cx + 20, headY - 15); ctx.lineTo(cx + 5, headY - 45); ctx.lineTo(cx - 5, headY - 45); ctx.fill();
      } else if (this.characterType === 'Mage' && this.skinId === 'darkmage') {
        ctx.fillStyle = '#2f3542'; ctx.shadowColor = '#57606f'; ctx.shadowBlur = 10;
        const cy_orb = headY - 30 + Math.sin(Date.now()/200)*5;
        ctx.beginPath(); ctx.moveTo(cx, cy_orb - 10); ctx.lineTo(cx + 8, cy_orb); ctx.lineTo(cx, cy_orb + 10); ctx.lineTo(cx - 8, cy_orb); ctx.fill(); ctx.shadowBlur = 0;
      } else if (this.skinId === 'champion') {
        // Grand Flowing Cape
        const capeColor1 = '#f1c40f'; // Gold
        const capeColor2 = '#e67e22'; // Darker Gold
        ctx.fillStyle = capeColor1;
        ctx.beginPath();
        ctx.moveTo(cx - f * 10, shoulderY);
        
        // Flowing cape logic using sine waves for wind effect
        const time = Date.now() / 200;
        const wave1 = Math.sin(time) * 15;
        const wave2 = Math.cos(time * 1.5) * 20;
        const wave3 = Math.sin(time * 0.8) * 25;
        
        const capeLength = 100;
        
        ctx.quadraticCurveTo(cx - f * 30 + wave1, shoulderY + 40, cx - f * 50 + wave2, shoulderY + capeLength);
        ctx.lineTo(cx - f * 90 + wave3, shoulderY + capeLength - 10);
        ctx.quadraticCurveTo(cx - f * 50 + wave1, shoulderY + 50, cx - f * 5, shoulderY);
        ctx.fill();
        
        // Inner cape
        ctx.fillStyle = capeColor2;
        ctx.beginPath();
        ctx.moveTo(cx - f * 5, shoulderY);
        ctx.quadraticCurveTo(cx - f * 20 + wave1, shoulderY + 40, cx - f * 35 + wave2, shoulderY + capeLength - 5);
        ctx.lineTo(cx - f * 65 + wave3, shoulderY + capeLength - 15);
        ctx.quadraticCurveTo(cx - f * 30 + wave1, shoulderY + 50, cx, shoulderY);
        ctx.fill();

        // Glowing Crown with Character Specific Color
        let crownColor = '#f1c40f'; // Default Gold
        switch (this.characterType) {
          case 'Striker': crownColor = '#ff4757'; break; // Red
          case 'Brawler': crownColor = '#1e90ff'; break; // Blue
          case 'Assassin': crownColor = '#2ed573'; break; // Green
          case 'Tank': crownColor = '#ffa502'; break; // Orange
          case 'Ninja': crownColor = '#9c88ff'; break; // Purple
          case 'Sniper': crownColor = '#00cec9'; break; // Cyan
          case 'Mage': crownColor = '#ff6b81'; break; // Pink
        }
        
        ctx.shadowColor = crownColor;
        ctx.shadowBlur = 15;
        ctx.fillStyle = crownColor;
        ctx.beginPath();
        ctx.moveTo(cx - 15, headY - 15);
        ctx.lineTo(cx - 20, headY - 35);
        ctx.lineTo(cx - 5, headY - 20);
        ctx.lineTo(cx, headY - 45);
        ctx.lineTo(cx + 5, headY - 20);
        ctx.lineTo(cx + 20, headY - 35);
        ctx.lineTo(cx + 15, headY - 15);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (this.skinId === 'grandmaster') {
        // Neck Choker
        ctx.beginPath();
        ctx.ellipse(cx, shoulderY - 6, 8, 3, 0, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fbc531'; // Gold choker
        ctx.stroke();

        // Super cool Grandmaster Halo/Crown
        const effectColor = this.getEffectColor();
        const t = Date.now() / 200;
        
        ctx.save();
        ctx.shadowColor = effectColor;
        ctx.shadowBlur = 15;
        
        // A floating halo ring above the head
        ctx.beginPath();
        ctx.ellipse(cx, headY - 25 + Math.sin(t) * 3, 20, 6, 0, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fbc531'; // Gold halo
        ctx.stroke();
        
        // Glowing gem in the center
        ctx.fillStyle = effectColor;
        ctx.beginPath();
        ctx.arc(cx, headY - 25 + Math.sin(t) * 3, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Floating diamond shards orbiting/above it
        ctx.fillStyle = '#ffffff';
        for (let i = -1; i <= 1; i += 2) {
          const sx = cx + i * 15;
          const sy = headY - 35 + Math.cos(t + i) * 4;
          ctx.beginPath();
          ctx.moveTo(sx, sy - 5); ctx.lineTo(sx + 3, sy); ctx.lineTo(sx, sy + 5); ctx.lineTo(sx - 3, sy);
          ctx.fill();
        }
        
        ctx.restore();
      }
    }

    ctx.restore();
  }



  getFrontHandPos(cx, shoulderY, hipY, f, swing, isWalking, isRunning, isJumping) {
    if (this.currentEmote === 'sit') return {x: cx + f*15, y: hipY};
    if (this.currentEmote === 'cheer') return {x: cx + f*15, y: shoulderY - 30 + Math.sin(this.animationTimer * 20 + Math.PI) * 10};
    if (this.currentEmote === 'taunt') return {x: cx + f*15, y: hipY - 5};
    if (this.currentEmote === 'dance') return {x: cx + f*25, y: shoulderY - 20 + Math.sin(this.animationTimer * 12) * 15};
    if (this.currentEmote === 'wave') return {x: cx + f*20, y: shoulderY - 35 + Math.sin(this.animationTimer * 8) * 10};
    if (this.currentEmote === 'firework') return {x: cx + f*5, y: shoulderY - 40};
    if (this.isReadingQuest) return {x: cx + f*25, y: shoulderY + 15};
    if (this.isDiveKicking) return {x: cx - f*10, y: shoulderY - 30};
    if (this.isAttacking) {
      const reach = (this.attackType === 'heavy' ? 50 : 40) * Math.sin(this.attackProgress * Math.PI);
      return {x: cx + f*reach, y: shoulderY - 5};
    }
    if (this.isChargingAttack) return {x: cx - f*25, y: shoulderY + 5};
    if (this.isDefending) return {x: cx + f*20, y: shoulderY - 15};
    if (this.isUsingSkill && this.characterType === 'Striker') return {x: cx + f*30, y: shoulderY - 10};
    if (isWalking) {
      if (isRunning) return {x: cx - f * swing * 25, y: shoulderY + (swing < 0 ? 0 : 20)};
      return {x: cx - f * swing * 20, y: shoulderY + 25};
    }
    if (isJumping) return {x: cx + f*15, y: shoulderY - 20};
    return {x: cx - f*5, y: shoulderY + 25};
  }

  getBackHandPos(cx, shoulderY, hipY, f, swing, isWalking, isRunning, isJumping) {
    if (this.currentEmote === 'sit') return {x: cx, y: hipY};
    if (this.currentEmote === 'cheer') return {x: cx - f*15, y: shoulderY - 30 + Math.sin(this.animationTimer * 20) * 10};
    if (this.currentEmote === 'taunt') return {x: cx - f*20, y: hipY};
    if (this.currentEmote === 'dance') return {x: cx - f*25, y: shoulderY - 20 + Math.sin(this.animationTimer * 12 + Math.PI) * 15};
    if (this.currentEmote === 'wave') return {x: cx - f*10, y: shoulderY + 15};
    if (this.currentEmote === 'firework') return {x: cx - f*10, y: shoulderY + 10};
    if (this.isDiveKicking) return {x: cx - f*20, y: shoulderY - 20};
    if (this.isReadingQuest) return {x: cx + f*20, y: shoulderY + 10};
    if (this.isDefending) return {x: cx + f*5, y: shoulderY - 20};
    if (this.isChargingAttack) return {x: cx - f*20, y: shoulderY + 15};
    if (isWalking) {
      if (isRunning) return {x: cx + f * swing * 25, y: shoulderY + (swing > 0 ? 0 : 20)};
      return {x: cx + f * swing * 20, y: shoulderY + 25};
    }
    if (isJumping) return {x: cx - f*15, y: shoulderY - 15};
    if (this.isUsingSkill && this.characterType === 'Striker') return {x: cx - f*15, y: shoulderY - 10};
    return {x: cx + f*10, y: shoulderY + 25};
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

    import('./AudioManager.js').then(({ audioManager }) => {
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
      
      import('./AudioManager.js').then(({ audioManager }) => {
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
