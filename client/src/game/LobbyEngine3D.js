import * as THREE from 'three';
import { Player } from './Player';

function hexToCSS(color) {
  if (typeof color === 'string') return color;
  return '#' + (color & 0xFFFFFF).toString(16).padStart(6, '0');
}

export class LobbyEngine3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.localPlayer = null;
    this.remotePlayers = new Map();
    this.leaderboardData = [];
    this.leaderboardTexture = null;
    this.leaderboardMesh = null;
    
    // Set up WebGL Renderer
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
      this.renderer.setSize(1024, 576, false);
      this.renderer.setClearColor(0x87CEEB);
      console.log('[LobbyEngine3D] WebGL Renderer created successfully');
    } catch (e) {
      console.error('[LobbyEngine3D] WebGL Renderer FAILED:', e);
      // Fallback: create without antialias
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas });
      this.renderer.setSize(1024, 576, false);
      this.renderer.setClearColor(0x87CEEB);
    }
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB); // Bright sky blue
    // No fog — keep everything fully visible
    
    // Camera
    this.camera = new THREE.PerspectiveCamera(60, this.canvas.width / this.canvas.height, 1, 5000);
    this.camera.position.set(0, 200, 500);
    this.camera.lookAt(0, 0, 0);

    // Lights (Very Bright)
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
    this.scene.add(ambientLight);
    
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x888888, 1.5);
    hemiLight.position.set(0, 500, 0);
    this.scene.add(hemiLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(200, 500, 300);
    this.scene.add(dirLight);
    
    const pointLight = new THREE.PointLight(0xff6b81, 1.0, 3000);
    pointLight.position.set(0, 400, 0);
    this.scene.add(pointLight);

    // Environment
    try {
      this.buildEnvironment();
      console.log('[LobbyEngine3D] Environment built OK');
    } catch(e) {
      console.error('[LobbyEngine3D] buildEnvironment FAILED:', e);
    }

    // Map for player 3D sprites
    this.playerSprites = new Map(); // socketId -> Sprite
    this.localSprite = null;
    
    // Animation frame
    this.animationId = null;
    this.lastTime = performance.now();
    this.walkTime = 0; // For camera bob

    // Camera Controls (Pointer Lock FPS)
    this.cameraAngle = 0; // Yaw
    this.cameraPitch = 0; // Pitch (0 = looking straight ahead)
    this.isPointerLocked = false;

    this.onCanvasClickBound = this.onCanvasClick.bind(this);
    this.onPointerMoveBound = this.onPointerMove.bind(this);
    this.onPointerLockChangeBound = this.onPointerLockChange.bind(this);

    this.canvas.addEventListener('click', this.onCanvasClickBound);
    document.addEventListener('mousemove', this.onPointerMoveBound);
    document.addEventListener('pointerlockchange', this.onPointerLockChangeBound);
  }

  onCanvasClick() {
    // Click to lock pointer (FPS mode)
    if (!this.isPointerLocked) {
      this.canvas.requestPointerLock();
    }
  }

  onPointerLockChange() {
    this.isPointerLocked = (document.pointerLockElement === this.canvas);
  }

  onPointerMove(e) {
    if (!this.isPointerLocked) return;

    const sensitivity = 0.003;
    this.cameraAngle -= e.movementX * sensitivity;
    this.cameraPitch -= e.movementY * sensitivity;

    // Clamp pitch so you can't look behind yourself
    const maxPitch = Math.PI / 2 - 0.05;
    if (this.cameraPitch > maxPitch) this.cameraPitch = maxPitch;
    if (this.cameraPitch < -maxPitch) this.cameraPitch = -maxPitch;
  }

  buildEnvironment() {
    // Floor — Bright checker pattern
    const floorGeometry = new THREE.PlaneGeometry(4000, 2000);
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512;
    floorCanvas.height = 256;
    const fctx = floorCanvas.getContext('2d');
    // Checker pattern
    const tileSize = 64;
    for (let row = 0; row < floorCanvas.height / tileSize; row++) {
      for (let col = 0; col < floorCanvas.width / tileSize; col++) {
        fctx.fillStyle = (row + col) % 2 === 0 ? '#5a6275' : '#6b7388';
        fctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
      }
    }
    const floorTexture = new THREE.CanvasTexture(floorCanvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(8, 4);
    const floorMaterial = new THREE.MeshLambertMaterial({ map: floorTexture });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Walls — Brighter
    const wallGeo = new THREE.BoxGeometry(4000, 800, 20);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x7f8c9a });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, 400, -1000);
    this.scene.add(backWall);

    // Side walls
    const sideWallGeo = new THREE.BoxGeometry(20, 800, 2000);
    const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
    leftWall.position.set(-2000, 400, 0);
    this.scene.add(leftWall);
    const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
    rightWall.position.set(2000, 400, 0);
    this.scene.add(rightWall);

    // Add neon lines to the wall
    const neonGeo = new THREE.BoxGeometry(4000, 10, 25);
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x00d2d3 });
    const neon = new THREE.Mesh(neonGeo, neonMat);
    neon.position.set(0, 500, -1000);
    this.scene.add(neon);
    
    const neon2 = new THREE.Mesh(new THREE.BoxGeometry(4000, 10, 25), new THREE.MeshBasicMaterial({ color: 0xff4757 }));
    neon2.position.set(0, 300, -1000);
    this.scene.add(neon2);
    
    // Original Portals & Equipment
    this.createPortalMesh(600, 'Fight (Arcade 1)', 0xff4757, 'join_arcade', 'Slot1');
    this.createPortalMesh(800, 'Fight (Arcade 2)', 0xff4757, 'join_arcade', 'Slot2');
    this.createPortalMesh(-300, 'Secret Shop', 0xfbc531, 'shop');
    this.createPortalMesh(-600, 'Skin Shop', 0xe056fd, 'skin_shop');
    this.createPortalMesh(1200, 'Gacha Machine', 0xfd79a8, 'gacha');
    this.createPortalMesh(-900, 'Discord TV', 0x5865F2, 'discord');
    this.createPortalMesh(-1200, 'Quest Board', 0xff7675, 'quests');
    this.createPortalMesh(1400, 'Tutorial', 0x00d2d3, 'tutorial');
    this.createPortalMesh(0, 'TRAINING', 0xff9f43, 'training');
  }

  createPortalMesh(x, name, color, action, slotId = null) {
    try {
      const cssColor = hexToCSS(color);
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      
      this.drawEquipment(ctx, canvas.width / 2, canvas.height - 100, name, cssColor, action, slotId);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(spriteMat);
      
      sprite.scale.set(400, 400, 1);
      sprite.position.set(x, 200, -500);
      sprite.userData = { action, slotId };
      this.scene.add(sprite);
    } catch(e) {
      console.error('[LobbyEngine3D] createPortalMesh FAILED for', name, e);
    }
  }

  drawEquipment(ctx, x, y, text, color, action, slotId) {
    ctx.save();
    
    if (action === 'join_arcade') {
      // Draw Arcade Cabinet
      ctx.fillStyle = color;
      ctx.fillRect(x - 60, y - 200, 120, 200);
      
      ctx.fillStyle = '#2d3436';
      ctx.fillRect(x - 40, y - 180, 80, 80);
      
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(text, x, y - 220);
      ctx.fillText('INSERT COIN', x, y - 130);
    } 
    else if (action === 'gacha') {
      // Draw Gacha Machine
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath(); ctx.ellipse(x, y, 80, 20, 0, 0, Math.PI * 2); ctx.fill();
      
      ctx.fillStyle = '#ff4757';
      ctx.beginPath();
      ctx.moveTo(x - 70, y); ctx.lineTo(x + 70, y);
      ctx.lineTo(x + 80, y - 120); ctx.lineTo(x - 80, y - 120);
      ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = '#2f3542'; ctx.stroke();
      
      ctx.fillStyle = '#dfe4ea';
      ctx.beginPath(); ctx.arc(x, y - 60, 30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(x - 20, y - 60); ctx.lineTo(x + 20, y - 60); ctx.stroke();
      
      ctx.fillStyle = '#2f3542';
      ctx.fillRect(x - 30, y - 30, 60, 20);
      
      ctx.fillStyle = 'rgba(116, 185, 255, 0.3)';
      ctx.beginPath(); ctx.arc(x, y - 200, 90, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.stroke();
      
      const capsules = [
        {cx: x-30, cy: y-140, c: '#fffa65'}, {cx: x+30, cy: y-150, c: '#00d2d3'},
        {cx: x, cy: y-180, c: '#ff9f43'}, {cx: x-40, cy: y-200, c: '#ff7675'},
        {cx: x+40, cy: y-210, c: '#a29bfe'}, {cx: x+10, cy: y-230, c: '#55efc4'},
        {cx: x-20, cy: y-250, c: '#ffeaa7'}
      ];
      for (const c of capsules) {
        ctx.fillStyle = c.c;
        ctx.beginPath(); ctx.arc(c.cx, c.cy, 24, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.arc(c.cx, c.cy, 24, Math.PI, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#2f3542'; ctx.stroke();
      }
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath(); ctx.arc(x - 30, y - 220, 30, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = 'white'; ctx.font = '900 36px "Impact"'; ctx.textAlign = 'center';
      ctx.shadowBlur = 10; ctx.shadowColor = color; ctx.lineWidth = 6; ctx.strokeStyle = 'black';
      ctx.strokeText(text, x, y - 320); ctx.fillText(text, x, y - 320);
    }
    else if (action === 'skin_shop' || action === 'shop') {
      const width = 400; const height = 250; const leftX = x - width/2; const topY = y - height;
      ctx.fillStyle = '#1e1c22'; ctx.fillRect(leftX, topY, width, height);
      ctx.fillStyle = '#111'; ctx.beginPath();
      ctx.moveTo(leftX - 20, topY); ctx.lineTo(leftX + width + 20, topY);
      ctx.lineTo(leftX + width, topY - 40); ctx.lineTo(leftX, topY - 40); ctx.fill();

      const stripeWidth = width / 8;
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 === 0 ? color : '#fd79a8';
        ctx.fillRect(leftX + i * stripeWidth, topY, stripeWidth, 25);
      }
      
      ctx.fillStyle = 'rgba(129, 236, 236, 0.2)'; ctx.strokeStyle = '#2d3436'; ctx.lineWidth = 6;
      ctx.fillRect(leftX + 20, y - 180, 80, 140); ctx.strokeRect(leftX + 20, y - 180, 80, 140);
      ctx.fillRect(leftX + width - 100, y - 180, 80, 140); ctx.strokeRect(leftX + width - 100, y - 180, 80, 140);
      
      ctx.fillStyle = 'rgba(129, 236, 236, 0.1)'; ctx.fillRect(x - 50, y - 180, 100, 180);
      ctx.strokeStyle = '#fbc531'; ctx.lineWidth = 4; ctx.strokeRect(x - 50, y - 180, 100, 180);
      ctx.beginPath(); ctx.moveTo(x, y - 180); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = '#fbc531'; ctx.beginPath();
      ctx.arc(x - 10, y - 100, 6, 0, Math.PI*2); ctx.arc(x + 10, y - 100, 6, 0, Math.PI*2); ctx.fill();

      ctx.fillStyle = 'white'; ctx.font = '900 36px "Impact"'; ctx.textAlign = 'center';
      ctx.shadowBlur = 10; ctx.shadowColor = color; ctx.lineWidth = 6; ctx.strokeStyle = 'black';
      ctx.strokeText(text, x, y - 320); ctx.fillText(text, x, y - 320);
    }
    else if (action === 'quests') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.beginPath(); ctx.ellipse(x, y, 60, 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(x, y - 160);
      ctx.shadowBlur = 40; ctx.shadowColor = color;
      
      ctx.fillStyle = '#f5f6fa'; ctx.beginPath();
      ctx.moveTo(0, 20); ctx.lineTo(-60, 0); ctx.lineTo(-60, -80); ctx.lineTo(0, -60); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 20); ctx.lineTo(60, 0); ctx.lineTo(60, -80); ctx.lineTo(0, -60); ctx.closePath(); ctx.fill(); ctx.stroke();
      
      ctx.fillStyle = color; ctx.fillRect(-4, -60, 8, 80);
      ctx.translate(-x, -(y - 160));
      
      ctx.fillStyle = 'white'; ctx.font = '900 36px "Impact"'; ctx.textAlign = 'center';
      ctx.shadowBlur = 10; ctx.shadowColor = color; ctx.lineWidth = 6; ctx.strokeStyle = 'black';
      ctx.strokeText(text, x, y - 260); ctx.fillText(text, x, y - 260);
    }
    else if (action === 'discord') {
      ctx.fillStyle = '#1e272e';
      ctx.fillRect(x - 120, y - 200, 240, 160);
      ctx.strokeStyle = '#5865F2'; ctx.lineWidth = 8;
      ctx.strokeRect(x - 120, y - 200, 240, 160);
      
      ctx.fillStyle = '#5865F2';
      ctx.fillRect(x - 100, y - 180, 200, 120);
      
      ctx.fillStyle = 'white'; ctx.font = 'bold 36px Inter'; ctx.textAlign = 'center';
      ctx.fillText('DISCORD', x, y - 110);
      
      ctx.fillStyle = '#2f3640';
      ctx.fillRect(x - 20, y - 40, 40, 40);
      ctx.fillRect(x - 60, y, 120, 10);
      
      ctx.fillStyle = 'white'; ctx.font = '900 36px "Impact"'; ctx.textAlign = 'center';
      ctx.shadowBlur = 10; ctx.shadowColor = color; ctx.lineWidth = 6; ctx.strokeStyle = 'black';
      ctx.strokeText(text, x, y - 230); ctx.fillText(text, x, y - 230);
    }
    else {
      // Default Portal Fallback
      const portalWidth = 140; const portalHeight = 200; const thickness = 16;
      const startX = x - portalWidth / 2;
      ctx.shadowBlur = 20; ctx.shadowColor = color; ctx.fillStyle = color;
      ctx.fillRect(startX, y - portalHeight, thickness, portalHeight);
      ctx.fillRect(startX + portalWidth - thickness, y - portalHeight, thickness, portalHeight);
      ctx.fillRect(startX, y - portalHeight, portalWidth, thickness);
      
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(startX + thickness, y - portalHeight + thickness, portalWidth - thickness * 2, portalHeight - thickness);
      
      const gradient = ctx.createLinearGradient(0, y - portalHeight, 0, y);
      gradient.addColorStop(0, color); gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient; ctx.globalAlpha = 0.4;
      ctx.fillRect(startX + thickness, y - portalHeight + thickness, portalWidth - thickness * 2, portalHeight - thickness);
      
      ctx.globalAlpha = 1.0; ctx.fillStyle = 'white'; ctx.font = '900 36px "Impact"'; ctx.textAlign = 'center';
      ctx.shadowBlur = 10; ctx.shadowColor = color; ctx.lineWidth = 6; ctx.strokeStyle = 'black';
      ctx.strokeText(text, x, y - portalHeight - 40); ctx.fillText(text, x, y - portalHeight - 40);
    }
    
    ctx.restore();
  }

  setLeaderboardData(data) {
    this.leaderboardData = data;
    this.updateLeaderboardMesh();
  }

  updateLeaderboardMesh() {
    if (!this.leaderboardData || this.leaderboardData.length === 0) return;

    if (!this.leaderboardTexture) {
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 400;
      this.leaderboardTexture = new THREE.CanvasTexture(canvas);
      
      const mat = new THREE.MeshBasicMaterial({ map: this.leaderboardTexture, transparent: true });
      const geo = new THREE.PlaneGeometry(1000, 400);
      this.leaderboardMesh = new THREE.Mesh(geo, mat);
      this.leaderboardMesh.position.set(0, 300, -990); // On the back wall
      this.scene.add(this.leaderboardMesh);
    }

    const canvas = this.leaderboardTexture.image;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const screenWidth = 300;
    const screenHeight = 300;

    // Trophies Leaderboard (x = 100)
    this.drawSingleLeaderboardScreen(ctx, 100, 50, screenWidth, screenHeight, '🏆 獎杯榜 TOP 5', 'trophies', '#fbc531');

    // Time Leaderboard (x = 600)
    this.drawSingleLeaderboardScreen(ctx, 600, 50, screenWidth, screenHeight, '⏱️ 肝帝榜 TOP 5', 'time', '#4cd137');

    this.leaderboardTexture.needsUpdate = true;
  }

  drawSingleLeaderboardScreen(ctx, x, y, width, height, title, sortKey, color) {
    // Screen Border / Frame
    ctx.fillStyle = '#2f3542';
    ctx.fillRect(x - 5, y - 5, width + 10, height + 10);
    
    // Inner Screen
    ctx.fillStyle = '#1e272e';
    ctx.fillRect(x, y, width, height);

    // Neon Border Glow
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, width, height);

    // Title Background
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.2;
    ctx.fillRect(x, y, width, 40);
    ctx.globalAlpha = 1.0;

    // Title Text
    ctx.fillStyle = color;
    ctx.font = 'bold 20px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(title, x + width / 2, y + 28);

    // Sort Data
    const sorted = [...this.leaderboardData].sort((a, b) => {
      if (sortKey === 'trophies') return b.trophies - a.trophies;
      if (sortKey === 'time') return b.playTime - a.playTime;
      return 0;
    }).slice(0, 5);

    // Draw Entries
    ctx.textAlign = 'left';
    ctx.font = '16px Inter';
    sorted.forEach((user, index) => {
      const entryY = y + 75 + index * 40;

      if (index % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(x + 5, entryY - 24, width - 10, 32);
      }

      ctx.fillStyle = index === 0 ? '#ffda79' : index === 1 ? '#d1ccc0' : index === 2 ? '#cc8e35' : '#747d8c';
      ctx.font = 'bold 16px Inter';
      ctx.fillText(`#${index + 1}`, x + 15, entryY);

      ctx.fillStyle = '#ffffff';
      let displayName = user.username;
      if (displayName.length > 10) displayName = displayName.substring(0, 10) + '...';
      ctx.fillText(displayName, x + 50, entryY);

      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      if (sortKey === 'trophies') {
        ctx.fillText(`🏆 ${user.trophies}`, x + width - 15, entryY);
      } else if (sortKey === 'time') {
        const h = Math.floor(user.playTime / 60);
        const m = user.playTime % 60;
        ctx.fillText(`${h}h ${m}m`, x + width - 15, entryY);
      }
      ctx.textAlign = 'left';
    });
  }

  setLocalPlayer(player) {
    this.localPlayer = player;
    this.localPlayer.z = 0; // Initialize Z if not present
    this.localSprite = this.createPlayerSprite(this.localPlayer);
    this.scene.add(this.localSprite);
  }

  updateRemotePlayers(playersList) {
    // Create new players
    for (const data of playersList) {
      if (data.socketId === 'local') continue; // We are local
      
      let rp = this.remotePlayers.get(data.socketId);
      if (!rp) {
        rp = new Player(data.x, data.y, data.color, {}, data.facing, data.characterType, false, 1, undefined, data.skinId);
        rp.z = data.z || 0; // Read Z
        rp.username = data.username;
        rp.trophies = data.trophies;
        this.remotePlayers.set(data.socketId, rp);
        
        const sprite = this.createPlayerSprite(rp);
        this.playerSprites.set(data.socketId, sprite);
        this.scene.add(sprite);
      } else {
        // Smooth interpolation could be done here, but for now teleport
        rp.x = data.x;
        rp.y = data.y;
        rp.z = data.z || 0;
        rp.facing = data.facing;
        rp.color = data.color;
        rp.skinId = data.skinId;
        rp.characterType = data.characterType;
      }
    }
    
    // Remove disconnected players
    const currentIds = new Set(playersList.map(p => p.socketId));
    for (const [socketId, rp] of this.remotePlayers.entries()) {
      if (!currentIds.has(socketId)) {
        this.remotePlayers.delete(socketId);
        const sprite = this.playerSprites.get(socketId);
        if (sprite) {
          this.scene.remove(sprite);
          sprite.material.map.dispose();
          sprite.material.dispose();
          this.playerSprites.delete(socketId);
        }
      }
    }
  }

  createPlayerSprite(player) {
    // Hidden canvas for 2D rendering
    const canvas = document.createElement('canvas');
    canvas.width = 150;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    
    const material = new THREE.SpriteMaterial({ map: texture, color: 0xffffff });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(150, 200, 1);
    
    // Attach custom data to sprite to update texture
    sprite.userData = { canvas, ctx, texture, player };
    
    return sprite;
  }

  updatePlayerSpriteTexture(sprite) {
    const { canvas, ctx, texture, player } = sprite.userData;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Temporarily adjust player's coordinate to draw nicely on this 150x200 canvas
    const oldX = player.x;
    const oldY = player.y;
    
    // Center character horizontally
    player.x = (canvas.width - player.width) / 2;
    // Align to bottom
    player.y = canvas.height - player.height;
    
    // Draw using Player's native 2D draw function!
    try {
      player.draw(ctx);
    } catch(e) {
      // Fallback: Draw a colored rectangle if player.draw fails
      ctx.fillStyle = player.color || '#ff4757';
      ctx.fillRect(player.x + 10, player.y, player.width - 20, player.height);
      ctx.beginPath();
      ctx.arc(player.x + player.width / 2, player.y - 2, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Also draw username above head
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(player.username || 'Player', canvas.width / 2, player.y - 10);
    
    // Restore
    player.x = oldX;
    player.y = oldY;
    
    texture.needsUpdate = true;
    
    // Position the 3D sprite
    // Track previous position to detect movement
    const prevX = sprite.userData.prevX || player.x;
    const prevZ = sprite.userData.prevZ || (player.z || 0);
    const dx = player.x - prevX;
    const dz = (player.z || 0) - prevZ;
    const isWalking = Math.abs(dx) > 0.5 || Math.abs(dz) > 0.5;
    
    sprite.userData.prevX = player.x;
    sprite.userData.prevZ = player.z || 0;
    
    // Bob up and down when walking
    let spriteY = 100;
    if (isWalking) {
      spriteY += Math.abs(Math.sin(Date.now() / 100)) * 15;
    }
    
    sprite.position.set(player.x, spriteY, player.z || 0);
  }

  start() {
    console.log('[LobbyEngine3D] start() called. Scene children:', this.scene.children.length);
    this.lastTime = performance.now();
    // Render one frame immediately so the screen isn't black
    try {
      this.renderer.render(this.scene, this.camera);
      console.log('[LobbyEngine3D] First frame rendered OK');
    } catch(e) {
      console.error('[LobbyEngine3D] First render FAILED:', e);
    }
    this.animate();
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    // Exit pointer lock
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    this.canvas.removeEventListener('click', this.onCanvasClickBound);
    document.removeEventListener('mousemove', this.onPointerMoveBound);
    document.removeEventListener('pointerlockchange', this.onPointerLockChangeBound);
  }

  dispose() {
    this.stop();
    // Dispose all textures and materials
    this.scene.traverse((obj) => {
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
      if (obj.geometry) obj.geometry.dispose();
    });
    this.renderer.dispose();
    console.log('[LobbyEngine3D] Disposed');
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    
    const now = performance.now();
    const deltaTime = (now - this.lastTime) / 1000;
    this.lastTime = now;

    if (this.localPlayer) {
      // Sprint: Shift = 2x speed
      const isSprinting = this.localPlayer.keys['shift'];
      const baseSpeed = 400;
      const speed = (isSprinting ? baseSpeed * 2 : baseSpeed) * deltaTime;
      
      let moveX = 0;
      let moveZ = 0;
      if (this.localPlayer.keys['a']) moveX -= 1;
      if (this.localPlayer.keys['d']) moveX += 1;
      if (this.localPlayer.keys['w']) moveZ -= 1;
      if (this.localPlayer.keys['s']) moveZ += 1;

      const isMoving = moveX !== 0 || moveZ !== 0;

      if (isMoving) {
        const len = Math.hypot(moveX, moveZ);
        moveX /= len;
        moveZ /= len;

        const rotatedX = moveX * Math.cos(this.cameraAngle) + moveZ * Math.sin(this.cameraAngle);
        const rotatedZ = -moveX * Math.sin(this.cameraAngle) + moveZ * Math.cos(this.cameraAngle);

        this.localPlayer.x += rotatedX * speed;
        this.localPlayer.z += rotatedZ * speed;
        
        if (moveX < 0) this.localPlayer.facing = -1;
        if (moveX > 0) this.localPlayer.facing = 1;
        
        this.localPlayer.isWalkHopping = true;
        this.localPlayer.y = -Math.abs(Math.sin(Date.now() / 100) * 10);
        
        // Walk time for camera bob
        this.walkTime += deltaTime * (isSprinting ? 14 : 8);
      } else {
        this.localPlayer.isWalkHopping = false;
        this.localPlayer.y = 0;
        this.walkTime = 0;
      }
      
      // Bound
      if (this.localPlayer.z < -800) this.localPlayer.z = -800;
      if (this.localPlayer.z > 800) this.localPlayer.z = 800;
      
      this.updatePlayerSpriteTexture(this.localSprite);
      // Hide local sprite in first-person (it would block the view)
      this.localSprite.visible = false;
      
      // Camera: First Person View with head bob
      const eyeHeight = 120;
      const camX = this.localPlayer.x;
      let camY = eyeHeight;
      const camZ = this.localPlayer.z || 0;

      // Camera bob when walking
      if (isMoving) {
        const bobAmplitude = isSprinting ? 6 : 3;
        camY += Math.sin(this.walkTime) * bobAmplitude;
      }

      this.camera.position.set(camX, camY, camZ);

      // Look direction based on cameraAngle and cameraPitch
      const lookDist = 100;
      const lookX = camX - Math.sin(this.cameraAngle) * lookDist;
      const lookY = camY + Math.sin(this.cameraPitch) * lookDist;
      const lookZ = camZ - Math.cos(this.cameraAngle) * lookDist;

      this.camera.lookAt(lookX, lookY, lookZ);
      
      // Raycast or distance check for interactions
      if (this.localPlayer.keys['enter']) {
        this.localPlayer.keys['enter'] = false;
        
        // Loop through all objects in scene with userData.action
        for (const obj of this.scene.children) {
          if (obj.userData && obj.userData.action) {
            // Simple distance check (within 150 units horizontally and 150 units depth)
            if (Math.hypot(this.localPlayer.x - obj.position.x, (this.localPlayer.z || 0) - obj.position.z) < 150) {
              if (this.onInteract) {
                // Discord requires no portal animation block
                if (obj.userData.action === 'discord') {
                  this.onInteract(obj.userData.action);
                } else if (obj.userData.action === 'join_arcade') {
                  this.onInteract(obj.userData.action, obj.userData.slotId);
                } else {
                  this.onInteract(obj.userData.action);
                }
              }
              break;
            }
          }
        }
      }
    }

    for (const [id, sprite] of this.playerSprites.entries()) {
      this.updatePlayerSpriteTexture(sprite);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
