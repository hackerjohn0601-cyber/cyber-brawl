import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fsPromises from 'fs/promises';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  fs.appendFileSync(path.join(__dirname, 'crash.log'), `Uncaught Exception: ${err.stack}\n`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  fs.appendFileSync(path.join(__dirname, 'crash.log'), `Unhandled Rejection: ${reason && reason.stack ? reason.stack : reason}\n`);
});

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the Vue frontend build
app.use(express.static(path.join(__dirname, '../client/dist'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Database handling
const dbPath = path.join(__dirname, 'db.json');

let dbLock = Promise.resolve();

async function getDB() {
  console.log('getDB called');
  return new Promise((resolve, reject) => {
    dbLock = dbLock.then(async () => {
      console.log('dbLock entered');
      try {
        const data = await fsPromises.readFile(dbPath, 'utf8');
        console.log('DB read success');
        resolve(JSON.parse(data));
      } catch (err) {
        console.error('DB read error:', err.code);
        if (err.code === 'ENOENT') {
          await fsPromises.writeFile(dbPath, JSON.stringify({ users: {}, bannedUsers: [] }));
          resolve({ users: {}, bannedUsers: [] });
        } else {
          resolve({ users: {}, bannedUsers: [] });
        }
      }
    }).catch(err => {
      console.error('dbLock error:', err);
      resolve({ users: {}, bannedUsers: [] });
    });
  });
}

async function saveDB(data) {
  return new Promise((resolve, reject) => {
    dbLock = dbLock.then(async () => {
      try {
        await fsPromises.writeFile(dbPath, JSON.stringify(data, null, 2));
        resolve();
      } catch (err) {
        console.error('saveDB write error:', err);
        reject(err);
      }
    }).catch(err => {
      console.error('dbLock error in saveDB:', err);
      reject(err);
    });
  });
}

// API Routes
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  if (username.length > 20) return res.status(400).json({ error: 'Username too long.' });
  
  const db = await getDB();
  if (db.users[username]) {
    return res.status(400).json({ error: 'Username already exists.' });
  }
  
  db.users[username] = {
    password, // In a real app, hash this!
    progress: {
      unlockedChars: ['Striker'],
      cpuMatches: 0,
      tokens: 0,
      quests: {
        parries: 0,
        cpuDefeated: 0,
        ultimatesHit: 0
      }
    }
  };
  
  await saveDB(db);
  res.json({ message: 'Registration successful', progress: db.users[username].progress });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  
  console.log('Login attempt:', username);
  const db = await getDB();
  console.log('DB fetched for login');
  const user = db.users[username];
  
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  
  if (db.bannedUsers && db.bannedUsers.includes(username)) {
    return res.status(403).json({ error: 'This account has been banned by an administrator.' });
  }
  
  // Ensure backward compatibility with newly added quest fields
  if (!user.progress.quests) {
    user.progress.quests = { parries: 0, cpuDefeated: 0, ultimatesHit: 0 };
    await saveDB(db);
  }
  
  res.json({ message: 'Login successful', progress: user.progress });
});

app.post('/api/syncProgress', async (req, res) => {
  const { username, password, progress } = req.body;
  if (!username || !password || !progress) return res.status(400).json({ error: 'Invalid payload.' });
  
  const db = await getDB();
  const user = db.users[username];
  
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  
  user.progress = progress;
  await saveDB(db);
  
  res.json({ message: 'Progress saved successfully.' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // For development, allow all origins
  }
});

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

let lobbyPlayers = {};
let arcadeSlots = { 'Slot1': 0, 'Slot2': 0, 'Slot3': 0, 'Slot4': 0 };
let slotDetails = { 
  'Slot1': { host: null, guest: null, spectators: [] },
  'Slot2': { host: null, guest: null, spectators: [] },
  'Slot3': { host: null, guest: null, spectators: [] },
  'Slot4': { host: null, guest: null, spectators: [] }
};

setInterval(() => {
  io.to('global_lobby').emit('lobbyState', lobbyPlayers);
  
  // Calculate slot occupancy
  for (let i = 1; i <= 4; i++) {
    const slotId = `Slot${i}`;
    const room = io.sockets.adapter.rooms.get(slotId);
    arcadeSlots[slotId] = room ? room.size : 0;
  }
  // Send both arcadeSlots and slotDetails so lobby can show spectator button
  io.to('global_lobby').emit('arcadeSlotsUpdate', arcadeSlots, slotDetails);
}, 1000 / 30);

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  socket.on('joinLobby', (playerData) => {
    socket.join('global_lobby');
    lobbyPlayers[socket.id] = playerData;
    socket.emit('arcadeSlotsUpdate', arcadeSlots, slotDetails);
  });

  socket.on('lobbyUpdate', (data) => {
    if (lobbyPlayers[socket.id]) {
      lobbyPlayers[socket.id] = { ...lobbyPlayers[socket.id], ...data };
    }
  });
  
  socket.on('joinSlot', (slotId, asSpectator = false) => {
    const room = io.sockets.adapter.rooms.get(slotId);
    const details = slotDetails[slotId];
    
    if (!details) return; // invalid slot

    if (asSpectator || (details.host && details.guest)) {
      if (!details.host) {
        socket.emit('roomError', 'Cannot spectate an empty room.');
        return;
      }
      socket.join(slotId);
      socket.roomId = slotId;
      socket.isHost = false;
      socket.isSpectator = true;
      details.spectators.push(socket.id);
      socket.leave('global_lobby');
      delete lobbyPlayers[socket.id];
      socket.emit('spectatorJoined', slotId);
      socket.to(slotId).emit('spectatorAdded', socket.id);
      console.log(`User ${socket.id} started spectating slot: ${slotId}`);
    } else if (!details.host) {
      socket.join(slotId);
      socket.roomId = slotId;
      socket.isHost = true;
      details.host = socket.id;
      socket.leave('global_lobby');
      delete lobbyPlayers[socket.id];
      socket.emit('roomCreated', slotId);
      console.log(`User ${socket.id} hosted slot: ${slotId}`);
    } else if (!details.guest) {
      socket.join(slotId);
      socket.roomId = slotId;
      socket.isHost = false;
      details.guest = socket.id;
      socket.leave('global_lobby');
      delete lobbyPlayers[socket.id];
      socket.emit('roomJoined', slotId);
      socket.to(slotId).emit('guestJoined', socket.id);
      console.log(`User ${socket.id} joined slot: ${slotId}`);
    }
  });

  // Relay inputs from Guest to Host
  socket.on('playerInput', (data) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('playerInput', data);
    }
  });

  // Relay game state from Host to Guest
  socket.on('gameState', (data) => {
    if (socket.roomId && socket.isHost) {
      socket.to(socket.roomId).emit('gameState', data);
    }
  });

  // Relay lobby actions (character selection, ready status) between Host and Guest
  socket.on('lobbyAction', (data) => {
    if (socket.roomId) {
      // Send to everyone else in the room
      socket.to(socket.roomId).emit('lobbyAction', data);
    }
  });

  // Start round phase sync (e.g. "3, 2, 1, FIGHT")
  socket.on('roundPhase', (text) => {
    if (socket.roomId && socket.isHost) {
      socket.to(socket.roomId).emit('roundPhase', text);
    }
  });
  
  // Game over sync
  socket.on('gameOver', (result) => {
    if (socket.roomId && socket.isHost) {
      socket.to(socket.roomId).emit('gameOver', result);
    }
  });

  // Global Chat
  socket.on('chatMessage', (text) => {
    const p = lobbyPlayers[socket.id];
    const username = p ? p.username : 'Guest';
    io.emit('chatMessage', {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      username: username,
      text: text,
      time: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Global Broadcast for Milestones
  socket.on('milestoneReached', (data) => {
    // data: { type: 1000|2000, username: string }
    const title = data.type === 2000 ? '新一代榮耀宗師！' : '新一代傳奇冠軍！';
    const message = `【世界公告】恭喜玩家 ${data.username} 成功登頂 ${data.type} 杯，成為${title}`;
    io.emit('globalBroadcast', message);
  });

  socket.on('leaveSlot', () => {
    if (socket.roomId) {
      const details = slotDetails[socket.roomId];
      if (details) {
        if (socket.isSpectator) {
          details.spectators = details.spectators.filter(id => id !== socket.id);
          socket.to(socket.roomId).emit('spectatorLeft', socket.id);
        } else {
          if (details.host === socket.id) details.host = null;
          if (details.guest === socket.id) details.guest = null;
          socket.to(socket.roomId).emit('opponentLeft');
          // If room is empty, clear it out
          if (!details.host && !details.guest && details.spectators.length === 0) {
            slotDetails[socket.roomId] = { host: null, guest: null, spectators: [] };
          }
        }
      }
      socket.leave(socket.roomId);
      socket.roomId = null;
      socket.isHost = false;
      socket.isSpectator = false;
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    delete lobbyPlayers[socket.id];
    
    if (socket.roomId) {
      const details = slotDetails[socket.roomId];
      if (details) {
        if (socket.isSpectator) {
          details.spectators = details.spectators.filter(id => id !== socket.id);
          socket.to(socket.roomId).emit('spectatorLeft', socket.id);
        } else {
          if (details.host === socket.id) details.host = null;
          if (details.guest === socket.id) details.guest = null;
          socket.to(socket.roomId).emit('opponentLeft');
        }
      }
    }
  });

  // Admin Events
  socket.on('adminAuthenticate', (data) => {
    if (data.username === 'john' && data.password === '0601') {
      socket.isAdmin = true;
      socket.emit('adminAuthenticated', { success: true });
    } else {
      socket.emit('adminAuthenticated', { success: false });
    }
  });

  socket.on('getAllUsers', async () => {
    if (!socket.isAdmin) return;
    try {
      const db = await getDB();
      const allUsers = Object.keys(db.users).map(username => ({
        username,
        isOnline: Object.values(lobbyPlayers).some(p => p.username === username)
      }));
      socket.emit('allUsersList', allUsers);
    } catch (e) {
      console.error(e);
    }
  });

  socket.on('getOnlinePlayers', () => {
    if (!socket.isAdmin) return;
    const players = Object.entries(lobbyPlayers).map(([id, data]) => ({
      socketId: id,
      username: data.username || 'Unknown',
      character: data.characterType
    }));
    socket.emit('onlinePlayersList', players);
  });

  socket.on('getLeaderboard', async () => {
    try {
      const db = await getDB();
      const users = Object.entries(db.users).map(([username, data]) => {
        const progress = data.progress || {};
        const trophies = progress.trophies || 0;
        const charPlayTime = progress.charPlayTime || {};
        const playTime = Object.values(charPlayTime).reduce((a, b) => a + b, 0);
        return { username, trophies, playTime };
      });
      socket.emit('leaderboardData', users);
    } catch (e) {
      console.error(e);
    }
  });

  socket.on('adminGrantCurrency', async (data) => {
    console.log('Received adminGrantCurrency:', data, 'isAdmin:', socket.isAdmin);
    const { targetUsername, type, amount } = data;
    if (!socket.isAdmin || !targetUsername || !type || !amount) {
      console.log('Failed validation:', { isAdmin: socket.isAdmin, targetUsername, type, amount });
      return;
    }

    try {
      const db = await getDB();
      if (!db.users || !db.users[targetUsername]) {
        console.log('Target user not found in DB:', targetUsername);
        return;
      }
      if (db.users && db.users[targetUsername]) {
        const userProgress = db.users[targetUsername].progress;
        if (type === 'tokens') {
          userProgress.tokens = (userProgress.tokens || 0) + Number(amount);
        } else if (type === 'goldCoins') {
          userProgress.goldCoins = (userProgress.goldCoins || 0) + Number(amount);
        }
        await saveDB(db);
        socket.emit('adminActionSuccess', { message: `已成功給予 ${targetUsername} ${amount} ${type === 'tokens' ? '代幣' : '金幣'}！` });
        
        // Find the target socket and push the updated progress
        for (const [id, data] of Object.entries(lobbyPlayers)) {
          if (data.username === targetUsername) {
            const targetSocket = io.sockets.sockets.get(id);
            if (targetSocket) {
              console.log(`Pushing progress to socket ${id} for user ${targetUsername}. goldCoins: ${userProgress.goldCoins}`);
              targetSocket.emit('progressSyncedFromServer', userProgress);
            } else {
              console.log(`Socket ${id} not found for user ${targetUsername}!`);
            }
          }
        }
      }
    } catch (e) {
      console.error('Error granting currency:', e);
    }
  });

  socket.on('banPlayer', async (targetUsername) => {
    if (!socket.isAdmin || !targetUsername) return;
    
    // 1. Add to database
    try {
      const db = await getDB();
      if (!db.bannedUsers) db.bannedUsers = [];
      if (!db.bannedUsers.includes(targetUsername)) {
        db.bannedUsers.push(targetUsername);
        await saveDB(db);
      }
    } catch (e) {
      console.error('Error banning user:', e);
    }

    // 2. Disconnect the target socket if they are currently online
    for (const [id, data] of Object.entries(lobbyPlayers)) {
      if (data.username === targetUsername) {
        const targetSocket = io.sockets.sockets.get(id);
        if (targetSocket) {
          targetSocket.emit('banned');
          targetSocket.disconnect(true);
        }
      }
    }
    socket.emit('banResult', { success: true, target: targetUsername });
  });

  // ===== EMOTE BROADCAST =====
  socket.on('emote', (emoteType) => {
    if (lobbyPlayers[socket.id]) {
      lobbyPlayers[socket.id].emote = emoteType;
      socket.to('global_lobby').emit('playerEmote', { socketId: socket.id, emote: emoteType });
    }
  });

  // ===== FRIEND SYSTEM =====
  socket.on('friend:request', async (targetUsername) => {
    const db = await getDB();
    if (!db.friends) db.friends = {};
    const myUsername = lobbyPlayers[socket.id]?.username;
    if (!myUsername || myUsername === targetUsername) return;
    if (!db.users[targetUsername]) { socket.emit('friend:error', '找不到該玩家'); return; }
    
    if (!db.friends[myUsername]) db.friends[myUsername] = { list: [], pending: [], requests: [] };
    if (!db.friends[targetUsername]) db.friends[targetUsername] = { list: [], pending: [], requests: [] };
    
    if (db.friends[myUsername].list.includes(targetUsername)) { socket.emit('friend:error', '已經是好友了'); return; }
    if (db.friends[targetUsername].requests.includes(myUsername)) { socket.emit('friend:error', '已經發送過請求了'); return; }
    if ((db.friends[myUsername].list.length || 0) >= 50) { socket.emit('friend:error', '好友已滿 (50人)'); return; }
    
    db.friends[targetUsername].requests.push(myUsername);
    db.friends[myUsername].pending.push(targetUsername);
    await saveDB(db);
    socket.emit('friend:requestSent', targetUsername);
    
    // Notify target if online
    for (const [id, data] of Object.entries(lobbyPlayers)) {
      if (data.username === targetUsername) {
        io.sockets.sockets.get(id)?.emit('friend:newRequest', myUsername);
      }
    }
  });

  socket.on('friend:accept', async (fromUsername) => {
    const db = await getDB();
    if (!db.friends) db.friends = {};
    const myUsername = lobbyPlayers[socket.id]?.username;
    if (!myUsername) return;
    
    if (!db.friends[myUsername]?.requests?.includes(fromUsername)) return;
    
    // Add to both friend lists
    db.friends[myUsername].list.push(fromUsername);
    db.friends[myUsername].requests = db.friends[myUsername].requests.filter(u => u !== fromUsername);
    if (!db.friends[fromUsername]) db.friends[fromUsername] = { list: [], pending: [], requests: [] };
    db.friends[fromUsername].list.push(myUsername);
    db.friends[fromUsername].pending = db.friends[fromUsername].pending.filter(u => u !== myUsername);
    await saveDB(db);
    
    socket.emit('friend:accepted', fromUsername);
    for (const [id, data] of Object.entries(lobbyPlayers)) {
      if (data.username === fromUsername) {
        io.sockets.sockets.get(id)?.emit('friend:accepted', myUsername);
      }
    }
  });

  socket.on('friend:decline', async (fromUsername) => {
    const db = await getDB();
    if (!db.friends) db.friends = {};
    const myUsername = lobbyPlayers[socket.id]?.username;
    if (!myUsername || !db.friends[myUsername]) return;
    db.friends[myUsername].requests = db.friends[myUsername].requests.filter(u => u !== fromUsername);
    if (db.friends[fromUsername]) db.friends[fromUsername].pending = db.friends[fromUsername].pending.filter(u => u !== myUsername);
    await saveDB(db);
    socket.emit('friend:declined', fromUsername);
  });

  socket.on('friend:remove', async (targetUsername) => {
    const db = await getDB();
    if (!db.friends) db.friends = {};
    const myUsername = lobbyPlayers[socket.id]?.username;
    if (!myUsername) return;
    if (db.friends[myUsername]) db.friends[myUsername].list = db.friends[myUsername].list.filter(u => u !== targetUsername);
    if (db.friends[targetUsername]) db.friends[targetUsername].list = db.friends[targetUsername].list.filter(u => u !== myUsername);
    await saveDB(db);
    socket.emit('friend:removed', targetUsername);
  });

  socket.on('friend:getList', async () => {
    const db = await getDB();
    if (!db.friends) db.friends = {};
    const myUsername = lobbyPlayers[socket.id]?.username;
    if (!myUsername) return;
    const myFriends = db.friends[myUsername] || { list: [], pending: [], requests: [] };
    
    // Add online status
    const friendsWithStatus = myFriends.list.map(name => ({
      username: name,
      online: Object.values(lobbyPlayers).some(p => p.username === name)
    }));
    
    socket.emit('friend:list', {
      friends: friendsWithStatus,
      requests: myFriends.requests || [],
      pending: myFriends.pending || []
    });
  });

  socket.on('friend:invite', (targetUsername) => {
    const myUsername = lobbyPlayers[socket.id]?.username;
    if (!myUsername) return;
    for (const [id, data] of Object.entries(lobbyPlayers)) {
      if (data.username === targetUsername) {
        io.sockets.sockets.get(id)?.emit('friend:battleInvite', { from: myUsername, socketId: socket.id });
      }
    }
  });

  // ===== CLAN SYSTEM =====
  socket.on('clan:create', async (clanData) => {
    const db = await getDB();
    if (!db.clans) db.clans = {};
    const myUsername = lobbyPlayers[socket.id]?.username;
    if (!myUsername) return;
    
    if (clanData.name.length < 2 || clanData.name.length > 20) { socket.emit('clan:error', '戰隊名稱需要 2-20 字'); return; }
    if (db.clans[clanData.name]) { socket.emit('clan:error', '戰隊名稱已被使用'); return; }
    
    // Check if already in a clan
    for (const [name, clan] of Object.entries(db.clans)) {
      if (clan.members.includes(myUsername)) { socket.emit('clan:error', '你已經有戰隊了'); return; }
    }
    
    db.clans[clanData.name] = {
      leader: myUsername,
      members: [myUsername],
      trophies: 0,
      maxMembers: 10,
      description: clanData.description || '',
      createdAt: new Date().toISOString()
    };
    await saveDB(db);
    socket.emit('clan:created', clanData.name);
  });

  socket.on('clan:join', async (clanName) => {
    const db = await getDB();
    if (!db.clans || !db.clans[clanName]) { socket.emit('clan:error', '找不到該戰隊'); return; }
    const myUsername = lobbyPlayers[socket.id]?.username;
    if (!myUsername) return;
    
    const clan = db.clans[clanName];
    if (clan.members.length >= clan.maxMembers) { socket.emit('clan:error', '戰隊已滿'); return; }
    if (clan.members.includes(myUsername)) { socket.emit('clan:error', '你已經在這個戰隊了'); return; }
    
    clan.members.push(myUsername);
    await saveDB(db);
    socket.emit('clan:joined', clanName);
  });

  socket.on('clan:leave', async () => {
    const db = await getDB();
    if (!db.clans) return;
    const myUsername = lobbyPlayers[socket.id]?.username;
    if (!myUsername) return;
    
    for (const [name, clan] of Object.entries(db.clans)) {
      if (clan.members.includes(myUsername)) {
        clan.members = clan.members.filter(m => m !== myUsername);
        if (clan.members.length === 0) { delete db.clans[name]; }
        else if (clan.leader === myUsername) { clan.leader = clan.members[0]; }
        await saveDB(db);
        socket.emit('clan:left', name);
        return;
      }
    }
  });

  socket.on('clan:getInfo', async () => {
    const db = await getDB();
    if (!db.clans) db.clans = {};
    const myUsername = lobbyPlayers[socket.id]?.username;
    if (!myUsername) return;
    
    let myClan = null;
    for (const [name, clan] of Object.entries(db.clans)) {
      if (clan.members.includes(myUsername)) {
        // Calculate total trophies
        let totalTrophies = 0;
        for (const member of clan.members) {
          totalTrophies += db.users[member]?.progress?.trophies || 0;
        }
        clan.trophies = totalTrophies;
        myClan = { name, ...clan };
        break;
      }
    }
    socket.emit('clan:info', myClan);
  });

  socket.on('clan:getList', async () => {
    const db = await getDB();
    if (!db.clans) db.clans = {};
    const clanList = Object.entries(db.clans).map(([name, clan]) => ({
      name,
      memberCount: clan.members.length,
      maxMembers: clan.maxMembers,
      leader: clan.leader,
      trophies: clan.trophies || 0
    })).sort((a, b) => b.trophies - a.trophies);
    socket.emit('clan:list', clanList);
  });

  // ===== CLAN CHAT =====
  socket.on('clan:chat', async (text) => {
    const db = await getDB();
    if (!db.clans) return;
    const myUsername = lobbyPlayers[socket.id]?.username;
    if (!myUsername || !text || text.length > 200) return;

    // Find my clan
    let myClanName = null;
    for (const [name, clan] of Object.entries(db.clans)) {
      if (clan.members.includes(myUsername)) { myClanName = name; break; }
    }
    if (!myClanName) return;

    const msg = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      username: myUsername,
      text: text,
      time: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      type: 'text'
    };

    // Send to all online clan members
    const clan = db.clans[myClanName];
    for (const [id, data] of Object.entries(lobbyPlayers)) {
      if (clan.members.includes(data.username)) {
        io.sockets.sockets.get(id)?.emit('clan:chatMsg', msg);
      }
    }
  });

  socket.on('clan:getInvitablePlayers', async () => {
    const db = await getDB();
    const myUsername = lobbyPlayers[socket.id]?.username;
    if (!myUsername || !db.clans) return;

    let myClan = null;
    for (const clan of Object.values(db.clans)) {
      if (clan.members.includes(myUsername)) {
        myClan = clan;
        break;
      }
    }
    
    if (!myClan) return;

    // Return all online players who are NOT in my clan
    const invitable = [];
    const onlineUsernames = new Set();
    for (const data of Object.values(lobbyPlayers)) {
      if (data.username && data.username !== myUsername) {
        onlineUsernames.add(data.username);
      }
    }

    for (const username of onlineUsernames) {
      if (!myClan.members.includes(username)) {
        invitable.push(username);
      }
    }
    
    socket.emit('clan:invitablePlayers', invitable);
  });

  // ===== CLAN INVITATIONS =====
  socket.on('clan:invite', async (targetUsername) => {
    const db = await getDB();
    if (!db.clans) return;
    const myUsername = lobbyPlayers[socket.id]?.username;
    if (!myUsername || !targetUsername || myUsername === targetUsername) return;

    // 1. Find my clan
    let myClanName = null;
    for (const [name, clan] of Object.entries(db.clans)) {
      if (clan.members.includes(myUsername)) { myClanName = name; break; }
    }
    if (!myClanName) {
      socket.emit('clan:error', '你目前沒有加入任何戰隊');
      return;
    }
    
    // 2. Check if target is online
    let targetSocketId = null;
    for (const [id, data] of Object.entries(lobbyPlayers)) {
      if (data.username === targetUsername) {
        targetSocketId = id;
        break;
      }
    }
    
    if (!targetSocketId) {
      socket.emit('clan:error', '該玩家目前不在線或不存在');
      return;
    }
    
    // 3. Send invite to target
    io.sockets.sockets.get(targetSocketId)?.emit('clan:inviteReceived', {
      clanName: myClanName,
      inviter: myUsername
    });
    
    socket.emit('clan:info', db.clans[myClanName]); // Refresh info just in case
  });

  socket.on('clan:inviteRespond', async (data) => {
    // data: { accept: boolean, clanName: string, inviter: string }
    const db = await getDB();
    const myUsername = lobbyPlayers[socket.id]?.username;
    if (!myUsername || !data.clanName) return;

    if (!data.accept) {
      // Could notify inviter they declined, but usually silent is fine
      return;
    }

    // Process acceptance
    if (!db.clans || !db.clans[data.clanName]) {
      socket.emit('clan:error', '該戰隊已經不存在');
      return;
    }

    const clan = db.clans[data.clanName];
    
    // Check if full
    if (clan.members.length >= clan.maxMembers) {
      socket.emit('clan:error', '該戰隊已經滿了');
      return;
    }
    
    // Check if I'm already in a clan
    let alreadyInClan = false;
    for (const c of Object.values(db.clans)) {
      if (c.members.includes(myUsername)) { alreadyInClan = true; break; }
    }
    if (alreadyInClan) {
      socket.emit('clan:error', '你已經有戰隊了，請先退出');
      return;
    }

    // Join the clan
    clan.members.push(myUsername);
    await saveDB(db);

    socket.emit('clan:joined', data.clanName);

    // Notify clan members
    const msg = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      username: '系統',
      text: `歡迎 ${myUsername} 加入戰隊！ (由 ${data.inviter} 邀請)`,
      time: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      type: 'text'
    };
    for (const [id, pData] of Object.entries(lobbyPlayers)) {
      if (clan.members.includes(pData.username)) {
        io.sockets.sockets.get(id)?.emit('clan:chatMsg', msg);
      }
    }
  });
  socket.on('clan:shareReplay', async (replayData) => {
    const db = await getDB();
    if (!db.clans) return;
    const myUsername = lobbyPlayers[socket.id]?.username;
    if (!myUsername) return;

    let myClanName = null;
    for (const [name, clan] of Object.entries(db.clans)) {
      if (clan.members.includes(myUsername)) { myClanName = name; break; }
    }
    if (!myClanName) return;

    const msg = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      username: myUsername,
      text: `分享了一場回放: ${replayData.metadata?.p1 || '?'} vs ${replayData.metadata?.p2 || '?'} (${replayData.metadata?.duration || '?'}秒)`,
      time: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      type: 'replay',
      replay: replayData
    };

    const clan = db.clans[myClanName];
    for (const [id, data] of Object.entries(lobbyPlayers)) {
      if (clan.members.includes(data.username)) {
        io.sockets.sockets.get(id)?.emit('clan:chatMsg', msg);
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT} (0.0.0.0)`);
});
