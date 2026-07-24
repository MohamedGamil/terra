/**
 * Ultra-Fast Canvas 2D Direct Pixel Buffer Renderer.
 * Optimized for rendering 1,000,000 pixels (1000x1000 grid) at 60+ FPS.
 */

export class TerritoryRenderer {
  constructor(canvasElement, gridWidth = 1000, gridHeight = 1000, palette) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { alpha: false, desynchronized: true });
    this.width = gridWidth;
    this.height = gridHeight;
    this.palette = palette;

    // Offscreen rendering surface for crisp pixel buffer manipulation
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = gridWidth;
    this.offscreenCanvas.height = gridHeight;
    this.offCtx = this.offscreenCanvas.getContext('2d', { alpha: false });

    // Direct 32-bit pixel buffer for 1000x1000 grid
    this.imageData = this.offCtx.createImageData(gridWidth, gridHeight);
    this.pixelBuffer = new Uint32Array(this.imageData.data.buffer);

    // Pan & Zoom state
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;

    this.setupInteractions();
    this.resizeCanvas();
  }

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
    // Initial center alignment
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
   * Render grid array to canvas using packed Uint32 buffer.
   * @param {Uint16Array|Int32Array} grid - 1D array of length width * height containing owner IDs
   * @param {boolean} drawBorders - Whether to draw territory border highlights
   * @returns {number} Execution duration in milliseconds
   */
  render(grid, drawBorders = true) {
    const startTime = performance.now();

    const len = this.width * this.height;
    const colors = this.palette.colors;
    const defaultAbgr = colors[0].abgr;
    const width = this.width;

    // Fast 32-bit pixel mapping loop
    for (let i = 0; i < len; i++) {
      const owner = grid[i];
      this.pixelBuffer[i] = colors[owner]?.abgr || defaultAbgr;
    }

    // Optional border overlay pass
    if (drawBorders) {
      const borderAbgr = (200 << 24) | (0 << 16) | (0 << 8) | 0; // Dark border tint
      for (let y = 1; y < this.height - 1; y += 2) {
        const row = y * width;
        for (let x = 1; x < width - 1; x += 2) {
          const idx = row + x;
          const owner = grid[idx];
          if (owner !== 0) {
            // Check 4-neighbors for territory boundary
            if (grid[idx - 1] !== owner || grid[idx + 1] !== owner || grid[idx - width] !== owner || grid[idx + width] !== owner) {
              this.pixelBuffer[idx] = borderAbgr;
            }
          }
        }
      }
    }

    // Put updated ImageData onto offscreen buffer
    this.offCtx.putImageData(this.imageData, 0, 0);

    // Render scaled offscreen canvas onto viewport
    this.ctx.fillStyle = '#06080c';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.imageSmoothingEnabled = this.zoom > 2.0 ? false : true;
    this.ctx.drawImage(
      this.offscreenCanvas,
      0, 0, this.width, this.height,
      this.panX, this.panY, this.width * this.zoom, this.height * this.zoom
    );

    return performance.now() - startTime;
  }
}
