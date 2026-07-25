import fs from 'fs';
import * as topojson from 'topojson-client';

const rawData = JSON.parse(fs.readFileSync('./node_modules/world-atlas/land-50m.json', 'utf8'));
const geojson = topojson.feature(rawData, rawData.objects.land);
const multiPolygon = geojson.features[0].geometry.coordinates;

console.log(`=== Natural Earth 50m GeoJSON World Map Data ===`);
console.log(`Total Authentic Land Polygons: ${multiPolygon.length}`);

let totalPoints = 0;
multiPolygon.forEach(polygon => {
  polygon.forEach(ring => {
    totalPoints += ring.length;
  });
});

console.log(`Total Exact Coordinate Points: ${totalPoints}`);
