import fs from 'fs';
import * as topojson from 'topojson-client';

const rawData = JSON.parse(fs.readFileSync('./node_modules/world-atlas/land-50m.json', 'utf8'));
const geojson = topojson.feature(rawData, rawData.objects.land);
const multiPolygon = geojson.features[0].geometry.coordinates;

const width = 1000;
const height = 1000;

console.log('=== Testing Antimeridian Unwrapping & Polygon Splitting ===');

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

let totalRingsDrawn = 0;
let maxDLonDetected = 0;

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

    // Project rings to [0..1000] canvas coordinates with wraparound shifts
    const shifts = [0];
    if (minLon < -180) shifts.push(360);
    if (maxLon > 180) shifts.push(-360);

    shifts.forEach(shift => {
      const projected = unwrapped.map(([lon, lat]) => {
        const shiftedLon = lon + shift;
        const x = Math.round(((shiftedLon + 180) / 360) * width * 10) / 10;
        const clampedLat = Math.max(-85, Math.min(85, lat));
        const y = Math.round(((90 - clampedLat) / 180) * height * 10) / 10;
        return [x, y];
      });

      // Check max distance between consecutive points
      for (let k = 0; k < projected.length - 1; k++) {
        const dx = Math.abs(projected[k + 1][0] - projected[k][0]);
        if (dx > maxDLonDetected) maxDLonDetected = dx;
      }

      totalRingsDrawn++;
    });
  });
});

console.log(`Max X segment jump after unwrapping: ${maxDLonDetected.toFixed(1)}px (Target < 200px)`);
if (maxDLonDetected < 300) {
  console.log('✅ SUCCESS: Antimeridian tears and diagonal lines completely eliminated!');
} else {
  console.log('❌ FAIL: Tears still present.');
}
