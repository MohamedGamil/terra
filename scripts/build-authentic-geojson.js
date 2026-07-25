import fs from 'fs';
import * as topojson from 'topojson-client';

const rawData = JSON.parse(fs.readFileSync('./node_modules/world-atlas/land-50m.json', 'utf8'));
const geojson = topojson.feature(rawData, rawData.objects.land);
const multiPolygon = geojson.features[0].geometry.coordinates;

const width = 1000;
const height = 1000;

console.log(`Processing ${multiPolygon.length} land polygons from Natural Earth 50m...`);

// Convert (longitude, latitude) -> (x, y) in 1000x1000 space
const normalizedPolygons = [];

multiPolygon.forEach(polygon => {
  polygon.forEach(ring => {
    if (ring.length >= 3) {
      let minX = 1000, maxX = 0, minY = 1000, maxY = 0;
      const projectedRing = ring.map(([lon, lat]) => {
        const x = Math.round(((lon + 180) / 360) * width * 10) / 10;
        const clampedLat = Math.max(-85, Math.min(85, lat));
        const y = Math.round(((90 - clampedLat) / 180) * height * 10) / 10;

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        return [x, y];
      });

      // Filter out sub-pixel noise (bounding box area < 0.25 sq px)
      const bboxArea = (maxX - minX) * (maxY - minY);
      if (bboxArea >= 0.25 || ring.length > 8) {
        normalizedPolygons.push(projectedRing);
      }
    }
  });
});

console.log(`Generated ${normalizedPolygons.length} optimized authentic 2D boundary rings.`);

const code = `/**
 * Authentic Natural Earth GeoJSON World Map Data Engine for Terra.
 * 100% Real-world geographic polygon data derived from Natural Earth 50m dataset.
 */

export class GeoJSONWorldMap {
  static getAuthenticWorldPolygons() {
    return ${JSON.stringify(normalizedPolygons)};
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
    // Generate impassable mountain ranges over major mountain systems (Himalayas, Andes, Rockies, Alps, Urals)
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
`;

fs.writeFileSync('./public/src/geojson-world-map.js', code);
console.log('Successfully updated public/src/geojson-world-map.js with optimized authentic Natural Earth GeoJSON data!');
