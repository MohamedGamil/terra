/**
 * Procedural Map Generator for Terra.
 * Generates map grids (1000x1000) for World, Archipelago, and Black Arena layouts.
 * Grid cell values: 0 = Water, 1 = Neutral Land, 2 = Impassable Mountain.
 */

export class MapGenerator {
  /**
   * Generate map grid based on layout type.
   * @param {'world'|'archipelago'|'arena'} type 
   * @param {number} width 
   * @param {number} height 
   * @returns {Uint8Array} Map terrain array
   */
  static generate(type = 'world', width = 1000, height = 1000) {
    const grid = new Uint8Array(width * height);

    switch (type.toLowerCase()) {
      case 'archipelago':
        return this.generateArchipelago(grid, width, height);
      case 'arena':
        return this.generateBlackArena(grid, width, height);
      case 'world':
      default:
        return this.generateWorldMap(grid, width, height);
    }
  }

  static generateWorldMap(grid, width, height) {
    // Fill ocean base
    grid.fill(0);

    // Generate 6 main continental centers
    const continents = [
      { cx: 0.25 * width, cy: 0.35 * height, rx: 180, ry: 150 },
      { cx: 0.70 * width, cy: 0.30 * height, rx: 220, ry: 180 },
      { cx: 0.32 * width, cy: 0.70 * height, rx: 160, ry: 190 },
      { cx: 0.75 * width, cy: 0.75 * height, rx: 140, ry: 120 },
      { cx: 0.50 * width, cy: 0.50 * height, rx: 120, ry: 100 },
      { cx: 0.88 * width, cy: 0.85 * height, rx: 90,  ry: 80  }
    ];

    const len = width * height;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const idx = row + x;
        let isLand = false;

        for (const c of continents) {
          const dx = (x - c.cx) / c.rx;
          const dy = (y - c.cy) / c.ry;
          const dist = dx * dx + dy * dy;

          // Simple Simplex-like noise wobble
          const wobble = (Math.sin(x * 0.02) + Math.cos(y * 0.02)) * 0.15;
          if (dist + wobble <= 1.0) {
            isLand = true;
            break;
          }
        }

        if (isLand) {
          // Inner mountain ranges (center of continents)
          const isMountain = Math.random() < 0.015 && (x % 5 === 0);
          grid[idx] = isMountain ? 2 : 1;
        }
      }
    }

    return grid;
  }

  static generateArchipelago(grid, width, height) {
    grid.fill(0); // Ocean

    // 14 island clusters
    const numIslands = 16;
    const islands = [];

    for (let i = 0; i < numIslands; i++) {
      islands.push({
        cx: Math.floor(0.1 * width + Math.random() * 0.8 * width),
        cy: Math.floor(0.1 * height + Math.random() * 0.8 * height),
        r: 45 + Math.random() * 65
      });
    }

    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const idx = row + x;
        let isLand = false;

        for (const isl of islands) {
          const dx = x - isl.cx;
          const dy = y - isl.cy;
          const distSq = dx * dx + dy * dy;
          const wobble = (Math.sin(x * 0.05) + Math.cos(y * 0.05)) * 12;
          if (distSq <= (isl.r + wobble) * (isl.r + wobble)) {
            isLand = true;
            break;
          }
        }

        if (isLand) grid[idx] = 1;
      }
    }

    return grid;
  }

  static generateBlackArena(grid, width, height) {
    // Solid Land Continent with 20px Ocean Border around edge
    grid.fill(1);

    const margin = 30;
    // Outer water border
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (x < margin || x >= width - margin || y < margin || y >= height - margin) {
          grid[row + x] = 0;
        }
      }
    }

    // Central cross mountain barrier
    const midX = Math.floor(width / 2);
    const midY = Math.floor(height / 2);

    for (let i = -150; i <= 150; i++) {
      const idxH = midY * width + (midX + i);
      const idxV = (midY + i) * width + midX;
      if (idxH >= 0 && idxH < grid.length) grid[idxH] = 2; // Mountain
      if (idxV >= 0 && idxV < grid.length) grid[idxV] = 2; // Mountain
    }

    return grid;
  }
}
