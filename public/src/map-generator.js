/**
 * Procedural & SVG Vector Map Generator for Terra.
 * Supports Real World SVG rasterization ('world'), Island Clusters ('archipelago'),
 * and Solid Continent Arena ('arena').
 */

import { SVGWorldMap } from './svg-world-map.js';

export class MapGenerator {
  /**
   * Generates a 2D Uint8Array terrain grid for the requested map type.
   * Values: 0 = Ocean Water, 1 = Neutral Land, 2 = Impassable Mountain
   */
  static generate(mapType = 'world', width = 1000, height = 1000) {
    if (mapType === 'world') {
      return SVGWorldMap.rasterize(width, height);
    } else if (mapType === 'archipelago') {
      return this.generateArchipelago(width, height);
    } else if (mapType === 'arena') {
      return this.generateArena(width, height);
    }
    return SVGWorldMap.rasterize(width, height);
  }

  static generateArchipelago(width, height) {
    const grid = new Uint8Array(width * height);
    grid.fill(0);

    const islandCount = 35;
    const islandCenters = [];

    for (let i = 0; i < islandCount; i++) {
      islandCenters.push({
        x: Math.floor((0.1 + Math.random() * 0.8) * width),
        y: Math.floor((0.1 + Math.random() * 0.8) * height),
        radius: Math.floor(40 + Math.random() * 90)
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
        if (maxNoise > 0.65) {
          grid[idx] = 2; // Central Peak
        } else if (maxNoise > 0.25) {
          grid[idx] = 1; // Land
        } else {
          grid[idx] = 0; // Water
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
}
