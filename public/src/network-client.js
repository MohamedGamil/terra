/**
 * Real-Time WebSocket Multiplayer Network Client Engine for Terra.
 * Manages 6-character room codes (e.g. TERRA-8F92), multi-client room creation,
 * joining, player list synchronization, spawn selection, and 20Hz state delta reception.
 */

export class NetworkClient {
  constructor(serverUrl = null) {
    this.serverUrl = serverUrl || (typeof window !== 'undefined' ? `ws://${window.location.hostname}:3001` : 'ws://localhost:3001');
    this.ws = null;
    this.isConnected = false;
    this.roomCode = null;
    this.playerId = null;
    this.isHost = false;
    this.players = [];

    // Message event callbacks
    this.onConnected = null;
    this.onRoomCreated = null;
    this.onRoomJoined = null;
    this.onPlayerJoined = null;
    this.onPlayerLeft = null;
    this.onMatchStarted = null;
    this.onSpawnPicked = null;
    this.onStateDelta = null;
    this.onError = null;
  }

  connect() {
    if (this.ws) return;

    try {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        console.log(`[NetworkClient] Connected to Terra Multiplayer Server at ${this.serverUrl}`);
        if (this.onConnected) this.onConnected();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleServerMessage(msg);
        } catch (err) {
          console.error('[NetworkClient] Failed to parse server message:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[NetworkClient] WebSocket Error:', err);
        if (this.onError) this.onError(err);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.ws = null;
        console.log('[NetworkClient] WebSocket Disconnected.');
      };
    } catch (err) {
      console.warn('[NetworkClient] Could not establish WebSocket connection:', err.message);
    }
  }

  handleServerMessage(msg) {
    switch (msg.type) {
      case 'ROOM_CREATED':
        this.roomCode = msg.roomCode;
        this.playerId = msg.playerId;
        this.isHost = true;
        this.players = msg.players || [];
        if (this.onRoomCreated) this.onRoomCreated(msg);
        break;

      case 'ROOM_JOINED':
        this.roomCode = msg.roomCode;
        this.playerId = msg.playerId;
        this.isHost = false;
        this.players = msg.players || [];
        if (this.onRoomJoined) this.onRoomJoined(msg);
        break;

      case 'PLAYER_JOINED':
        this.players = msg.players || this.players;
        if (this.onPlayerJoined) this.onPlayerJoined(msg);
        break;

      case 'PLAYER_LEFT':
        this.players = msg.players || this.players;
        if (this.onPlayerLeft) this.onPlayerLeft(msg);
        break;

      case 'MATCH_STARTED':
        if (this.onMatchStarted) this.onMatchStarted(msg);
        break;

      case 'SPAWN_PICKED':
        if (this.onSpawnPicked) this.onSpawnPicked(msg);
        break;

      case 'STATE_DELTA':
        if (this.onStateDelta) this.onStateDelta(msg);
        break;

      case 'ERROR':
        if (this.onError) this.onError(msg.message);
        break;
    }
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  createRoom(playerName, playerColor, mapType, botCount, botDifficulty, seed) {
    this.send({
      type: 'CREATE_ROOM',
      playerName,
      playerColor,
      mapType,
      botCount,
      botDifficulty,
      seed
    });
  }

  joinRoom(roomCode, playerName, playerColor) {
    this.send({
      type: 'JOIN_ROOM',
      roomCode: roomCode.toUpperCase(),
      playerName,
      playerColor
    });
  }

  startMatch() {
    this.send({
      type: 'START_MATCH',
      roomCode: this.roomCode
    });
  }

  sendSpawn(pixelIdx) {
    this.send({
      type: 'PICK_SPAWN',
      roomCode: this.roomCode,
      playerId: this.playerId,
      pixelIdx
    });
  }

  sendAttack(targetPixelIdx, forcePercent) {
    this.send({
      type: 'CLIENT_ACTION',
      action: 'ATTACK',
      roomCode: this.roomCode,
      playerId: this.playerId,
      targetPixelIdx,
      forcePercent
    });
  }

  sendBoatAttack(targetPixelIdx, forcePercent) {
    this.send({
      type: 'CLIENT_ACTION',
      action: 'BOAT_ATTACK',
      roomCode: this.roomCode,
      playerId: this.playerId,
      targetPixelIdx,
      forcePercent
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.roomCode = null;
    this.playerId = null;
    this.isHost = false;
    this.players = [];
  }
}
