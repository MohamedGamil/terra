/**
 * Interactive RTS Minimap Navigation Widget for Terra.
 * Renders full-map territory overview, camera viewport rectangle,
 * and provides click/drag camera navigation.
 */

export class MinimapRenderer {
  constructor(canvasElement, mainWidth = 1000, mainHeight = 1000, palette) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { alpha: false });
    this.mainWidth = mainWidth;
    this.mainHeight = mainHeight;
    this.palette = palette;

    this.miniWidth = 220;
    this.miniHeight = 135;
    this.canvas.width = this.miniWidth;
    this.canvas.height = this.miniHeight;

    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.miniWidth;
    this.offscreenCanvas.height = this.miniHeight;
    this.offCtx = this.offscreenCanvas.getContext('2d', { alpha: false });

    this.imageData = this.offCtx.createImageData(this.miniWidth, this.miniHeight);
    this.pixelBuffer = new Uint32Array(this.imageData.data.buffer);

    this.isDragging = false;
    this.onNavigate = null; // Callback: (mapX, mapY) => void

    this.setupInteractions();
  }

  setupInteractions() {
    this.boundHandleNav = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const normX = Math.min(Math.max(0, clickX / this.miniWidth), 1.0);
      const normY = Math.min(Math.max(0, clickY / this.miniHeight), 1.0);

      const targetMapX = normX * this.mainWidth;
      const targetMapY = normY * this.mainHeight;

      if (this.onNavigate) {
        this.onNavigate(targetMapX, targetMapY);
      }
    };

    this.boundMousedown = (e) => {
      this.isDragging = true;
      this.boundHandleNav(e);
    };

    this.boundMousemove = (e) => {
      if (this.isDragging) this.boundHandleNav(e);
    };

    this.boundMouseup = () => {
      this.isDragging = false;
    };

    this.canvas.addEventListener('mousedown', this.boundMousedown);
    window.addEventListener('mousemove', this.boundMousemove);
    window.addEventListener('mouseup', this.boundMouseup);
  }

  destroy() {
    this.canvas.removeEventListener('mousedown', this.boundMousedown);
    window.removeEventListener('mousemove', this.boundMousemove);
    window.removeEventListener('mouseup', this.boundMouseup);
  }

  render(grid, terrainGrid, mainRenderer) {
    const colors = this.palette.colors;
    const stepX = this.mainWidth / this.miniWidth;
    const stepY = this.mainHeight / this.miniHeight;

    let bufIdx = 0;
    for (let my = 0; my < this.miniHeight; my++) {
      const mapY = Math.floor(my * stepY);
      const rowOffset = mapY * this.mainWidth;

      for (let mx = 0; mx < this.miniWidth; mx++) {
        const mapX = Math.floor(mx * stepX);
        const gIdx = rowOffset + mapX;
        const owner = grid[gIdx];

        if (owner > 0) {
          this.pixelBuffer[bufIdx++] = colors[owner]?.abgr || mainRenderer.landAbgr;
        } else if (terrainGrid) {
          const terrain = terrainGrid[gIdx];
          if (terrain === 0) this.pixelBuffer[bufIdx++] = mainRenderer.waterAbgr;
          else if (terrain === 2) this.pixelBuffer[bufIdx++] = mainRenderer.mountainAbgr;
          else this.pixelBuffer[bufIdx++] = mainRenderer.landAbgr;
        } else {
          this.pixelBuffer[bufIdx++] = mainRenderer.landAbgr;
        }
      }
    }

    this.offCtx.putImageData(this.imageData, 0, 0);

    // Draw Minimap Canvas
    this.ctx.drawImage(this.offscreenCanvas, 0, 0);

    // Overlay: Dynamic Camera Viewport Bounds Rectangle
    if (mainRenderer) {
      const viewW = mainRenderer.canvas.width;
      const viewH = mainRenderer.canvas.height;

      const mapVisibleW = viewW / mainRenderer.zoom;
      const mapVisibleH = viewH / mainRenderer.zoom;

      const mapMinX = -mainRenderer.panX / mainRenderer.zoom;
      const mapMinY = -mainRenderer.panY / mainRenderer.zoom;

      const miniRectX = (mapMinX / this.mainWidth) * this.miniWidth;
      const miniRectY = (mapMinY / this.mainHeight) * this.miniHeight;
      const miniRectW = (mapVisibleW / this.mainWidth) * this.miniWidth;
      const miniRectH = (mapVisibleH / this.mainHeight) * this.miniHeight;

      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(miniRectX, miniRectY, miniRectW, miniRectH);

      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      this.ctx.fillRect(miniRectX, miniRectY, miniRectW, miniRectH);
    }
  }
}
