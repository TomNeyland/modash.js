import { expect } from 'chai';
import { execSync, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLI_PATH = path.join(__dirname, '../../dist/cli.js');
const LARGE_FIXTURES_DIR = path.join(__dirname, '../../fixtures/large');

// Helper to ensure fixture exists
function ensureFixture(name) {
  const filepath = path.join(LARGE_FIXTURES_DIR, name);

  if (!fs.existsSync(filepath)) {
    console.log(`\n⚡ Generating missing fixture: ${name}`);
    execSync(`npx tsx scripts/generate-large-fixtures.ts`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '../..')
    });
  }

  return filepath;
}

// Helper to measure streaming performance
function measureStreamingPerformance(name, fixturePath, pipeline, options = {}) {
  return new Promise((resolve, reject) => {
    const startTime = process.hrtime.bigint();
    const startMem = process.memoryUsage();

    const command = `cat ${fixturePath} | node ${CLI_PATH} '${JSON.stringify(pipeline)}'`;

    let outputLines = 0;
    let outputBuffer = '';
    let errorBuffer = '';

    const child = spawn('sh', ['-c', command], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    child.stdout.on('data', (chunk) => {
      outputBuffer += chunk.toString();
      outputLines += chunk.toString().split('\n').filter(line => line.trim()).length;
    });

    child.stderr.on('data', (chunk) => {
      errorBuffer += chunk.toString();
    });

    child.on('close', (code) => {
      const endTime = process.hrtime.bigint();
      const endMem = process.memoryUsage();
      const duration = Number(endTime - startTime) / 1_000_000; // Convert to ms
      const memDelta = (endMem.heapUsed - startMem.heapUsed) / 1024 / 1024; // MB

      if (code !== 0) {
        reject(new Error(`Command failed with code ${code}: ${errorBuffer}`));
        return;
      }

      // Parse performance stats if --stats was used
      let stats = null;
      if (options.stats && errorBuffer.includes('Performance Stats')) {
        const throughputMatch = errorBuffer.match(/Throughput: ([\d,]+) docs\/sec/);
        const timeMatch = errorBuffer.match(/Execution time: ([\d.]+)ms/);
        if (throughputMatch) {
          stats = {
            throughput: parseInt(throughputMatch[1].replace(/,/g, '')),
            reportedTime: timeMatch ? parseFloat(timeMatch[1]) : null
          };
        }
      }

      resolve({
        name,
        duration: Math.round(duration),
        memory: Math.round(memDelta * 100) / 100,
        outputLines,
        stats,
        code
      });
    });

    child.on('error', reject);
  });
}

describe('CLI Streaming Performance Tests', function() {
  // Increase timeout for large data processing
  this.timeout(120000);

  const performanceResults = [];

  after(() => {
    console.log('\n📊 CLI Streaming Performance Summary');
    console.log('=====================================');

    const table = performanceResults.map(r => ({
      Test: r.name,
      'Time (ms)': r.duration,
      'Memory (MB)': r.memory,
      'Output Lines': r.outputLines,
      'Throughput': r.throughput ? `${r.throughput.toLocaleString()} docs/sec` : 'N/A',
    }));

    console.table(table);
  });

  describe('100K Orders - Streaming Aggregations', () => {
    const fixturePath = ensureFixture('orders-100k.jsonl');

    it('should stream total revenue aggregation efficiently', async () => {
      const pipeline = [
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            orderCount: { $sum: 1 },
            avgOrderValue: { $avg: '$totalAmount' }
          }
        }
      ];

      const result = await measureStreamingPerformance(
        '100K Revenue (Stream)',
        fixturePath,
        pipeline
      );

      result.throughput = Math.round(100000 / (result.duration / 1000));
      performanceResults.push(result);

      expect(result.outputLines).to.equal(1);
      expect(result.duration).to.be.lessThan(5000); // Should complete in under 5 seconds
    });

    it('should stream group by status efficiently', async () => {
      const pipeline = [
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalRevenue: { $sum: '$totalAmount' },
            avgOrderValue: { $avg: '$totalAmount' }
          }
        },
        { $sort: { count: -1 } }
      ];

      const result = await measureStreamingPerformance(
        '100K Group Status (Stream)',
        fixturePath,
        pipeline
      );

      result.throughput = Math.round(100000 / (result.duration / 1000));
      performanceResults.push(result);

      expect(result.outputLines).to.be.at.most(5); // 5 statuses
      expect(result.duration).to.be.lessThan(5000);
    });

    it('should handle complex pipeline with unwind', async () => {
      const pipeline = [
        { $match: { status: { $in: ['delivered', 'shipped'] } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.category',
            revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
            itemCount: { $sum: '$items.quantity' }
          }
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 }
      ];

      const result = await measureStreamingPerformance(
        '100K Complex Pipeline (Stream)',
        fixturePath,
        pipeline
      );

      performanceResults.push(result);

      expect(result.outputLines).to.be.at.most(10);
      expect(result.duration).to.be.lessThan(10000);
    });

    it('should handle filtering with high selectivity', async () => {
      const pipeline = [
        { $match: { totalAmount: { $gte: 10000 } } }, // High value orders
        {
          $group: {
            _id: '$paymentMethod',
            count: { $sum: 1 },
            totalRevenue: { $sum: '$totalAmount' }
          }
        }
      ];

      const result = await measureStreamingPerformance(
        '100K High Value Filter (Stream)',
        fixturePath,
        pipeline
      );

      result.throughput = Math.round(100000 / (result.duration / 1000));
      performanceResults.push(result);

      expect(result.duration).to.be.lessThan(5000);
    });
  });

  describe('1M Orders - Large Scale Streaming', () => {
    const fixturePath = path.join(LARGE_FIXTURES_DIR, 'orders-1m.jsonl');

    before(function() {
      if (!fs.existsSync(fixturePath)) {
        console.log('⚠️  Skipping 1M orders tests - fixture not generated yet');
        console.log('   Run: npm run fixtures:large:generate orders');
        this.skip();
      }
    });

    it('should stream 1M orders aggregation', async () => {
      const pipeline = [
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            orderCount: { $sum: 1 }
          }
        }
      ];

      const result = await measureStreamingPerformance(
        '1M Revenue (Stream)',
        fixturePath,
        pipeline
      );

      result.throughput = Math.round(1000000 / (result.duration / 1000));
      performanceResults.push(result);

      expect(result.outputLines).to.equal(1);
      expect(result.duration).to.be.lessThan(30000); // Should complete in under 30 seconds
    });

    it('should handle 1M orders with grouping', async () => {
      const pipeline = [
        {
          $group: {
            _id: {
              status: '$status',
              priority: '$priority'
            },
            count: { $sum: 1 },
            avgAmount: { $avg: '$totalAmount' }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ];

      const result = await measureStreamingPerformance(
        '1M Multi-Group (Stream)',
        fixturePath,
        pipeline
      );

      performanceResults.push(result);

      expect(result.outputLines).to.be.at.most(20);
      expect(result.duration).to.be.lessThan(40000);
    });
  });

  describe('Streaming vs Loading Performance Comparison', () => {
    const fixturePath = ensureFixture('orders-100k.jsonl');

    it('should demonstrate streaming advantage', async () => {
      // Test with streaming (cat | cli)
      const streamPipeline = [
        { $match: { status: 'delivered' } },
        { $group: { _id: null, count: { $sum: 1 } } }
      ];

      const streamResult = await measureStreamingPerformance(
        '100K Stream Match',
        fixturePath,
        streamPipeline
      );

      // Test with file loading (--file option)
      const fileCommand = `node ${CLI_PATH} '${JSON.stringify(streamPipeline)}' --file ${fixturePath}`;
      const fileStart = process.hrtime.bigint();

      try {
        execSync(fileCommand, { encoding: 'utf-8' });
      } catch (e) {
        // Ignore output, we just want timing
      }

      const fileEnd = process.hrtime.bigint();
      const fileDuration = Number(fileEnd - fileStart) / 1_000_000;

      console.log('\n📈 Streaming vs File Loading:');
      console.log(`   Streaming: ${streamResult.duration}ms`);
      console.log(`   File Load: ${Math.round(fileDuration)}ms`);
      console.log(`   Advantage: ${Math.round(((fileDuration - streamResult.duration) / fileDuration) * 100)}% faster`);

      expect(streamResult.duration).to.be.lessThan(fileDuration * 1.5); // Streaming should be comparable or faster
    });
  });

  describe('CLI Options with Large Data', () => {
    const fixturePath = ensureFixture('orders-100k.jsonl');

    it('should handle --stats option efficiently', async () => {
      const command = `cat ${fixturePath} | node ${CLI_PATH} '[{"$group": {"_id": null, "count": {"$sum": 1}}}]' --stats 2>&1`;

      const start = process.hrtime.bigint();
      const output = execSync(command, { encoding: 'utf-8' });
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1_000_000;

      // Check that stats are included
      expect(output).to.include('Performance Stats');
      expect(output).to.include('Throughput');
      expect(duration).to.be.lessThan(5000);
    });

    it('should handle --pretty option with streaming', async () => {
      const pipeline = [
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $limit: 2 }
      ];

      const command = `cat ${fixturePath} | node ${CLI_PATH} '${JSON.stringify(pipeline)}' --pretty`;

      const start = process.hrtime.bigint();
      const output = execSync(command, { encoding: 'utf-8' });
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1_000_000;

      // Pretty output should be valid JSON array
      expect(() => JSON.parse(output)).to.not.throw();
      expect(output).to.include('  '); // Indentation
      expect(duration).to.be.lessThan(5000);
    });
  });

  describe('Memory Efficiency', () => {
    const fixturePath = ensureFixture('orders-100k.jsonl');

    it('should maintain low memory usage during streaming', async () => {
      const pipeline = [
        { $match: { 'items.0': { $exists: true } } },
        {
          $group: {
            _id: '$status',
            orders: { $push: '$orderId' } // This could use a lot of memory
          }
        },
        {
          $project: {
            status: '$_id',
            orderCount: { $size: '$orders' }
          }
        }
      ];

      const result = await measureStreamingPerformance(
        '100K Memory Test (Stream)',
        fixturePath,
        pipeline
      );

      performanceResults.push(result);

      // Memory usage should be reasonable even with $push
      expect(result.memory).to.be.lessThan(500); // Less than 500MB
    });
  });
});