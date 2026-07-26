import fs from 'fs';
import path from 'path';
import * as topojson from 'topojson-client';
import { MapGenerator } from '../public/src/map-generator.js';

const rawData = JSON.parse(fs.readFileSync('./node_modules/world-atlas/land-50m.json', 'utf8'));
const geojson = topojson.feature(rawData, rawData.objects.land);
const multiPolygon = geojson.features[0].geometry.coordinates;

const width = 1000;
const height = 1000;

console.log(`Processing ${multiPolygon.length} land polygons from Natural Earth 50m...`);

function unwrapRing(ring) {
  const unwrapped = [];
  let currentLonOffset = 0;

  for (let i = 0; i < ring.length; i++) {
    let [lon, lat] = ring[i];

    if (i > 0) {
      const prevLon = ring[i - 1][0];
      const deltaLon = lon - prevLon;

      if (deltaLon > 180) {
        currentLonOffset -= 360;
      } else if (deltaLon < -180) {
        currentLonOffset += 360;
      }
    }

    unwrapped.push([lon + currentLonOffset, lat]);
  }

  return unwrapped;
}

const normalizedPolygons = [];

multiPolygon.forEach((polygon) => {
  polygon.forEach((ring) => {
    if (ring.length < 3) return;

    const unwrapped = unwrapRing(ring);

    let minLon = Infinity, maxLon = -Infinity;
    unwrapped.forEach(([lon]) => {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    });

    const shifts = [0];
    if (minLon < -180) shifts.push(360);
    if (maxLon > 180) shifts.push(-360);

    shifts.forEach(shift => {
      let minX = 1000, maxX = 0, minY = 1000, maxY = 0;
      const projectedRing = unwrapped.map(([lon, lat]) => {
        const shiftedLon = lon + shift;
        const x = Math.round(((shiftedLon + 180) / 360) * width * 10) / 10;
        const clampedLat = Math.max(-85, Math.min(85, lat));
        const y = Math.round(((90 - clampedLat) / 180) * height * 10) / 10;

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        return [x, y];
      });

      const bboxArea = (maxX - minX) * (maxY - minY);
      if (bboxArea >= 0.25 || ring.length > 8) {
        normalizedPolygons.push(projectedRing);
      }
    });
  });
});

function rasterizeScanline(polygons, width, height, grid) {
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

function drawMountainRidge(x1, y1, x2, y2, radius, width, height, grid) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = (x1 < x2) ? 1 : -1;
  const sy = (y1 < y2) ? 1 : -1;
  let err = dx - dy;

  let cx = x1;
  let cy = y1;

  while (true) {
    const rSq = radius * radius;
    for (let dy2 = -radius; dy2 <= radius; dy2++) {
      const ny = cy + dy2;
      if (ny < 0 || ny >= height) continue;
      for (let dx2 = -radius; dx2 <= radius; dx2++) {
        const nx = cx + dx2;
        if (nx < 0 || nx >= width) continue;
        if (dx2 * dx2 + dy2 * dy2 <= rSq) {
          const idx = ny * width + nx;
          if (grid[idx] === 1) {
            grid[idx] = 2; // Impassable Mountain
          }
        }
      }
    }

    if (cx === x2 && cy === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }
}

function applyMountains(width, height, grid) {
  // Rockies
  drawMountainRidge(160, 220, 240, 320, 4, width, height, grid);
  drawMountainRidge(240, 320, 220, 420, 4, width, height, grid);

  // Andes
  drawMountainRidge(270, 560, 310, 680, 4, width, height, grid);
  drawMountainRidge(310, 680, 290, 800, 4, width, height, grid);

  // Alps
  drawMountainRidge(470, 260, 520, 280, 4, width, height, grid);
  drawMountainRidge(520, 280, 550, 270, 4, width, height, grid);

  // Himalayas
  drawMountainRidge(700, 320, 780, 340, 4, width, height, grid);
  drawMountainRidge(780, 340, 760, 370, 4, width, height, grid);

  // Urals
  drawMountainRidge(615, 150, 615, 320, 4, width, height, grid);
}

console.log("Rasterizing world map grid...");
const grid = new Uint8Array(width * height);
rasterizeScanline(normalizedPolygons, width, height, grid);
applyMountains(width, height, grid);

console.log("Running map generator cleanup/normalization pass...");
MapGenerator.cleanupGrid(width, height, grid);

console.log("Encoding grid using Run-Length Encoding (RLE)...");
const rle = [];
let currentVal = grid[0];
let count = 1;
for (let i = 1; i < grid.length; i++) {
  if (grid[i] === currentVal) {
    count++;
  } else {
    rle.push(count, currentVal);
    currentVal = grid[i];
    count = 1;
  }
}
rle.push(count, currentVal);

const assetsDir = path.resolve('./public/assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const jsonPath = path.join(assetsDir, 'natural-earth-world-50m.json');
fs.writeFileSync(jsonPath, JSON.stringify(rle));
console.log(`Successfully built pre-smoothed RLE world map asset containing ${rle.length} runs: ${jsonPath}`);
