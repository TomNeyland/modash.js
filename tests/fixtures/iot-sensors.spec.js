import { expect } from 'chai';
import Modash from '../../src/index.js';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  loadFixture,
  measurePerformance,
  assertCloseTo,
  formatPerformanceReport
} from './test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('IoT Sensors - Query Patterns & Metamorphic Testing', () => {
  let readings;
  const performanceResults = [];

  before(() => {
    const readingsPath = path.join(__dirname, '../../fixtures/iot-sensors.jsonl');
    readings = loadFixture(readingsPath) || generateSensorReadingsFixture(100);
  });

  after(() => {
    if (performanceResults.length > 0) {
      console.log(formatPerformanceReport(performanceResults));
    }
  });

  describe('Sensor Health Monitoring', () => {
    it('should identify sensors with low battery', () => {
      let result;
      const perf = measurePerformance('Low Battery Sensors Query', () => {
        result = Modash.aggregate(readings, [
        { $match: { 'metadata.batteryLevel': { $lt: 20 } } },
        {
          $group: {
            _id: '$deviceId',
            avgBattery: { $avg: '$metadata.batteryLevel' },
            lastReading: { $max: '$timestamp' },
            location: { $first: '$location' },
            readingCount: { $sum: 1 }
          }
        },
        { $sort: { avgBattery: 1 } }
      ]);
      });
      performanceResults.push(perf);

      result.forEach(sensor => {
        expect(sensor.avgBattery).to.be.lessThan(20);
        expect(sensor).to.have.property('location');
      });
    });

    it('should detect signal strength issues', () => {
      const result = Modash.aggregate(readings, [
        {
          $group: {
            _id: '$deviceId',
            avgSignal: { $avg: '$metadata.signalStrength' },
            minSignal: { $min: '$metadata.signalStrength' },
            maxSignal: { $max: '$metadata.signalStrength' },
            signalVariance: {
              $stdDevPop: '$metadata.signalStrength'
            }
          }
        },
        { $match: { avgSignal: { $lt: -70 } } },
        { $sort: { avgSignal: 1 } }
      ]);

      result.forEach(sensor => {
        expect(sensor.avgSignal).to.be.lessThan(-70);
        expect(sensor.minSignal).to.be.at.most(sensor.maxSignal);
      });
    });
  });

  describe('Environmental Analysis', () => {
    it('should calculate average conditions by location', () => {
      const result = Modash.aggregate(readings, [
        { $match: { sensorType: { $in: ['temperature', 'humidity', 'co2'] } } },
        {
          $group: {
            _id: {
              building: '$location.building',
              floor: '$location.floor',
              sensorType: '$sensorType'
            },
            avgValue: { $avg: '$value' },
            minValue: { $min: '$value' },
            maxValue: { $max: '$value' },
            readingCount: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: {
              building: '$_id.building',
              floor: '$_id.floor'
            },
            conditions: {
              $push: {
                type: '$_id.sensorType',
                avg: '$avgValue',
                min: '$minValue',
                max: '$maxValue'
              }
            }
          }
        },
        { $sort: { '_id.building': 1, '_id.floor': 1 } }
      ]);

      result.forEach(location => {
        expect(location._id).to.have.property('building');
        expect(location._id).to.have.property('floor');
        expect(location.conditions).to.be.an('array');
      });
    });

    it('should identify temperature anomalies', () => {
      const result = Modash.aggregate(readings, [
        { $match: { sensorType: 'temperature' } },
        {
          $group: {
            _id: '$location.building',
            avgTemp: { $avg: '$value' },
            stdDev: { $stdDevPop: '$value' }
          }
        },
        {
          $lookup: {
            from: readings.filter(r => r.sensorType === 'temperature'),
            let: { building: '$_id', avgTemp: '$avgTemp', stdDev: '$stdDev' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$location.building', '$$building'] },
                      { $eq: ['$sensorType', 'temperature'] },
                      {
                        $or: [
                          { $gt: ['$value', { $add: ['$$avgTemp', { $multiply: ['$$stdDev', 2] }] }] },
                          { $lt: ['$value', { $subtract: ['$$avgTemp', { $multiply: ['$$stdDev', 2] }] }] }
                        ]
                      }
                    ]
                  }
                }
              }
            ],
            as: 'anomalies'
          }
        },
        {
          $project: {
            building: '$_id',
            avgTemp: 1,
            stdDev: 1,
            anomalyCount: { $size: '$anomalies' }
          }
        }
      ]);

      result.forEach(building => {
        expect(building).to.have.property('avgTemp');
        expect(building).to.have.property('stdDev');
        expect(building.anomalyCount).to.be.at.least(0);
      });
    });
  });

  describe('Alert System', () => {
    it('should prioritize critical alerts', () => {
      const result = Modash.aggregate(readings, [
        { $match: { status: 'critical' } },
        {
          $group: {
            _id: {
              device: '$deviceId',
              type: '$sensorType'
            },
            criticalCount: { $sum: 1 },
            latestValue: { $last: '$value' },
            latestTime: { $max: '$timestamp' },
            location: { $first: '$location' }
          }
        },
        {
          $addFields: {
            urgencyScore: {
              $multiply: [
                '$criticalCount',
                {
                  $switch: {
                    branches: [
                      { case: { $eq: ['$_id.type', 'co2'] }, then: 3 },
                      { case: { $eq: ['$_id.type', 'temperature'] }, then: 2 },
                      { case: { $eq: ['$_id.type', 'motion'] }, then: 2 }
                    ],
                    default: 1
                  }
                }
              ]
            }
          }
        },
        { $sort: { urgencyScore: -1, latestTime: -1 } },
        { $limit: 10 }
      ]);

      result.forEach(alert => {
        expect(alert.criticalCount).to.be.at.least(1);
        expect(alert.urgencyScore).to.be.at.least(1);
      });
    });

    it('should analyze alert patterns over time', () => {
      const result = Modash.aggregate(readings, [
        { $match: { anomaly: true } },
        {
          $addFields: {
            hour: { $hour: '$timestamp' },
            dayOfWeek: { $dayOfWeek: '$timestamp' }
          }
        },
        {
          $group: {
            _id: {
              hour: '$hour',
              dayOfWeek: '$dayOfWeek'
            },
            alertCount: { $sum: 1 },
            affectedDevices: { $addToSet: '$deviceId' },
            sensorTypes: { $addToSet: '$sensorType' }
          }
        },
        {
          $addFields: {
            deviceCount: { $size: '$affectedDevices' },
            sensorTypeCount: { $size: '$sensorTypes' }
          }
        },
        { $sort: { alertCount: -1 } }
      ]);

      result.forEach(pattern => {
        expect(pattern._id.hour).to.be.at.least(0).and.at.most(23);
        expect(pattern._id.dayOfWeek).to.be.at.least(1).and.at.most(7);
        expect(pattern.alertCount).to.be.at.least(1);
      });
    });
  });

  describe('Device Performance', () => {
    it('should calculate device reliability metrics', () => {
      const result = Modash.aggregate(readings, [
        {
          $group: {
            _id: '$deviceId',
            totalReadings: { $sum: 1 },
            normalReadings: {
              $sum: { $cond: [{ $eq: ['$status', 'normal'] }, 1, 0] }
            },
            warningReadings: {
              $sum: { $cond: [{ $eq: ['$status', 'warning'] }, 1, 0] }
            },
            criticalReadings: {
              $sum: { $cond: [{ $eq: ['$status', 'critical'] }, 1, 0] }
            },
            avgBattery: { $avg: '$metadata.batteryLevel' },
            avgSignal: { $avg: '$metadata.signalStrength' }
          }
        },
        {
          $addFields: {
            reliabilityScore: {
              $multiply: [
                100,
                { $divide: ['$normalReadings', '$totalReadings'] }
              ]
            },
            healthScore: {
              $avg: [
                { $divide: ['$avgBattery', 100] },
                { $add: [1, { $divide: ['$avgSignal', 100] }] },
                { $divide: ['$normalReadings', '$totalReadings'] }
              ]
            }
          }
        },
        { $sort: { reliabilityScore: -1 } }
      ]);

      result.forEach(device => {
        expect(device.reliabilityScore).to.be.at.least(0).and.at.most(100);
        expect(device.totalReadings).to.equal(
          device.normalReadings + device.warningReadings + device.criticalReadings
        );
      });
    });

    it('should identify devices needing calibration', () => {
      const result = Modash.aggregate(readings, [
        {
          $addFields: {
            daysSinceCalibration: {
              $divide: [
                { $subtract: [new Date(), '$metadata.calibratedAt'] },
                1000 * 60 * 60 * 24
              ]
            }
          }
        },
        {
          $group: {
            _id: '$deviceId',
            avgDaysSinceCalibration: { $avg: '$daysSinceCalibration' },
            sensorType: { $first: '$sensorType' },
            location: { $first: '$location' },
            anomalyRate: {
              $avg: { $cond: ['$anomaly', 1, 0] }
            }
          }
        },
        {
          $match: {
            $or: [
              { avgDaysSinceCalibration: { $gte: 180 } },
              { anomalyRate: { $gte: 0.1 } }
            ]
          }
        },
        { $sort: { avgDaysSinceCalibration: -1 } }
      ]);

      result.forEach(device => {
        expect(device.avgDaysSinceCalibration).to.be.a('number');
        expect(device.anomalyRate).to.be.at.least(0).and.at.most(1);
      });
    });
  });

  describe('Metamorphic Properties', () => {
    it('should maintain conservation of readings across groupings', () => {
      const totalReadings = readings.length;

      const byDevice = Modash.aggregate(readings, [
        {
          $group: {
            _id: '$deviceId',
            count: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$count' }
          }
        }
      ])[0]?.total || 0;

      const byType = Modash.aggregate(readings, [
        {
          $group: {
            _id: '$sensorType',
            count: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$count' }
          }
        }
      ])[0]?.total || 0;

      expect(byDevice).to.equal(totalReadings);
      expect(byType).to.equal(totalReadings);
    });

    it('should preserve anomaly detection consistency', () => {
      const directAnomalies = readings.filter(r => r.anomaly).length;

      const aggregatedAnomalies = Modash.aggregate(readings, [
        { $match: { anomaly: true } },
        { $count: 'total' }
      ])[0]?.total || 0;

      const summedAnomalies = Modash.aggregate(readings, [
        {
          $group: {
            _id: null,
            anomalyCount: {
              $sum: { $cond: ['$anomaly', 1, 0] }
            }
          }
        }
      ])[0]?.anomalyCount || 0;

      expect(aggregatedAnomalies).to.equal(directAnomalies);
      expect(summedAnomalies).to.equal(directAnomalies);
    });

    it('should maintain average value consistency across transformations', () => {
      const tempReadings = readings.filter(r => r.sensorType === 'temperature');

      if (tempReadings.length > 0) {
        const directAvg = tempReadings.reduce((sum, r) => sum + r.value, 0) / tempReadings.length;

        const aggregatedAvg = Modash.aggregate(readings, [
          { $match: { sensorType: 'temperature' } },
          {
            $group: {
              _id: null,
              avgTemp: { $avg: '$value' }
            }
          }
        ])[0]?.avgTemp || 0;

        expect(Math.abs(directAvg - aggregatedAvg)).to.be.lessThan(0.01);
      }
    });

    it('should satisfy distributive property for status counts', () => {
      const buildings = [...new Set(readings.map(r => r.location.building))];

      const totalStatuses = Modash.aggregate(readings, [
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const buildingStatuses = buildings.flatMap(building =>
        Modash.aggregate(readings, [
          { $match: { 'location.building': building } },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ])
      );

      const statusMap = new Map();
      buildingStatuses.forEach(s => {
        statusMap.set(s._id, (statusMap.get(s._id) || 0) + s.count);
      });

      totalStatuses.forEach(status => {
        expect(statusMap.get(status._id) || 0).to.equal(status.count);
      });
    });
  });

  describe('Complex Analytics', () => {
    it('should calculate environmental comfort index', () => {
      const result = Modash.aggregate(readings, [
        {
          $group: {
            _id: {
              building: '$location.building',
              floor: '$location.floor',
              room: '$location.room'
            },
            temperature: {
              $avg: {
                $cond: [{ $eq: ['$sensorType', 'temperature'] }, '$value', null]
              }
            },
            humidity: {
              $avg: {
                $cond: [{ $eq: ['$sensorType', 'humidity'] }, '$value', null]
              }
            },
            co2: {
              $avg: {
                $cond: [{ $eq: ['$sensorType', 'co2'] }, '$value', null]
              }
            },
            light: {
              $avg: {
                $cond: [{ $eq: ['$sensorType', 'light'] }, '$value', null]
              }
            }
          }
        },
        {
          $addFields: {
            comfortIndex: {
              $avg: [
                {
                  $cond: [
                    { $and: [{ $gte: ['$temperature', 20] }, { $lte: ['$temperature', 24] }] },
                    100,
                    { $multiply: [50, { $subtract: [1, { $abs: { $subtract: ['$temperature', 22] } }] }] }
                  ]
                },
                {
                  $cond: [
                    { $and: [{ $gte: ['$humidity', 40] }, { $lte: ['$humidity', 60] }] },
                    100,
                    { $multiply: [50, { $subtract: [1, { $abs: { $subtract: ['$humidity', 50] } }] }] }
                  ]
                },
                {
                  $cond: [
                    { $lte: ['$co2', 800] },
                    100,
                    { $max: [0, { $subtract: [100, { $divide: [{ $subtract: ['$co2', 800] }, 10] }] }] }
                  ]
                }
              ]
            }
          }
        },
        { $sort: { comfortIndex: -1 } }
      ]);

      result.forEach(room => {
        if (room.comfortIndex !== null) {
          expect(room.comfortIndex).to.be.at.least(0).and.at.most(100);
        }
      });
    });

    it('should predict maintenance requirements', () => {
      const result = Modash.aggregate(readings, [
        {
          $group: {
            _id: '$deviceId',
            avgBattery: { $avg: '$metadata.batteryLevel' },
            batteryDeclineRate: {
              $avg: {
                $subtract: [
                  { $first: '$metadata.batteryLevel' },
                  { $last: '$metadata.batteryLevel' }
                ]
              }
            },
            anomalyRate: {
              $avg: { $cond: ['$anomaly', 1, 0] }
            },
            criticalRate: {
              $avg: { $cond: [{ $eq: ['$status', 'critical'] }, 1, 0] }
            },
            daysSinceCalibration: {
              $avg: {
                $divide: [
                  { $subtract: [new Date(), '$metadata.calibratedAt'] },
                  1000 * 60 * 60 * 24
                ]
              }
            }
          }
        },
        {
          $addFields: {
            maintenanceScore: {
              $add: [
                { $multiply: [{ $subtract: [100, '$avgBattery'] }, 0.3] },
                { $multiply: ['$anomalyRate', 100, 0.3] },
                { $multiply: ['$criticalRate', 100, 0.2] },
                { $multiply: [{ $min: ['$daysSinceCalibration', 365] }, 0.2 / 365] }
              ]
            }
          }
        },
        { $sort: { maintenanceScore: -1 } },
        { $limit: 10 }
      ]);

      result.forEach(device => {
        expect(device.maintenanceScore).to.be.a('number');
        expect(device.avgBattery).to.be.at.least(0).and.at.most(100);
      });
    });
  });
});

function generateSensorReadingsFixture(count) {
  const sensorTypes = ['temperature', 'humidity', 'pressure', 'motion', 'light', 'co2'];
  const buildings = ['A', 'B', 'C'];
  const statuses = ['normal', 'warning', 'critical'];

  return Array.from({ length: count }, (_, i) => {
    const sensorType = sensorTypes[Math.floor(Math.random() * sensorTypes.length)];
    let value, status = 'normal';

    switch (sensorType) {
      case 'temperature':
        value = Math.random() * 50 - 10;
        if (value < 10 || value > 30) status = 'warning';
        if (value < 0 || value > 35) status = 'critical';
        break;
      case 'humidity':
        value = Math.random() * 60 + 20;
        break;
      case 'pressure':
        value = Math.random() * 60 + 980;
        break;
      case 'motion':
        value = Math.random() > 0.5 ? 1 : 0;
        break;
      case 'light':
        value = Math.random() * 100000;
        break;
      case 'co2':
        value = Math.random() * 1600 + 400;
        if (value > 1000) status = 'warning';
        if (value > 1500) status = 'critical';
        break;
    }

    return {
      _id: `READ-${i + 1}`,
      deviceId: `SENSOR-${Math.floor(Math.random() * 50) + 1}`,
      sensorType,
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      value,
      unit: sensorType === 'temperature' ? '°C' : sensorType === 'humidity' ? '%' : 'unit',
      location: {
        building: buildings[Math.floor(Math.random() * buildings.length)],
        floor: Math.floor(Math.random() * 10) + 1,
        room: `${Math.floor(Math.random() * 900) + 100}`,
        coordinates: {
          lat: Math.random() * 180 - 90,
          lng: Math.random() * 360 - 180
        }
      },
      status,
      metadata: {
        batteryLevel: Math.floor(Math.random() * 90) + 10,
        signalStrength: -Math.floor(Math.random() * 60) - 30,
        firmware: `v1.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`,
        calibratedAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
      },
      anomaly: status === 'critical' || Math.random() < 0.05,
      tags: status === 'critical' ? ['alert', 'requires-attention'] : []
    };
  });
}