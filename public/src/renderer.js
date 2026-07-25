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

    this.onCanvasClick = null; // Callback: (coords, mouseButton) => void

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
      this.isMouseDown = true;
      this.isDragging = false;
      this.mouseDownX = e.clientX;
      this.mouseDownY = e.clientY;
      this.dragStartX = e.clientX - this.panX;
      this.dragStartY = e.clientY - this.panY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isMouseDown) return;

      const dist = Math.hypot(e.clientX - this.mouseDownX, e.clientY - this.mouseDownY);
      if (dist > 5) {
        this.isDragging = true;
        this.panX = e.clientX - this.dragStartX;
        this.panY = e.clientY - this.dragStartY;
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
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      const newZoom = Math.min(Math.max(0.2, this.zoom * zoomFactor), 8.0);
      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
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
    const clientX = screenX - rect.left;
    const clientY = screenY - rect.top;

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
      const hx = this.panX + this.hoverSpawnPoint.x * this.zoom;
      const hy = this.panY + this.hoverSpawnPoint.y * this.zoom;
      this.ctx.beginPath();
      this.ctx.arc(hx, hy, Math.max(12, 16 * this.zoom), 0, Math.PI * 2);
      this.ctx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 4]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // Selected Spawn Pick Point Indicator
    if (this.spawnPickPoint) {
      const sx = this.panX + this.spawnPickPoint.x * this.zoom;
      const sy = this.panY + this.spawnPickPoint.y * this.zoom;
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, Math.max(14, 18 * this.zoom), 0, Math.PI * 2);
      this.ctx.strokeStyle = '#00f2fe';
      this.ctx.lineWidth = 3.5;
      this.ctx.stroke();

      this.ctx.fillStyle = 'rgba(0, 242, 254, 0.4)';
      this.ctx.fill();

      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 13px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('YOUR SPAWN', sx, sy - 24);
    }

    // Target Selection Crosshair
    if (this.targetPixelIdx >= 0) {
      const tx = (this.targetPixelIdx % this.width);
      const ty = Math.floor(this.targetPixelIdx / this.width);
      const sx = this.panX + tx * this.zoom;
      const sy = this.panY + ty * this.zoom;

      this.ctx.beginPath();
      this.ctx.arc(sx, sy, Math.max(14, 20 * this.zoom), 0, Math.PI * 2);
      this.ctx.strokeStyle = '#f43f5e';
      this.ctx.lineWidth = 2.5;
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(sx - 10, sy); this.ctx.lineTo(sx + 10, sy);
      this.ctx.moveTo(sx, sy - 10); this.ctx.lineTo(sx, sy + 10);
      this.ctx.strokeStyle = '#f43f5e';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }

    // Naval Boat Transport Icons
    for (const boat of this.boats) {
      const bx = this.panX + boat.x * this.zoom;
      const by = this.panY + boat.y * this.zoom;
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = `${Math.max(12, Math.floor(14 * this.zoom))}px sans-serif`;
      this.ctx.fillText('⛵', bx - 6, by + 6);
    }

    return performance.now() - startTime;
  }
}
