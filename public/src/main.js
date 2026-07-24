import { ColorPalette } from './color.js';
import { TerritoryRenderer } from './renderer.js';
import { TerritorySimulation } from './simulation.js';
import { BenchmarkRunner } from './benchmark.js';

class TerraApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.selectedMap = 'world';
    this.botCount = 100;
    this.botDifficulty = 'easy';
    this.playerColorHex = '#00f2fe';
    this.selectedForcePercent = 25;

    this.palette = new ColorPalette(500, this.playerColorHex);
    this.simulation = new TerritorySimulation(1000, 1000, this.botCount, this.selectedMap);
    this.renderer = new TerritoryRenderer(this.canvas, 1000, 1000, this.palette);

    this.isRunning = true;
    this.lastTime = performance.now();
    this.fpsHistory = [];
    this.targetPixelIdx = -1;

    this.initLobbyUI();
    this.initCombatUI();
    this.initCanvasEvents();
    this.startLoop();
  }

  initLobbyUI() {
    // Player Name & Color Picker
    const colorPicker = document.getElementById('input-player-color');
    colorPicker.addEventListener('change', (e) => {
      this.playerColorHex = e.target.value;
      this.palette.setPlayerColor(1, this.playerColorHex);
    });

    // Map Card Selection
    const mapCards = document.querySelectorAll('.map-card');
    mapCards.forEach(card => {
      card.addEventListener('click', () => {
        mapCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.selectedMap = card.dataset.map;
      });
    });

    // Bot Count Slider
    const botSlider = document.getElementById('slider-bot-count');
    const botLbl = document.getElementById('lbl-bot-count');
    botSlider.addEventListener('input', (e) => {
      this.botCount = parseInt(e.target.value, 10);
      botLbl.textContent = `${this.botCount} Bots`;
    });

    // Bot Difficulty
    const diffBtns = document.querySelectorAll('.btn-diff');
    diffBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        diffBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.botDifficulty = btn.dataset.diff;
      });
    });

    // Start Match Button
    document.getElementById('btn-start-match').addEventListener('click', () => {
      this.startNewMatch();
    });

    // Leave Match Button
    document.getElementById('btn-leave-match').addEventListener('click', () => {
      document.getElementById('lobby-screen').style.display = 'flex';
      this.simulation.state = 'LOBBY';
    });

    // Restart Game Button
    document.getElementById('btn-restart-game').addEventListener('click', () => {
      document.getElementById('gameover-modal').classList.remove('active');
      document.getElementById('lobby-screen').style.display = 'flex';
      this.simulation.state = 'LOBBY';
    });
  }

  initCombatUI() {
    // Force Slider & Quick Buttons
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

    // Execute Attack Button
    document.getElementById('btn-attack-execute').addEventListener('click', () => {
      if (this.targetPixelIdx >= 0) {
        this.simulation.executeAttack(1, this.targetPixelIdx, this.selectedForcePercent);
      }
    });

    // Execute Boat Attack Button
    document.getElementById('btn-boat-execute').addEventListener('click', () => {
      if (this.targetPixelIdx >= 0) {
        this.simulation.launchBoatAttack(1, this.targetPixelIdx, this.selectedForcePercent);
      }
    });

    // Benchmark Buttons
    document.getElementById('btn-run-benchmark').addEventListener('click', () => this.runBenchmark());
    document.getElementById('btn-close-modal').addEventListener('click', () => {
      document.getElementById('benchmark-modal').classList.remove('active');
    });
  }

  initCanvasEvents() {
    this.canvas.addEventListener('click', (e) => {
      const coords = this.renderer.screenToMapCoords(e.clientX, e.clientY);
      if (!coords) return;

      if (this.simulation.state === 'SPAWN_PICK') {
        // Set Human Spawn Point
        const ok = this.simulation.setHumanSpawn(coords.idx);
        if (ok) {
          this.renderer.spawnPickPoint = { x: coords.mapX, y: coords.mapY };
        }
      } else if (this.simulation.state === 'PLAYING') {
        // Set Target Selection Lock
        this.targetPixelIdx = coords.idx;
        this.renderer.targetPixelIdx = coords.idx;

        const targetOwner = this.simulation.grid[coords.idx];
        const statusText = document.getElementById('target-status-text');

        if (targetOwner === 0) {
          statusText.textContent = `Target: Unclaimed Neutral Land (${coords.mapX}, ${coords.mapY})`;
        } else if (targetOwner === 1) {
          statusText.textContent = `Target: Your Own Territory (${coords.mapX}, ${coords.mapY})`;
        } else {
          statusText.textContent = `Target: Bot ${targetOwner}'s Territory (${coords.mapX}, ${coords.mapY})`;
        }
      }
    });

    // Lock Spawn Button
    document.getElementById('btn-confirm-spawn').addEventListener('click', () => {
      this.simulation.confirmSpawnsAndStart();
      document.getElementById('spawn-banner').style.display = 'none';
    });
  }

  startNewMatch() {
    const playerName = document.getElementById('input-player-name').value || 'Commander';
    document.getElementById('lobby-screen').style.display = 'none';

    this.palette = new ColorPalette(this.botCount + 1, this.playerColorHex);
    this.simulation = new TerritorySimulation(1000, 1000, this.botCount, this.selectedMap);
    this.simulation.players[1].name = playerName;

    this.renderer = new TerritoryRenderer(this.canvas, 1000, 1000, this.palette);
    this.renderer.spawnPickPoint = null;
    this.renderer.targetPixelIdx = -1;
    this.targetPixelIdx = -1;

    // Start Spawn Selection Phase
    this.simulation.startSpawnPhase();
    document.getElementById('spawn-banner').style.display = 'flex';
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

      // Advance simulation state
      this.simulation.update(delta);

      // Pass active boats to renderer
      this.renderer.boats = this.simulation.boats;

      // Render map frame
      const renderMs = this.renderer.render(this.simulation.grid, this.simulation.terrainGrid, true);

      // FPS stats
      const fps = delta > 0 ? 1000 / delta : 60;
      this.fpsHistory.push(fps);
      if (this.fpsHistory.length > 30) this.fpsHistory.shift();

      const avgFps = (this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length).toFixed(1);
      document.getElementById('hud-fps').textContent = `${avgFps} FPS`;
      document.getElementById('hud-render-ms').textContent = `${renderMs.toFixed(2)}ms`;

      // Update Spawn Banner Timer
      if (this.simulation.state === 'SPAWN_PICK') {
        document.getElementById('spawn-timer').textContent = `${Math.ceil(this.simulation.spawnTimer)}s`;
      } else {
        document.getElementById('spawn-banner').style.display = 'none';
      }

      // Update Telemetry Panel
      const stats = this.simulation.getStats();
      document.getElementById('stat-active-bots').textContent = stats.activePlayers;
      document.getElementById('stat-territory-pct').textContent = `${stats.percentClaimed}%`;
      document.getElementById('stat-player-troops').textContent = stats.playerBalance.toLocaleString();
      document.getElementById('stat-player-land').textContent = `${stats.playerLandCount.toLocaleString()} px`;

      // Red Interest Indicator
      const balanceEl = document.getElementById('stat-player-troops');
      if (stats.redInterest) {
        balanceEl.className = 'stat-value highlight-rose';
        balanceEl.title = 'RED INTEREST WARNING: Spend troops to expand territory!';
      } else {
        balanceEl.className = 'stat-value highlight-amber';
        balanceEl.title = '';
      }

      // Check Game Over Modal
      if (this.simulation.state === 'GAME_OVER' && this.simulation.gameResult) {
        const modal = document.getElementById('gameover-modal');
        if (!modal.classList.contains('active')) {
          modal.classList.add('active');
          const res = this.simulation.gameResult;
          document.getElementById('gameover-title').textContent = res.outcome === 'VICTORY' ? 'VICTORY!' : 'DEFEATED';
          document.getElementById('gameover-badge').textContent = res.outcome === 'VICTORY' ? 'CONQUEROR' : 'ELIMINATED';
          document.getElementById('gameover-badge').className = res.outcome === 'VICTORY' ? 'result-badge result-pass' : 'result-badge result-fail';
          document.getElementById('gov-final-pct').textContent = res.finalLandPct;
          document.getElementById('gov-peak-troops').textContent = res.peakTroops.toLocaleString();
          document.getElementById('gov-bots-killed').textContent = res.botsKilled;
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
