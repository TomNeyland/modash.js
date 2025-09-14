import { expect } from 'chai';
import { execSync } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('CLI Fixture Queries', () => {
  const CLI_PATH = path.join(__dirname, '../../dist/cli.js');
  const FIXTURES_DIR = path.join(__dirname, '../../fixtures');

  // Helper to run CLI command
  function runCLI(pipeline, fixture, options = {}) {
    const fixturePath = path.join(FIXTURES_DIR, fixture);
    const optionFlags = Object.entries(options)
      .filter(([, value]) => value)
      .map(([key]) => `--${key}`)
      .join(' ');
    const command = `node ${CLI_PATH} '${JSON.stringify(pipeline)}' --file ${fixturePath} ${optionFlags}`;

    try {
      const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });

      // Handle different output formats
      if (options.pretty) {
        return output; // Return raw pretty-printed output
      }

      if (options.stats || options.explain) {
        return output; // Return raw output including stats/explain
      }

      // Parse JSONL output
      return output.trim().split('\n')
        .filter(line => line && line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            console.error(`Failed to parse line: ${line}`);
            return null;
          }
        })
        .filter(item => item !== null);
    } catch (error) {
      console.error(`CLI command failed: ${command}`);
      console.error(`Error output: ${error.stdout || error.message}`);
      throw error;
    }
  }

  describe('E-commerce Orders Queries', () => {
    it('should calculate total revenue via CLI', () => {
      const pipeline = [
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            orderCount: { $sum: 1 }
          }
        }
      ];

      const result = runCLI(pipeline, 'ecommerce-orders.jsonl');

      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.property('totalRevenue');
      expect(result[0].totalRevenue).to.be.a('number');
      expect(result[0].totalRevenue).to.be.greaterThan(0);
      expect(result[0].orderCount).to.equal(100); // We generated 100 orders
    });

    it('should find orders above average value', () => {
      // First get average
      const avgPipeline = [
        {
          $group: {
            _id: null,
            avgAmount: { $avg: '$totalAmount' }
          }
        }
      ];

      const avgResult = runCLI(avgPipeline, 'ecommerce-orders.jsonl');
      const avgAmount = avgResult[0].avgAmount;

      // Then filter above average - just count matching docs
      const pipeline = [
        { $match: { totalAmount: { $gte: avgAmount } } }
      ];

      const result = runCLI(pipeline, 'ecommerce-orders.jsonl');

      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
      expect(result.length).to.be.lessThanOrEqual(100);
    });

    it('should group orders by status', () => {
      const pipeline = [
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            avgAmount: { $avg: '$totalAmount' }
          }
        },
        { $sort: { count: -1 } }
      ];

      const result = runCLI(pipeline, 'ecommerce-orders.jsonl');

      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);

      result.forEach(group => {
        expect(group).to.have.property('_id');
        expect(group).to.have.property('count');
        expect(group).to.have.property('avgAmount');
        expect(['pending', 'processing', 'shipped', 'delivered', 'cancelled']).to.include(group._id);
      });
    });
  });

  describe('Blog Posts Queries', () => {
    it('should find most viewed posts', () => {
      const pipeline = [
        { $match: { status: 'published' } },
        { $sort: { views: -1 } },
        { $limit: 5 },
        { $project: { title: 1, views: 1, likes: 1 } }
      ];

      const result = runCLI(pipeline, 'blog-posts.jsonl');

      expect(result.length).to.be.at.most(5);

      if (result.length > 1) {
        // Check sorting
        expect(result[0].views).to.be.at.least(result[1].views);
      }

      result.forEach(post => {
        expect(post).to.have.property('title');
        expect(post).to.have.property('views');
      });
    });

    it('should calculate engagement metrics', () => {
      const pipeline = [
        { $match: { status: 'published', views: { $gt: 0 } } },
        {
          $addFields: {
            engagementRate: { $divide: ['$likes', '$views'] }
          }
        },
        { $sort: { engagementRate: -1 } },
        { $limit: 3 },
        { $project: { title: 1, views: 1, likes: 1, engagementRate: 1 } }
      ];

      const result = runCLI(pipeline, 'blog-posts.jsonl');

      expect(result.length).to.be.at.most(3);

      result.forEach(post => {
        expect(post).to.have.property('engagementRate');
        expect(post.engagementRate).to.be.at.least(0);
        // Engagement rate could be > 1 if likes > views (edge case in test data)
        // but should be reasonable
        expect(post.engagementRate).to.be.lessThan(10);
      });
    });

    it('should group posts by category', () => {
      const pipeline = [
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            avgViews: { $avg: '$views' }
          }
        }
      ];

      const result = runCLI(pipeline, 'blog-posts.jsonl');

      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);

      result.forEach(category => {
        expect(category).to.have.property('_id');
        expect(category).to.have.property('count');
        expect(category).to.have.property('avgViews');
        expect(category.count).to.be.greaterThan(0);
      });
    });
  });

  describe('IoT Sensors Queries', () => {
    it('should find sensors with low battery', () => {
      const pipeline = [
        { $match: { 'metadata.batteryLevel': { $lt: 20 } } },
        {
          $group: {
            _id: '$deviceId',
            avgBattery: { $avg: '$metadata.batteryLevel' },
            readingCount: { $sum: 1 }
          }
        },
        { $sort: { avgBattery: 1 } },
        { $limit: 5 }
      ];

      const result = runCLI(pipeline, 'iot-sensors.jsonl');

      result.forEach(sensor => {
        expect(sensor).to.have.property('_id');
        expect(sensor).to.have.property('avgBattery');
        expect(sensor.avgBattery).to.be.lessThan(20);
      });
    });

    it('should calculate average temperature by location', () => {
      const pipeline = [
        { $match: { sensorType: 'temperature' } },
        {
          $group: {
            _id: '$location',
            avgTemp: { $avg: '$value' },
            minTemp: { $min: '$value' },
            maxTemp: { $max: '$value' },
            readingCount: { $sum: 1 }
          }
        }
      ];

      const result = runCLI(pipeline, 'iot-sensors.jsonl');

      expect(result).to.be.an('array');

      result.forEach(location => {
        expect(location).to.have.property('avgTemp');
        expect(location).to.have.property('minTemp');
        expect(location).to.have.property('maxTemp');
        expect(location.minTemp).to.be.at.most(location.avgTemp);
        expect(location.avgTemp).to.be.at.most(location.maxTemp);
      });
    });

    it('should identify anomalies', () => {
      const pipeline = [
        {
          $match: {
            $or: [
              { value: { $gt: 100 } },
              { value: { $lt: -50 } }
            ]
          }
        }
      ];

      const result = runCLI(pipeline, 'iot-sensors.jsonl');

      // Some readings might be anomalies, or none
      expect(result).to.be.an('array');
      // If there are anomalies, they should match the criteria
      result.forEach(reading => {
        const isAnomaly = reading.value > 100 || reading.value < -50;
        expect(isAnomaly).to.be.true;
      });
    });
  });

  describe('CLI with Options', () => {
    it('should work with --pretty option', () => {
      const pipeline = [
        { $limit: 1 },
        { $project: { _id: 1 } }
      ];

      const output = runCLI(pipeline, 'ecommerce-orders.jsonl', { pretty: true });

      // Pretty output should be indented JSON
      expect(output).to.include('  ');
      expect(() => JSON.parse(output)).to.not.throw();
    });

    it('should work with --stats option', () => {
      const pipeline = [
        { $group: { _id: null, count: { $sum: 1 } } }
      ];

      const output = runCLI(pipeline, 'blog-posts.jsonl', { stats: true });

      // Stats output should include the result and timing information
      // The stats are printed to stderr, but result is in stdout
      expect(output).to.be.a('string');
      expect(output).to.include('_id');
    });

    it('should work with --explain option', () => {
      const pipeline = [
        { $match: { status: 'published' } },
        { $limit: 5 }
      ];

      const output = runCLI(pipeline, 'blog-posts.jsonl', { explain: true });

      // Explain output should include the results
      // The analysis is printed to stderr, but results are in stdout
      expect(output).to.be.a('string');
      expect(output.length).to.be.greaterThan(0);
    });
  });

  describe('Performance with Large Fixtures', () => {
    it('should handle all 64 e-commerce orders efficiently', () => {
      const start = Date.now();

      const pipeline = [
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.category',
            totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
            itemCount: { $sum: '$items.quantity' }
          }
        },
        { $sort: { totalRevenue: -1 } }
      ];

      const result = runCLI(pipeline, 'ecommerce-orders.jsonl');
      const duration = Date.now() - start;

      expect(result).to.be.an('array');
      expect(duration).to.be.lessThan(1000); // Should complete in under 1 second

      result.forEach(category => {
        expect(category).to.have.property('_id');
        expect(category).to.have.property('totalRevenue');
        expect(category).to.have.property('itemCount');
      });
    });
  });
});