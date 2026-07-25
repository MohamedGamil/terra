/**
 * Authentic Natural Earth GeoJSON World Map Data Engine for Terra.
 * Uses isolated artifact dataset: public/assets/natural-earth-world-50m.json
 * Antimeridian-unwrapped & split to prevent diagonal lines and polar distortion.
 */

import worldPolygonsAsset from '../assets/natural-earth-world-50m.json' with { type: 'json' };

let cachedPolygons = worldPolygonsAsset;

export class GeoJSONWorldMap {
  static getAuthenticWorldPolygons() {
    if (cachedPolygons && cachedPolygons.length > 0) {
      return cachedPolygons;
    }

    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      try {
        const fs = typeof require !== 'undefined' ? require('fs') : null;
        const path = typeof require !== 'undefined' ? require('path') : null;

        if (fs && path) {
          const jsonPath = path.resolve('./public/assets/natural-earth-world-50m.json');
          cachedPolygons = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          return cachedPolygons;
        }
      } catch (err) {
        // Fallback
      }
    }

    return cachedPolygons || [];
  }

  /**
   * Allows setting polygons directly or in browser environment.
   */
  static setPolygons(polygons) {
    cachedPolygons = polygons;
  }

  /**
   * Rasterizes 100% authentic Natural Earth GeoJSON land polygons into Canvas 2D terrain grid.
   * Values: 0 = Ocean Water, 1 = Neutral Land, 2 = Mountain
   */
  static rasterize(width = 1000, height = 1000) {
    const grid = new Uint8Array(width * height);
    grid.fill(0); // Ocean Water default

    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      this.drawPolygonsToContext(ctx, width, height, grid);
    } else if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      this.drawPolygonsToContext(ctx, width, height, grid);
    } else {
      this.rasterizeScanline(width, height, grid);
    }

    this.applyMountains(width, height, grid);
    return grid;
  }

  static drawPolygonsToContext(ctx, width, height, grid) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();

    const polygons = this.getAuthenticWorldPolygons();
    const scaleX = width / 1000;
    const scaleY = height / 1000;

    for (let i = 0; i < polygons.length; i++) {
      const ring = polygons[i];
      if (ring.length < 3) continue;

      ctx.moveTo(ring[0][0] * scaleX, ring[0][1] * scaleY);
      for (let j = 1; j < ring.length; j++) {
        ctx.lineTo(ring[j][0] * scaleX, ring[j][1] * scaleY);
      }
      ctx.closePath();
    }
    ctx.fill();

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    for (let i = 0; i < grid.length; i++) {
      if (data[i * 4] > 128) {
        grid[i] = 1;
      }
    }
  }

  static rasterizeScanline(width, height, grid) {
    const polygons = this.getAuthenticWorldPolygons();
    const scaleX = width / 1000;
    const scaleY = height / 1000;

    for (const ring of polygons) {
      if (ring.length < 3) continue;

      let minY = height, maxY = 0;
      const scaledRing = ring.map(([x, y]) => {
        const sx = x * scaleX;
        const sy = y * scaleY;
        if (sy < minY) minY = Math.floor(sy);
        if (sy > maxY) maxY = Math.ceil(sy);
        return [sx, sy];
      });

      minY = Math.max(0, minY);
      maxY = Math.min(height - 1, maxY);

      for (let y = minY; y <= maxY; y++) {
        const nodeX = [];
        let j = scaledRing.length - 1;

        for (let i = 0; i < scaledRing.length; i++) {
          if ((scaledRing[i][1] < y && scaledRing[j][1] >= y) || (scaledRing[j][1] < y && scaledRing[i][1] >= y)) {
            const x = scaledRing[i][0] + (y - scaledRing[i][1]) / (scaledRing[j][1] - scaledRing[i][1]) * (scaledRing[j][0] - scaledRing[i][0]);
            nodeX.push(x);
          }
          j = i;
        }

        nodeX.sort((a, b) => a - b);

        for (let k = 0; k < nodeX.length; k += 2) {
          if (nodeX[k] >= width) break;
          if (nodeX[k + 1] > 0) {
            const startX = Math.max(0, Math.floor(nodeX[k]));
            const endX = Math.min(width - 1, Math.ceil(nodeX[k + 1]));
            const row = y * width;
            for (let x = startX; x <= endX; x++) {
              grid[row + x] = 1;
            }
          }
        }
      }
    }
  }

  static applyMountains(width, height, grid) {
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === 1) {
        const y = Math.floor(i / width);
        const x = i % width;

        const isHimalayas = (x >= 650 && x <= 780 && y >= 320 && y <= 400);
        const isAndes = (x >= 280 && x <= 330 && y >= 620 && y <= 920);
        const isRockies = (x >= 150 && x <= 240 && y >= 200 && y <= 400);
        const isAlps = (x >= 490 && x <= 550 && y >= 260 && y <= 310);
        const isUrals = (x >= 600 && x <= 630 && y >= 150 && y <= 320);

        if ((isHimalayas || isAndes || isRockies || isAlps || isUrals) && ((x + y * 13) % 7 === 0)) {
          grid[i] = 2; // Impassable Mountain
        }
      }
    }
  }
}
