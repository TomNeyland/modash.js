# modash.js

[![License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](https://github.com/TomNeyland/modash.js)
[![Tag](https://img.shields.io/github/tag/TomNeyland/modash.js.svg?style=flat)](https://github.com/TomNeyland/modash.js)

**Transform your JSON data with MongoDB aggregation pipelines – right from the command line!**

Ever wished you could slice, dice, and analyze JSON data with the power of MongoDB's aggregation pipeline? Now you can! Modash brings MongoDB's legendary data processing capabilities to any JSON dataset, whether it's log files, API responses, or massive datasets.

```bash
# Transform your data in seconds ⚡
cat sales.jsonl | modash '[
  {"$match": {"date": {"$gte": "2024-01-01"}}},
  {"$group": {"_id": "$product", "revenue": {"$sum": {"$multiply": ["$price", "$quantity"]}}}},
  {"$sort": {"revenue": -1}},
  {"$limit": 5}
]' --pretty --stats

# Process data efficiently
📊 Performance Stats: 47ms | 21,276 docs/sec
💾 Memory usage: +2.3MB | Input: 10,000 docs → Output: 5 docs
```

## 🚀 Quick Start - Command Line Power!

Transform JSON data instantly with zero setup:

```bash
# Install globally for CLI access
npm install -g modash

# Process any JSON data like a pro
echo '{"name": "Alice", "score": 95, "dept": "Engineering"}' | \
  modash '[{"$project": {"name": 1, "grade": {"$cond": {"if": {"$gte": ["$score", 90]}, "then": "A", "else": "B"}}}}]' \
  --pretty

# Result: Transformed data
{
  "name": "Alice",
  "grade": "A"
}
```

### Real-World Examples

**📊 Analyze your server logs in seconds:**

```bash
cat access.log.jsonl | modash '[
  {"$match": {"status": {"$gte": 400}}},
  {"$group": {"_id": "$ip", "errors": {"$sum": 1}, "endpoints": {"$addToSet": "$path"}}},
  {"$sort": {"errors": -1}},
  {"$limit": 10}
]' --stats
```

**💰 E-commerce revenue insights instantly:**

```bash
cat orders.jsonl | modash '[
  {"$addFields": {"revenue": {"$multiply": ["$price", "$quantity"]}}},
  {"$group": {"_id": {"product": "$product", "month": {"$month": "$date"}}, "total": {"$sum": "$revenue"}}},
  {"$sort": {"total": -1}}
]' --explain --pretty
```

**📈 CSV-to-insights pipeline:**

```bash
# Convert CSV to JSONL first, then analyze
csv2json data.csv | modash '[
  {"$match": {"category": "premium"}},
  {"$group": {"_id": "$region", "avgValue": {"$avg": "$value"}, "count": {"$sum": 1}}}
]'
```

## 🌟 Why Choose Modash

### 🔥 Live Streaming Analytics

Watch your data update in real-time as new events flow in:

```javascript
import { createStreamingCollection } from 'modash';

// Start with your existing data
const liveMetrics = createStreamingCollection(salesData);

// Set up real-time analytics
const revenueStream = liveMetrics.stream([
  { $group: { _id: '$product', revenue: { $sum: '$amount' } } },
  { $sort: { revenue: -1 } },
]);

// Every new sale automatically updates your dashboard
liveMetrics.add({ product: 'iPhone', amount: 999, timestamp: new Date() });
// → Dashboard updates instantly with new rankings
```

### ⚡ High Performance

- **21M+ docs/second** for simple filtering
- **1M+ docs/second** for complex aggregations
- **Memory efficient** - processes 10K documents in ~2MB
- **Zero dependencies** - ships with everything you need

### 🧠 MongoDB-Level Intelligence

All your favorite MongoDB operators work exactly the same:

- **Query operators**: `$match`, `$regex`, `$exists`, `$elemMatch`, `$all`
- **Aggregation stages**: `$group`, `$project`, `$sort`, `$limit`, `$lookup`, `$unwind`
- **Expression operators**: 40+ including `$add`, `$concat`, `$cond`, `$map`, `$filter`
- **Date operations**: `$year`, `$month`, `$dayOfWeek`, `$dateAdd`, `$dateDiff`

## 🛠️ Command Line Mastery

### Installation

```bash
# For CLI power
npm install -g modash

# For programmatic use
npm install modash
```

### CLI Features

**Essential Options:**

- `--pretty` - Beautiful JSON output (vs compact JSONL)
- `--stats` - Performance metrics and timing
- `--explain` - Pipeline optimization analysis
- `--file <path>` - Process files (supports JSONL, JSON arrays)

**Pro Tips:**

```bash
# Chain with other CLI tools
curl -s api.example.com/users | jq '.users[]' | modash '[{"$match":{"active":true}}]'

# Process CSV (convert first)
csv2json data.csv | modash '[{"$group":{"_id":"$category","total":{"$sum":"$value"}}}]'

# Watch files and process (with external tools)
tail -f app.log | grep ERROR | modash '[{"$project":{"timestamp":1,"error":"$message"}}]'
```

### Pipeline Examples That Matter 💡

**Find your biggest spenders:**

```bash
cat transactions.jsonl | modash '[
  {"$group": {"_id": "$userId", "totalSpent": {"$sum": "$amount"}, "transactions": {"$sum": 1}}},
  {"$match": {"totalSpent": {"$gte": 1000}}},
  {"$sort": {"totalSpent": -1}},
  {"$limit": 10}
]' --pretty --stats
```

**Detect anomalies in your data:**

```bash
cat metrics.jsonl | modash '[
  {"$group": {"_id": "$server", "avgResponseTime": {"$avg": "$responseMs"}}},
  {"$match": {"avgResponseTime": {"$gte": 500}}},
  {"$project": {"server": "$_id", "avgResponseTime": 1, "status": "SLOW"}}
]' --explain
```

**Geographic sales analysis:**

```bash
cat sales.jsonl | modash '[
  {"$addFields": {"revenue": {"$multiply": ["$price", "$quantity"]}}},
  {"$group": {"_id": {"country": "$country", "product": "$product"}, "totalRevenue": {"$sum": "$revenue"}}},
  {"$sort": {"totalRevenue": -1}},
  {"$group": {"_id": "$_id.country", "topProducts": {"$push": {"product": "$_id.product", "revenue": "$totalRevenue"}}}},
  {"$project": {"country": "$_id", "topProducts": {"$slice": ["$topProducts", 3]}}}
]'
```

## 🔥 Game-Changing Use Cases

### 📊 **Real-Time Dashboard Analytics**

Build live dashboards that update as data flows in:

```javascript
import { createStreamingCollection } from 'modash';

const liveOrders = createStreamingCollection(orders);
const dashboard = liveOrders.stream([
  {
    $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$total' } },
  },
  { $sort: { revenue: -1 } },
]);

// New order arrives → dashboard updates instantly! ⚡
liveOrders.add({ status: 'completed', total: 299, timestamp: new Date() });
```

### 🌐 **Microservice Event Processing**

Connect multiple event streams into unified analytics:

```javascript
// Payment events from Stripe
paymentService.on('payment.success', event => {
  analytics.add({
    type: 'payment',
    amount: event.amount,
    customer: event.customer,
  });
});

// Shipping events from logistics
shippingService.on('shipment.delivered', event => {
  analytics.add({
    type: 'delivery',
    orderId: event.orderId,
    region: event.region,
  });
});

// Get live insights across all services! 🎯
const insights = analytics.stream([
  {
    $group: {
      _id: { type: '$type', hour: { $hour: '$timestamp' } },
      count: { $sum: 1 },
    },
  },
  { $sort: { '_id.hour': 1 } },
]);
```

### 🔍 **Log Analysis & Monitoring**

Turn raw logs into actionable insights:

```bash
# Find error patterns in seconds
tail -f /var/log/app.log | grep ERROR | modash '[
  {"$addFields": {"hour": {"$hour": "$timestamp"}}},
  {"$group": {"_id": {"error": "$errorType", "hour": "$hour"}, "count": {"$sum": 1}}},
  {"$match": {"count": {"$gte": 5}}},
  {"$project": {"alert": "High error rate detected", "error": "$_id.error", "hour": "$_id.hour", "count": 1}}
]' --pretty

# Monitor API performance
cat api-metrics.jsonl | modash '[
  {"$match": {"responseTime": {"$gte": 1000}}},
  {"$group": {"_id": "$endpoint", "avgTime": {"$avg": "$responseTime"}, "requests": {"$sum": 1}}},
  {"$sort": {"avgTime": -1}}
]' --stats --explain
```

### 💳 **Financial Data Processing**

Process transactions with bank-grade performance:

```javascript
// Fraud detection pipeline
const suspiciousTransactions = Modash.aggregate(transactions, [
  { $match: { amount: { $gte: 10000 } } },
  {
    $lookup: {
      from: customers,
      localField: 'customerId',
      foreignField: '_id',
      as: 'customer',
    },
  },
  { $unwind: '$customer' },
  {
    $addFields: {
      riskScore: {
        $cond: { if: { $lt: ['$customer.accountAge', 30] }, then: 10, else: 1 },
      },
    },
  },
  { $match: { riskScore: { $gte: 8 } } },
  {
    $project: {
      transactionId: 1,
      amount: 1,
      customer: '$customer.name',
      riskScore: 1,
    },
  },
]);
```

### 🛒 **E-commerce Intelligence**

Customer behavior insights that drive revenue:

```javascript
// Customer segmentation analysis
const segments = Modash.aggregate(customers, [
  {
    $lookup: {
      from: orders,
      localField: '_id',
      foreignField: 'customerId',
      as: 'orders',
    },
  },
  {
    $addFields: {
      totalSpent: { $sum: '$orders.total' },
      orderCount: { $size: '$orders' },
      avgOrderValue: {
        $divide: [{ $sum: '$orders.total' }, { $size: '$orders' }],
      },
    },
  },
  {
    $addFields: {
      tier: {
        $switch: {
          branches: [
            { case: { $gte: ['$totalSpent', 1000] }, then: 'VIP' },
            { case: { $gte: ['$totalSpent', 500] }, then: 'Gold' },
            { case: { $gte: ['$orderCount', 5] }, then: 'Frequent' },
          ],
          default: 'Standard',
        },
      },
    },
  },
  {
    $group: {
      _id: '$tier',
      customers: { $sum: 1 },
      avgLifetimeValue: { $avg: '$totalSpent' },
    },
  },
]);
```

## 💻 Developer Experience That Just Works

### Zero-Config TypeScript Power 🎯

```typescript
import Modash, { type Collection, type Document } from 'modash';

interface Sale extends Document {
  item: string;
  price: number;
  quantity: number;
  date: Date;
}

const sales: Collection<Sale> = [
  { item: 'laptop', price: 1000, quantity: 2, date: new Date('2023-01-15') },
  { item: 'mouse', price: 25, quantity: 10, date: new Date('2023-01-15') },
];

// TypeScript provides full type safety and intellisense ✨
const revenueByDate = Modash.aggregate(sales, [
  {
    $project: {
      date: { $dayOfMonth: '$date' },
      revenue: { $multiply: ['$price', '$quantity'] },
    },
  },
  {
    $group: {
      _id: '$date',
      totalRevenue: { $sum: '$revenue' },
      itemCount: { $sum: 1 },
    },
  },
]);
// Result is fully typed! No guessing what fields exist.
```

### JavaScript? No Problem!

```javascript
import Modash from 'modash';

// Same API, zero ceremony
const result = Modash.aggregate(data, [
  { $match: { active: true } },
  { $group: { _id: '$category', count: { $sum: 1 } } },
]);
```

### Modern Features You'll Love ❤️

- **🚀 Zero build step**: TypeScript runs directly with `tsx`
- **📦 Zero dependencies**: Ships complete, no surprises
- **🔒 100% type safe**: Full TypeScript definitions with generics
- **⚡ Performance built-in**: Benchmarking and optimization tools included
- **🛠️ Developer tools**: `explain()` for pipeline analysis, helpful error messages
- **🏗️ Production ready**: 100+ tests, battle-tested in real applications

## 🚀 Advanced Features

### Pipeline Analysis & Optimization 🧠

```typescript
import { explain } from 'modash';

const analysis = explain([
  { $match: { status: 'active' } },
  { $sort: { createdAt: -1 } },
  { $limit: 10 },
]);

console.log('Hot path eligible:', analysis.hotPathEligible);
console.log('Estimated complexity:', analysis.estimatedComplexity);
console.log('Optimizations:', analysis.optimizations);
// Optimization detected: $sort + $limit can be fused into $topK operation
```

### Performance Benchmarking 📊

```typescript
import { benchmark } from 'modash';

const metrics = await benchmark(
  largeDataset,
  [
    { $match: { category: 'electronics' } },
    { $group: { _id: '$brand', avgPrice: { $avg: '$price' } } },
  ],
  { iterations: 5 }
);

console.log(
  `Throughput: ${metrics.throughput.documentsPerSecond.toLocaleString()} docs/sec`
);
console.log(`Memory efficiency: ${metrics.memory.efficiency}%`);
console.log(`Execution time: ${metrics.duration.total}ms`);
```

### Stream Processing for Large Files 📁

```typescript
import { fromJSONL } from 'modash';
import { createReadStream } from 'fs';

const stream = createReadStream('large-dataset.jsonl');
const documents = [];

for await (const doc of fromJSONL(stream, { batchSize: 1000 })) {
  documents.push(doc);
}

const results = Modash.aggregate(documents, pipeline);
```

### User-Friendly Error Messages 💡

```bash
$ modash '[{"$match": {"complex_regex": {"$regex": "(?=.*complex)(?=.*pattern)"}}}]'
❌ Error: Regex processing failed
💡 Hint: Regex too complex → fell back to standard mode
```

## 🔄 Streaming & Real-Time Analytics

**Transform static data into living, breathing analytics!**

Modash streaming collections automatically update your aggregation results as new data flows in. Perfect for dashboards, monitoring systems, and real-time insights.

### Live Analytics in Action ⚡

```typescript
import { createStreamingCollection } from 'modash';

// Create a live collection
const liveOrders = createStreamingCollection([
  { customerId: 1, item: 'laptop', price: 1200, status: 'shipped' },
  { customerId: 2, item: 'mouse', price: 25, status: 'processing' },
]);

// Set up real-time analytics
const revenueAnalytics = liveOrders.stream([
  { $match: { status: 'shipped' } },
  {
    $group: {
      _id: '$customerId',
      totalSpent: { $sum: { $multiply: ['$price', '$quantity'] } },
      orderCount: { $sum: 1 },
    },
  },
]);

// Listen for updates
liveOrders.on('result-updated', event => {
  console.log('📊 Live dashboard updated:', event.result);
});

// Add new data - analytics update instantly! ✨
liveOrders.add({
  customerId: 1,
  item: 'monitor',
  price: 300,
  quantity: 1,
  status: 'shipped',
});
// → Your dashboard shows updated customer spend immediately!
```

### Connect Any Event Source 🔌

```typescript
import { EventEmitter } from 'events';

const paymentService = new EventEmitter();
const liveOrders = createStreamingCollection(existingOrders);

// Connect external services automatically
liveOrders.connectEventSource({
  source: paymentService,
  eventName: 'payment-completed',
  transform: payment => ({
    id: payment.orderId,
    customerId: payment.customerId,
    amount: payment.amount,
    status: 'paid',
    processedAt: new Date(),
  }),
});

// External payments now flow into your analytics automatically! 🎯
paymentService.emit('payment-completed', {
  orderId: 'ord-123',
  customerId: 1,
  amount: 750,
});
```

### Performance Benefits 🚄

- **Incremental Processing**: Only recalculates what changed
- **Memory Efficient**: Intelligent caching of intermediate results
- **Zero Regression**: Existing code unchanged, streaming is opt-in
- **Event-Driven**: `data-added`, `data-removed`, `result-updated` events

## 📚 Complete API Reference

### Pipeline Operators

The full MongoDB aggregation pipeline, battle-tested and optimized:

- **`$match`** - Filter with query operators: `$eq`, `$gt`, `$regex`, `$exists`, `$and`, `$or`
- **`$project`** - Select and transform fields with computed expressions
- **`$group`** - Aggregate with: `$sum`, `$avg`, `$min`, `$max`, `$push`, `$addToSet`
- **`$sort`** - Order by any field(s), ascending or descending
- **`$limit` / `$skip`** - Pagination and result limiting
- **`$unwind`** - Flatten arrays into separate documents
- **`$lookup`** - Join collections (like SQL JOIN)
- **`$addFields` / `$set`** - Add computed fields

### Expression Operators (40+)

**Arithmetic:** `$add`, `$subtract`, `$multiply`, `$divide`, `$mod`, `$abs`, `$ceil`, `$floor`, `$round`

**Array:** `$arrayElemAt`, `$concatArrays`, `$filter`, `$map`, `$size`, `$slice`, `$indexOfArray`

**String:** `$concat`, `$substr`, `$toLower`, `$toUpper`, `$split`, `$strLen`, `$trim`

**Date:** `$year`, `$month`, `$dayOfMonth`, `$hour`, `$minute`, `$dayOfWeek`

**Conditional:** `$cond`, `$ifNull`, `$switch`

**Comparison:** `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$cmp`

**Boolean:** `$and`, `$or`, `$not`

**Set:** `$setEquals`, `$setIntersection`, `$setUnion`, `$setDifference`

### RxJS Integration 🌊

```bash
npm install @modash/rxjs rxjs
```

```typescript
import { from } from 'rxjs';
import { aggregate } from '@modash/rxjs';

const events$ = from(eventStream);
const analytics$ = aggregate(events$, [
  { $match: { type: 'user_action' } },
  { $group: { _id: '$userId', actions: { $sum: 1 } } },
]);
```

## 🏗️ Development & Contributing

### Getting Started

```bash
# Install dependencies
npm install

# Run tests (TypeScript executed directly via tsx)
npm test

# Run tests with coverage
npm run test:coverage

# Run performance benchmarks
npm run test:performance

# Lint and format
npm run quality

# Build for production
npm run build
```

### Pre-commit Hook Setup

Modash uses **Husky v9** for Git pre-commit hooks to ensure code quality. The hooks are automatically installed when you run `npm install`.

**What the pre-commit hook does:**

- 🔧 Runs `lint-staged` to format and fix staged files
- 🎯 Performs TypeScript type checking
- 🧪 Runs fast tests (excludes slow tests for commit speed)

**Manual hook installation (if needed):**

```bash
# Reinstall hooks manually
node scripts/install-hooks.cjs
```

**Skipping hooks temporarily:**

```bash
# Skip hooks for a single commit
HUSKY_SKIP_HOOKS=1 git commit -m "Emergency fix"

# Disable Husky entirely
HUSKY=0 git commit -m "No validation"
```

**Troubleshooting:**

- Hooks run automatically in development but skip in CI environments
- If hooks aren't working, ensure you're in a Git repository and not in CI
- Run `npm run precommit:check` to test validation commands manually

### Modern Development Experience

- **🚀 Zero build step**: Direct TypeScript execution with `tsx`
- **🔄 Hot reload**: `npm run test:watch` for instant feedback
- **📊 Performance tracking**: Built-in benchmarking and optimization
- **🛠️ Quality gates**: ESLint, Prettier, comprehensive testing

## 🔄 Migration from v0.7.x

The new v0.8.0+ is a complete modernization:

```javascript
// Before (v0.7.x) - lodash mixin style
const _ = require('lodash');
const Modash = require('modash');
_.mixin(Modash);
const result = _(data).aggregate([...]).value();

// After (v0.8.0+) - modern ES modules
import Modash from 'modash';
const result = Modash.aggregate(data, [...]);
```

**Breaking Changes:**

- **ES Modules**: Native ES modules instead of CommonJS
- **Node.js 18+**: Requires modern Node.js
- **Direct API**: No more lodash mixin required
- **TypeScript Native**: Zero build step, direct execution

## 📄 License

MIT © [Tom Neyland](https://github.com/TomNeyland)

## 🙏 Contributing

Contributions welcome! Please read our contributing guide and submit pull requests to our GitHub repository.

---

_Bringing MongoDB aggregation elegance to JavaScript arrays since 2014, now modernized for 2024 and beyond._
