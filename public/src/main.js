import { ColorPalette } from './color.js';
import { TerritoryRenderer } from './renderer.js';
import { TerritorySimulation } from './simulation.js';
import { MinimapRenderer } from './minimap.js';
import { BenchmarkRunner } from './benchmark.js';
import { MatchRecorder } from './match-recorder.js';
import { StatsDashboard } from './stats-dashboard.js';
import { ParticleSystem } from './particles.js';

class TerraApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.contextMenu = document.getElementById('rts-context-menu');
    this.selectedMap = 'world';
    this.botCount = 100;
    this.botDifficulty = 'easy';
    this.playerColorHex = '#00f2fe';
    this.selectedForcePercent = 25;

    this.palette = new ColorPalette(500, this.playerColorHex);
    this.simulation = new TerritorySimulation(1000, 1000, this.botCount, this.selectedMap);
    this.renderer = new TerritoryRenderer(this.canvas, 1000, 1000, this.palette);
    this.minimap = new MinimapRenderer(this.minimapCanvas, 1000, 1000, this.palette);

    this.particles = new ParticleSystem(500);
    this.recorder = new MatchRecorder(1.0);
    this.dashboard = new StatsDashboard('post-match-overlay', 'chart-canvas');

    this.isRunning = true;
    this.lastTime = performance.now();
    this.fpsHistory = [];
    this.targetPixelIdx = -1;
    this.matchElapsedSec = 0;

    this.initParticleEvents();
    this.initMinimapEvents();
    this.initLobbyUI();
    this.initCombatUI();
    this.initSpawnButtons();
    this.initContextMenuUI();
    this.setupRendererCallbacks();
    this.startLoop();
  }

  initParticleEvents() {
    this.simulation.onParticleEvent = (type, data) => {
      if (type === 'ATTACK_LAUNCH') {
        this.particles.spawnShockwave(data.x, data.y, data.color || '#00f2fe', 22);
        this.particles.spawnFloatingText(data.x, data.y, `-${data.troops}`, '#ff0055');
      } else if (type === 'BOAT_LAUNCH') {
        this.particles.spawnShockwave(data.x, data.y, '#00f2fe', 16);
        this.particles.spawnFloatingText(data.x, data.y, `⛵ BOAT (${data.troops})`, '#00f2fe');
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
      document.getElementById('lobby-screen').style.display = 'flex';
      document.getElementById('spawn-banner').style.display = 'none';
      this.closeContextMenu();
      this.simulation.state = 'LOBBY';
    });

    document.getElementById('btn-restart-game').addEventListener('click', () => {
      document.getElementById('gameover-modal').classList.remove('active');
      document.getElementById('lobby-screen').style.display = 'flex';
      this.closeContextMenu();
      this.simulation.state = 'LOBBY';
    });
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

    document.getElementById('btn-attack-execute').addEventListener('click', () => {
      if (this.targetPixelIdx >= 0) {
        this.simulation.executeAttack(1, this.targetPixelIdx, this.selectedForcePercent);
      }
    });

    document.getElementById('btn-boat-execute').addEventListener('click', () => {
      if (this.targetPixelIdx >= 0) {
        this.simulation.launchBoatAttack(1, this.targetPixelIdx, this.selectedForcePercent);
      }
    });

    document.getElementById('btn-run-benchmark').addEventListener('click', () => this.runBenchmark());
    document.getElementById('btn-close-modal').addEventListener('click', () => {
      document.getElementById('benchmark-modal').classList.remove('active');
    });
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
        this.targetPixelIdx = coords.idx;
        this.renderer.targetPixelIdx = coords.idx;

        const targetOwner = this.simulation.grid[coords.idx];
        const terrainType = this.simulation.terrainGrid[coords.idx];
        const statusText = document.getElementById('target-status-text');

        if (targetOwner === 0) {
          statusText.textContent = terrainType === 0 ? `Ocean Water Cell (${coords.mapX}, ${coords.mapY})` : `Unclaimed Neutral Land (${coords.mapX}, ${coords.mapY})`;
        } else if (targetOwner === 1) {
          statusText.textContent = `Your Kingdom (${coords.mapX}, ${coords.mapY})`;
        } else {
          statusText.textContent = `Bot ${targetOwner}'s Territory (${coords.mapX}, ${coords.mapY})`;
        }

        if (buttonType === 'right') {
          this.openContextMenu(e.clientX, e.clientY, terrainType);
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
        this.simulation.executeAttack(1, this.targetPixelIdx, this.selectedForcePercent);
      }
      this.closeContextMenu();
    });

    document.getElementById('ctx-boat').addEventListener('click', () => {
      if (this.targetPixelIdx >= 0) {
        this.simulation.launchBoatAttack(1, this.targetPixelIdx, this.selectedForcePercent);
      }
      this.closeContextMenu();
    });

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
    document.getElementById('lobby-screen').style.display = 'none';

    this.palette = new ColorPalette(this.botCount + 1, this.playerColorHex);
    this.simulation = new TerritorySimulation(1000, 1000, this.botCount, this.selectedMap);
    
    // Start Step 2 Untimed Spawn Selection Phase FIRST
    this.simulation.startSpawnPhase();
    if (this.simulation.players && this.simulation.players[1]) {
      this.simulation.players[1].name = playerName;
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

    document.getElementById('spawn-banner').style.display = 'flex';
  }

  launchMatchWithCountdown() {
    document.getElementById('spawn-banner').style.display = 'none';

    const overlay = document.getElementById('countdown-overlay');
    const numEl = document.getElementById('countdown-num');
    overlay.style.display = 'flex';

    if (this.simulation.humanSpawnIdx !== null) {
      this.renderer.centerOnPixel(this.simulation.humanSpawnIdx, 2.5);
    }

    let count = 3;
    numEl.textContent = '3';

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        numEl.textContent = `${count}`;
      } else if (count === 0) {
        numEl.textContent = 'GO!';
      } else {
        clearInterval(interval);
        overlay.style.display = 'none';

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
      document.getElementById('hud-fps').textContent = `${avgFps} FPS`;

      const stats = this.simulation.getStats();
      document.getElementById('stat-active-bots').textContent = stats.activePlayers;
      document.getElementById('stat-territory-pct').textContent = `${stats.percentClaimed}%`;
      document.getElementById('stat-player-troops').textContent = stats.playerBalance.toLocaleString();
      document.getElementById('stat-player-land').textContent = `${stats.playerLandCount.toLocaleString()} px`;

      const balanceEl = document.getElementById('stat-player-troops');
      if (stats.redInterest) {
        balanceEl.className = 'stat-value highlight-rose';
        balanceEl.title = 'RED INTEREST WARNING: Spend troops to expand territory!';
      } else {
        balanceEl.className = 'stat-value highlight-amber';
        balanceEl.title = '';
      }

      if (this.simulation.state === 'GAME_OVER' && this.simulation.gameResult) {
        const overlay = document.getElementById('post-match-overlay');
        if (overlay && overlay.style.display === 'none') {
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
