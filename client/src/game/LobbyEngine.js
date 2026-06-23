import { Player } from './Player';

export class LobbyEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    // Floors
    this.floors = {
      0: 1500, // B1
      1: 426,  // 1F
      2: -150  // 2F
    };
    this.floorY = this.floors[1]; // default
    this.zoom = 0.75; // Zoom out the lobby for a better field of view
    this.cameraX = 0;
    this.cameraY = 0;
    this.currentFloor = 1;
    this.mapWidth = 2048; // Expanded lobby width

    // Local player (will be initialized by GameCanvas)
    this.localPlayer = null;

    // Remote players map: socketId -> Player
    this.remotePlayers = new Map();
    
    // Leaderboard Data
    this.leaderboardData = [];
    
    // Interactive objects (Shifted +1024 to the right for the portal zone)
    this.portals = [
      { id: 'elevator_up', x: 1124, y: this.floors[1], text: 'ELEVATOR (Up)', color: '#8c7ae6', floor: 1 },
      { id: 'elevator_down', x: 1124, y: this.floors[2], text: 'ELEVATOR (Down)', color: '#8c7ae6', floor: 2 },
      { id: 'stairs_down', x: 1944, y: this.floors[1], text: 'STAIRS (Down)', color: '#7f8fa6', floor: 1 },
      { id: 'stairs_up', x: 1944, y: this.floors[0], text: 'STAIRS (Up)', color: '#7f8fa6', floor: 0 },
      { id: 'quests', x: 1284, y: this.floors[1], text: 'QUEST BOARD', color: '#ff7675', floor: 1 },
      { id: 'training', x: 1444, y: this.floors[1], text: 'TRAINING', color: '#ff9f43', floor: 1 },
      { id: 'tutorial', x: 1604, y: this.floors[1], text: 'HOW TO PLAY', color: '#00d2d3', floor: 1 },
      { id: 'gacha', x: 1764, y: this.floors[1], text: 'GACHA', color: '#fd79a8', floor: 1 },
      { id: 'shop', x: 1204, y: this.floors[0], text: 'SECRET SHOP', color: '#fbc531', floor: 0 },
      { id: 'skin_shop', x: 1574, y: this.floors[0], text: '服裝商店 (SKIN SHOP)', color: '#e056fd', floor: 0 },
      { id: 'discord', x: 250, y: this.floors[1], text: '官方 DISCORD 社群', color: '#5865F2', floor: 1 }
    ];
    
    // Arcade Cabinets (Shifted +1024 to the right)
    this.arcadeCabinets = [
      { id: 'Slot1', x: 1224, y: this.floors[2], color: '#fffa65', name: 'CABINET 1' },
      { id: 'Slot2', x: 1374, y: this.floors[2], color: '#ff9f43', name: 'CABINET 2' },
      { id: 'Slot3', x: 1674, y: this.floors[2], color: '#ff7675', name: 'CABINET 3' },
      { id: 'Slot4', x: 1824, y: this.floors[2], color: '#00d2d3', name: 'CABINET 4' }
    ];

    // Server state for arcades
    this.arcadeSlotsData = { 'Slot1': 0, 'Slot2': 0, 'Slot3': 0, 'Slot4': 0 };
    
    // Public rooms received from server
    this.publicRooms = {};
    
    this.lastTime = 0;
    this.isRunning = false;

    // Callback when player triggers an interaction
    this.onInteract = null;

    // Create hidden video element for the Big TV in the Chill Zone
    this.gameplayVideo = document.createElement('video');
    this.gameplayVideo.src = '/gameplay.mp4'; // Use local file from client/public/
    this.gameplayVideo.crossOrigin = 'anonymous';
    this.gameplayVideo.loop = true;
    this.gameplayVideo.muted = true; // Must be muted to autoplay
    this.gameplayVideo.playsInline = true;
    this.gameplayVideo.play().catch(e => console.log('Video autoplay prevented', e));
  }

  setLocalPlayer(player) {
    this.localPlayer = player;
  }

  applyLobbyState(lobbyPlayers, currentSocketId) {
    // lobbyPlayers is an object: { socketId: { x, y, facing, color, characterType } }
    const currentIds = new Set(Object.keys(lobbyPlayers));
    
    // Remove disconnected players
    for (const id of this.remotePlayers.keys()) {
      if (!currentIds.has(id)) {
        this.remotePlayers.delete(id);
      }
    }

    // Update or add remote players
    for (const [id, data] of Object.entries(lobbyPlayers)) {
      if (id === currentSocketId) continue; // Skip local player
      
      if (!this.remotePlayers.has(id)) {
        // Create new remote player representation
        const newPlayer = new Player(data.x, data.y, data.color, {}, data.facing, data.characterType, true, 1, undefined, data.skinId);
        this.remotePlayers.set(id, newPlayer);
      }
      
      const rp = this.remotePlayers.get(id);
      rp.x = data.x;
      rp.y = data.y;
      rp.facing = data.facing;
      rp.color = data.color;
      rp.skinId = data.skinId;
      rp.username = data.username;
      rp.trophies = data.trophies || 0;
      if (rp.characterType !== data.characterType) {
        rp.characterType = data.characterType;
      }
    }
  }

  setLeaderboardData(data) {
    this.leaderboardData = data;
  }

  setArcadeSlots(slots) {
    this.arcadeSlotsData = slots;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    if (this.localPlayer) {
      this.localPlayer.isEnteringPortal = false;
      this.localPlayer.portalEnterProgress = 0;
      this.localPlayer.portalCallback = null;
      this.localPlayer.isActive = true;
      if (this.localPlayer.x < 0) this.localPlayer.x = 0;
      if (this.localPlayer.x > 1024) this.localPlayer.x = 100;
      if (isNaN(this.localPlayer.x) || isNaN(this.localPlayer.y)) {
         this.localPlayer.x = 100;
         this.localPlayer.y = 100;
      }
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  stop() {
    this.isRunning = false;
  }

  loop(timestamp) {
    if (!this.isRunning) return;
    
    const deltaTime = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;
    
    this.update(deltaTime);
    this.draw();
    
    requestAnimationFrame((t) => this.loop(t));
  }

  update(deltaTime) {
    if (this.localPlayer) {
      // Local physics (no attacking, just movement)
      this.localPlayer.isAttacking = false;
      this.localPlayer.isUsingSkill = false;
      this.localPlayer.isDefending = false;
      
      const currentFloorY = this.floors[this.currentFloor];
      
      this.localPlayer.update(deltaTime, this.mapWidth, currentFloorY);
      
      const targetCameraY = this.currentFloor === 2 ? 576 : (this.currentFloor === 0 ? -1074 : 0);
      this.cameraY += (targetCameraY - this.cameraY) * 5 * deltaTime;
      
      const viewWidth = this.canvas.width / this.zoom;
      let targetCameraX = this.localPlayer.x - viewWidth / 2;
      if (targetCameraX < 0) targetCameraX = 0;
      if (targetCameraX > this.mapWidth - viewWidth) targetCameraX = this.mapWidth - viewWidth;
      this.cameraX += (targetCameraX - this.cameraX) * 5 * deltaTime;
      
      // Check interactions
      if (this.localPlayer.keys['enter']) {
        // Prevent spamming
        this.localPlayer.keys['enter'] = false;
        
        // If already entering portal, do nothing
        if (this.localPlayer.isEnteringPortal) return;
        
        let interacted = false;
        // Check portals
        for (const p of this.portals) {
          if (p.floor === this.currentFloor && Math.abs(this.localPlayer.x - p.x) < 50) {
            if (p.id === 'elevator_up') {
              this.localPlayer.startPortalAnimation(() => {
                this.currentFloor = 2;
                this.localPlayer.y = this.floors[2] - this.localPlayer.height;
                this.localPlayer.velocity.y = 0;
              });
            } else if (p.id === 'elevator_down') {
              this.localPlayer.startPortalAnimation(() => {
                this.currentFloor = 1;
                this.localPlayer.y = this.floors[1] - this.localPlayer.height;
                this.localPlayer.velocity.y = 0;
              });
            } else if (p.id === 'stairs_down') {
              this.localPlayer.startPortalAnimation(() => {
                this.currentFloor = 0;
                this.localPlayer.y = this.floors[0] - this.localPlayer.height;
                this.localPlayer.velocity.y = 0;
              });
            } else if (p.id === 'stairs_up') {
              this.localPlayer.startPortalAnimation(() => {
                this.currentFloor = 1;
                this.localPlayer.y = this.floors[1] - this.localPlayer.height;
                this.localPlayer.velocity.y = 0;
              });
            } else if (p.id === 'quests') {
              this.localPlayer.isReadingQuest = true;
              if (this.onInteract) this.onInteract(p.id);
            } else if (p.id === 'discord') {
              // Trigger immediately to bypass browser popup blockers
              if (this.onInteract) this.onInteract(p.id);
            } else {
              this.localPlayer.startPortalAnimation(() => {
                if (this.onInteract) this.onInteract(p.id);
              });
            }
            interacted = true;
            break;
          }
        }
        
        if (!interacted && this.currentFloor === 2) {
          for (const cab of this.arcadeCabinets) {
            if (Math.abs(this.localPlayer.x - cab.x) < 50) {
              this.localPlayer.startPortalAnimation(() => {
                if (this.onInteract) this.onInteract('join_arcade', cab.id);
              });
              interacted = true;
              break;
            }
          }
        }
      }
    }
  }

  draw() {
    // Clear canvas
    this.ctx.fillStyle = '#1e272e';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.ctx.save();
    this.ctx.scale(this.zoom, this.zoom);
    
    // We adjust cameraY slightly so the floor remains near the bottom even when zoomed out
    const adjustedCameraY = this.cameraY + (this.canvas.height / this.zoom - this.canvas.height) * 0.5;
    this.ctx.translate(-this.cameraX, adjustedCameraY);

    // Draw lobby floor B1 (Basement) - Eerie path
    this.drawEerieBasement();

    // Draw lobby floor 1
    this.ctx.fillStyle = '#485460';
    this.ctx.fillRect(0, this.floors[1], this.mapWidth, 150);
    
    // Draw Chill Zone Decor (Floor 1 left side)
    this.drawChillZone(0, this.floors[1]);

    // Draw Leaderboard Screens (Floor 1 wall)
    this.drawLeaderboards(this.floors[1]);

    // Draw lobby floor 2
    this.ctx.fillStyle = '#485460';
    this.ctx.fillRect(0, this.floors[2], this.mapWidth, 150);
    
    // Draw Boss Battle Teaser (Floor 2 left side)
    this.drawBossTeaser(100, this.floors[2]);

    // Draw decorations
    this.drawDecorations();

    // Draw static portals
    for (const p of this.portals) {
      if (p.id === 'quests') {
        this.drawFloatingBook(p.x, p.y, p.text, p.color);
      } else if (p.id === 'gacha') {
        this.drawGachaMachine(p.x, p.y, p.text, p.color);
      } else if (p.id === 'stairs_down' || p.id === 'stairs_up') {
        this.drawStairs(p.x, p.y, p.text, p.color, p.id === 'stairs_up' ? -1 : 1);
      } else if (p.id === 'shop') {
        this.drawBigStorefront(p.x, p.y, p.text, p.color);
      } else if (p.id === 'skin_shop') {
        this.drawClothingStorefront(p.x, p.y, p.text, p.color);
      } else if (p.id === 'discord') {
        // Draw a Discord logo billboard
        this.ctx.fillStyle = p.color;
        this.ctx.fillRect(p.x - 40, p.y - 120, 80, 60);
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 24px Inter';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("💬", p.x, p.y - 80);
        this.drawPortal(p.x, p.y, p.text, p.color);
      } else {
        this.drawPortal(p.x, p.y, p.text, p.color);
      }
    }
    
    // Draw Arcade Cabinets
    for (const cab of this.arcadeCabinets) {
      const roomFloorY = this.floors[2];
      const count = this.arcadeSlotsData[cab.id] || 0;
      
      // Cabinet body
      this.ctx.fillStyle = cab.color;
      this.ctx.fillRect(cab.x - 30, roomFloorY - 100, 60, 100);
      
      // Cabinet screen
      this.ctx.fillStyle = '#2d3436';
      this.ctx.fillRect(cab.x - 20, roomFloorY - 90, 40, 40);
      
      // Text
      this.ctx.fillStyle = '#fff';
      this.ctx.font = 'bold 16px Inter';
      this.ctx.textAlign = 'center';
      
      if (count >= 2) {
        this.ctx.fillStyle = '#ff4757';
        this.ctx.fillText('FULL', cab.x, roomFloorY - 110);
      } else {
        this.ctx.fillStyle = '#2ed573';
        this.ctx.fillText(`${count}/2`, cab.x, roomFloorY - 110);
      }
      
      this.ctx.fillStyle = '#fff';
      this.ctx.font = '12px Inter';
      this.ctx.fillText(cab.name, cab.x, roomFloorY - 130);
    }

    // Draw remote players
    for (const rp of this.remotePlayers.values()) {
      // HACK: Hide ghost players (caused by hot-reloads) that are stuck floating at the exact spawn point
      if (Math.abs(rp.x - 100) < 1 && Math.abs(rp.y - 100) < 1) continue;
      
      rp.draw(this.ctx);
    }

    // Draw local player
    if (this.localPlayer) {
      this.localPlayer.draw(this.ctx);
      
      // Draw interaction prompts
      let nearObj = null;
      for (const p of this.portals) {
        if (p.floor === this.currentFloor && Math.abs(this.localPlayer.x - p.x) < 50) nearObj = p.text;
      }
      
      if (!nearObj && this.currentFloor === 2) {
        for (const cab of this.arcadeCabinets) {
          if (Math.abs(this.localPlayer.x - cab.x) < 50) nearObj = `Play Arcade ${cab.id.replace('Slot', '')}`;
        }
      }
      
      if (nearObj) {
        this.ctx.fillStyle = 'white';
        this.ctx.font = '900 18px "Arial Black", sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = 'black';
        
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const actionText = isTouch ? 'OK' : 'ENTER';
        
        this.ctx.strokeText(`Press ${actionText} to ${nearObj}`, this.localPlayer.x + this.localPlayer.width/2, this.localPlayer.y - 30);
        this.ctx.fillText(`Press ${actionText} to ${nearObj}`, this.localPlayer.x + this.localPlayer.width/2, this.localPlayer.y - 30);
      }
    }
    
    this.ctx.restore();
  }

  drawChillZone(startX, floorY) {
    this.ctx.save();
    
    // Draw an elevated wooden deck for the lounge area
    const deckWidth = 900;
    const deckX = startX + 50;
    this.ctx.fillStyle = '#5c3a21'; // Dark wood
    this.ctx.fillRect(deckX, floorY, deckWidth, 20);
    this.ctx.fillStyle = '#8b5a2b'; // Lighter wood planks
    for (let i = 0; i < deckWidth; i += 40) {
      this.ctx.fillRect(deckX + i, floorY, 38, 20);
    }

    // A large comfy circular rug in the middle
    this.ctx.fillStyle = '#a29bfe'; // Soft purple rug
    this.ctx.beginPath();
    this.ctx.ellipse(deckX + deckWidth / 2, floorY + 10, 250, 40, 0, 0, Math.PI * 2);
    this.ctx.fill();
    // Inner pattern on the rug
    this.ctx.fillStyle = '#6c5ce7';
    this.ctx.beginPath();
    this.ctx.ellipse(deckX + deckWidth / 2, floorY + 10, 200, 30, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Large Neon Sign on the back wall (Moved higher to not overlap with TV)
    this.ctx.font = 'bold 48px "Arial Black", sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#00d2d3';
    this.ctx.shadowColor = '#00d2d3';
    this.ctx.shadowBlur = 20;
    this.ctx.fillText("FIGHTER'S LOUNGE", deckX + deckWidth / 2, floorY - 330);
    this.ctx.shadowBlur = 0;

    // A low coffee table in the center
    const tableX = deckX + deckWidth / 2;
    this.ctx.fillStyle = '#2f3640'; // Glass/metal table top
    this.ctx.fillRect(tableX - 80, floorY - 25, 160, 10);
    this.ctx.fillStyle = '#718093'; // Table legs
    this.ctx.fillRect(tableX - 70, floorY - 15, 10, 15);
    this.ctx.fillRect(tableX + 60, floorY - 15, 10, 15);
    
    // Some cups/drinks on the table
    this.ctx.fillStyle = '#fbc531';
    this.ctx.fillRect(tableX - 20, floorY - 35, 10, 10); // cup 1
    this.ctx.fillStyle = '#e84118';
    this.ctx.fillRect(tableX + 10, floorY - 38, 8, 13); // cup 2

    // Potted Plants on the edges
    const drawPlant = (px, py) => {
      this.ctx.fillStyle = '#dcdde1'; // Pot
      this.ctx.fillRect(px - 15, py - 40, 30, 40);
      this.ctx.fillStyle = '#44bd32'; // Leaves
      this.ctx.beginPath();
      this.ctx.arc(px, py - 60, 30, 0, Math.PI * 2);
      this.ctx.arc(px - 20, py - 50, 20, 0, Math.PI * 2);
      this.ctx.arc(px + 20, py - 50, 20, 0, Math.PI * 2);
      this.ctx.fill();
    };
    drawPlant(deckX + 100, floorY);
    drawPlant(deckX + deckWidth - 100, floorY);

    // BIG TV/Monitor showing Gameplay Video
    const tvWidth = 480;
    const tvHeight = 270;
    const tvX = deckX + deckWidth / 2 - tvWidth / 2; // Centered
    const tvY = floorY - tvHeight - 30; // Slightly higher

    // TV Frame
    this.ctx.fillStyle = '#1e272e';
    this.ctx.fillRect(tvX - 10, tvY - 10, tvWidth + 20, tvHeight + 20);
    
    // Draw Video Frame or Placeholder
    if (this.gameplayVideo && this.gameplayVideo.readyState >= 2) {
      // Draw actual video content to canvas
      this.ctx.drawImage(this.gameplayVideo, tvX, tvY, tvWidth, tvHeight);
    } else {
      // Fallback screen if video is loading
      this.ctx.fillStyle = '#2d98da';
      this.ctx.fillRect(tvX, tvY, tvWidth, tvHeight);
      this.ctx.fillStyle = '#fff';
      this.ctx.font = 'bold 24px Inter';
      this.ctx.fillText("VIDEO LOADING...", tvX + tvWidth/2, tvY + tvHeight/2);
    }
    
    // Glow effect
    this.ctx.fillStyle = 'rgba(45, 152, 218, 0.1)';
    this.ctx.fillRect(tvX, tvY, tvWidth, tvHeight);

    this.ctx.restore();
  }

  drawBossTeaser(x, y) {
    // Large metal door
    this.ctx.fillStyle = '#2d3436';
    this.ctx.fillRect(x, y - 200, 300, 200);
    
    // Warning tape
    this.ctx.save();
    this.ctx.translate(x, y - 100);
    this.ctx.rotate(Math.PI / -8);
    this.ctx.fillStyle = '#f1c40f';
    this.ctx.fillRect(-50, 0, 400, 40);
    this.ctx.fillStyle = '#000';
    this.ctx.font = 'bold 24px Inter';
    this.ctx.fillText('DANGER - KEEP OUT', 150, 28);
    this.ctx.restore();
    
    // Glowing red eyes inside
    if (Math.random() > 0.95) {
      this.ctx.fillStyle = '#e74c3c';
      this.ctx.beginPath();
      this.ctx.arc(x + 120, y - 120, 5, 0, Math.PI * 2);
      this.ctx.arc(x + 180, y - 120, 5, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  drawLeaderboards(floorY) {
    if (!this.leaderboardData || this.leaderboardData.length === 0) return;

    const screenWidth = 260;
    const screenHeight = 220;
    const y = floorY - 260; // Up on the wall

    // Trophies Leaderboard (x = 500)
    this.drawSingleLeaderboardScreen(500, y, screenWidth, screenHeight, '🏆 獎杯榜 TOP 5', 'trophies', '#fbc531');

    // Time Leaderboard (x = 800)
    this.drawSingleLeaderboardScreen(800, y, screenWidth, screenHeight, '⏱️ 肝帝榜 TOP 5', 'time', '#4cd137');
  }

  drawSingleLeaderboardScreen(x, y, width, height, title, sortKey, color) {
    // Screen Border / Frame
    this.ctx.fillStyle = '#2f3542';
    this.ctx.fillRect(x - 5, y - 5, width + 10, height + 10);
    
    // Inner Screen
    this.ctx.fillStyle = '#1e272e'; // Dark screen
    this.ctx.fillRect(x, y, width, height);

    // Neon Border Glow
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, width, height);

    // Title Background
    this.ctx.fillStyle = color;
    this.ctx.globalAlpha = 0.2;
    this.ctx.fillRect(x, y, width, 30);
    this.ctx.globalAlpha = 1.0;

    // Title Text
    this.ctx.fillStyle = color;
    this.ctx.font = 'bold 16px Inter';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(title, x + width / 2, y + 20);

    // Sort Data
    const sorted = [...this.leaderboardData].sort((a, b) => {
      if (sortKey === 'trophies') return b.trophies - a.trophies;
      if (sortKey === 'time') return b.playTime - a.playTime;
      return 0;
    }).slice(0, 5); // Only show top 5

    // Draw Entries
    this.ctx.textAlign = 'left';
    this.ctx.font = '14px Inter';
    sorted.forEach((user, index) => {
      const entryY = y + 55 + index * 32;

      // Draw Row Background
      if (index % 2 === 0) {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.fillRect(x + 5, entryY - 18, width - 10, 24);
      }

      // Rank
      this.ctx.fillStyle = index === 0 ? '#ffda79' : index === 1 ? '#d1ccc0' : index === 2 ? '#cc8e35' : '#747d8c';
      this.ctx.font = 'bold 14px Inter';
      this.ctx.fillText(`#${index + 1}`, x + 15, entryY);

      // Name
      this.ctx.fillStyle = '#ffffff';
      // Truncate name if too long
      let displayName = user.username;
      if (displayName.length > 10) displayName = displayName.substring(0, 10) + '...';
      this.ctx.fillText(displayName, x + 45, entryY);

      // Value
      this.ctx.fillStyle = color;
      this.ctx.textAlign = 'right';
      if (sortKey === 'trophies') {
        this.ctx.fillText(`🏆 ${user.trophies}`, x + width - 15, entryY);
      } else if (sortKey === 'time') {
        const h = Math.floor(user.playTime / 60);
        const m = user.playTime % 60;
        this.ctx.fillText(`${h}h ${m}m`, x + width - 15, entryY);
      }
      this.ctx.textAlign = 'left'; // Reset
    });
  }

  drawStairs(x, y, text, color, direction) {
    this.ctx.save();
    
    // Draw stairs structure
    this.ctx.fillStyle = '#2d3436';
    this.ctx.fillRect(x - 40, y - 100, 80, 100);
    
    // Draw steps
    this.ctx.fillStyle = '#636e72';
    for (let i = 0; i < 5; i++) {
      const stepY = y - 20 - (i * 20);
      const stepWidth = 80 - (i * 10);
      const stepX = x - stepWidth / 2;
      this.ctx.fillRect(stepX, stepY, stepWidth, 20);
      
      // Highlight edge
      this.ctx.fillStyle = '#b2bec3';
      this.ctx.fillRect(stepX, stepY, stepWidth, 3);
      this.ctx.fillStyle = '#636e72';
    }

    // Portal text
    this.ctx.fillStyle = color;
    this.ctx.font = 'bold 16px Inter';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(text, x, y - 120);
    
    this.ctx.restore();
  }

  drawEerieBasement() {
    this.ctx.save();
    const b1Y = this.floors[0];
    const width = this.mapWidth;

    // Background wall (deep dark grunge)
    const wallGradient = this.ctx.createLinearGradient(0, b1Y - 400, 0, b1Y);
    wallGradient.addColorStop(0, '#0a0a0a');
    wallGradient.addColorStop(1, '#1e272e');
    this.ctx.fillStyle = wallGradient;
    this.ctx.fillRect(0, b1Y - 576, width, 576);

    // Floor (stone path)
    const floorGradient = this.ctx.createLinearGradient(0, b1Y, 0, b1Y + 150);
    floorGradient.addColorStop(0, '#2d3436');
    floorGradient.addColorStop(1, '#050505');
    this.ctx.fillStyle = floorGradient;
    this.ctx.fillRect(0, b1Y, width, 150);

    // Grid lines for stone path
    this.ctx.strokeStyle = '#1e272e';
    this.ctx.lineWidth = 2;
    for (let i = 0; i < width; i += 60) {
      this.ctx.beginPath();
      this.ctx.moveTo(i, b1Y);
      this.ctx.lineTo(i - 20, b1Y + 150);
      this.ctx.stroke();
    }
    
    // --- Black Garden (Left side of B1) ---
    // Draw eerie black trees
    const drawBlackTree = (tx, ty, scale) => {
      this.ctx.save();
      this.ctx.translate(tx, ty);
      this.ctx.scale(scale, scale);
      
      this.ctx.fillStyle = '#111'; // Pitch black trunk
      this.ctx.beginPath();
      this.ctx.moveTo(-10, 0);
      this.ctx.lineTo(10, 0);
      this.ctx.lineTo(5, -100);
      this.ctx.lineTo(-5, -100);
      this.ctx.fill();
      
      // Branches
      this.ctx.strokeStyle = '#111';
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.moveTo(0, -60);
      this.ctx.lineTo(-30, -90);
      this.ctx.moveTo(2, -40);
      this.ctx.lineTo(40, -80);
      this.ctx.moveTo(0, -80);
      this.ctx.lineTo(20, -120);
      this.ctx.stroke();
      
      // Eerie glowing leaves/spores
      this.ctx.fillStyle = 'rgba(155, 89, 182, 0.6)';
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = '#9b59b6';
      this.ctx.beginPath();
      this.ctx.arc(-30, -90, 15, 0, Math.PI * 2);
      this.ctx.arc(40, -80, 10, 0, Math.PI * 2);
      this.ctx.arc(20, -120, 18, 0, Math.PI * 2);
      this.ctx.fill();
      
      this.ctx.restore();
    };

    drawBlackTree(150, b1Y, 1.2);
    drawBlackTree(350, b1Y, 0.9);
    drawBlackTree(550, b1Y, 1.5);
    drawBlackTree(750, b1Y, 1.1);

    // Withered black grass/bushes
    this.ctx.fillStyle = '#0a0a0a';
    for (let i = 50; i < 900; i += 40) {
      this.ctx.beginPath();
      this.ctx.arc(i, b1Y + 5, 20, Math.PI, 0);
      this.ctx.fill();
    }
    
    // Some glowing purple mushrooms on the ground
    this.ctx.fillStyle = '#8e44ad';
    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = '#8e44ad';
    const mushrooms = [120, 280, 410, 600, 820];
    for (let mx of mushrooms) {
      this.ctx.beginPath();
      this.ctx.arc(mx, b1Y, 6, Math.PI, 0);
      this.ctx.fill();
      this.ctx.fillStyle = '#fff'; // white spots
      this.ctx.fillRect(mx - 2, b1Y - 4, 2, 2);
      this.ctx.fillStyle = '#8e44ad';
    }
    this.ctx.shadowBlur = 0;
    // --- End Black Garden ---

    // Draw cobblestone path pattern deterministically
    this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (let i = 0; i < width; i += 40) {
      for (let j = 0; j < 150; j += 20) {
        if ((i * 17 + j * 23) % 10 > 3) {
          this.ctx.fillRect(i + (j % 40), b1Y + j, 35, 15);
        }
      }
    }

    // Creepy green toxic dripping pipes / fog
    const time = Date.now() / 1000;
    for (let i = 150; i < width - 100; i += 400) {
      // Pipe
      this.ctx.fillStyle = '#1e272e';
      this.ctx.fillRect(i, b1Y - 576, 40, 500);
      
      // Dripping sludge
      this.ctx.fillStyle = '#44bd32';
      const dripY = ((time * 80 + i * 2) % 500);
      this.ctx.fillRect(i + 15, b1Y - 576 + dripY, 10, 25);
      
      // Sludge puddle
      this.ctx.fillStyle = 'rgba(68, 189, 50, 0.4)';
      this.ctx.beginPath();
      this.ctx.ellipse(i + 20, b1Y + 10, 50 + Math.sin(time * 3 + i) * 15, 12, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Eerie floating particles (dust/fog)
    this.ctx.fillStyle = 'rgba(150, 150, 150, 0.3)';
    for (let i = 0; i < 40; i++) {
      const px = (i * 73 + time * 15) % width;
      const py = b1Y - 150 - (i * 31 + time * 8) % 300;
      this.ctx.beginPath();
      this.ctx.arc(px, py, (i % 3) + 1, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    // Vignette / Darkness overlay around the edges
    const center = this.localPlayer ? this.localPlayer.x + this.localPlayer.width/2 : width/2;
    const darkness = this.ctx.createRadialGradient(center, b1Y - 100, 50, center, b1Y - 100, 700);
    darkness.addColorStop(0, 'rgba(0,0,0,0)');
    darkness.addColorStop(0.5, 'rgba(0,0,0,0.6)');
    darkness.addColorStop(1, 'rgba(0,0,0,0.95)');
    this.ctx.fillStyle = darkness;
    this.ctx.fillRect(0, b1Y - 576, width, 576 + 150);

    this.ctx.restore();
  }

  drawBigStorefront(x, y, text, color) {
    this.ctx.save();
    
    const width = 360;
    const height = 250;
    const leftX = x - width / 2;
    const topY = y - height;

    // Building background
    this.ctx.fillStyle = '#2d3436';
    this.ctx.fillRect(leftX, topY, width, height);
    
    // Roof / Awning
    this.ctx.fillStyle = '#111';
    this.ctx.beginPath();
    this.ctx.moveTo(leftX - 20, topY);
    this.ctx.lineTo(leftX + width + 20, topY);
    this.ctx.lineTo(leftX + width, topY - 30);
    this.ctx.lineTo(leftX, topY - 30);
    this.ctx.fill();

    // Awning stripes
    const stripeWidth = width / 8;
    for (let i = 0; i < 8; i++) {
      this.ctx.fillStyle = i % 2 === 0 ? '#b33939' : '#218c74';
      this.ctx.fillRect(leftX + i * stripeWidth, topY, stripeWidth, 20);
    }

    // Double Doors
    this.ctx.fillStyle = '#4b3832';
    this.ctx.fillRect(x - 60, y - 180, 58, 180); // Left door
    this.ctx.fillRect(x + 2, y - 180, 58, 180);  // Right door
    
    // Door handles
    this.ctx.fillStyle = '#f1c40f';
    this.ctx.fillRect(x - 15, y - 100, 5, 25);
    this.ctx.fillRect(x + 10, y - 100, 5, 25);
    
    // Neon Sign Box
    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(x - 100, topY - 80, 200, 50);
    this.ctx.strokeStyle = '#fbc531';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(x - 100, topY - 80, 200, 50);

    // Glowing Neon Text
    this.ctx.fillStyle = '#fbc531';
    this.ctx.font = 'bold 24px "Arial Black", sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = '#fbc531';
    // Flickering neon effect
    const time = Date.now();
    if (Math.sin(time / 200) > -0.8) {
      this.ctx.fillText("BLACK MARKET", x, topY - 45);
    }

    // Portal Prompt Text
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = color;
    this.ctx.font = 'bold 16px Inter';
    this.ctx.fillText(text, x, y - height - 100);
    
    this.ctx.restore();
  }

  drawClothingStorefront(x, y, text, color) {
    this.ctx.save();
    
    const width = 360;
    const height = 250;
    const leftX = x - width / 2;
    const topY = y - height;

    // Building background (Stylish dark purple-grey)
    this.ctx.fillStyle = '#1e1c22';
    this.ctx.fillRect(leftX, topY, width, height);
    
    // Roof / Awning
    this.ctx.fillStyle = '#111';
    this.ctx.beginPath();
    this.ctx.moveTo(leftX - 20, topY);
    this.ctx.lineTo(leftX + width + 20, topY);
    this.ctx.lineTo(leftX + width, topY - 30);
    this.ctx.lineTo(leftX, topY - 30);
    this.ctx.fill();

    // Awning stripes (Purple & Pink)
    const stripeWidth = width / 8;
    for (let i = 0; i < 8; i++) {
      this.ctx.fillStyle = i % 2 === 0 ? '#8e44ad' : '#fd79a8';
      this.ctx.fillRect(leftX + i * stripeWidth, topY, stripeWidth, 20);
    }

    // Glass Display Windows (Left & Right)
    this.ctx.fillStyle = 'rgba(129, 236, 236, 0.2)'; // Glass reflection
    this.ctx.strokeStyle = '#2d3436';
    this.ctx.lineWidth = 4;
    // Left Window
    this.ctx.fillRect(leftX + 20, y - 180, 80, 140);
    this.ctx.strokeRect(leftX + 20, y - 180, 80, 140);
    // Right Window
    this.ctx.fillRect(leftX + width - 100, y - 180, 80, 140);
    this.ctx.strokeRect(leftX + width - 100, y - 180, 80, 140);
    
    // Draw Mannequins inside windows
    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 2;
    // Left Mannequin
    this.ctx.beginPath();
    this.ctx.moveTo(leftX + 60, y - 80); // Hip
    this.ctx.lineTo(leftX + 60, y - 130); // Torso
    this.ctx.moveTo(leftX + 60, y - 130);
    this.ctx.lineTo(leftX + 45, y - 100); // L Arm
    this.ctx.moveTo(leftX + 60, y - 130);
    this.ctx.lineTo(leftX + 75, y - 100); // R Arm
    this.ctx.moveTo(leftX + 60, y - 80);
    this.ctx.lineTo(leftX + 50, y - 40); // L Leg
    this.ctx.moveTo(leftX + 60, y - 80);
    this.ctx.lineTo(leftX + 70, y - 40); // R Leg
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.arc(leftX + 60, y - 145, 15, 0, Math.PI*2); // Head
    this.ctx.stroke();

    // Right Mannequin
    this.ctx.beginPath();
    this.ctx.moveTo(leftX + width - 60, y - 80); // Hip
    this.ctx.lineTo(leftX + width - 60, y - 130); // Torso
    this.ctx.moveTo(leftX + width - 60, y - 130);
    this.ctx.lineTo(leftX + width - 75, y - 110); // L Arm (posed up)
    this.ctx.lineTo(leftX + width - 65, y - 130); // Hand touching head
    this.ctx.moveTo(leftX + width - 60, y - 130);
    this.ctx.lineTo(leftX + width - 45, y - 100); // R Arm
    this.ctx.moveTo(leftX + width - 60, y - 80);
    this.ctx.lineTo(leftX + width - 70, y - 40); // L Leg
    this.ctx.moveTo(leftX + width - 60, y - 80);
    this.ctx.lineTo(leftX + width - 40, y - 60); // R Leg (kick pose)
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.arc(leftX + width - 60, y - 145, 15, 0, Math.PI*2); // Head
    this.ctx.stroke();

    // Glass Reflection glare
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    this.ctx.beginPath();
    this.ctx.moveTo(leftX + 20, y - 180);
    this.ctx.lineTo(leftX + 60, y - 180);
    this.ctx.lineTo(leftX + 20, y - 100);
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.moveTo(leftX + width - 100, y - 180);
    this.ctx.lineTo(leftX + width - 60, y - 180);
    this.ctx.lineTo(leftX + width - 100, y - 100);
    this.ctx.fill();

    // Elegant Glass Door (Center)
    this.ctx.fillStyle = 'rgba(129, 236, 236, 0.1)';
    this.ctx.fillRect(x - 50, y - 180, 100, 180); 
    this.ctx.strokeStyle = '#fbc531'; // Gold door frame
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(x - 50, y - 180, 100, 180);
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - 180);
    this.ctx.lineTo(x, y); // Center door split
    this.ctx.stroke();
    
    // Door handles
    this.ctx.fillStyle = '#fbc531';
    this.ctx.beginPath();
    this.ctx.arc(x - 10, y - 100, 4, 0, Math.PI*2);
    this.ctx.arc(x + 10, y - 100, 4, 0, Math.PI*2);
    this.ctx.fill();
    
    // Neon Sign Box
    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(x - 100, topY - 80, 200, 50);
    this.ctx.strokeStyle = color; // Purple border
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(x - 100, topY - 80, 200, 50);

    // Glowing Neon Text
    this.ctx.fillStyle = color; // Purple text
    this.ctx.font = 'bold 24px "Arial Black", sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = color;
    // Flickering neon effect
    const time = Date.now();
    if (Math.sin(time / 300) > -0.9) {
      this.ctx.fillText("SKIN SHOP", x, topY - 45);
    }

    // Portal Prompt Text
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = color;
    this.ctx.font = 'bold 16px Inter';
    this.ctx.fillText(text, x, y - height - 100);
    
    this.ctx.restore();
  }

  drawFloatingBook(x, y, text, color) {
    this.ctx.save();
    
    // Floating animation
    const time = Date.now() / 1000;
    const floatY = Math.sin(time * 2) * 10;
    const bookY = y - 80 + floatY;
    
    // Draw book shadow on the ground
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, 30, 10, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw the book
    this.ctx.translate(x, bookY);
    
    // Glow effect
    this.ctx.shadowBlur = 20;
    this.ctx.shadowColor = color;
    
    // Left page
    this.ctx.fillStyle = '#f5f6fa';
    this.ctx.beginPath();
    this.ctx.moveTo(0, 10);
    this.ctx.lineTo(-30, 0);
    this.ctx.lineTo(-30, -40);
    this.ctx.lineTo(0, -30);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    // Right page
    this.ctx.beginPath();
    this.ctx.moveTo(0, 10);
    this.ctx.lineTo(30, 0);
    this.ctx.lineTo(30, -40);
    this.ctx.lineTo(0, -30);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    // Book spine
    this.ctx.fillStyle = color;
    this.ctx.fillRect(-2, -30, 4, 40);

    // Some text lines on the pages
    this.ctx.shadowBlur = 0;
    this.ctx.strokeStyle = '#dcdde1';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(-25, -5); this.ctx.lineTo(-5, -12);
    this.ctx.moveTo(-25, -15); this.ctx.lineTo(-5, -22);
    this.ctx.moveTo(5, -12); this.ctx.lineTo(25, -5);
    this.ctx.moveTo(5, -22); this.ctx.lineTo(25, -15);
    this.ctx.stroke();

    this.ctx.restore();

    // Text Label
    this.ctx.save();
    this.ctx.globalAlpha = 1.0;
    this.ctx.fillStyle = 'white';
    this.ctx.font = '900 20px "Impact", "Arial Black", sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = color;
    this.ctx.lineWidth = 4;
    this.ctx.strokeStyle = 'black';
    this.ctx.strokeText(text, x, y - 130 + floatY);
    this.ctx.fillText(text, x, y - 130 + floatY);
    this.ctx.restore();
  }

  drawBackgroundShop() {
    this.ctx.save();
    
    // The entire "sky" area is the shop wall
    const shopX = 0;
    const shopY = -576;
    const shopWidth = this.canvas.width;
    const shopHeight = this.floors[1] + 576;

    // Building structure (Wall)
    this.ctx.fillStyle = '#2f3640'; // Dark grey building
    this.ctx.fillRect(shopX, shopY, shopWidth, shopHeight);
    
    // Roof (Just a trim at the top)
    this.ctx.fillStyle = '#c23616'; // Red roof trim
    this.ctx.fillRect(shopX, shopY, shopWidth, 40);

    // Neon Sign Board (Centered at the top)
    this.ctx.fillStyle = '#192a56';
    this.ctx.fillRect(shopWidth / 2 - 200, shopY + 60, 400, 70);
    this.ctx.strokeStyle = '#e1b12c';
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(shopWidth / 2 - 200, shopY + 60, 400, 70);

    // Neon Text "BELL'S SHOP"
    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = '#fbc531';
    this.ctx.fillStyle = '#fbc531';
    this.ctx.font = '900 36px "Impact", "Arial Black", sans-serif';
    this.ctx.textAlign = 'center';
    // Pulsing effect based on time
    const time = Date.now() / 200;
    this.ctx.globalAlpha = 0.8 + Math.sin(time) * 0.2;
    this.ctx.fillText("BELL'S WEAPON SHOP", shopWidth / 2, shopY + 110);
    
    this.ctx.globalAlpha = 1.0;
    this.ctx.shadowBlur = 0;

    // Display Window 1 (Left side)
    this.ctx.fillStyle = 'rgba(116, 185, 255, 0.15)'; // Glass
    this.ctx.fillRect(100, shopHeight - 200, 200, 150);
    this.ctx.strokeStyle = '#718093';
    this.ctx.lineWidth = 6;
    this.ctx.strokeRect(100, shopHeight - 200, 200, 150);

    // Weapon silhouettes in window 1
    this.ctx.fillStyle = '#1e272e';
    // Sword
    this.ctx.fillRect(140, shopHeight - 180, 8, 110);
    this.ctx.fillRect(125, shopHeight - 100, 38, 8);
    // Shield
    this.ctx.beginPath();
    this.ctx.arc(230, shopHeight - 120, 35, 0, Math.PI * 2);
    this.ctx.fill();

    // Display Window 2 (Right side)
    this.ctx.fillStyle = 'rgba(116, 185, 255, 0.15)'; // Glass
    this.ctx.fillRect(shopWidth - 300, shopHeight - 200, 200, 150);
    this.ctx.strokeRect(shopWidth - 300, shopHeight - 200, 200, 150);

    // Weapon silhouettes in window 2
    this.ctx.fillStyle = '#1e272e';
    // Staff/Spear
    this.ctx.fillRect(shopWidth - 250, shopHeight - 180, 6, 120);
    this.ctx.beginPath();
    this.ctx.moveTo(shopWidth - 253, shopHeight - 180);
    this.ctx.lineTo(shopWidth - 247, shopHeight - 180);
    this.ctx.lineTo(shopWidth - 250, shopHeight - 200);
    this.ctx.fill();

    // Door (Center)
    this.ctx.fillStyle = '#353b48';
    this.ctx.fillRect(shopWidth / 2 - 60, shopHeight - 180, 120, 180);
    this.ctx.strokeStyle = '#718093';
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(shopWidth / 2 - 60, shopHeight - 180, 120, 180);
    
    // Door handle
    this.ctx.fillStyle = '#e1b12c';
    this.ctx.beginPath();
    this.ctx.arc(shopWidth / 2 + 40, shopHeight - 90, 6, 0, Math.PI * 2);
    this.ctx.fill();

    // Small glowing "OPEN" sign on door
    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = '#4cd137';
    this.ctx.fillStyle = '#4cd137';
    this.ctx.font = 'bold 18px Arial';
    this.ctx.fillText("OPEN", shopWidth / 2, shopHeight - 130);

    this.ctx.restore();
  }

  drawPortal(x, y, text, color) {
    this.ctx.save();
    
    const portalWidth = 100;
    const portalHeight = 130;
    const thickness = 12;
    
    // Center the portal at x
    const startX = x - portalWidth / 2;
    
    // Draw neon arch
    this.ctx.shadowBlur = 20;
    this.ctx.shadowColor = color;
    this.ctx.fillStyle = color;
    
    // Left pillar
    this.ctx.fillRect(startX, y - portalHeight, thickness, portalHeight);
    // Right pillar
    this.ctx.fillRect(startX + portalWidth - thickness, y - portalHeight, thickness, portalHeight);
    // Top arch
    this.ctx.fillRect(startX, y - portalHeight, portalWidth, thickness);
    
    // Inner dark void
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    this.ctx.fillRect(startX + thickness, y - portalHeight + thickness, portalWidth - thickness * 2, portalHeight - thickness);
    
    // Inner glow
    const gradient = this.ctx.createLinearGradient(0, y - portalHeight, 0, y);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    this.ctx.fillStyle = gradient;
    this.ctx.globalAlpha = 0.4;
    this.ctx.fillRect(startX + thickness, y - portalHeight + thickness, portalWidth - thickness * 2, portalHeight - thickness);
    
    // Text
    this.ctx.globalAlpha = 1.0;
    this.ctx.fillStyle = 'white';
    this.ctx.font = '900 26px "Impact", "Arial Black", sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = color;
    // Add text outline
    this.ctx.lineWidth = 4;
    this.ctx.strokeStyle = 'black';
    this.ctx.strokeText(text, x, y - portalHeight - 20);
    // Draw text fill
    this.ctx.fillText(text, x, y - portalHeight - 20);
    
    this.ctx.restore();
  }

  drawGachaMachine(x, y, text, color) {
    this.ctx.save();
    
    // Draw shadow
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, 40, 10, 0, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Draw Machine Base
    this.ctx.fillStyle = '#ff4757'; // Red base
    this.ctx.beginPath();
    this.ctx.moveTo(x - 35, y);
    this.ctx.lineTo(x + 35, y);
    this.ctx.lineTo(x + 40, y - 60);
    this.ctx.lineTo(x - 40, y - 60);
    this.ctx.fill();
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = '#2f3542';
    this.ctx.stroke();
    
    // Coin Slot & Dial
    this.ctx.fillStyle = '#dfe4ea';
    this.ctx.beginPath();
    this.ctx.arc(x, y - 30, 15, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
    // Dial knob
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();
    this.ctx.moveTo(x - 10, y - 30);
    this.ctx.lineTo(x + 10, y - 30);
    this.ctx.stroke();
    
    // Output hole
    this.ctx.fillStyle = '#2f3542';
    this.ctx.fillRect(x - 15, y - 15, 30, 10);
    
    // Glass Globe
    this.ctx.fillStyle = 'rgba(116, 185, 255, 0.3)';
    this.ctx.beginPath();
    this.ctx.arc(x, y - 100, 45, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    this.ctx.stroke();
    
    // Gacha capsules inside
    const capsules = [
      {cx: x-15, cy: y-70, color: '#fffa65'},
      {cx: x+15, cy: y-75, color: '#00d2d3'},
      {cx: x, cy: y-90, color: '#ff9f43'},
      {cx: x-20, cy: y-100, color: '#ff7675'},
      {cx: x+20, cy: y-105, color: '#a29bfe'},
      {cx: x+5, cy: y-115, color: '#55efc4'},
      {cx: x-10, cy: y-125, color: '#ffeaa7'}
    ];
    for (const c of capsules) {
      this.ctx.fillStyle = c.color;
      this.ctx.beginPath();
      this.ctx.arc(c.cx, c.cy, 12, 0, Math.PI * 2);
      this.ctx.fill();
      // Capsule details (half transparent white)
      this.ctx.fillStyle = 'rgba(255,255,255,0.4)';
      this.ctx.beginPath();
      this.ctx.arc(c.cx, c.cy, 12, Math.PI, Math.PI * 2);
      this.ctx.fill();
      this.ctx.lineWidth = 1;
      this.ctx.strokeStyle = '#2f3542';
      this.ctx.stroke();
    }
    
    // Glass reflection
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    this.ctx.beginPath();
    this.ctx.arc(x - 15, y - 110, 15, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.restore();
    
    // Text Label
    this.ctx.save();
    this.ctx.globalAlpha = 1.0;
    this.ctx.fillStyle = 'white';
    this.ctx.font = '900 20px "Impact", "Arial Black", sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = color;
    this.ctx.lineWidth = 4;
    this.ctx.strokeStyle = 'black';
    
    // Float animation for text
    const time = Date.now() / 1000;
    const floatY = Math.sin(time * 2) * 5;
    
    this.ctx.strokeText(text, x, y - 160 + floatY);
    this.ctx.fillText(text, x, y - 160 + floatY);
    this.ctx.restore();
  }

  drawShopArrow(x, y, text, color) {
    this.ctx.save();
    
    // Draw pulsing right arrow
    const time = Date.now() / 200;
    const pulseOffset = Math.sin(time) * 10;
    
    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = color;
    this.ctx.fillStyle = color;
    
    this.ctx.beginPath();
    this.ctx.moveTo(x - 20 + pulseOffset, y - 60);
    this.ctx.lineTo(x + 10 + pulseOffset, y - 60);
    this.ctx.lineTo(x + 10 + pulseOffset, y - 75);
    this.ctx.lineTo(x + 40 + pulseOffset, y - 50);
    this.ctx.lineTo(x + 10 + pulseOffset, y - 25);
    this.ctx.lineTo(x + 10 + pulseOffset, y - 40);
    this.ctx.lineTo(x - 20 + pulseOffset, y - 40);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.font = 'bold 16px Inter';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(text, x, y - 100);

    this.ctx.restore();
  }

  drawDecorations() {
    this.ctx.save();
    
    const now = new Date();
    const month = now.getMonth(); // 0-11
    const date = now.getDate();
    
    // Halloween (October)
    if (month === 9) {
      this.drawHalloweenDecorations();
    }
    // Christmas (December)
    else if (month === 11) {
      this.drawChristmasDecorations();
    }
    // Valentine's Day (February 13-15)
    else if (month === 1 && date >= 13 && date <= 15) {
      this.drawValentineDecorations();
    }
    
    this.ctx.restore();
  }

  drawHalloweenDecorations() {
    // Draw a couple of Pumpkins on the floor
    this.ctx.fillStyle = '#ff9f43'; // Orange
    
    const drawPumpkin = (x, y) => {
      this.ctx.beginPath();
      this.ctx.ellipse(x, y, 20, 15, 0, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Stem
      this.ctx.fillStyle = '#10ac84';
      this.ctx.fillRect(x - 2, y - 20, 4, 8);
      
      // Eyes (glowing)
      this.ctx.fillStyle = '#feca57';
      this.ctx.beginPath();
      this.ctx.moveTo(x - 8, y - 5);
      this.ctx.lineTo(x - 4, y - 5);
      this.ctx.lineTo(x - 6, y - 10);
      this.ctx.fill();
      
      this.ctx.beginPath();
      this.ctx.moveTo(x + 4, y - 5);
      this.ctx.lineTo(x + 8, y - 5);
      this.ctx.lineTo(x + 6, y - 10);
      this.ctx.fill();
      this.ctx.fillStyle = '#ff9f43'; // reset
    };

    drawPumpkin(150, this.floorY + 10);
    drawPumpkin(850, this.floorY + 15);
  }

  drawChristmasDecorations() {
    // Snowflakes falling
    const time = Date.now() / 1000;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (let i = 0; i < 50; i++) {
      const x = (Math.sin(i * 123) * 1000 + time * 50) % this.canvas.width;
      const y = (Math.cos(i * 321) * 1000 + time * 100) % this.canvas.height;
      
      this.ctx.beginPath();
      this.ctx.arc(x, y, Math.random() * 2 + 1, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  drawValentineDecorations() {
    // Floating hearts
    const time = Date.now() / 1000;
    this.ctx.fillStyle = 'rgba(255, 107, 129, 0.6)';
    
    for (let i = 0; i < 15; i++) {
      const x = (Math.sin(i * 99) * 1000 + time * 20) % this.canvas.width;
      const y = this.canvas.height - ((Math.cos(i * 77) * 1000 + time * 50) % this.canvas.height);
      
      this.ctx.save();
      this.ctx.translate(x, y);
      const scale = Math.sin(time * 2 + i) * 0.2 + 0.8;
      this.ctx.scale(scale, scale);
      
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.bezierCurveTo(-10, -10, -20, 10, 0, 20);
      this.ctx.bezierCurveTo(20, 10, 10, -10, 0, 0);
      this.ctx.fill();
      
      this.ctx.restore();
    }
  }
}
