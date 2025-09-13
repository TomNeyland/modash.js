/**
 * D3.js Integration Example
 * Demonstrates how Modash.js can prepare data for D3.js visualizations
 */

import Modash from '../src/modash/index.js';

// Sample IoT sensor data for demonstration
const sensorData = [
  {
    timestamp: new Date('2024-01-15T08:00:00'),
    sensor: 'temp-01',
    location: 'office',
    value: 22.5,
    type: 'temperature',
  },
  {
    timestamp: new Date('2024-01-15T08:15:00'),
    sensor: 'temp-01',
    location: 'office',
    value: 23.1,
    type: 'temperature',
  },
  {
    timestamp: new Date('2024-01-15T08:30:00'),
    sensor: 'temp-01',
    location: 'office',
    value: 23.8,
    type: 'temperature',
  },
  {
    timestamp: new Date('2024-01-15T08:00:00'),
    sensor: 'humid-01',
    location: 'office',
    value: 45.2,
    type: 'humidity',
  },
  {
    timestamp: new Date('2024-01-15T08:15:00'),
    sensor: 'humid-01',
    location: 'office',
    value: 44.8,
    type: 'humidity',
  },
  {
    timestamp: new Date('2024-01-15T08:30:00'),
    sensor: 'humid-01',
    location: 'office',
    value: 46.1,
    type: 'humidity',
  },
  {
    timestamp: new Date('2024-01-15T08:00:00'),
    sensor: 'temp-02',
    location: 'warehouse',
    value: 18.5,
    type: 'temperature',
  },
  {
    timestamp: new Date('2024-01-15T08:15:00'),
    sensor: 'temp-02',
    location: 'warehouse',
    value: 19.2,
    type: 'temperature',
  },
  {
    timestamp: new Date('2024-01-15T08:30:00'),
    sensor: 'temp-02',
    location: 'warehouse',
    value: 19.8,
    type: 'temperature',
  },
];

console.log('🎨 D3.js Integration Examples with Modash.js\n');

// =========================================
// 1. TIME SERIES DATA FOR D3 LINE CHART
// =========================================
console.log('📈 Time Series: Multi-Sensor Temperature Monitoring');

const temperatureData = Modash.aggregate(sensorData, [
  { $match: { type: 'temperature' } },
  {
    $project: {
      timestamp: '$timestamp',
      sensor: '$sensor',
      location: '$location',
      value: '$value',
      hour: { $hour: '$timestamp' },
      minute: { $minute: '$timestamp' },
    },
  },
  { $sort: { timestamp: 1, sensor: 1 } },
]);

// Transform for D3.js - already in good format, just add helper
function toD3TimeSeriesFormat(data) {
  // Group by sensor for multiple lines
  const groupedBySensor = {};

  data.forEach(d => {
    if (!groupedBySensor[d.sensor]) {
      groupedBySensor[d.sensor] = [];
    }
    groupedBySensor[d.sensor].push({
      date: d.timestamp,
      value: d.value,
      location: d.location,
    });
  });

  return Object.entries(groupedBySensor).map(([sensor, values]) => ({
    sensor,
    location: values[0].location,
    values,
  }));
}

const d3TimeSeriesData = toD3TimeSeriesFormat(temperatureData);
console.log(
  'D3 Time Series Data Structure:',
  JSON.stringify(d3TimeSeriesData, null, 2)
);

// =========================================
// 2. HIERARCHICAL DATA FOR D3 TREEMAP
// =========================================
console.log('\n🌳 Hierarchical: Sensor Data by Location and Type');

const hierarchicalData = Modash.aggregate(sensorData, [
  {
    $group: {
      _id: {
        location: '$location',
        type: '$type',
      },
      avgValue: { $avg: '$value' },
      sensorCount: { $sum: 1 },
      minValue: { $min: '$value' },
      maxValue: { $max: '$value' },
    },
  },
  {
    $group: {
      _id: '$_id.location',
      sensors: {
        $push: {
          type: '$_id.type',
          avgValue: '$avgValue',
          count: '$sensorCount',
          range: { $subtract: ['$maxValue', '$minValue'] },
        },
      },
      locationTotal: { $sum: '$sensorCount' },
    },
  },
]);

// Transform for D3.js hierarchy (treemap, sunburst, etc.)
function toD3HierarchyFormat(data) {
  return {
    name: 'sensors',
    children: data.map(location => ({
      name: location._id,
      value: location.locationTotal,
      children: location.sensors.map(sensor => ({
        name: sensor.type,
        value: sensor.count,
        avgValue: sensor.avgValue,
        range: sensor.range,
      })),
    })),
  };
}

const d3HierarchyData = toD3HierarchyFormat(hierarchicalData);
console.log(
  'D3 Hierarchy Data Structure:',
  JSON.stringify(d3HierarchyData, null, 2)
);

// =========================================
// 3. NETWORK DATA FOR D3 FORCE SIMULATION
// =========================================
console.log('\n🕸️ Network: Sensor Correlation Analysis');

// Create correlation data between sensors
const correlationData = Modash.aggregate(sensorData, [
  {
    $group: {
      _id: '$timestamp',
      sensors: {
        $push: {
          sensor: '$sensor',
          value: '$value',
          type: '$type',
          location: '$location',
        },
      },
    },
  },
  { $match: { 'sensors.1': { $exists: true } } }, // Only timestamps with multiple sensors
  {
    $project: {
      timestamp: '$_id',
      correlations: '$sensors',
    },
  },
]);

// Transform for D3.js network (nodes and links)
function toD3NetworkFormat(data) {
  const nodes = new Map();
  const links = [];

  // Create unique nodes
  data.forEach(timepoint => {
    timepoint.correlations.forEach(sensor => {
      if (!nodes.has(sensor.sensor)) {
        nodes.set(sensor.sensor, {
          id: sensor.sensor,
          type: sensor.type,
          location: sensor.location,
          group: sensor.location,
        });
      }
    });

    // Create links between sensors at same timestamp
    const sensors = timepoint.correlations;
    for (let i = 0; i < sensors.length; i++) {
      for (let j = i + 1; j < sensors.length; j++) {
        const correlation = Math.abs(sensors[i].value - sensors[j].value);
        links.push({
          source: sensors[i].sensor,
          target: sensors[j].sensor,
          strength: 1 / (1 + correlation), // Inverse correlation as strength
          timestamp: timepoint.timestamp,
        });
      }
    }
  });

  return {
    nodes: Array.from(nodes.values()),
    links,
  };
}

const d3NetworkData = toD3NetworkFormat(correlationData);
console.log(
  'D3 Network Data Structure:',
  JSON.stringify(d3NetworkData, null, 2)
);

// =========================================
// 4. GEOGRAPHIC DATA FOR D3 MAPS
// =========================================
console.log('\n🗺️ Geographic: Sensor Distribution Map');

// Add mock geographic coordinates for demonstration
const geoSensorData = sensorData.map(d => ({
  ...d,
  coordinates:
    d.location === 'office' ? [-122.4194, 37.7749] : [-122.4094, 37.7849],
}));

const geographicData = Modash.aggregate(geoSensorData, [
  {
    $group: {
      _id: '$location',
      avgTemperature: {
        $avg: {
          $cond: [{ $eq: ['$type', 'temperature'] }, '$value', null],
        },
      },
      avgHumidity: {
        $avg: {
          $cond: [{ $eq: ['$type', 'humidity'] }, '$value', null],
        },
      },
      sensorCount: { $sum: 1 },
      coordinates: { $first: '$coordinates' },
    },
  },
]);

// Transform for D3.js geographic visualization
function toD3GeoFormat(data) {
  return {
    type: 'FeatureCollection',
    features: data.map(location => ({
      type: 'Feature',
      properties: {
        name: location._id,
        avgTemperature: location.avgTemperature,
        avgHumidity: location.avgHumidity,
        sensorCount: location.sensorCount,
      },
      geometry: {
        type: 'Point',
        coordinates: location.coordinates,
      },
    })),
  };
}

const d3GeoData = toD3GeoFormat(geographicData);
console.log(
  'D3 Geographic Data (GeoJSON):',
  JSON.stringify(d3GeoData, null, 2)
);

// =========================================
// 5. SCALABLE DATA PROCESSING
// =========================================
console.log('\n⚡ Scalable: Multi-Resolution Time Aggregation');

// Create multi-resolution aggregations for different zoom levels
const multiResolutionData = {
  // Minute-level detail
  minuteLevel: Modash.aggregate(sensorData, [
    {
      $project: {
        sensor: 1,
        type: 1,
        location: 1,
        value: 1,
        minute: {
          $subtract: [
            '$timestamp',
            { $mod: [{ $subtract: ['$timestamp', new Date(0)] }, 60000] },
          ],
        },
      },
    },
    {
      $group: {
        _id: { sensor: '$sensor', minute: '$minute' },
        avgValue: { $avg: '$value' },
        type: { $first: '$type' },
        location: { $first: '$location' },
      },
    },
  ]),

  // Hour-level summary
  hourLevel: Modash.aggregate(sensorData, [
    {
      $project: {
        sensor: 1,
        type: 1,
        location: 1,
        value: 1,
        hour: { $hour: '$timestamp' },
      },
    },
    {
      $group: {
        _id: { sensor: '$sensor', hour: '$hour' },
        avgValue: { $avg: '$value' },
        minValue: { $min: '$value' },
        maxValue: { $max: '$value' },
        type: { $first: '$type' },
        location: { $first: '$location' },
      },
    },
  ]),
};

console.log(
  'Multi-Resolution Data:',
  JSON.stringify(multiResolutionData, null, 2)
);

// =========================================
// 6. D3.js HELPER CLASS
// =========================================
console.log('\n🔧 D3.js Helper Functions');

/**
 * Helper class for D3.js integrations with Modash.js
 */
class ModashD3 {
  /**
   * Prepare time series data for D3.js line charts
   */
  static timeSeries(data, pipeline, options = {}) {
    const aggregated = Modash.aggregate(data, pipeline);

    // Convert to D3-friendly format
    return aggregated.map(d => ({
      date: options.dateExtractor ? options.dateExtractor(d) : new Date(d._id),
      value: options.valueExtractor ? options.valueExtractor(d) : d.value,
      ...options.additionalFields,
    }));
  }

  /**
   * Prepare hierarchical data for D3.js tree layouts
   */
  static hierarchy(data, pipeline, options = {}) {
    const aggregated = Modash.aggregate(data, pipeline);

    const rootName = options.rootName || 'root';
    const nameExtractor = options.nameExtractor || (d => d._id);
    const valueExtractor = options.valueExtractor || (d => d.value);
    const childrenExtractor = options.childrenExtractor || (d => d.children);

    return {
      name: rootName,
      children: aggregated.map(d => ({
        name: nameExtractor(d),
        value: valueExtractor(d),
        children: childrenExtractor(d) || [],
      })),
    };
  }

  /**
   * Prepare network data for D3.js force simulations
   */
  static network(data, pipeline, options = {}) {
    const aggregated = Modash.aggregate(data, pipeline);

    const nodes = new Set();
    const links = [];

    aggregated.forEach(d => {
      const source = options.sourceExtractor
        ? options.sourceExtractor(d)
        : d.source;
      const target = options.targetExtractor
        ? options.targetExtractor(d)
        : d.target;
      const weight = options.weightExtractor
        ? options.weightExtractor(d)
        : d.weight || 1;

      nodes.add(source);
      nodes.add(target);
      links.push({ source, target, weight });
    });

    return {
      nodes: Array.from(nodes).map(id => ({ id, ...options.nodeProperties })),
      links,
    };
  }

  /**
   * Prepare geographic data for D3.js maps
   */
  static geographic(data, pipeline, options = {}) {
    const aggregated = Modash.aggregate(data, pipeline);

    return {
      type: 'FeatureCollection',
      features: aggregated.map(d => ({
        type: 'Feature',
        properties: options.propertiesExtractor
          ? options.propertiesExtractor(d)
          : d,
        geometry: {
          type: 'Point',
          coordinates: options.coordinatesExtractor
            ? options.coordinatesExtractor(d)
            : d.coordinates,
        },
      })),
    };
  }

  /**
   * Generate color scales for D3.js visualizations
   */
  static colorScale(domain, scheme = 'category10') {
    const d3ColorSchemes = {
      category10: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd'],
      blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6'],
      reds: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a'],
    };

    const colors = d3ColorSchemes[scheme] || d3ColorSchemes.category10;
    const scale = {};

    domain.forEach((value, index) => {
      scale[value] = colors[index % colors.length];
    });

    return scale;
  }
}

// Example using the helper class
console.log('\n🎨 Using D3 Helper Class:');

const helperTimeSeriesData = ModashD3.timeSeries(
  sensorData,
  [{ $match: { type: 'temperature' } }, { $sort: { timestamp: 1 } }],
  {
    dateExtractor: d => d.timestamp,
    valueExtractor: d => d.value,
    additionalFields: { sensor: d => d.sensor, location: d => d.location },
  }
);

console.log(
  'Helper-generated D3 time series:',
  JSON.stringify(helperTimeSeriesData.slice(0, 3), null, 2)
);

const helperGeoData = ModashD3.geographic(
  geoSensorData,
  [
    {
      $group: {
        _id: '$location',
        avgValue: { $avg: '$value' },
        coordinates: { $first: '$coordinates' },
      },
    },
  ],
  {
    propertiesExtractor: d => ({ name: d._id, avgValue: d.avgValue }),
    coordinatesExtractor: d => d.coordinates,
  }
);

console.log(
  'Helper-generated GeoJSON:',
  JSON.stringify(helperGeoData, null, 2)
);

console.log('\n✅ D3.js integration examples completed!');
console.log(
  '💡 These examples show Modash.js flexibility for complex D3.js visualizations.'
);
