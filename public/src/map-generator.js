/**
 * Procedural & GeoJSON Vector Map Generator for Terra.
 * Supports High-Detail Real World GeoJSON ('world', 'europe', 'asia'),
 * Seed-Based Island Clusters ('archipelago'), Volcanic Gulf ('ring_of_fire'),
 * and Solid Continent Arena ('arena').
 */

import { GeoJSONWorldMap } from './geojson-world-map.js';

export class MapGenerator {
  /**
   * Fast deterministic Mulberry32 Pseudo-Random Number Generator.
   * @param {string|number} seed Seed string or integer
   */
  static createPRNG(seed = 12345) {
    let s = 0;
    if (typeof seed === 'string') {
      for (let i = 0; i < seed.length; i++) {
        s = (Math.imul(31, s) + seed.charCodeAt(i)) | 0;
      }
    } else {
      s = Math.floor(seed) | 0;
    }
    if (s === 0) s = 12345;

    return function() {
      let t = s += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Generates a 2D Uint8Array terrain grid for the requested map type and seed.
   * Values: 0 = Ocean Water, 1 = Neutral Land, 2 = Impassable Mountain
   */
  static generate(mapType = 'world', width = 1000, height = 1000, seed = 12345, customMapData = null) {
    const prng = this.createPRNG(seed);

    if (mapType === 'custom' && customMapData && customMapData.terrainGrid) {
      return new Uint8Array(customMapData.terrainGrid);
    }

    let grid;
    if (mapType === 'world') {
      grid = GeoJSONWorldMap.rasterize(width, height);
    } else if (mapType === 'europe') {
      grid = this.generateRegionalCrop('europe', width, height);
    } else if (mapType === 'asia') {
      grid = this.generateRegionalCrop('asia', width, height);
    } else if (mapType === 'archipelago') {
      grid = this.generateArchipelago(width, height, prng);
    } else if (mapType === 'ring_of_fire') {
      grid = this.generateRingOfFire(width, height, prng);
    } else if (mapType === 'arena') {
      grid = this.generateArena(width, height);
    } else {
      grid = GeoJSONWorldMap.rasterize(width, height);
    }

    this.cleanupGrid(width, height, grid);
    return grid;
  }

  /**
   * Regional GeoJSON Crop for Europe / Asia maps.
   */
  static generateRegionalCrop(region, width = 1000, height = 1000) {
    const fullWorld = GeoJSONWorldMap.rasterize(width, height);
    const grid = new Uint8Array(width * height);
    grid.fill(0);

    // Bounds in 1000x1000 world space
    let minX = 400, maxX = 660, minY = 80, maxY = 380; // Europe default
    if (region === 'asia') {
      minX = 580; maxX = 980; minY = 140; maxY = 600;  // Asia default
    }

    const cropW = maxX - minX;
    const cropH = maxY - minY;

    for (let y = 0; y < height; y++) {
      const srcY = Math.floor(minY + (y / height) * cropH);
      const row = y * width;
      const srcRow = srcY * width;

      for (let x = 0; x < width; x++) {
        const srcX = Math.floor(minX + (x / width) * cropW);
        const srcIdx = srcRow + srcX;
        if (srcIdx >= 0 && srcIdx < fullWorld.length) {
          grid[row + x] = fullWorld[srcIdx];
        }
      }
    }
    return grid;
  }

  /**
   * Seed-Based Archipelago Island Cluster Generator.
   */
  static generateArchipelago(width, height, prng) {
    const grid = new Uint8Array(width * height);
    grid.fill(0);

    const islandCount = 40;
    const islandCenters = [];

    for (let i = 0; i < islandCount; i++) {
      islandCenters.push({
        x: Math.floor((0.08 + prng() * 0.84) * width),
        y: Math.floor((0.08 + prng() * 0.84) * height),
        radius: Math.floor(35 + prng() * 85)
      });
    }

    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        let maxNoise = 0;

        for (const center of islandCenters) {
          const dx = x - center.x;
          const dy = y - center.y;
          const dist = Math.hypot(dx, dy);

          if (dist < center.radius * 1.4) {
            const val = 1.0 - (dist / (center.radius * 1.4));
            if (val > maxNoise) maxNoise = val;
          }
        }

        const idx = row + x;
        if (maxNoise > 0.68) {
          grid[idx] = 2; // Central Mountain Peak
        } else if (maxNoise > 0.25) {
          grid[idx] = 1; // Neutral Land
        } else {
          grid[idx] = 0; // Ocean Water
        }
      }
    }
    return grid;
  }

  /**
   * Seed-Based Volcanic Ring of Fire Island Bay Generator.
   */
  static generateRingOfFire(width, height, prng) {
    const grid = new Uint8Array(width * height);
    const midX = width / 2;
    const midY = height / 2;
    const outerRadius = width * 0.42;
    const innerRadius = width * 0.22;

    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const dist = Math.hypot(x - midX, y - midY);

        if (dist >= innerRadius && dist <= outerRadius) {
          // Ring of land with noisy islands
          const angle = Math.atan2(y - midY, x - midX);
          const noise = Math.sin(angle * 6) * 20 + Math.cos(angle * 12) * 15;
          const adjustedDist = dist + noise;

          if (adjustedDist >= innerRadius + 15 && adjustedDist <= outerRadius - 15) {
            if (Math.abs(adjustedDist - (innerRadius + outerRadius) / 2) < 25) {
              grid[row + x] = 2; // Impassable volcanic ridge
            } else {
              grid[row + x] = 1; // Land
            }
          } else {
            grid[row + x] = 1;
          }
        } else {
          grid[row + x] = 0; // Ocean
        }
      }
    }
    return grid;
  }

  static generateArena(width, height) {
    const grid = new Uint8Array(width * height);
    grid.fill(1); // Solid Land

    // Ocean borders
    const borderWidth = 25;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (x < borderWidth || x >= width - borderWidth || y < borderWidth || y >= height - borderWidth) {
          grid[row + x] = 0;
        }
      }
    }

    // Mountain Cross Barriers
    const midX = Math.floor(width / 2);
    const midY = Math.floor(height / 2);

    for (let y = 100; y < height - 100; y++) {
      if (Math.abs(y - midY) > 80) {
        for (let dx = -10; dx <= 10; dx++) {
          const idx = y * width + (midX + dx);
          if (idx >= 0 && idx < grid.length) grid[idx] = 2;
        }
      }
    }

    for (let x = 100; x < width - 100; x++) {
      if (Math.abs(x - midX) > 80) {
        for (let dy = -10; dy <= 10; dy++) {
          const idx = (midY + dy) * width + x;
          if (idx >= 0 && idx < grid.length) grid[idx] = 2;
        }
      }
    }

    return grid;
  }

  static cleanupGrid(width, height, grid) {
    // Normalize diagonal tearing land connections to form solid 4-connected land bridges
    for (let y = 0; y < height - 1; y++) {
      const row = y * width;
      const nextRow = (y + 1) * width;
      for (let x = 0; x < width - 1; x++) {
        const topLeft = grid[row + x];
        const topRight = grid[row + x + 1];
        const bottomLeft = grid[nextRow + x];
        const bottomRight = grid[nextRow + x + 1];

        if (bottomLeft > 0 && topRight > 0 && topLeft === 0 && bottomRight === 0) {
          grid[row + x] = 1;
        }
        if (topLeft > 0 && bottomRight > 0 && bottomLeft === 0 && topRight === 0) {
          grid[nextRow + x] = 1;
        }
      }
    }

    const visited = new Uint8Array(width * height);

    for (let i = 0; i < grid.length; i++) {
      if (grid[i] > 0 && !visited[i]) {
        const component = [];
        const queue = [i];
        visited[i] = 1;

        let head = 0;
        while (head < queue.length) {
          const idx = queue[head++];
          component.push(idx);

          const cx = idx % width;
          const cy = Math.floor(idx / width);

          // Check 4 neighbors
          const neighbors = [
            idx - 1,
            idx + 1,
            idx - width,
            idx + width
          ];

          for (let n = 0; n < neighbors.length; n++) {
            const nIdx = neighbors[n];
            if (nIdx >= 0 && nIdx < grid.length) {
              const nx = nIdx % width;
              const ny = Math.floor(nIdx / width);
              if (Math.abs(nx - cx) <= 1 && Math.abs(ny - cy) <= 1) {
                if (grid[nIdx] > 0 && !visited[nIdx]) {
                  visited[nIdx] = 1;
                  queue.push(nIdx);
                }
              }
            }
          }
        }

        // Prune contiguous land components containing fewer than 15 pixels
        if (component.length < 15) {
          for (let c = 0; c < component.length; c++) {
            grid[component[c]] = 0;
          }
        }
      }
    }
  }
}
