/**
 * Authentic Natural Earth RLE-Encoded World Map Data Engine for Terra.
 * Decodes the pre-smoothed and normalized world map grid in < 5ms.
 */

import worldRleAsset from '../assets/natural-earth-world-50m.json' with { type: 'json' };

export class GeoJSONWorldMap {
  static getAuthenticWorldPolygons() {
    return [];
  }

  static setPolygons(polygons) {
    // No-op, compatibility
  }

  /**
   * Decodes pre-smoothed and normalized RLE world map grid.
   * Values: 0 = Ocean Water, 1 = Neutral Land, 2 = Mountain
   */
  static rasterize(width = 1000, height = 1000) {
    const fullGrid = new Uint8Array(1000 * 1000);
    if (Array.isArray(worldRleAsset)) {
      let idx = 0;
      for (let i = 0; i < worldRleAsset.length; i += 2) {
        const count = worldRleAsset[i];
        const val = worldRleAsset[i + 1];
        fullGrid.fill(val, idx, idx + count);
        idx += count;
      }
    }

    if (width === 1000 && height === 1000) {
      return fullGrid;
    }

    // Scale to requested width and height
    const grid = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const srcY = Math.floor((y / height) * 1000);
      const rowOffset = y * width;
      const srcRowOffset = srcY * 1000;
      for (let x = 0; x < width; x++) {
        const srcX = Math.floor((x / width) * 1000);
        grid[rowOffset + x] = fullGrid[srcRowOffset + srcX];
      }
    }
    return grid;
  }
}
