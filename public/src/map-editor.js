/**
 * In-Browser Interactive Map Editor & Custom Territory Designer Engine for Terra.
 * Allows users to paint custom terrain (land, ocean, mountain), place spawn points,
 * flood fill regions, calculate geography statistics, and import/export map JSON files.
 */

export class MapEditor {
  constructor(width = 1000, height = 1000) {
    this.width = width;
    this.height = height;
    this.terrainGrid = new Uint8Array(width * height);
    this.terrainGrid.fill(0); // Default to ocean water
    this.customSpawns = [];

    this.activeTool = 'land'; // 'land' | 'ocean' | 'mountain' | 'eraser' | 'spawn' | 'fill'
    this.activePaintType = 1;
    this.brushRadius = 5;
    this.isDrawing = false;
  }

  setTool(tool) {
    this.activeTool = tool;
    if (tool === 'land') this.activePaintType = 1;
    else if (tool === 'ocean' || tool === 'eraser') this.activePaintType = 0;
    else if (tool === 'mountain') this.activePaintType = 2;
  }

  setBrushRadius(radius) {
    this.brushRadius = Math.max(1, Math.min(30, radius));
  }

  clearMap(fillTerrain = 0) {
    this.terrainGrid.fill(fillTerrain);
    this.customSpawns = [];
  }

  paintAt(x, y) {
    x = Math.round(x);
    y = Math.round(y);

    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;

    if (this.activeTool === 'spawn') {
      // Avoid duplicate spawn markers in exact same spot
      if (!this.customSpawns.some(s => Math.hypot(s.x - x, s.y - y) < 15)) {
        this.customSpawns.push({ x, y, id: this.customSpawns.length + 1 });
      }
      // Paint land underneath spawn marker
      this.terrainGrid[y * this.width + x] = 1;
      return;
    }

    if (this.activeTool === 'fill') {
      this.floodFill(x, y);
      return;
    }

    let value = 1; // Default land
    if (this.activeTool === 'ocean' || this.activeTool === 'eraser') value = 0;
    else if (this.activeTool === 'mountain') value = 2;

    const r = this.brushRadius;
    const rSq = r * r;

    const startX = Math.max(0, Math.floor(x - r));
    const endX = Math.min(this.width - 1, Math.ceil(x + r));
    const startY = Math.max(0, Math.floor(y - r));
    const endY = Math.min(this.height - 1, Math.ceil(y + r));

    for (let cy = startY; cy <= endY; cy++) {
      for (let cx = startX; cx <= endX; cx++) {
        const dx = cx - x;
        const dy = cy - y;
        if (dx * dx + dy * dy <= rSq) {
          this.terrainGrid[cy * this.width + cx] = value;
        }
      }
    }
  }

  floodFill(startX, startY) {
    const targetIdx = startY * this.width + startX;
    const originalType = this.terrainGrid[targetIdx];

    let fillType = this.activePaintType !== undefined ? this.activePaintType : (originalType === 0 ? 1 : 0);

    if (originalType === fillType) return;

    const queue = [targetIdx];
    const visited = new Uint8Array(this.width * this.height);
    visited[targetIdx] = 1;

    let processed = 0;
    const maxProcess = 1000000; // Full 1000x1000 grid fill

    while (queue.length > 0 && processed < maxProcess) {
      const idx = queue.pop();
      this.terrainGrid[idx] = fillType;
      processed++;

      const cx = idx % this.width;
      const cy = Math.floor(idx / this.width);

      const neighbors = [
        cx > 0 ? idx - 1 : -1,
        cx < this.width - 1 ? idx + 1 : -1,
        cy > 0 ? idx - this.width : -1,
        cy < this.height - 1 ? idx + this.width : -1
      ];

      for (const nIdx of neighbors) {
        if (nIdx >= 0 && !visited[nIdx] && this.terrainGrid[nIdx] === originalType) {
          visited[nIdx] = 1;
          queue.push(nIdx);
        }
      }
    }
  }

  getStatistics() {
    let landCount = 0;
    let oceanCount = 0;
    let mountainCount = 0;

    for (let i = 0; i < this.terrainGrid.length; i++) {
      const t = this.terrainGrid[i];
      if (t === 1) landCount++;
      else if (t === 2) mountainCount++;
      else oceanCount++;
    }

    const total = this.width * this.height;
    return {
      totalPixels: total,
      landCount,
      oceanCount,
      mountainCount,
      landPct: ((landCount / total) * 100).toFixed(1),
      oceanPct: ((oceanCount / total) * 100).toFixed(1),
      mountainPct: ((mountainCount / total) * 100).toFixed(1),
      spawnCount: this.customSpawns.length
    };
  }

  exportToJSON(mapName = 'Custom Map') {
    return {
      version: '1.0',
      name: mapName,
      width: this.width,
      height: this.height,
      terrainGrid: Array.from(this.terrainGrid),
      customSpawns: this.customSpawns,
      exportedAt: new Date().toISOString()
    };
  }

  importFromJSON(jsonData) {
    if (!jsonData || !jsonData.terrainGrid || !jsonData.width || !jsonData.height) {
      throw new Error('Invalid custom map JSON structure');
    }

    this.width = jsonData.width;
    this.height = jsonData.height;
    this.terrainGrid = new Uint8Array(jsonData.terrainGrid);
    this.customSpawns = jsonData.customSpawns || [];
  }

  renderToCanvas(ctx, renderWidth = 1000, renderHeight = 1000) {
    const imgData = ctx.createImageData(this.width, this.height);
    const data = imgData.data;

    for (let i = 0; i < this.terrainGrid.length; i++) {
      const t = this.terrainGrid[i];
      const pxIdx = i * 4;

      if (t === 1) {
        // Neutral Land - Sleek emerald / dark green
        data[pxIdx] = 30;
        data[pxIdx + 1] = 180;
        data[pxIdx + 2] = 110;
        data[pxIdx + 3] = 255;
      } else if (t === 2) {
        // Impassable Mountain - Slate gray
        data[pxIdx] = 120;
        data[pxIdx + 1] = 130;
        data[pxIdx + 2] = 140;
        data[pxIdx + 3] = 255;
      } else {
        // Ocean Water - Deep Navy
        data[pxIdx] = 10;
        data[pxIdx + 1] = 20;
        data[pxIdx + 2] = 40;
        data[pxIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Draw custom spawn point markers
    ctx.fillStyle = '#ff0055';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    for (const spawn of this.customSpawns) {
      ctx.beginPath();
      ctx.arc(spawn.x, spawn.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
