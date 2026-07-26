import { ColorPalette } from './color.js';
import { TerritoryRenderer } from './renderer.js';
import { TerritorySimulation } from './simulation.js';
import { MinimapRenderer } from './minimap.js';
import { BenchmarkRunner } from './benchmark.js';
import { MatchRecorder } from './match-recorder.js';
import { StatsDashboard } from './stats-dashboard.js';
import { ParticleSystem } from './particles.js';
import { SoundEngine } from './audio.js';
import { MapEditor } from './map-editor.js';
import { NetworkClient } from './network-client.js';

class TerraApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.contextMenu = document.getElementById('rts-context-menu');
    this.selectedMap = 'world';
    this.mapSeed = '12345';
    this.botCount = 100;
    this.botDifficulty = 'easy';
    this.playerColorHex = '#00f2fe';
    this.selectedForcePercent = 25;
    this.customMapData = null;
    this.gameMode = 'single'; // 'single' | 'multi'

    this.sound = new SoundEngine();
    this.palette = new ColorPalette(500, this.playerColorHex);
    this.simulation = new TerritorySimulation(1000, 1000, this.botCount, this.selectedMap, this.mapSeed);
    this.renderer = new TerritoryRenderer(this.canvas, 1000, 1000, this.palette);
    this.minimap = new MinimapRenderer(this.minimapCanvas, 1000, 1000, this.palette);

    this.particles = new ParticleSystem(500);
    this.recorder = new MatchRecorder(1.0);
    this.dashboard = new StatsDashboard('post-match-overlay', 'chart-canvas');
    this.mapEditor = new MapEditor(1000, 1000);
    this.netClient = new NetworkClient();

    this.isRunning = true;
    this.lastTime = performance.now();
    this.fpsHistory = [];
    this.targetPixelIdx = -1;
    this.matchElapsedSec = 0;

    this.initAudioUI();
    this.initParticleEvents();
    this.initMinimapEvents();
    this.initLobbyUI();
    this.initMultiplayerUI();
    this.initMapEditorUI();
    this.initCombatUI();
    this.initSpawnButtons();
    this.initContextMenuUI();
    this.initEmoteUI();
    this.setupRendererCallbacks();

    this.updateSceneVisibility('LOBBY');
    this.startLoop();
  }

  updateSceneVisibility(stateName) {
    const lobbyScreen = document.getElementById('lobby-screen');
    const spawnBanner = document.getElementById('spawn-banner');
    const playerHud = document.getElementById('player-hud');
    const topRightHud = document.getElementById('hud-top-right');
    const minimapContainer = document.getElementById('minimap-container');
    const targetBar = document.getElementById('target-bar');
    const postMatchOverlay = document.getElementById('post-match-overlay');
    const gameOverModal = document.getElementById('gameover-modal');
    const mapEditorModal = document.getElementById('map-editor-modal');
    const benchmarkModal = document.getElementById('benchmark-modal');

    const show = (el, flex = false) => {
      if (el) {
        el.classList.remove('hidden');
        el.style.display = flex ? 'flex' : 'block';
      }
    };
    const hide = (el) => {
      if (el) {
        el.classList.add('hidden');
        el.style.display = 'none';
      }
    };

    if (stateName === 'LOBBY') {
      show(lobbyScreen, true);
      hide(spawnBanner);
      hide(playerHud);
      hide(topRightHud);
      hide(minimapContainer);
      hide(targetBar);
      hide(postMatchOverlay);
      hide(gameOverModal);
      hide(mapEditorModal);
      hide(benchmarkModal);
    } else if (stateName === 'MAP_EDITOR') {
      show(mapEditorModal, true);
      hide(lobbyScreen);
      hide(spawnBanner);
      hide(playerHud);
      hide(topRightHud);
      hide(minimapContainer);
      hide(targetBar);
      hide(postMatchOverlay);
      hide(gameOverModal);
      hide(benchmarkModal);
    } else if (stateName === 'SPAWN_PICK') {
      show(spawnBanner, true);
      show(topRightHud, true);
      hide(lobbyScreen);
      hide(playerHud);
      hide(minimapContainer);
      hide(targetBar);
      hide(postMatchOverlay);
      hide(gameOverModal);
      hide(mapEditorModal);
      hide(benchmarkModal);
    } else if (stateName === 'PLAYING') {
      show(playerHud);
      show(topRightHud, true);
      show(minimapContainer);
      show(targetBar);
      hide(lobbyScreen);
      hide(spawnBanner);
      hide(postMatchOverlay);
      hide(gameOverModal);
      hide(mapEditorModal);
      hide(benchmarkModal);
    } else if (stateName === 'GAME_OVER') {
      show(topRightHud, true);
      show(minimapContainer);
      show(postMatchOverlay, true);
      hide(lobbyScreen);
      hide(spawnBanner);
      hide(playerHud);
      hide(targetBar);
      hide(mapEditorModal);
      hide(benchmarkModal);
    }
  }

  initAudioUI() {
    const audioBtn = document.getElementById('btn-toggle-audio');
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        const isMuted = this.sound.toggleMute();
        audioBtn.textContent = isMuted ? '🔇 Muted' : '🔊 Sound';
        audioBtn.title = isMuted ? 'Unmute Sound' : 'Mute Sound';
      });
    }
  }

  initParticleEvents() {
    this.simulation.onParticleEvent = (type, data) => {
      if (type === 'ATTACK_LAUNCH') {
        this.sound.playAttack();
        this.particles.spawnShockwave(data.x, data.y, data.color || '#00f2fe', 22);
        this.particles.spawnFloatingText(data.x, data.y, `-${TerritorySimulation.formatTroops(data.troops)}`, '#ff0055');
      } else if (type === 'BOAT_LAUNCH') {
        this.sound.playBoat();
        this.particles.spawnShockwave(data.x, data.y, '#00f2fe', 16);
        this.particles.spawnFloatingText(data.x, data.y, `⛵ BOAT (${TerritorySimulation.formatTroops(data.troops)})`, '#00f2fe');
      }
    };
  }

  initMinimapEvents() {
    this.minimap.onNavigate = (mapX, mapY) => {
      const idx = Math.floor(mapY) * this.simulation.width + Math.floor(mapX);
      this.renderer.centerOnPixel(idx, this.renderer.zoom);
    };
  }

  initLobbyUI() {
    const colorPicker = document.getElementById('input-player-color');
    colorPicker.addEventListener('change', (e) => {
      this.playerColorHex = e.target.value;
      this.palette.setPlayerColor(1, this.playerColorHex);
    });

    const seedInput = document.getElementById('input-map-seed');
    if (seedInput) {
      seedInput.addEventListener('input', (e) => {
        this.mapSeed = e.target.value || '12345';
      });
    }

    const randomSeedBtn = document.getElementById('btn-random-seed');
    if (randomSeedBtn) {
      randomSeedBtn.addEventListener('click', () => {
        const newSeed = Math.floor(Math.random() * 899999 + 100000).toString();
        this.mapSeed = newSeed;
        if (seedInput) seedInput.value = newSeed;
      });
    }

    const mapCards = document.querySelectorAll('.map-card');
    mapCards.forEach(card => {
      card.addEventListener('click', () => {
        mapCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.selectedMap = card.dataset.map;
      });
    });

    const botSlider = document.getElementById('slider-bot-count');
    const botLbl = document.getElementById('lbl-bot-count');
    botSlider.addEventListener('input', (e) => {
      this.botCount = parseInt(e.target.value, 10);
      botLbl.textContent = `${this.botCount} Bots`;
    });

    const diffBtns = document.querySelectorAll('.btn-diff');
    diffBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        diffBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.botDifficulty = btn.dataset.diff;
      });
    });

    document.getElementById('btn-start-match').addEventListener('click', () => {
      this.openSpawnSelectionPhase();
    });

    document.getElementById('btn-leave-match').addEventListener('click', () => {
      this.closeContextMenu();
      this.simulation.state = 'LOBBY';
      this.updateSceneVisibility('LOBBY');
    });

    document.getElementById('btn-restart-game').addEventListener('click', () => {
      document.getElementById('gameover-modal').classList.remove('active');
      this.closeContextMenu();
      this.simulation.state = 'LOBBY';
      this.updateSceneVisibility('LOBBY');
    });
  }

  initMultiplayerUI() {
    const tabSingle = document.getElementById('tab-mode-single');
    const tabMulti = document.getElementById('tab-mode-multi');
    const multiSection = document.getElementById('multiplayer-room-section');
    const createBtn = document.getElementById('btn-create-room');
    const joinBtn = document.getElementById('btn-join-room');
    const roomInput = document.getElementById('input-room-code');

    if (tabSingle && tabMulti) {
      tabSingle.addEventListener('click', () => {
        tabSingle.classList.add('active');
        tabMulti.classList.remove('active');
        this.gameMode = 'single';
        if (multiSection) multiSection.classList.add('hidden');
      });

      tabMulti.addEventListener('click', () => {
        tabMulti.classList.add('active');
        tabSingle.classList.remove('active');
        this.gameMode = 'multi';
        if (multiSection) multiSection.classList.remove('hidden');
        this.netClient.connect();
      });
    }

    const updatePlayersListUI = (players) => {
      const badge = document.getElementById('online-room-badge');
      const codeLbl = document.getElementById('lbl-active-room-code');
      const countLbl = document.getElementById('lbl-room-player-count');
      const listEl = document.getElementById('online-players-list');

      if (badge && codeLbl && countLbl) {
        badge.style.display = 'block';
        codeLbl.textContent = this.netClient.roomCode || 'TERRA-ROOM';
        countLbl.textContent = players.length;
      }

      if (listEl) {
        listEl.innerHTML = players.map(p => `<div>👤 ${p.name || 'Player'} (${p.isHost ? 'Host' : 'Member'})</div>`).join('');
      }
    };

    this.netClient.onRoomCreated = (data) => {
      updatePlayersListUI(data.players || []);
    };

    this.netClient.onRoomJoined = (data) => {
      updatePlayersListUI(data.players || []);
    };

    this.netClient.onPlayerJoined = (data) => {
      updatePlayersListUI(data.players || []);
    };

    this.netClient.onPlayerLeft = (data) => {
      updatePlayersListUI(data.players || []);
    };

    if (createBtn) {
      createBtn.addEventListener('click', () => {
        this.netClient.connect();
        const playerName = document.getElementById('input-player-name').value || 'Commander';
        this.netClient.createRoom(
          playerName,
          this.playerColorHex,
          this.selectedMap,
          this.botCount,
          this.botDifficulty,
          this.mapSeed
        );
      });
    }

    if (joinBtn && roomInput) {
      joinBtn.addEventListener('click', () => {
        const code = roomInput.value.trim();
        if (!code) {
          alert('Please enter a valid 6-character room code!');
          return;
        }
        this.netClient.connect();
        const playerName = document.getElementById('input-player-name').value || 'Commander';
        this.netClient.joinRoom(code, playerName, this.playerColorHex);
      });
    }
  }

  initMapEditorUI() {
    const modal = document.getElementById('map-editor-modal');
    const openBtn = document.getElementById('btn-open-map-editor');
    const closeBtn = document.getElementById('btn-close-map-editor');
    const editorCanvas = document.getElementById('editor-canvas');

    if (!modal || !editorCanvas) return;
    const ctx = editorCanvas.getContext('2d');

    const updateStatsUI = () => {
      const stats = this.mapEditor.getStatistics();
      const landEl = document.getElementById('stat-land-pct');
      const oceanEl = document.getElementById('stat-ocean-pct');
      const mountainEl = document.getElementById('stat-mountain-pct');
      const spawnEl = document.getElementById('stat-spawn-count');

      if (landEl) landEl.textContent = `${stats.landPct}%`;
      if (oceanEl) oceanEl.textContent = `${stats.oceanPct}%`;
      if (mountainEl) mountainEl.textContent = `${stats.mountainPct}%`;
      if (spawnEl) spawnEl.textContent = stats.spawnCount;

      this.mapEditor.renderToCanvas(ctx);
    };

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        this.updateSceneVisibility('MAP_EDITOR');
        updateStatsUI();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.updateSceneVisibility('LOBBY');
      });
    }

    // Tool switching
    const toolBtns = document.querySelectorAll('.editor-tool-btn');
    toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        toolBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.mapEditor.setTool(btn.dataset.tool);
      });
    });

    // Brush slider
    const brushSlider = document.getElementById('editor-brush-slider');
    const brushVal = document.getElementById('editor-brush-val');
    if (brushSlider && brushVal) {
      brushSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.mapEditor.setBrushRadius(val);
        brushVal.textContent = `${val}px`;
      });
    }

    // Canvas drawing mouse handlers
    let isDrawing = false;

    const paintFromEvent = (e) => {
      const rect = editorCanvas.getBoundingClientRect();
      const scaleX = 1000 / rect.width;
      const scaleY = 1000 / rect.height;

      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      this.mapEditor.paintAt(x, y);
      updateStatsUI();
    };

    editorCanvas.addEventListener('mousedown', (e) => {
      isDrawing = true;
      paintFromEvent(e);
    });

    editorCanvas.addEventListener('mousemove', (e) => {
      if (isDrawing) paintFromEvent(e);
    });

    window.addEventListener('mouseup', () => {
      isDrawing = false;
    });

    // Clear Canvas
    const clearBtn = document.getElementById('btn-editor-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.mapEditor.clearMap(0);
        updateStatsUI();
      });
    }

    // Export Map JSON
    const exportBtn = document.getElementById('btn-editor-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const jsonStr = JSON.stringify(this.mapEditor.exportToJSON('Custom Map'), null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'terra-custom-map.json';
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    // Import Map JSON
    const importInput = document.getElementById('input-editor-import');
    if (importInput) {
      importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const jsonData = JSON.parse(evt.target.result);
            this.mapEditor.importFromJSON(jsonData);
            updateStatsUI();
          } catch (err) {
            alert('Failed to import map JSON: ' + err.message);
          }
        };
        reader.readAsText(file);
      });
    }

    // Play This Map
    const playBtn = document.getElementById('btn-editor-use-map');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.selectedMap = 'custom';
        this.customMapData = this.mapEditor.exportToJSON('Custom Map');

        // Select custom map card in lobby
        document.querySelectorAll('.map-card').forEach(c => c.classList.remove('active'));
        const customCard = document.getElementById('map-card-custom');
        if (customCard) customCard.classList.add('active');

        modal.classList.add('hidden');
        this.openSpawnSelectionPhase();
      });
    }
  }

  initCombatUI() {
    const attackSlider = document.getElementById('attack-slider');
    const attackVal = document.getElementById('attack-val');

    const updateForceUI = (val) => {
      this.selectedForcePercent = parseInt(val, 10);
      attackSlider.value = this.selectedForcePercent;
      attackVal.textContent = `${this.selectedForcePercent}%`;

      document.querySelectorAll('.btn-quick').forEach(btn => {
        const f = parseInt(btn.dataset.force, 10);
        if (f === this.selectedForcePercent) btn.classList.add('active');
        else btn.classList.remove('active');
      });
    };

    attackSlider.addEventListener('input', (e) => updateForceUI(e.target.value));

    document.querySelectorAll('.btn-quick').forEach(btn => {
      btn.addEventListener('click', () => updateForceUI(btn.dataset.force));
    });

    const attackBtn = document.getElementById('btn-attack-execute');
    if (attackBtn) {
      attackBtn.addEventListener('click', () => {
        if (this.targetPixelIdx >= 0) {
          const targetOwner = this.simulation.grid[this.targetPixelIdx];
          const isTargeted = (targetOwner !== 0);
          if (this.simulation.executeAttack(1, this.targetPixelIdx, this.selectedForcePercent, isTargeted)) {
            this.sound.playAttack();
          }
        }
      });
    }

    const boatBtn = document.getElementById('btn-boat-execute');
    if (boatBtn) {
      boatBtn.addEventListener('click', () => {
        if (this.targetPixelIdx >= 0) {
          if (this.simulation.launchBoatAttack(1, this.targetPixelIdx, this.selectedForcePercent)) {
            this.sound.playBoat();
          }
        }
      });
    }

    const radarBtn = document.getElementById('btn-radar-execute');
    if (radarBtn) {
      radarBtn.addEventListener('click', () => {
        let tx = null, ty = null;
        if (this.targetPixelIdx >= 0) {
          tx = this.targetPixelIdx % this.simulation.width;
          ty = Math.floor(this.targetPixelIdx / this.simulation.width);
        }
        this.simulation.triggerScoutRadar(1, tx, ty);
      });
    }

    const fogBtn = document.getElementById('btn-toggle-fog');
    if (fogBtn) {
      fogBtn.addEventListener('click', () => {
        this.simulation.fogOfWarEnabled = !this.simulation.fogOfWarEnabled;
        this.renderer.fogOfWarEnabled = this.simulation.fogOfWarEnabled;
        const stateStr = this.simulation.fogOfWarEnabled ? 'Enabled' : 'Disabled';
        this.simulation.addToast(`Fog of War ${stateStr}`, 'info');
      });
    }

    const audioBtn = document.getElementById('btn-toggle-audio');
    if (audioBtn) {
      audioBtn.addEventListener('click', () => {
        const muted = this.sound.toggleMute();
        audioBtn.textContent = muted ? '🔇 Muted' : '🔊 Sound';
        this.simulation.addToast(muted ? 'Audio Muted' : 'Audio Enabled', 'info');
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') {
        if (this.simulation.state === 'PLAYING') {
          let tx = null, ty = null;
          if (this.targetPixelIdx >= 0) {
            tx = this.targetPixelIdx % this.simulation.width;
            ty = Math.floor(this.targetPixelIdx / this.simulation.width);
          }
          this.simulation.triggerScoutRadar(1, tx, ty);
        }
      }
    });

    const benchBtn = document.getElementById('btn-run-benchmark');
    if (benchBtn) {
      benchBtn.addEventListener('click', () => this.runBenchmark());
    }

    const closeModalBtn = document.getElementById('btn-close-modal');
    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', () => {
        const modal = document.getElementById('benchmark-modal');
        if (modal) modal.classList.add('hidden');
      });
    }
  }

  initSpawnButtons() {
    document.getElementById('btn-confirm-spawn').addEventListener('click', () => {
      this.launchMatchWithCountdown();
    });

    document.getElementById('btn-random-spawn').addEventListener('click', () => {
      const width = this.simulation.width;
      const height = this.simulation.height;
      let rIdx = 0;
      do {
        rIdx = Math.floor(Math.random() * (width * height));
      } while (this.simulation.terrainGrid[rIdx] !== 1);

      this.simulation.setHumanSpawn(rIdx);
      const rx = rIdx % width;
      const ry = Math.floor(rIdx / width);
      this.renderer.spawnPickPoint = { x: rx, y: ry };

      const confirmBtn = document.getElementById('btn-confirm-spawn');
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = '1.0';

      const subText = document.getElementById('spawn-sub-text');
      if (subText) subText.textContent = '✓ Random Spawn Selected! Click LOCK SPAWN & START MATCH.';
    });
  }

  setupRendererCallbacks() {
    this.canvas.oncontextmenu = (e) => e.preventDefault();

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.simulation.state === 'SPAWN_PICK') {
        const coords = this.renderer.screenToMapCoords(e.clientX, e.clientY);
        if (coords && this.simulation.terrainGrid[coords.idx] === 1) {
          this.renderer.hoverSpawnPoint = { x: coords.mapX, y: coords.mapY };
        } else {
          this.renderer.hoverSpawnPoint = null;
        }
      } else {
        this.renderer.hoverSpawnPoint = null;
      }
    });

    this.renderer.onCanvasClick = (coords, buttonType, e) => {
      this.closeContextMenu();

      if (this.simulation.state === 'SPAWN_PICK') {
        if (buttonType === 'left') {
          const ok = this.simulation.setHumanSpawn(coords.idx);
          const subText = document.getElementById('spawn-sub-text');
          const confirmBtn = document.getElementById('btn-confirm-spawn');

          if (ok) {
            this.renderer.spawnPickPoint = { x: coords.mapX, y: coords.mapY };
            if (subText) subText.textContent = '✓ Spawn Selected! Click LOCK SPAWN & START MATCH to launch.';
            if (confirmBtn) {
              confirmBtn.disabled = false;
              confirmBtn.style.opacity = '1.0';
            }
          } else {
            if (subText) subText.textContent = '⚠️ Invalid Location! Click on green neutral land area.';
          }
        }
      } else if (this.simulation.state === 'PLAYING') {
        let idx = coords.idx;
        const initialOwner = this.simulation.grid[idx];
        if (initialOwner <= 1) {
          const rivalIdx = this.findClosestRivalPixel(idx, 12);
          if (rivalIdx !== -1) {
            idx = rivalIdx;
          }
        }

        this.targetPixelIdx = idx;
        this.renderer.targetPixelIdx = idx;

        const targetOwner = this.simulation.grid[idx];
        const terrainType = this.simulation.terrainGrid[idx];
        const statusText = document.getElementById('target-status-text');

        const snapX = idx % this.simulation.width;
        const snapY = Math.floor(idx / this.simulation.width);

        if (targetOwner === 0) {
          statusText.textContent = terrainType === 0 ? `Ocean Water Cell (${snapX}, ${snapY})` : `Unclaimed Neutral Land (${snapX}, ${snapY})`;
        } else if (targetOwner === 1) {
          statusText.textContent = `Your Kingdom (${snapX}, ${snapY})`;
        } else {
          const rival = this.simulation.players[targetOwner];
          const troopText = rival ? ` [Troops: ${TerritorySimulation.formatTroops(rival.balance)}]` : '';
          statusText.textContent = `Bot ${targetOwner}'s Territory (${snapX}, ${snapY})${troopText}`;
        }

        if (buttonType === 'right') {
          this.openContextMenu(e.clientX, e.clientY, terrainType);
        }
      }
    };

    this.renderer.onCanvasDoubleClick = (coords, e) => {
      if (this.simulation && this.simulation.state === 'PLAYING') {
        let idx = coords.idx;
        const initialOwner = this.simulation.grid[idx];
        if (initialOwner <= 1) {
          const rivalIdx = this.findClosestRivalPixel(idx, 12);
          if (rivalIdx !== -1) {
            idx = rivalIdx;
          }
        }

        this.targetPixelIdx = idx;
        this.renderer.targetPixelIdx = idx;

        const targetOwner = this.simulation.grid[idx];
        const isTargeted = (targetOwner !== 0);
        const terrainType = this.simulation.terrainGrid[idx];

        const tx = idx % this.simulation.width;
        const ty = Math.floor(idx / this.simulation.width);
        const crosshairX = this.renderer.panX + (tx + 0.5) * this.renderer.zoom;
        const crosshairY = this.renderer.panY + (ty + 0.5) * this.renderer.zoom;

        console.log('[DOUBLE-CLICK DEBUG]', {
          screenClick: { x: e.clientX, y: e.clientY },
          mapClickRaw: { x: coords.mapX, y: coords.mapY },
          snappedTargetMap: { x: tx, y: ty },
          crosshairScreen: { x: crosshairX, y: crosshairY },
          zoom: this.renderer.zoom,
          pan: { x: this.renderer.panX, y: this.renderer.panY }
        });

        if (this.particles) {
          const tx = idx % this.simulation.width;
          const ty = Math.floor(idx / this.simulation.width);
          this.particles.spawnShockwave(tx, ty, '#ff00aa', 24);
          for (let i = 0; i < 6; i++) {
            this.particles.spawnSpark(tx, ty, '#ff00aa');
          }
          this.particles.spawnFloatingText(tx, ty - 5, '🎯 TARGET', '#ff00aa');
        }

        if (terrainType === 0) {
          this.simulation.launchBoatAttack(1, idx, this.selectedForcePercent);
        } else if (terrainType === 1) {
          this.simulation.executeAttack(1, idx, this.selectedForcePercent, isTargeted);
        }
      }
    };
  }

  initContextMenuUI() {
    document.addEventListener('click', (e) => {
      if (!this.contextMenu.contains(e.target) && e.target !== this.canvas) {
        this.closeContextMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeContextMenu();
    });

    document.getElementById('ctx-attack').addEventListener('click', () => {
      if (this.targetPixelIdx >= 0) {
        const targetOwner = this.simulation.grid[this.targetPixelIdx];
        const isTargeted = (targetOwner !== 0);
        this.simulation.executeAttack(1, this.targetPixelIdx, this.selectedForcePercent, isTargeted);
      }
      this.closeContextMenu();
    });

    document.getElementById('ctx-boat').addEventListener('click', () => {
      if (this.targetPixelIdx >= 0) {
        this.simulation.launchBoatAttack(1, this.targetPixelIdx, this.selectedForcePercent);
      }
      this.closeContextMenu();
    });

    const proposeBtn = document.getElementById('ctx-nap-propose');
    if (proposeBtn) {
      proposeBtn.addEventListener('click', () => {
        if (this.targetPixelIdx >= 0) {
          const targetOwner = this.simulation.grid[this.targetPixelIdx];
          if (targetOwner > 0 && targetOwner !== 1) {
            this.simulation.proposePact(1, targetOwner);
          }
        }
        this.closeContextMenu();
      });
    }

    const breakBtn = document.getElementById('ctx-nap-break');
    if (breakBtn) {
      breakBtn.addEventListener('click', () => {
        if (this.targetPixelIdx >= 0) {
          const targetOwner = this.simulation.grid[this.targetPixelIdx];
          if (targetOwner > 0 && targetOwner !== 1) {
            this.simulation.breakPact(1, targetOwner);
          }
        }
        this.closeContextMenu();
      });
    }

    const aidBtn = document.getElementById('ctx-send-aid');
    if (aidBtn) {
      aidBtn.addEventListener('click', () => {
        if (this.targetPixelIdx >= 0) {
          const targetOwner = this.simulation.grid[this.targetPixelIdx];
          if (targetOwner > 0 && targetOwner !== 1) {
            this.simulation.sendAid(1, targetOwner, 10);
          }
        }
        this.closeContextMenu();
      });
    }

    document.getElementById('ctx-lock').addEventListener('click', () => {
      this.closeContextMenu();
    });

    document.getElementById('ctx-cancel').addEventListener('click', () => {
      this.targetPixelIdx = -1;
      this.renderer.targetPixelIdx = -1;
      document.getElementById('target-status-text').textContent = 'Click or right-click any territory on map.';
      this.closeContextMenu();
    });
  }

  initEmoteUI() {
    const emoteBtn = document.getElementById('btn-emote-wheel');
    const overlay = document.getElementById('emote-wheel-overlay');
    const closeBtn = document.getElementById('btn-close-emotes');
    const feed = document.getElementById('emote-chat-feed');

    const toggleWheel = () => {
      if (this.simulation && this.simulation.state === 'PLAYING') {
        overlay.classList.toggle('hidden');
        overlay.style.display = overlay.classList.contains('hidden') ? 'none' : 'flex';
      }
    };

    if (emoteBtn) {
      emoteBtn.addEventListener('click', toggleWheel);
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
      });
    }

    const emoteButtons = overlay.querySelectorAll('.btn-emote');
    emoteButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const emote = btn.getAttribute('data-emote');
        if (this.simulation) {
          this.simulation.broadcastEmote(1, emote);
        }
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'e') {
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          e.preventDefault();
          toggleWheel();
        }
      } else if (e.key === 'Escape') {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
      }
    });

    this.appendChatMessage = (name, color, emoji) => {
      if (!feed) return;
      const msgEl = document.createElement('div');
      msgEl.className = 'chat-message';
      msgEl.style.borderLeftColor = color;
      msgEl.innerHTML = `<span style="color: ${color}; font-weight: 700;">${name}</span> <span>${emoji}</span>`;
      
      feed.appendChild(msgEl);
      feed.scrollTop = feed.scrollHeight;

      setTimeout(() => {
        msgEl.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        msgEl.style.opacity = '0';
        msgEl.style.transform = 'translateX(-20px)';
        setTimeout(() => msgEl.remove(), 500);
      }, 5500);
    };
  }

  findClosestRivalPixel(idx, maxRadius = 25) {
    if (!this.simulation) return -1;
    const width = this.simulation.width;
    const height = this.simulation.height;
    const cx = idx % width;
    const cy = Math.floor(idx / width);

    let closestIdx = -1;
    let minDistance = Infinity;

    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;

          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            const owner = this.simulation.grid[nIdx];
            if (owner > 1) {
              const d = Math.hypot(dx, dy);
              if (d < minDistance) {
                minDistance = d;
                closestIdx = nIdx;
              }
            }
          }
        }
      }
      if (closestIdx !== -1) break;
    }
    return closestIdx;
  }

  openContextMenu(screenX, screenY, terrainType) {
    this.contextMenu.style.display = 'flex';
    this.contextMenu.style.left = `${Math.min(screenX, window.innerWidth - 220)}px`;
    this.contextMenu.style.top = `${Math.min(screenY, window.innerHeight - 180)}px`;

    const attackItem = document.getElementById('ctx-attack');
    const boatItem = document.getElementById('ctx-boat');

    if (terrainType === 0) {
      boatItem.classList.add('highlight');
      attackItem.classList.remove('highlight');
    } else {
      attackItem.classList.add('highlight');
      boatItem.classList.remove('highlight');
    }
  }

  closeContextMenu() {
    this.contextMenu.style.display = 'none';
  }

  openSpawnSelectionPhase() {
    const playerName = document.getElementById('input-player-name').value || 'Commander';
    this.updateSceneVisibility('SPAWN_PICK');

    this.palette = new ColorPalette(this.botCount + 1, this.playerColorHex);
    this.simulation = new TerritorySimulation(1000, 1000, this.botCount, this.selectedMap, this.mapSeed, this.customMapData);
    this.simulation.isMultiplayer = (this.gameMode === 'multi');
    this.simulation.onEmoteBroadcast = (name, color, emoji) => {
      if (this.appendChatMessage) {
        this.appendChatMessage(name, color, emoji);
      }
    };
    
    // Start Step 2 Untimed Spawn Selection Phase FIRST
    this.simulation.startSpawnPhase();
    if (this.simulation.players && this.simulation.players[1]) {
      this.simulation.players[1].name = playerName;
    }
    for (let id = 1; id <= this.botCount; id++) {
      if (this.simulation.players[id]) {
        this.simulation.players[id].color = this.palette.getHex(id);
      }
    }

    this.simulation.onParticleEvent = (eventType, data) => {
      if (!this.particles) return;
      if (eventType === 'ATTACK_LAUNCH') {
        this.particles.spawnShockwave(data.x, data.y, data.color || '#00f2fe', 24);
        for (let i = 0; i < 5; i++) {
          this.particles.spawnSpark(data.x, data.y, data.color || '#00f2fe');
        }
      } else if (eventType === 'BOAT_LAUNCH') {
        this.particles.spawnShockwave(data.x, data.y, '#00f2fe', 30);
        this.particles.spawnFloatingText(data.x, data.y, '🚤 NAVAL', '#00f2fe');
      } else if (eventType === 'CONQUEST') {
        this.particles.spawnShockwave(data.x, data.y, data.color || '#00f2fe', 16);
      }
    };

    if (this.renderer) {
      this.renderer.destroy();
    }
    if (this.minimap) {
      this.minimap.destroy();
    }
    this.renderer = new TerritoryRenderer(this.canvas, 1000, 1000, this.palette);
    this.minimap = new MinimapRenderer(this.minimapCanvas, 1000, 1000, this.palette);
    this.initMinimapEvents();
    this.setupRendererCallbacks();

    this.renderer.spawnPickPoint = null;
    this.renderer.hoverSpawnPoint = null;
    this.renderer.targetPixelIdx = -1;
    this.targetPixelIdx = -1;

    const subText = document.getElementById('spawn-sub-text');
    if (subText) subText.textContent = 'Click anywhere on neutral land to choose your starting kingdom';

    const confirmBtn = document.getElementById('btn-confirm-spawn');
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.5';

    requestAnimationFrame(() => {
      if (this.renderer) {
        this.renderer.forceFitViewport();
      }
    });
  }

  launchMatchWithCountdown() {
    const overlay = document.getElementById('countdown-overlay');
    const numEl = document.getElementById('countdown-num');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.style.display = 'flex';
    }

    if (this.simulation.humanSpawnIdx !== null) {
      this.renderer.centerOnPixel(this.simulation.humanSpawnIdx, 2.5);
    }

    let count = 3;
    if (numEl) numEl.textContent = '3';

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        if (numEl) numEl.textContent = `${count}`;
      } else if (count === 0) {
        if (numEl) numEl.textContent = 'GO!';
      } else {
        clearInterval(interval);
        if (overlay) {
          overlay.classList.add('hidden');
          overlay.style.display = 'none';
        }
        this.updateSceneVisibility('PLAYING');

        this.simulation.confirmSpawnsAndStart();
        this.recorder.start();
        this.matchElapsedSec = 0;
      }
    }, 600);
  }

  runBenchmark() {
    this.isRunning = false;
    const progressEl = document.getElementById('benchmark-progress');
    const statusText = document.getElementById('benchmark-status');

    statusText.textContent = 'Benchmarking 1000x1000 Canvas Rendering (1,000 frames)...';
    document.getElementById('benchmark-modal').classList.add('active');

    const benchSim = new TerritorySimulation(1000, 1000, 500, 'world');
    benchSim.startSpawnPhase();
    benchSim.confirmSpawnsAndStart();

    const benchRunner = new BenchmarkRunner(
      this.renderer,
      benchSim,
      (progress) => {
        progressEl.textContent = `Progress: ${progress.progressPercent}% (${progress.frameCount}/${progress.targetFrames} frames) | Current FPS: ${progress.currentFps}`;
      },
      (results) => {
        this.displayBenchmarkResults(results);
        this.isRunning = true;
        this.startLoop();
      }
    );

    benchRunner.start();
  }

  displayBenchmarkResults(res) {
    const badge = document.getElementById('modal-result-badge');
    badge.style.display = 'inline-block';
    badge.textContent = res.passed ? 'GATE-001 PASSED' : 'GATE-001 FAILED';
    badge.className = res.passed ? 'result-badge result-pass' : 'result-badge result-fail';

    document.getElementById('val-avg-fps').textContent = res.avgFps;
    document.getElementById('val-render-ms').textContent = `${res.avgRenderMs}ms`;
    document.getElementById('val-p99-ms').textContent = `${res.p99RenderMs}ms`;
    document.getElementById('benchmark-status').textContent =
      `Benchmark Complete! Average FPS: ${res.avgFps} (Threshold >= 60 FPS).`;
  }

  startLoop() {
    const loop = (now) => {
      if (!this.isRunning) return;

      const delta = now - this.lastTime;
      this.lastTime = now;

      this.simulation.update(delta);
      this.renderer.boats = this.simulation.boats;
      this.renderer.toasts = this.simulation.toastNotifications;
      this.renderer.radarPulses = this.simulation.radarPulses;
      this.renderer.visibilityBuffer = this.simulation.visibilityBuffer;
      this.renderer.players = this.simulation.players;
      this.renderer.activeEmotes = this.simulation.activeEmotes;

      if (this.simulation.state === 'PLAYING') {
        this.matchElapsedSec += delta / 1000;
        let totalLandPixels = 0;
        for (let i = 0; i < this.simulation.terrainGrid.length; i++) {
          if (this.simulation.terrainGrid[i] === 1) totalLandPixels++;
        }
        this.recorder.sample(this.matchElapsedSec, this.simulation.players, totalLandPixels);
      }

      const renderMs = this.renderer.render(this.simulation.grid, this.simulation.terrainGrid, true);
      this.particles.update(delta / 1000);
      this.particles.render(this.renderer.ctx, this.renderer);
      this.minimap.render(this.simulation.grid, this.simulation.terrainGrid, this.renderer);

      const fps = delta > 0 ? 1000 / delta : 60;
      this.fpsHistory.push(fps);
      if (this.fpsHistory.length > 30) this.fpsHistory.shift();

      const avgFps = (this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length).toFixed(1);
      const fpsEl = document.getElementById('sys-fps');
      if (fpsEl) fpsEl.textContent = `${avgFps} FPS`;

      const renderEl = document.getElementById('sys-render-ms');
      if (renderEl) renderEl.textContent = `${renderMs.toFixed(1)}ms`;

      const stats = this.simulation.getStats();
      const activeBotsEl = document.getElementById('sys-active-bots');
      if (activeBotsEl) activeBotsEl.textContent = `${stats.activePlayers} Bots`;

      const troopsEl = document.getElementById('hud-troops');
      if (troopsEl) troopsEl.textContent = TerritorySimulation.formatTroops(stats.playerBalance);

      const landEl = document.getElementById('hud-land');
      if (landEl) landEl.textContent = `${stats.playerLandCount.toLocaleString()} px² (${((stats.playerLandCount / (1000 * 1000)) * 100).toFixed(1)}%)`;

      const rankEl = document.getElementById('hud-rank');
      if (rankEl && this.simulation.players) {
        const sorted = [...this.simulation.players].sort((a, b) => (b.landCount || 0) - (a.landCount || 0));
        const playerRank = sorted.findIndex(p => p.id === 1) + 1;
        rankEl.textContent = `#${playerRank || 1} / ${this.simulation.players.length - 1}`;
      }

      // Live Top Players Leaderboard HUD Widget
      const lbRowsEl = document.getElementById('lb-rows');
      if (lbRowsEl && this.simulation.players) {
        const sortedEmpires = [...this.simulation.players]
          .filter(p => p && p.landCount > 0)
          .sort((a, b) => b.landCount - a.landCount);

        const top7 = sortedEmpires.slice(0, 7);
        let html = '';
        top7.forEach((p, idx) => {
          const isHuman = p.id === 1;
          const hexColor = this.palette ? this.palette.getHex(p.id) : '#00f2fe';
          const pct = ((p.landCount / (1000 * 1000)) * 100).toFixed(1);
          html += `
            <div class="lb-row ${isHuman ? 'human' : ''}">
              <div class="lb-left">
                <span class="lb-rank">#${idx + 1}</span>
                <span class="lb-swatch" style="background: ${hexColor}"></span>
                <span class="lb-name">${p.name || 'Bot ' + p.id}</span>
              </div>
              <div class="lb-right">${p.landCount.toLocaleString()} px² (${pct}%)</div>
            </div>
          `;
        });
        lbRowsEl.innerHTML = html;
      }

      const interestEl = document.getElementById('hud-interest');
      if (interestEl) {
        if (stats.redInterest) {
          interestEl.textContent = 'RED INTEREST (0.1%)';
          interestEl.className = 'hud-val highlight-rose';
        } else {
          interestEl.textContent = 'NORMAL (1.0%)';
          interestEl.className = 'hud-val';
        }
      }

      if (this.simulation.state === 'GAME_OVER' && this.simulation.gameResult) {
        const overlay = document.getElementById('post-match-overlay');
        if (overlay && overlay.style.display !== 'flex') {
          this.updateSceneVisibility('GAME_OVER');
          if (this.simulation.gameResult && this.simulation.gameResult.outcome === 'VICTORY') {
            this.sound.playVictoryFanfare();
          } else {
            this.sound.playDefeatStinger();
          }
          const summary = this.recorder.getSummary();
          this.dashboard.show(
            summary,
            () => {
              // Play Again
              document.getElementById('lobby-screen').style.display = 'none';
              this.openSpawnSelectionPhase();
            },
            () => {
              // Back to Lobby
              document.getElementById('lobby-screen').style.display = 'flex';
              this.simulation.state = 'LOBBY';
            }
          );
        }
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new TerraApp();
});
