import * as THREE from 'three';
import { Player } from './Player';

export class LobbyEngine3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.localPlayer = null;
    this.remotePlayers = new Map();
    this.leaderboardData = [];
    this.leaderboardTexture = null;
    this.leaderboardMesh = null;
    
    // Set up WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setSize(this.canvas.width, this.canvas.height);
    this.renderer.setClearColor(0x1e272e); // Dark Cyberpunk background
    
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x1e272e, 0.0015);
    
    // Camera
    this.camera = new THREE.PerspectiveCamera(60, this.canvas.width / this.canvas.height, 1, 3000);
    this.camera.position.set(0, 300, 600); // High angled shot
    this.camera.lookAt(0, 0, 0);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0xff4757, 1.5, 1000);
    pointLight.position.set(0, 500, 0);
    this.scene.add(pointLight);

    // Environment
    this.buildEnvironment();

    // Map for player 3D sprites
    this.playerSprites = new Map(); // socketId -> Sprite
    this.localSprite = null;
    
    // Animation frame
    this.animationId = null;
    this.lastTime = performance.now();
  }

  buildEnvironment() {
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(4000, 2000);
    const floorMaterial = new THREE.MeshLambertMaterial({ color: 0x2f3640 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Walls
    const wallGeo = new THREE.BoxGeometry(4000, 600, 20);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x485460 });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, 300, -1000);
    this.scene.add(backWall);

    // Add neon lines to the wall
    const neonGeo = new THREE.BoxGeometry(4000, 10, 25);
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x00d2d3 });
    const neon = new THREE.Mesh(neonGeo, neonMat);
    neon.position.set(0, 500, -1000);
    this.scene.add(neon);
    
    // Portals (Boxes for now)
    this.createPortalMesh(600, 'Fight (Arcade)', 0xff4757);
    this.createPortalMesh(-600, 'Shop', 0xfbc531);
  }

  createPortalMesh(x, name, color) {
    const geo = new THREE.BoxGeometry(100, 150, 100);
    const mat = new THREE.MeshLambertMaterial({ color: color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 75, -500);
    this.scene.add(mesh);
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
    player.draw(ctx);
    
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
    // X and Z are standard
    // Y is up in 3D, our player.y is from top-left in 2D. 
    // We'll place the sprite at y=100 (half its height)
    sprite.position.set(player.x, 100, player.z || 0);
  }

  start() {
    this.lastTime = performance.now();
    this.animate();
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    
    const now = performance.now();
    const deltaTime = (now - this.lastTime) / 1000;
    this.lastTime = now;

    if (this.localPlayer) {
      // Very basic 3D movement logic. We override the 2D Player's update.
      const speed = 400 * deltaTime;
      if (this.localPlayer.keys['a']) this.localPlayer.x -= speed;
      if (this.localPlayer.keys['d']) this.localPlayer.x += speed;
      if (this.localPlayer.keys['w']) this.localPlayer.z -= speed;
      if (this.localPlayer.keys['s']) this.localPlayer.z += speed;
      
      // Face direction
      if (this.localPlayer.keys['a']) this.localPlayer.facing = -1;
      if (this.localPlayer.keys['d']) this.localPlayer.facing = 1;
      
      // Bound
      if (this.localPlayer.z < -800) this.localPlayer.z = -800;
      if (this.localPlayer.z > 800) this.localPlayer.z = 800;
      
      // Walk hop animation
      if (this.localPlayer.keys['w'] || this.localPlayer.keys['a'] || this.localPlayer.keys['s'] || this.localPlayer.keys['d']) {
        this.localPlayer.isWalkHopping = true;
        this.localPlayer.y = -Math.abs(Math.sin(Date.now() / 100) * 10);
      } else {
        this.localPlayer.isWalkHopping = false;
        this.localPlayer.y = 0;
      }
      
      this.updatePlayerSpriteTexture(this.localSprite);
      
      // Camera follow
      this.camera.position.x += (this.localPlayer.x - this.camera.position.x) * 5 * deltaTime;
      this.camera.position.z += ((this.localPlayer.z || 0) + 600 - this.camera.position.z) * 5 * deltaTime;
      
      // Raycast or distance check for interactions
      if (this.localPlayer.keys['enter']) {
        this.localPlayer.keys['enter'] = false;
        
        // Simple distance check
        if (Math.hypot(this.localPlayer.x - 600, (this.localPlayer.z || 0) - (-500)) < 150) {
          if (this.onInteract) this.onInteract('join_arcade', 'Slot1');
        }
        if (Math.hypot(this.localPlayer.x - (-600), (this.localPlayer.z || 0) - (-500)) < 150) {
          if (this.onInteract) this.onInteract('shop');
        }
      }
    }

    for (const [id, sprite] of this.playerSprites.entries()) {
      this.updatePlayerSpriteTexture(sprite);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
