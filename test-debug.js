import { expect } from 'chai';
import Modash from './src/index.js';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loadFixture } from './tests/fixtures/test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readingsPath = path.join(__dirname, 'fixtures/iot-sensors.jsonl');
const readings = loadFixture(readingsPath);

if (!readings || readings.length === 0) {
  console.log('ERROR: No readings loaded');
  process.exit(1);
}

const buildings = [...new Set(readings.map(r => r.location.building))];

console.log('Buildings:', buildings);
console.log('Total readings:', readings.length);

const totalStatuses = Modash.aggregate(readings, [
  {
    $group: {
      _id: '$status',
      count: { $sum: 1 },
    },
  },
]);

console.log('\nTotal statuses:');
totalStatuses.forEach(s => console.log(`  ${s._id}: ${s.count}`));

const buildingStatuses = buildings.flatMap(building => {
  const result = Modash.aggregate(readings, [
    { $match: { 'location.building': building } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);
  console.log(`\nBuilding ${building} statuses:`, result);
  return result;
});

console.log('\nBuilding statuses total count:', buildingStatuses.length);

const statusMap = new Map();
buildingStatuses.forEach(s => {
  statusMap.set(s._id, (statusMap.get(s._id) || 0) + s.count);
});

console.log('\nStatus map size:', statusMap.size);
console.log('Status map entries:', Array.from(statusMap.entries()));

console.log('\nComparison:');
totalStatuses.forEach(status => {
  const got = statusMap.get(status._id) || 0;
  console.log(`Status ${status._id}: expected ${status.count}, got ${got}`);
});