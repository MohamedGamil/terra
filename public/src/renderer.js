/**
 * Ultra-Fast Canvas 2D Renderer for Terra.
 * Renders 1000x1000 pixel maps, territory frontiers, spawn pick previews,
 * target crosshairs, naval boats, and provides distance-threshold gesture disambiguation.
 */

export class TerritoryRenderer {
  constructor(canvasElement, gridWidth = 1000, gridHeight = 1000, palette) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { alpha: false, desynchronized: true });
    this.width = gridWidth;
    this.height = gridHeight;
    this.palette = palette;

    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = gridWidth;
    this.offscreenCanvas.height = gridHeight;
    this.offCtx = this.offscreenCanvas.getContext('2d', { alpha: false });

    this.imageData = this.offCtx.createImageData(gridWidth, gridHeight);
    this.pixelBuffer = new Uint32Array(this.imageData.data.buffer);

    // High-contrast terrain ABGR colors (Little-Endian: 0xAABBGGRR)
    this.waterAbgr = (255 << 24) | (40 << 16) | (22 << 8) | 10;      // #0a1628 Deep Ocean
    this.landAbgr = (255 << 24) | (72 << 16) | (56 << 8) | 42;       // #2a3848 Neutral Land
    this.mountainAbgr = (255 << 24) | (36 << 16) | (26 << 8) | 18;   // #121a24 Impassable Mountain

    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;

    // Gesture Disambiguation State (Click vs Drag)
    this.isMouseDown = false;
    this.isDragging = false;
    this.mouseDownX = 0;
    this.mouseDownY = 0;
    this.dragStartX = 0;
    this.dragStartY = 0;

    this.targetPixelIdx = -1;
    this.spawnPickPoint = null;
    this.hoverSpawnPoint = null;
    this.boats = [];
    this.radarPulses = [];
    this.visibilityBuffer = null;
    this.fogOfWarEnabled = true;

    this.onCanvasClick = null; // Callback: (coords, mouseButton) => void
    this.onCanvasDoubleClick = null; // Callback: (coords, e) => void

    this.setupInteractions();
    this.resizeCanvas();
  }

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
    if (this.panX === 0 && this.panY === 0) {
      this.panX = (this.canvas.width - this.width * this.zoom) / 2;
      this.panY = (this.canvas.height - this.height * this.zoom) / 2;
    }
  }

  setupInteractions() {
    window.addEventListener('resize', () => this.resizeCanvas());

    this.canvas.addEventListener('mousedown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? (this.canvas.width / rect.width) : 1;
      const scaleY = rect.height > 0 ? (this.canvas.height / rect.height) : 1;

      const canvasX = (e.clientX - rect.left) * scaleX;
      const canvasY = (e.clientY - rect.top) * scaleY;

      this.isMouseDown = true;
      this.isDragging = false;
      this.mouseDownX = e.clientX;
      this.mouseDownY = e.clientY;
      this.dragStartX = canvasX - this.panX;
      this.dragStartY = canvasY - this.panY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isMouseDown) return;

      const dist = Math.hypot(e.clientX - this.mouseDownX, e.clientY - this.mouseDownY);
      if (dist > 5) {
        this.isDragging = true;
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? (this.canvas.width / rect.width) : 1;
        const scaleY = rect.height > 0 ? (this.canvas.height / rect.height) : 1;

        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;

        this.panX = canvasX - this.dragStartX;
        this.panY = canvasY - this.dragStartY;
      }
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
    });

    this.canvas.addEventListener('click', (e) => {
      const dist = Math.hypot(e.clientX - this.mouseDownX, e.clientY - this.mouseDownY);
      if (dist <= 6 && this.onCanvasClick) {
        const coords = this.screenToMapCoords(e.clientX, e.clientY);
        if (coords) {
          this.onCanvasClick(coords, 'left', e);
        }
      }
    });

    this.canvas.addEventListener('dblclick', (e) => {
      e.preventDefault();
      if (this.onCanvasDoubleClick) {
        const coords = this.screenToMapCoords(e.clientX, e.clientY);
        if (coords) {
          this.onCanvasDoubleClick(coords, e);
        }
      }
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const dist = Math.hypot(e.clientX - this.mouseDownX, e.clientY - this.mouseDownY);
      if (dist <= 6 && this.onCanvasClick) {
        const coords = this.screenToMapCoords(e.clientX, e.clientY);
        if (coords) {
          this.onCanvasClick(coords, 'right', e);
        }
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? (this.canvas.width / rect.width) : 1;
      const scaleY = rect.height > 0 ? (this.canvas.height / rect.height) : 1;

      const canvasX = (e.clientX - rect.left) * scaleX;
      const canvasY = (e.clientY - rect.top) * scaleY;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      const newZoom = Math.min(Math.max(0.2, this.zoom * zoomFactor), 8.0);
      
      this.panX = canvasX - (canvasX - this.panX) * (newZoom / this.zoom);
      this.panY = canvasY - (canvasY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;
    }, { passive: false });
  }

  centerOnPixel(pixelIdx, targetZoom = 2.5) {
    if (pixelIdx < 0) return;
    const px = pixelIdx % this.width;
    const py = Math.floor(pixelIdx / this.width);

    this.zoom = targetZoom;
    this.panX = (this.canvas.width / 2) - (px * this.zoom);
    this.panY = (this.canvas.height / 2) - (py * this.zoom);
  }

  screenToMapCoords(screenX, screenY) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? (this.canvas.width / rect.width) : 1;
    const scaleY = rect.height > 0 ? (this.canvas.height / rect.height) : 1;

    const clientX = (screenX - rect.left) * scaleX;
    const clientY = (screenY - rect.top) * scaleY;

    const mapX = Math.floor((clientX - this.panX) / this.zoom);
    const mapY = Math.floor((clientY - this.panY) / this.zoom);

    if (mapX >= 0 && mapX < this.width && mapY >= 0 && mapY < this.height) {
      return { mapX, mapY, idx: mapY * this.width + mapX };
    }
    return null;
  }

  render(grid, terrainGrid = null, drawBorders = true) {
    const startTime = performance.now();
    const len = this.width * this.height;
    const colors = this.palette.colors;
    const width = this.width;

    for (let i = 0; i < len; i++) {
      const owner = grid[i];

      if (owner > 0) {
        this.pixelBuffer[i] = colors[owner]?.abgr || this.landAbgr;
      } else if (terrainGrid) {
        const terrain = terrainGrid[i];
        if (terrain === 0) this.pixelBuffer[i] = this.waterAbgr;
        else if (terrain === 2) this.pixelBuffer[i] = this.mountainAbgr;
        else this.pixelBuffer[i] = this.landAbgr;
      } else {
        this.pixelBuffer[i] = this.landAbgr;
      }
    }

    // Border highlights
    if (drawBorders) {
      const borderAbgr = (220 << 24) | (0 << 16) | (0 << 8) | 0;
      for (let y = 1; y < this.height - 1; y += 2) {
        const row = y * width;
        for (let x = 1; x < width - 1; x += 2) {
          const idx = row + x;
          const owner = grid[idx];
          if (owner > 0) {
            if (grid[idx - 1] !== owner || grid[idx + 1] !== owner || grid[idx - width] !== owner || grid[idx + width] !== owner) {
              this.pixelBuffer[idx] = borderAbgr;
            }
          }
        }
      }
    }

    this.offCtx.putImageData(this.imageData, 0, 0);

    // Draw main viewport
    this.ctx.fillStyle = '#040609';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.imageSmoothingEnabled = this.zoom > 2.0 ? false : true;
    this.ctx.drawImage(
      this.offscreenCanvas,
      0, 0, this.width, this.height,
      this.panX, this.panY, this.width * this.zoom, this.height * this.zoom
    );

    // Hover Spawn Circle Preview
    if (this.hoverSpawnPoint) {
      const hx = this.panX + (this.hoverSpawnPoint.x + 0.5) * this.zoom;
      const hy = this.panY + (this.hoverSpawnPoint.y + 0.5) * this.zoom;
      this.ctx.beginPath();
      this.ctx.arc(hx, hy, Math.max(6, 10 * this.zoom), 0, Math.PI * 2);
      this.ctx.strokeStyle = 'rgba(0, 242, 254, 0.8)';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([3, 3]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // Selected Spawn Pick Point Indicator
    if (this.spawnPickPoint) {
      const sx = this.panX + (this.spawnPickPoint.x + 0.5) * this.zoom;
      const sy = this.panY + (this.spawnPickPoint.y + 0.5) * this.zoom;
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, Math.max(8, 12 * this.zoom), 0, Math.PI * 2);
      this.ctx.strokeStyle = '#00f2fe';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      this.ctx.fillStyle = 'rgba(0, 242, 254, 0.3)';
      this.ctx.fill();

      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 11px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('YOUR SPAWN', sx, sy - 16);
    }

    // Compact High-Precision Target Selection Crosshair
    if (this.targetPixelIdx >= 0) {
      const tx = (this.targetPixelIdx % this.width);
      const ty = Math.floor(this.targetPixelIdx / this.width);
      const sx = this.panX + (tx + 0.5) * this.zoom;
      const sy = this.panY + (ty + 0.5) * this.zoom;
      const rad = Math.max(6, 10 * this.zoom);

      // Outer dark shadow ring
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, rad, 0, Math.PI * 2);
      this.ctx.strokeStyle = 'rgba(4, 6, 9, 0.8)';
      this.ctx.lineWidth = 3;
      this.ctx.stroke();

      // Inner high-contrast rose ring
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, rad, 0, Math.PI * 2);
      this.ctx.strokeStyle = '#f43f5e';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();

      // Precision crosshair lines
      const arm = Math.max(4, 6 * this.zoom);
      this.ctx.beginPath();
      this.ctx.moveTo(sx - arm, sy); this.ctx.lineTo(sx + arm, sy);
      this.ctx.moveTo(sx, sy - arm); this.ctx.lineTo(sx, sy + arm);
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();

      // Center dot
      this.ctx.fillStyle = '#f43f5e';
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Naval Boat Transport Icons
    for (const boat of this.boats) {
      const bx = this.panX + boat.x * this.zoom;
      const by = this.panY + boat.y * this.zoom;
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = `${Math.max(12, Math.floor(14 * this.zoom))}px sans-serif`;
      this.ctx.fillText('⛵', bx - 6, by + 6);
    }

    // Capital Centroid Crowns / Circles
    if (this.players) {
      for (let id = 1; id < this.players.length; id++) {
        const p = this.players[id];
        if (p && p.isAlive && p.capitalX !== null && p.capitalX !== undefined) {
          const cx = this.panX + p.capitalX * this.zoom;
          const cy = this.panY + p.capitalY * this.zoom;

          this.ctx.fillStyle = p.color || '#00f2fe';
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, Math.max(4, 6 * this.zoom), 0, Math.PI * 2);
          this.ctx.fill();

          this.ctx.strokeStyle = '#ffffff';
          this.ctx.lineWidth = 1.5;
          this.ctx.stroke();

          // Draw small inner core
          this.ctx.fillStyle = '#ffffff';
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, Math.max(1.5, 2.5 * this.zoom), 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
    }

    // Scout Radar Pulse Wave Animations
    for (const pulse of this.radarPulses) {
      const px = this.panX + pulse.x * this.zoom;
      const py = this.panY + pulse.y * this.zoom;
      const rad = pulse.radius * this.zoom;

      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(px, py, rad, 0, Math.PI * 2);
      this.ctx.strokeStyle = '#00f2fe';
      this.ctx.lineWidth = 2.5;
      this.ctx.setLineDash([6, 6]);
      this.ctx.stroke();

      this.ctx.fillStyle = 'rgba(0, 242, 254, 0.08)';
      this.ctx.fill();
      this.ctx.restore();
    }

    // Render Toast Notifications
    if (this.toasts && this.toasts.length > 0) {
      let toastY = 70;
      for (let i = this.toasts.length - 1; i >= 0; i--) {
        const toast = this.toasts[i];
        const ageMs = Date.now() - toast.timestamp;
        if (ageMs > 4000) continue;

        const opacity = ageMs > 3200 ? 1 - (ageMs - 3200) / 800 : 1;
        this.ctx.save();
        this.ctx.globalAlpha = opacity;

        const padding = 12;
        this.ctx.font = '13px Inter, system-ui, sans-serif';
        const textWidth = this.ctx.measureText(toast.message).width;
        const toastW = textWidth + padding * 2;
        const toastX = (this.canvas.width - toastW) / 2;

        this.ctx.fillStyle = toast.type === 'success' ? 'rgba(16, 185, 129, 0.9)' :
                             (toast.type === 'error' ? 'rgba(239, 68, 68, 0.9)' :
                             (toast.type === 'warning' ? 'rgba(245, 158, 11, 0.9)' : 'rgba(15, 23, 42, 0.9)'));
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.lineWidth = 1;

        this.ctx.beginPath();
        this.ctx.roundRect(toastX, toastY, toastW, 30, 8);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(toast.message, this.canvas.width / 2, toastY + 19);
        this.ctx.restore();

        toastY += 36;
      }
    }

    return performance.now() - startTime;
  }
}
