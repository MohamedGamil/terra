/**
 * Ultra-Fast Canvas 2D Renderer for Terra.
 * Renders 1000x1000 pixel maps, territory frontiers, target crosshairs, and naval boats.
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

    // ABGR color constants
    this.waterAbgr = (255 << 24) | (30 << 16) | (16 << 8) | 7;     // #07101e Ocean
    this.mountainAbgr = (255 << 24) | (64 << 16) | (52 << 8) | 44;  // #2c3440 Mountain

    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;

    this.targetPixelIdx = -1;
    this.spawnPickPoint = null;
    this.boats = [];

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
      this.isDragging = true;
      this.dragStartX = e.clientX - this.panX;
      this.dragStartY = e.clientY - this.panY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.panX = e.clientX - this.dragStartX;
      this.panY = e.clientY - this.dragStartY;
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
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

  /**
   * Convert Screen (canvas) click coordinates to Map Grid (X, Y) pixel index.
   */
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
    const defaultAbgr = colors[0].abgr;
    const width = this.width;

    for (let i = 0; i < len; i++) {
      const owner = grid[i];

      if (owner > 0) {
        this.pixelBuffer[i] = colors[owner]?.abgr || defaultAbgr;
      } else if (terrainGrid) {
        const terrain = terrainGrid[i];
        if (terrain === 0) this.pixelBuffer[i] = this.waterAbgr;
        else if (terrain === 2) this.pixelBuffer[i] = this.mountainAbgr;
        else this.pixelBuffer[i] = defaultAbgr;
      } else {
        this.pixelBuffer[i] = defaultAbgr;
      }
    }

    // Border highlights
    if (drawBorders) {
      const borderAbgr = (200 << 24) | (0 << 16) | (0 << 8) | 0;
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
    this.ctx.fillStyle = '#06080c';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.imageSmoothingEnabled = this.zoom > 2.0 ? false : true;
    this.ctx.drawImage(
      this.offscreenCanvas,
      0, 0, this.width, this.height,
      this.panX, this.panY, this.width * this.zoom, this.height * this.zoom
    );

    // Overlay 1: Spawn Pick Point Indicator
    if (this.spawnPickPoint) {
      const sx = this.panX + this.spawnPickPoint.x * this.zoom;
      const sy = this.panY + this.spawnPickPoint.y * this.zoom;
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, Math.max(12, 16 * this.zoom), 0, Math.PI * 2);
      this.ctx.strokeStyle = '#00f2fe';
      this.ctx.lineWidth = 3;
      this.ctx.stroke();

      this.ctx.fillStyle = 'rgba(0, 242, 254, 0.3)';
      this.ctx.fill();
    }

    // Overlay 2: Target Selection Crosshair
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

      // Crosshair lines
      this.ctx.beginPath();
      this.ctx.moveTo(sx - 10, sy); this.ctx.lineTo(sx + 10, sy);
      this.ctx.moveTo(sx, sy - 10); this.ctx.lineTo(sx, sy + 10);
      this.ctx.strokeStyle = '#f43f5e';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }

    // Overlay 3: Naval Boat Transport Icons
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
