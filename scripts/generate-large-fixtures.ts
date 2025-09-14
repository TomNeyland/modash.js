#!/usr/bin/env tsx

/**
 * Generate large JSONL fixtures for performance testing
 * These files are gitignored and generated on-demand
 */

import * as fs from 'fs';
import * as path from 'path';
import { faker } from '@faker-js/faker';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, '../fixtures/large');
const BATCH_SIZE = 10000; // Write in batches to avoid memory issues

// Ensure fixtures/large directory exists
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

interface FixtureConfig {
  name: string;
  sizes: { label: string; count: number }[];
  generator: (index: number) => any;
}

// Simple but realistic generators optimized for performance
const configs: FixtureConfig[] = [
  {
    name: 'orders',
    sizes: [
      { label: '100k', count: 100_000 },
      { label: '1m', count: 1_000_000 },
    ],
    generator: (i: number) => {
      const orderDate = new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000);
      const itemCount = Math.floor(Math.random() * 5) + 1;
      const items = Array.from({ length: itemCount }, () => ({
        productId: `PROD-${Math.floor(Math.random() * 10000)}`,
        name: faker.commerce.productName(),
        category: faker.commerce.department(),
        price: parseFloat(faker.commerce.price({ min: 10, max: 500 })),
        quantity: Math.floor(Math.random() * 3) + 1,
      }));

      const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

      return {
        _id: `ORD-${i}`,
        orderId: faker.string.uuid(),
        customerId: Math.floor(Math.random() * 50000) + 1,
        status: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'][
          Math.floor(Math.random() * 5)
        ],
        orderDate: orderDate.toISOString(),
        totalAmount: Math.round(totalAmount * 100) / 100,
        items,
        shippingAddress: {
          country: faker.location.country(),
          state: faker.location.state(),
          city: faker.location.city(),
          zipCode: faker.location.zipCode(),
        },
        paymentMethod: ['credit_card', 'debit_card', 'paypal', 'bank_transfer'][
          Math.floor(Math.random() * 4)
        ],
        priority: ['standard', 'express', 'overnight'][Math.floor(Math.random() * 3)],
      };
    },
  },
  {
    name: 'events',
    sizes: [
      { label: '100k', count: 100_000 },
      { label: '1m', count: 1_000_000 },
    ],
    generator: (i: number) => ({
      _id: `EVT-${i}`,
      eventId: faker.string.uuid(),
      timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      eventType: ['click', 'view', 'purchase', 'signup', 'login', 'logout'][
        Math.floor(Math.random() * 6)
      ],
      userId: Math.floor(Math.random() * 100000) + 1,
      sessionId: `session-${Math.floor(Math.random() * 50000)}`,
      properties: {
        page: faker.internet.url(),
        referrer: Math.random() > 0.3 ? faker.internet.url() : null,
        device: ['desktop', 'mobile', 'tablet'][Math.floor(Math.random() * 3)],
        browser: ['chrome', 'firefox', 'safari', 'edge'][Math.floor(Math.random() * 4)],
        country: faker.location.countryCode(),
        duration: Math.floor(Math.random() * 300),
      },
      value: Math.random() * 1000,
    }),
  },
  {
    name: 'logs',
    sizes: [
      { label: '100k', count: 100_000 },
      { label: '1m', count: 1_000_000 },
    ],
    generator: (i: number) => ({
      _id: `LOG-${i}`,
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      level: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'][
        Math.floor(Math.random() * 5)
      ],
      service: ['api', 'web', 'worker', 'database', 'cache'][Math.floor(Math.random() * 5)],
      host: `server-${Math.floor(Math.random() * 20) + 1}.example.com`,
      message: faker.hacker.phrase(),
      metadata: {
        requestId: faker.string.uuid(),
        userId: Math.random() > 0.5 ? Math.floor(Math.random() * 10000) + 1 : null,
        duration: Math.floor(Math.random() * 5000),
        statusCode: [200, 201, 400, 401, 403, 404, 500, 503][Math.floor(Math.random() * 8)],
        method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'][Math.floor(Math.random() * 5)],
        path: faker.internet.url(),
      },
    }),
  },
  {
    name: 'metrics',
    sizes: [
      { label: '100k', count: 100_000 },
      { label: '1m', count: 1_000_000 },
    ],
    generator: (i: number) => {
      const timestamp = new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000);
      const metricType = ['cpu', 'memory', 'disk', 'network', 'latency'][
        Math.floor(Math.random() * 5)
      ];

      let value: number;
      switch (metricType) {
        case 'cpu':
        case 'memory':
        case 'disk':
          value = Math.random() * 100; // percentage
          break;
        case 'network':
          value = Math.random() * 1000; // mbps
          break;
        case 'latency':
          value = Math.random() * 500; // ms
          break;
        default:
          value = Math.random() * 100;
      }

      return {
        _id: `METRIC-${i}`,
        timestamp: timestamp.toISOString(),
        host: `server-${Math.floor(Math.random() * 50) + 1}`,
        metricType,
        value: Math.round(value * 100) / 100,
        tags: {
          region: ['us-east', 'us-west', 'eu-west', 'ap-south'][Math.floor(Math.random() * 4)],
          environment: ['production', 'staging', 'development'][Math.floor(Math.random() * 3)],
          service: ['api', 'web', 'worker', 'database'][Math.floor(Math.random() * 4)],
        },
        metadata: {
          unit: metricType === 'network' ? 'mbps' : metricType === 'latency' ? 'ms' : '%',
          threshold: metricType === 'cpu' ? 80 : metricType === 'memory' ? 90 : 95,
        },
      };
    },
  },
];

function writeJSONL(filePath: string, count: number, generator: (i: number) => any): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    let written = 0;

    console.log(`📝 Writing ${count.toLocaleString()} records to ${path.basename(filePath)}...`);

    const startTime = Date.now();

    stream.on('error', reject);
    stream.on('finish', () => {
      console.log('\n  ✅ Complete!\n');
      resolve();
    });

    // Write in batches
    function writeBatch() {
      let canContinue = true;

      while (written < count && canContinue) {
        const batchSize = Math.min(BATCH_SIZE, count - written);
        const batch: string[] = [];

        for (let i = 0; i < batchSize; i++) {
          const record = generator(written + i);
          batch.push(JSON.stringify(record));
        }

        canContinue = stream.write(batch.join('\n') + '\n');
        written += batchSize;

        // Progress indicator
        if (written % 100000 === 0 || written === count) {
          const progress = ((written / count) * 100).toFixed(1);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const rate = elapsed > 0 ? Math.round(written / parseFloat(elapsed)) : 0;
          process.stdout.write(
            `\r  Progress: ${progress}% (${written.toLocaleString()}/${count.toLocaleString()}) - ${rate.toLocaleString()} records/sec`
          );
        }
      }

      if (written < count) {
        // Wait for drain event if buffer is full
        stream.once('drain', writeBatch);
      } else {
        // All done, close the stream
        stream.end();
      }
    }

    writeBatch();
  });
}

async function checkAndGenerate(config: FixtureConfig, size: { label: string; count: number }) {
  const filename = `${config.name}-${size.label}.jsonl`;
  const filepath = path.join(FIXTURES_DIR, filename);

  if (fs.existsSync(filepath)) {
    const stats = fs.statSync(filepath);
    const sizeInMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`✓ ${filename} already exists (${sizeInMB} MB)`);
    return false;
  }

  console.log(`⚡ Generating ${filename}...`);

  // Set a consistent seed for reproducibility
  faker.seed(12345);

  await writeJSONL(filepath, size.count, config.generator);

  const stats = fs.statSync(filepath);
  const sizeInMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`  📦 File size: ${sizeInMB} MB\n`);

  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const requestedFixtures = args.length > 0 ? args : configs.map(c => c.name);
  const forceRegenerate = args.includes('--force');

  console.log('🚀 Large Fixture Generator');
  console.log('==========================\n');

  if (forceRegenerate) {
    console.log('⚠️  Force regenerate mode - will overwrite existing files\n');
  }

  let generatedCount = 0;
  let skippedCount = 0;

  for (const config of configs) {
    if (!requestedFixtures.includes(config.name) && !requestedFixtures.includes('all')) {
      continue;
    }

    console.log(`📊 ${config.name.toUpperCase()} Fixtures`);
    console.log('-'.repeat(30));

    for (const size of config.sizes) {
      const filename = `${config.name}-${size.label}.jsonl`;
      const filepath = path.join(FIXTURES_DIR, filename);

      if (fs.existsSync(filepath) && !forceRegenerate) {
        const stats = fs.statSync(filepath);
        const sizeInMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`✓ ${filename} already exists (${sizeInMB} MB)`);
        skippedCount++;
      } else {
        if (forceRegenerate && fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        const generated = await checkAndGenerate(config, size);
        if (generated) {
          generatedCount++;
        }
      }
    }
    console.log();
  }

  console.log('📈 Summary');
  console.log('----------');
  console.log(`✅ Generated: ${generatedCount} files`);
  console.log(`⏭️  Skipped: ${skippedCount} files (already exist)`);

  if (skippedCount > 0 && !forceRegenerate) {
    console.log('\n💡 Tip: Use --force to regenerate existing files');
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Generation interrupted by user');
  process.exit(1);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { configs, writeJSONL, checkAndGenerate };