import { ColorPalette } from './color.js';
import { TerritoryRenderer } from './renderer.js';
import { TerritorySimulation } from './simulation.js';
import { BenchmarkRunner } from './benchmark.js';

class TerraApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.palette = new ColorPalette(500);
    this.simulation = new TerritorySimulation(1000, 1000, 500);
    this.renderer = new TerritoryRenderer(this.canvas, 1000, 1000, this.palette);

    this.isRunning = true;
    this.drawBorders = true;
    this.lastTime = performance.now();
    this.fpsHistory = [];
    this.benchmark = null;

    this.initUI();
    this.startLoop();
  }

  initUI() {
    // Buttons
    document.getElementById('btn-run-benchmark').addEventListener('click', () => this.runBenchmark());
    document.getElementById('btn-reset-map').addEventListener('click', () => this.resetMap());
    document.getElementById('btn-close-modal').addEventListener('click', () => {
      document.getElementById('benchmark-modal').classList.remove('active');
    });

    // Controls
    const attackSlider = document.getElementById('attack-slider');
    const attackVal = document.getElementById('attack-val');
    attackSlider.addEventListener('input', (e) => {
      attackVal.textContent = `${e.target.value}%`;
    });

    const borderToggle = document.getElementById('border-toggle');
    if (borderToggle) {
      borderToggle.addEventListener('change', (e) => {
        this.drawBorders = e.target.checked;
      });
    }
  }

  resetMap() {
    this.simulation = new TerritorySimulation(1000, 1000, 500);
    document.getElementById('benchmark-modal').classList.remove('active');
  }

  runBenchmark() {
    this.isRunning = false; // Pause main loop
    const progressEl = document.getElementById('benchmark-progress');
    const statusText = document.getElementById('benchmark-status');

    statusText.textContent = 'Benchmarking 1000x1000 Canvas Rendering (1,000 frames)...';
    document.getElementById('benchmark-modal').classList.add('active');
    document.getElementById('modal-result-badge').style.display = 'none';

    this.benchmark = new BenchmarkRunner(
      this.renderer,
      this.simulation,
      (progress) => {
        progressEl.textContent = `Progress: ${progress.progressPercent}% (${progress.frameCount}/${progress.targetFrames} frames) | Current FPS: ${progress.currentFps}`;
      },
      (results) => {
        this.displayBenchmarkResults(results);
        this.isRunning = true;
        this.startLoop();
      }
    );

    this.benchmark.start();
  }

  displayBenchmarkResults(res) {
    const badge = document.getElementById('modal-result-badge');
    badge.style.display = 'inline-block';
    if (res.passed) {
      badge.textContent = 'GATE-001 PASSED';
      badge.className = 'result-badge result-pass';
    } else {
      badge.textContent = 'GATE-001 FAILED';
      badge.className = 'result-badge result-fail';
    }

    document.getElementById('val-avg-fps').textContent = res.avgFps;
    document.getElementById('val-render-ms').textContent = `${res.avgRenderMs}ms`;
    document.getElementById('val-p99-ms').textContent = `${res.p99RenderMs}ms`;

    document.getElementById('benchmark-status').textContent =
      `Benchmark Complete! Average FPS: ${res.avgFps} (Threshold >= 60 FPS). 99th Percentile Latency: ${res.p99RenderMs}ms.`;
  }

  startLoop() {
    const loop = (now) => {
      if (!this.isRunning) return;

      const delta = now - this.lastTime;
      this.lastTime = now;

      // Update simulation step
      this.simulation.update(delta);

      // Render frame
      const renderMs = this.renderer.render(this.simulation.grid, this.drawBorders);

      // FPS tracking
      const fps = delta > 0 ? 1000 / delta : 60;
      this.fpsHistory.push(fps);
      if (this.fpsHistory.length > 30) this.fpsHistory.shift();

      const avgFps = (this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length).toFixed(1);

      // Update HUD stats
      document.getElementById('hud-fps').textContent = `${avgFps} FPS`;
      document.getElementById('hud-render-ms').textContent = `${renderMs.toFixed(2)}ms`;

      const stats = this.simulation.getStats();
      document.getElementById('stat-active-bots').textContent = stats.activePlayers;
      document.getElementById('stat-territory-pct').textContent = `${stats.percentClaimed}%`;
      document.getElementById('stat-total-pixels').textContent = stats.totalLandClaimed.toLocaleString();

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
}

// Bootstrap application on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new TerraApp();
});
