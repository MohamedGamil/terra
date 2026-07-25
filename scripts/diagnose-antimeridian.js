import fs from 'fs';
import * as topojson from 'topojson-client';

const rawData = JSON.parse(fs.readFileSync('./node_modules/world-atlas/land-50m.json', 'utf8'));
const geojson = topojson.feature(rawData, rawData.objects.land);
const multiPolygon = geojson.features[0].geometry.coordinates;

let antimeridianTearCount = 0;

multiPolygon.forEach((polygon, pIdx) => {
  polygon.forEach((ring, rIdx) => {
    for (let i = 0; i < ring.length - 1; i++) {
      const lon1 = ring[i][0];
      const lon2 = ring[i + 1][0];
      const dLon = Math.abs(lon2 - lon1);

      if (dLon > 180) {
        antimeridianTearCount++;
        console.log(`Antimeridian Jump Found! Polygon ${pIdx}, Ring ${rIdx}, Segment ${i}: lon1=${lon1}, lon2=${lon2}, dLon=${dLon}`);
      }
    }
  });
});

console.log(`\nTotal Antimeridian Jump Segments causing Map Tears: ${antimeridianTearCount}`);
