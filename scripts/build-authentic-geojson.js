import fs from 'fs';
import path from 'path';
import * as topojson from 'topojson-client';

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

    // Calculate bounding box in unwrapped longitude space
    let minLon = Infinity, maxLon = -Infinity;
    unwrapped.forEach(([lon]) => {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    });

    // Handle Antimeridian wraparound by projecting primary ring + duplicate shift if spanning boundary
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

      // Filter out sub-pixel noise (bounding box area < 0.25 sq px)
      const bboxArea = (maxX - minX) * (maxY - minY);
      if (bboxArea >= 0.25 || ring.length > 8) {
        normalizedPolygons.push(projectedRing);
      }
    });
  });
});

const assetsDir = path.resolve('./public/assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const jsonPath = path.join(assetsDir, 'natural-earth-world-50m.json');
fs.writeFileSync(jsonPath, JSON.stringify(normalizedPolygons));
console.log(`Successfully isolated ${normalizedPolygons.length} boundary rings into artifact: ${jsonPath}`);
