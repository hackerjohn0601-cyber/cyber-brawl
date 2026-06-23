import { io } from 'socket.io-client';

export class NetworkManager {
  constructor() {
    this.socket = null;
    this.isHost = false;
    this.roomId = null;
    
    // Callbacks
    this.onRoomCreated = null;
    this.onRoomJoined = null;
    this.onRoomError = null;
    this.onGuestJoined = null;
    this.onOpponentLeft = null;
    this.onLobbyAction = null;
    
    // Game relay callbacks
    this.onPlayerInput = null;
    this.onGameState = null;
    this.onRoundPhase = null;
    this.onGameOver = null;
    
    // Lobby callbacks
    this.onLobbyUpdate = null;
    this.onChatMessage = null;
    this.onLobbyState = null;
    this.onRoomList = null;
    
    // Spectator callbacks
    this.onSpectatorJoined = null;
    this.onSpectatorAdded = null;
    this.onSpectatorLeft = null;
    
    // Clan callbacks
    this.onClanInviteReceived = null;
    
    // Clan callbacks
    this.onClanInviteReceived = null;
  }

  connect(serverUrl = '') {
    if (this.socket) return;
    
    // If serverUrl is empty, io() automatically connects to the host that served the page
    this.socket = serverUrl ? io(serverUrl) : io();
    
    this.socket.on('connect', () => {
      console.log('Connected to multiplayer server');
    });

    this.socket.on('roomCreated', (code) => {
      this.isHost = true;
      this.roomId = code;
      if (this.onRoomCreated) this.onRoomCreated(code);
    });

    this.socket.on('roomJoined', (code) => {
      this.isHost = false;
      this.roomId = code;
      if (this.onRoomJoined) this.onRoomJoined(code);
    });

    this.socket.on('roomError', (msg) => {
      if (this.onRoomError) this.onRoomError(msg);
    });

    this.socket.on('guestJoined', (socketId) => {
      if (this.onGuestJoined) this.onGuestJoined();
    });

    this.socket.on('opponentLeft', () => {
      if (this.onOpponentLeft) this.onOpponentLeft();
    });

    this.socket.on('lobbyAction', (data) => {
      if (this.onLobbyAction) this.onLobbyAction(data);
    });

    this.socket.on('playerInput', (data) => {
      if (this.onPlayerInput) this.onPlayerInput(data);
    });

    this.socket.on('gameState', (data) => {
      if (this.onGameState) this.onGameState(data);
    });

    this.socket.on('roundPhase', (text) => {
      if (this.onRoundPhase) this.onRoundPhase(text);
    });

    this.socket.on('gameOver', (result) => {
      if (this.onGameOver) this.onGameOver(result);
    });

    this.socket.on('chatMessage', (msg) => {
      if (this.onChatMessage) this.onChatMessage(msg);
    });

    this.socket.on('lobbyState', (data) => {
      if (this.onLobbyState) this.onLobbyState(data);
    });

    this.socket.on('arcadeSlotsUpdate', (slots, details) => {
      if (this.onArcadeSlotsUpdate) this.onArcadeSlotsUpdate(slots, details);
    });

    this.socket.on('spectatorJoined', (code) => {
      this.isHost = false;
      this.roomId = code;
      this.isSpectator = true;
      if (this.onSpectatorJoined) this.onSpectatorJoined(code);
    });

    this.socket.on('spectatorAdded', (socketId) => {
      if (this.onSpectatorAdded) this.onSpectatorAdded(socketId);
    });

    this.socket.on('spectatorLeft', (socketId) => {
      if (this.onSpectatorLeft) this.onSpectatorLeft(socketId);
    });

    this.socket.on('globalBroadcast', (message) => {
      if (this.onGlobalBroadcast) this.onGlobalBroadcast(message);
    });

    this.socket.on('clan:inviteReceived', (data) => {
      if (this.onClanInviteReceived) this.onClanInviteReceived(data);
    });

    this.socket.on('clan:inviteResponse', (data) => {
      if (this.onClanInviteResponse) this.onClanInviteResponse(data);
    });
  }

  joinLobby(playerData) {
    if (this.socket) this.socket.emit('joinLobby', playerData);
  }

  sendLobbyUpdate(data) {
    if (this.socket) this.socket.emit('lobbyUpdate', data);
  }

  joinSlot(slotId) {
    if (this.socket) this.socket.emit('joinSlot', slotId);
  }

  joinSlotAsSpectator(slotId) {
    if (this.socket) this.socket.emit('joinSlot', slotId, true);
  }

  leaveSlot() {
    if (this.socket) {
      this.socket.emit('leaveSlot');
      this.roomId = null;
      this.isHost = false;
      this.isSpectator = false;
    }
  }

  sendLobbyAction(data) {
    if (this.socket && this.roomId) {
      this.socket.emit('lobbyAction', data);
    }
  }

  sendInput(key, isDown) {
    if (this.socket && this.roomId) {
      this.socket.emit('playerInput', { key, isDown });
    }
  }

  sendGameState(state) {
    if (this.socket && this.roomId && this.isHost) {
      this.socket.emit('gameState', state);
    }
  }

  sendRoundPhase(text) {
    if (this.socket && this.roomId && this.isHost) {
      this.socket.emit('roundPhase', text);
    }
  }

  sendGameOver(result) {
    if (this.socket && this.roomId && this.isHost) {
      this.socket.emit('gameOver', result);
    }
  }

  sendChatMessage(text) {
    if (this.socket) {
      this.socket.emit('chatMessage', text);
    }
  }

  emitMilestone(type, username) {
    if (this.socket) {
      this.socket.emit('milestoneReached', { type, username });
    }
  }

  // --- Clan Methods ---
  inviteToClan(targetUsername) {
    if (this.socket) this.socket.emit('clan:invite', targetUsername);
  }

  respondToClanInvite(accept, clanName, inviter) {
    if (this.socket) this.socket.emit('clan:inviteRespond', { accept, clanName, inviter });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isHost = false;
    this.roomId = null;
  }

  // --- Admin Methods ---
  adminAuthenticate(username, password) {
    if (this.socket) this.socket.emit('adminAuthenticate', { username, password });
  }

  getOnlinePlayers() {
    if (this.socket) this.socket.emit('getOnlinePlayers');
  }

  banPlayer(targetUsername) {
    if (this.socket) this.socket.emit('banPlayer', targetUsername);
  }

  adminGrantCurrency(targetUsername, type, amount) {
    if (this.socket) this.socket.emit('adminGrantCurrency', { targetUsername, type, amount });
  }
}

export const networkManager = new NetworkManager();
