# modash.js

[![License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](https://github.com/TomNeyland/modash.js)
[![Tag](https://img.shields.io/github/tag/TomNeyland/modash.js.svg?style=flat)](https://github.com/TomNeyland/modash.js)

**TypeScript-native MongoDB aggregation library for modern JavaScript**

A clean, elegant API for processing JavaScript arrays using MongoDB aggregation pipeline syntax and operators. Built TypeScript-first with full type safety, zero build steps, and modern ES2022+ features.

## ✨ Features

- **Complete MongoDB Aggregation Pipeline**: Full support for `$match`, `$project`, `$group`, `$sort`, `$limit`, `$skip`, `$unwind`, `$lookup`, `$addFields`
- **Rich Expression Operators**: 40+ operators including boolean, comparison, arithmetic, string, date, array, and set operations
- **Enhanced Query Operators**: Advanced `$match` with `$regex`, `$exists`, `$elemMatch`, `$all`, `$and`, `$or`, `$nor`
- **Array Manipulation**: Comprehensive array operators like `$arrayElemAt`, `$filter`, `$map`, `$slice`, `$concatArrays`
- **🔄 Streaming/Incremental Updates**: Live data processing with `StreamingCollection` for real-time analytics
- **Event-Driven Architecture**: Real-time notifications when data changes with automatic result updates
- **TypeScript-Native**: Direct TypeScript execution with zero build steps - no compilation needed
- **Complete Type Safety**: Full TypeScript definitions with generics and IntelliSense support
- **Modern ES2022+**: Native modules, latest JavaScript features, works directly with tsx/esm
- **Zero Security Vulnerabilities**: Completely modernized dependency tree
- **Production Ready**: 100+ comprehensive tests, battle-tested implementations

## 🚀 Installation

```bash
npm install modash
```

> **TypeScript Native**: This library runs TypeScript directly without compilation. Use with `tsx`, `ts-node`, or any modern TypeScript runtime.

## 📖 Usage

### Quick Start (TypeScript)

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
  { item: 'keyboard', price: 75, quantity: 5, date: new Date('2023-01-16') },
];

// TypeScript provides full type safety and intellisense
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

console.log(revenueByDate);
// [
//   { _id: 15, totalRevenue: 2250, itemCount: 2 },
//   { _id: 16, totalRevenue: 375, itemCount: 1 }
// ]
```

### JavaScript Usage

```javascript
import Modash from 'modash';

const sales = [
  { item: 'laptop', price: 1000, quantity: 2, date: new Date('2023-01-15') },
  { item: 'mouse', price: 25, quantity: 10, date: new Date('2023-01-15') },
  { item: 'keyboard', price: 75, quantity: 5, date: new Date('2023-01-16') },
];

// Works seamlessly with plain JavaScript too
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
```

## 🔄 Streaming/Incremental Updates

**NEW!** Stream live data changes with automatic aggregation updates:

### Real-Time Analytics

```typescript
import { createStreamingCollection } from 'modash';

interface Order extends Document {
  customerId: number;
  item: string;
  price: number;
  quantity: number;
  status: string;
}

// Create a streaming collection
const liveOrders = createStreamingCollection<Order>([
  { customerId: 1, item: 'laptop', price: 1200, quantity: 1, status: 'shipped' },
  { customerId: 2, item: 'mouse', price: 25, quantity: 2, status: 'processing' }
]);

// Set up live analytics pipeline
const revenueAnalytics = [
  { $match: { status: 'shipped' } },
  {
    $group: {
      _id: '$customerId',
      totalSpent: { $sum: { $multiply: ['$price', '$quantity'] } },
      orderCount: { $sum: 1 }
    }
  }
];

// Start streaming - returns current results and keeps them updated
const results = liveOrders.stream(revenueAnalytics);
console.log('Initial results:', results);

// Listen for real-time updates
liveOrders.on('result-updated', (event) => {
  console.log('Live results updated:', event.result);
});

// Add new data - automatically triggers recalculation
liveOrders.addBulk([
  { customerId: 1, item: 'monitor', price: 300, quantity: 1, status: 'shipped' },
  { customerId: 3, item: 'keyboard', price: 75, quantity: 1, status: 'shipped' }
]);

// Results automatically update in real-time!
```

### Streaming Features

- **Live Data Updates**: Use `.add()` and `.addBulk()` for incremental updates
- **Record Removal**: Use `.remove()`, `.removeById()`, and other removal methods for incremental subtraction
- **Multiple Pipelines**: Run multiple concurrent streaming aggregations
- **Event-Driven**: Listen for `data-added`, `data-removed`, and `result-updated` events
- **Memory Efficient**: Optimized for large datasets with intelligent caching
- **Backward Compatible**: Existing API unchanged, streaming is opt-in

### 🔌 EventEmitter Integration

**Connect to any EventEmitter as a data source with automatic streaming updates:**

```typescript
import { EventEmitter } from 'events';
import { createStreamingCollection } from 'modash';

interface PaymentEvent {
  orderId: string;
  customerId: number;
  amount: number;
  currency: string;
  status: 'completed' | 'failed';
  timestamp: Date;
}

interface Order {
  id: string;
  customerId: number;
  item: string;
  price: number;
  status: string;
  processedAt: Date;
}

// Create payment processing EventEmitter
const paymentService = new EventEmitter();

// Start with existing orders
const liveOrders = createStreamingCollection<Order>([
  { id: 'ord-1', customerId: 1, item: 'laptop', price: 1200, status: 'pending', processedAt: new Date() }
]);

// Connect EventEmitter with transform function
const consumerId = liveOrders.connectEventSource({
  source: paymentService,
  eventName: 'payment-completed',
  transform: (eventData: PaymentEvent, eventName: string): Order | null => {
    // Skip failed payments
    if (eventData.status === 'failed') return null;
    
    // Transform payment event to order format
    return {
      id: eventData.orderId,
      customerId: eventData.customerId,
      item: 'processed-payment',
      price: eventData.amount,
      status: 'paid',
      processedAt: eventData.timestamp
    };
  }
});

// Set up real-time analytics
const revenueAnalytics = [
  { $match: { status: 'paid' } },
  { $group: { 
    _id: '$customerId', 
    totalSpent: { $sum: '$price' },
    orderCount: { $sum: 1 } 
  }},
  { $sort: { totalSpent: -1 } }
];

// Start streaming - gets live updates from EventEmitter
const results = liveOrders.stream(revenueAnalytics);
console.log('Initial revenue:', results);

// Listen for real-time updates
liveOrders.on('result-updated', (event) => {
  console.log('📊 Live analytics updated:', event.result);
});

liveOrders.on('data-added', (event) => {
  console.log(`💰 ${event.newDocuments.length} new payments processed`);
});

// Simulate external payment events
paymentService.emit('payment-completed', {
  orderId: 'ord-2',
  customerId: 1,
  amount: 750,
  currency: 'USD',
  status: 'completed',
  timestamp: new Date()
});

paymentService.emit('payment-completed', {
  orderId: 'ord-3',
  customerId: 2,
  amount: 400,
  currency: 'USD', 
  status: 'completed',
  timestamp: new Date()
});

// Results automatically update! Analytics now show:
// [
//   { _id: 1, totalSpent: 1950, orderCount: 2 },  // laptop + payment
//   { _id: 2, totalSpent: 400, orderCount: 1 }    // new customer
// ]

// Cleanup when done
liveOrders.disconnectEventSource(consumerId);
```

### 🔄 Advanced Record Removal

**Dynamic data removal with automatic aggregation updates:**

```typescript
const inventory = createStreamingCollection([
  { id: 1, product: 'laptop', quantity: 50, category: 'electronics' },
  { id: 2, product: 'mouse', quantity: 200, category: 'accessories' },
  { id: 3, product: 'monitor', quantity: 30, category: 'electronics' },
  { id: 4, product: 'keyboard', quantity: 100, category: 'accessories' }
]);

const stockAnalytics = [
  { $group: { _id: '$category', totalItems: { $sum: '$quantity' }, products: { $sum: 1 } } },
  { $sort: { totalItems: -1 } }
];

inventory.stream(stockAnalytics);

// Remove out-of-stock items
inventory.remove(item => item.quantity === 0);

// Remove specific products by ID
inventory.removeById(2);

// Remove products by query
inventory.removeByQuery({ category: 'accessories' });

// Remove in batches
const removed = inventory.removeFirst(2); // Remove oldest items

// All operations automatically update streaming analytics!
```

### Performance Benefits

- **Incremental Processing**: Only recalculates what's necessary
- **Caching Infrastructure**: Maintains intermediate results for efficiency  
- **No Regression**: Zero impact on existing non-streaming operations
- **Future Optimizations**: Architecture ready for per-stage incremental updates

## 🌟 Real-World Examples

### 🛒 E-commerce Analytics

**Top-Selling Products with Inventory Management:**

```javascript
// Analyze product performance and identify low stock items
const productAnalysis = Modash.aggregate(orders, [
  {
    $lookup: {
      from: products,
      localField: 'productId',
      foreignField: '_id',
      as: 'product',
    },
  },
  { $unwind: '$product' },
  {
    $addFields: {
      revenue: { $multiply: ['$quantity', '$product.price'] },
      lowStock: { $lt: ['$product.stock', 10] },
      isPremium: { $in: ['premium', '$product.tags'] },
    },
  },
  {
    $group: {
      _id: '$product.name',
      totalRevenue: { $sum: '$revenue' },
      totalQuantitySold: { $sum: '$quantity' },
      avgRating: { $avg: { $avg: '$product.ratings' } },
      lowStockAlert: { $first: '$lowStock' },
      category: { $first: '$product.category' },
    },
  },
  { $sort: { totalRevenue: -1 } },
  { $limit: 5 },
]);

/* Expected Output:
[
  {
    _id: "MacBook Pro 16\"",
    totalRevenue: 2499,
    totalQuantitySold: 1,
    avgRating: 4.6,
    lowStockAlert: false,
    category: "laptops"
  }
  // ... more products
]
*/
```

**Customer Segmentation & Purchase Behavior:**

```javascript
// Advanced customer analytics with tier-based insights
const customerInsights = Modash.aggregate(orders, [
  {
    $lookup: {
      from: customers,
      localField: 'customerId',
      foreignField: '_id',
      as: 'customer',
    },
  },
  {
    $lookup: {
      from: products,
      localField: 'productId',
      foreignField: '_id',
      as: 'product',
    },
  },
  { $unwind: '$customer' },
  { $unwind: '$product' },
  {
    $addFields: {
      orderValue: { $multiply: ['$quantity', '$product.price'] },
      customerTier: '$customer.tier',
      isPremiumProduct: { $in: ['premium', '$product.tags'] },
    },
  },
  {
    $group: {
      _id: '$customerId',
      customerName: { $first: '$customer.name' },
      customerTier: { $first: '$customerTier' },
      totalOrders: { $sum: 1 },
      totalSpent: { $sum: '$orderValue' },
      avgOrderValue: { $avg: '$orderValue' },
      premiumProductsPurchased: {
        $sum: { $cond: ['$isPremiumProduct', 1, 0] },
      },
    },
  },
  { $sort: { totalSpent: -1 } },
]);

/* Expected Output:
[
  {
    _id: 201,
    customerName: "Alice Johnson", 
    customerTier: "premium",
    totalOrders: 2,
    totalSpent: 3498,
    avgOrderValue: 1749,
    premiumProductsPurchased: 2
  }
  // ... more customers
]
*/
```

### 📝 Content Management & Analytics

**High-Performance Content Discovery:**

```javascript
// Find top-performing blog posts with engagement scoring
const topContent = Modash.aggregate(blogPosts, [
  {
    $lookup: {
      from: authors,
      localField: 'authorId',
      foreignField: '_id',
      as: 'author',
    },
  },
  { $unwind: '$author' },
  {
    $addFields: {
      engagementScore: {
        $add: [
          { $multiply: ['$views', 0.1] },
          { $multiply: ['$likes', 2] },
          { $multiply: [{ $size: '$comments' }, 5] },
        ],
      },
      commentsCount: { $size: '$comments' },
      authorName: '$author.name',
    },
  },
  {
    $match: {
      views: { $gte: 1000 },
    },
  },
  { $sort: { engagementScore: -1 } },
  {
    $project: {
      title: 1,
      authorName: 1,
      views: 1,
      likes: 1,
      commentsCount: 1,
      engagementScore: { $round: ['$engagementScore', 2] },
      tags: 1,
    },
  },
  { $limit: 10 },
]);

/* Expected Output:
[
  {
    title: "Advanced JavaScript Patterns",
    authorName: "Mike Chen",
    views: 2100,
    likes: 156,
    commentsCount: 2,
    engagementScore: 532.0,
    tags: ["javascript", "patterns", "advanced"]
  }
  // ... more posts
]
*/
```

### 👥 HR & People Analytics

**Department Performance & Salary Analysis:**

```javascript
// Comprehensive HR analytics with performance metrics
const hrAnalytics = Modash.aggregate(employees, [
  {
    $addFields: {
      avgPerformance: { $avg: '$performance' },
      yearsOfService: {
        $divide: [
          { $subtract: [new Date(), '$startDate'] },
          365.25 * 24 * 60 * 60 * 1000,
        ],
      },
    },
  },
  {
    $group: {
      _id: '$department',
      employeeCount: { $sum: 1 },
      avgSalary: { $avg: '$salary' },
      minSalary: { $min: '$salary' },
      maxSalary: { $max: '$salary' },
      avgPerformance: { $avg: '$avgPerformance' },
      totalPayroll: { $sum: '$salary' },
    },
  },
  {
    $addFields: {
      salaryRange: { $subtract: ['$maxSalary', '$minSalary'] },
      payrollPerEmployee: { $divide: ['$totalPayroll', '$employeeCount'] },
    },
  },
  { $sort: { avgSalary: -1 } },
]);

/* Expected Output:
[
  {
    _id: "engineering",
    employeeCount: 2,
    avgSalary: 102500,
    minSalary: 95000,
    maxSalary: 110000,
    avgPerformance: 8.97,
    totalPayroll: 205000,
    salaryRange: 15000,
    payrollPerEmployee: 102500
  }
  // ... more departments
]
*/
```

### 💰 Financial Transaction Analysis

**Account Activity & Risk Assessment:**

```javascript
// Comprehensive financial transaction analysis
const accountSummary = Modash.aggregate(transactions, [
  {
    $addFields: {
      month: { $month: '$date' },
      isDeposit: { $eq: ['$type', 'deposit'] },
      absAmount: { $abs: '$amount' },
    },
  },
  {
    $group: {
      _id: '$accountId',
      totalTransactions: { $sum: 1 },
      totalDeposits: {
        $sum: { $cond: ['$isDeposit', '$amount', 0] },
      },
      totalWithdrawals: {
        $sum: { $cond: ['$isDeposit', 0, { $abs: '$amount' }] },
      },
      netBalance: { $sum: '$amount' },
      avgTransactionSize: { $avg: '$absAmount' },
      largestTransaction: { $max: '$absAmount' },
      categories: { $addToSet: '$category' },
    },
  },
  {
    $addFields: {
      categoryCount: { $size: '$categories' },
      isPositiveBalance: { $gt: ['$netBalance', 0] },
      activityLevel: {
        $switch: {
          branches: [
            { case: { $gte: ['$totalTransactions', 4] }, then: 'High' },
            { case: { $gte: ['$totalTransactions', 2] }, then: 'Medium' },
          ],
          default: 'Low',
        },
      },
    },
  },
  { $sort: { netBalance: -1 } },
]);

/* Expected Output:
[
  {
    _id: "ACC001",
    totalTransactions: 3,
    totalDeposits: 5000,
    totalWithdrawals: 1550,
    netBalance: 3450,
    avgTransactionSize: 2183.33,
    largestTransaction: 5000,
    categories: ["salary", "rent", "groceries"],
    categoryCount: 3,
    isPositiveBalance: true,
    activityLevel: "Medium"
  }
  // ... more accounts
]
*/
```

### 🌡️ IoT Environmental Monitoring

**Sensor Data Analysis with Alert System:**

```javascript
// Environmental monitoring with automated alerts
const environmentalAnalysis = Modash.aggregate(sensorReadings, [
  {
    $addFields: {
      tempAlert: {
        $or: [{ $lt: ['$temperature', 18] }, { $gt: ['$temperature', 26] }],
      },
      locationKey: {
        $concat: [
          '$location.building',
          '-Floor',
          { $toString: '$location.floor' },
          '-',
          '$location.room',
        ],
      },
    },
  },
  {
    $group: {
      _id: '$locationKey',
      deviceId: { $first: '$deviceId' },
      avgTemperature: { $avg: '$temperature' },
      avgHumidity: { $avg: '$humidity' },
      tempAlertCount: { $sum: { $cond: ['$tempAlert', 1, 0] } },
      totalReadings: { $sum: 1 },
      location: { $first: '$location' },
    },
  },
  {
    $addFields: {
      alertPercentage: {
        $multiply: [{ $divide: ['$tempAlertCount', '$totalReadings'] }, 100],
      },
      status: {
        $switch: {
          branches: [
            { case: { $gt: ['$alertPercentage', 50] }, then: 'Critical' },
            { case: { $gt: ['$alertPercentage', 20] }, then: 'Warning' },
          ],
          default: 'Normal',
        },
      },
    },
  },
  { $sort: { alertPercentage: -1 } },
]);

/* Expected Output:
[
  {
    _id: "A-Floor1-101",
    deviceId: "TEMP001",
    avgTemperature: 23.3,
    avgHumidity: 46.5,
    tempAlertCount: 0,
    totalReadings: 2,
    alertPercentage: 0,
    status: "Normal",
    location: { building: "A", floor: 1, room: "101" }
  }
  // ... more locations
]
*/
```

### 📱 Social Media Trend Analysis

**Viral Content & Hashtag Analytics:**

```javascript
// Advanced social media analytics with virality scoring
const trendingContent = Modash.aggregate(socialPosts, [
  {
    $lookup: {
      from: users,
      localField: 'userId',
      foreignField: '_id',
      as: 'user',
    },
  },
  { $unwind: '$user' },
  { $unwind: '$hashtags' },
  {
    $group: {
      _id: '$hashtags',
      postCount: { $sum: 1 },
      totalLikes: { $sum: '$likes' },
      totalShares: { $sum: '$shares' },
      avgEngagement: {
        $avg: { $add: ['$likes', { $multiply: ['$shares', 3] }] },
      },
      uniqueUsers: { $addToSet: '$user.username' },
    },
  },
  {
    $addFields: {
      userCount: { $size: '$uniqueUsers' },
      viralityScore: {
        $multiply: [
          '$avgEngagement',
          { $sqrt: '$userCount' },
          { $log10: { $add: ['$postCount', 1] } },
        ],
      },
      trendingLevel: {
        $switch: {
          branches: [
            { case: { $gt: ['$viralityScore', 100] }, then: 'Viral' },
            { case: { $gt: ['$viralityScore', 50] }, then: 'Trending' },
          ],
          default: 'Popular',
        },
      },
    },
  },
  { $sort: { viralityScore: -1 } },
  {
    $project: {
      hashtag: '$_id',
      postCount: 1,
      userCount: 1,
      avgEngagement: { $round: ['$avgEngagement', 1] },
      viralityScore: { $round: ['$viralityScore', 2] },
      trendingLevel: 1,
    },
  },
]);

/* Expected Output:
[
  {
    hashtag: "typescript",
    postCount: 1,
    userCount: 1,
    avgEngagement: 101.0,
    viralityScore: 30.30,
    trendingLevel: "Popular"
  }
  // ... more hashtags  
]
*/
```

## 🔧 API Reference

### Pipeline Operators

- **`$match`** - Filter documents with advanced query operators
  - Basic: `{ field: value }`, `{ field: { $gt: 100 } }`
  - Advanced: `{ $and: [...] }`, `{ $or: [...] }`, `{ name: { $regex: 'pattern' } }`
  - Array: `{ tags: { $all: ['tag1', 'tag2'] } }`, `{ items: { $size: 3 } }`
  - Existence: `{ field: { $exists: true } }`

- **`$project`** - Reshape documents, add computed fields
- **`$group`** - Group documents and apply aggregations
- **`$sort`** - Sort documents by one or more fields
- **`$limit`** - Limit number of documents
- **`$skip`** - Skip documents for pagination
- **`$unwind`** - Deconstruct arrays into multiple documents
- **`$lookup`** - Perform left outer joins with other collections
- **`$addFields` / `$set`** - Add computed fields to documents

### Expression Operators

#### Arithmetic

- `$add`, `$subtract`, `$multiply`, `$divide`, `$mod`
- `$abs`, `$ceil`, `$floor`, `$round`, `$sqrt`, `$pow`

#### Comparison

- `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$cmp`

#### Boolean

- `$and`, `$or`, `$not`

#### String

- `$concat`, `$substr`, `$toLower`, `$toUpper`
- `$split`, `$strLen`, `$trim`, `$ltrim`, `$rtrim`

#### Array Operations

- `$size`, `$arrayElemAt`, `$slice`, `$concatArrays`
- `$in`, `$indexOfArray`, `$reverseArray`
- `$filter`, `$map` - Advanced array transformations
- `$avg`, `$sum`, `$min`, `$max` - Array aggregation (expression context)

#### Date

- `$year`, `$month`, `$dayOfMonth`, `$dayOfYear`, `$dayOfWeek`
- `$hour`, `$minute`, `$second`, `$millisecond`

#### Set Operations

- `$setEquals`, `$setIntersection`, `$setUnion`, `$setDifference`, `$setIsSubset`
- `$anyElementTrue`, `$allElementsTrue`

#### Conditional

- `$cond`, `$ifNull`

### Accumulator Operators

- **`$sum`** - Sum values
- **`$avg`** - Average values
- **`$min`**, **`$max`** - Minimum/maximum values
- **`$first`**, **`$last`** - First/last values
- **`$push`** - Collect values into array
- **`$addToSet`** - Collect unique values

## 🏷️ TypeScript Support

Modash.js is built TypeScript-first with zero compilation steps needed. It provides comprehensive type definitions for exceptional developer experience:

```typescript
import Modash, { type Collection, type Pipeline, type Document } from 'modash';

// Define your document types with full type safety
interface Customer extends Document {
  _id: number;
  name: string;
  email: string;
  age: number;
  orders: Order[];
  address: {
    street: string;
    city: string;
    country: string;
  };
}

interface Order extends Document {
  _id: string;
  total: number;
  items: string[];
  status: 'pending' | 'shipped' | 'delivered';
}

// Type-safe collections with IntelliSense
const customers: Collection<Customer> = [
  {
    _id: 1,
    name: 'Alice Johnson',
    email: 'alice@example.com',
    age: 30,
    orders: [],
    address: { street: '123 Main St', city: 'Seattle', country: 'USA' },
  },
];

// Fully typed pipelines with compile-time validation
const pipeline: Pipeline = [
  // $match with typed query operators
  { $match: { age: { $gte: 25 }, 'address.country': 'USA' } },

  // $addFields with expression type checking
  {
    $addFields: {
      orderCount: { $size: '$orders' },
      isVip: { $gte: [{ $size: '$orders' }, 5] },
      fullAddress: {
        $concat: [
          '$address.street',
          ', ',
          '$address.city',
          ', ',
          '$address.country',
        ],
      },
      customerTier: {
        $cond: {
          if: { $gte: ['$age', 35] },
          then: 'senior',
          else: 'standard',
        },
      },
    },
  },

  // $project with field selection and computed fields
  {
    $project: {
      name: 1,
      email: 1,
      orderCount: 1,
      isVip: 1,
      customerTier: 1,
      fullAddress: 1,
      _id: 0, // Exclude _id field
    },
  },

  { $sort: { orderCount: -1 } },
];

// Fully typed results with IntelliSense support
const result = Modash.aggregate(customers, pipeline);
// TypeScript infers: Collection<{name: string, email: string, orderCount: number, isVip: boolean, ...}>

// Type-safe individual stage operations
const activeCustomers = Modash.$match(customers, {
  age: { $gte: 18 },
  'orders.status': { $in: ['pending', 'shipped'] },
});

const customerSummary = Modash.$group(activeCustomers, {
  _id: '$address.country',
  totalCustomers: { $sum: 1 },
  avgAge: { $avg: '$age' },
  customerNames: { $push: '$name' },
});
```

### Advanced TypeScript Features

```typescript
// Generic helper for typed aggregation results
function typedAggregate<TInput extends Document, TOutput extends Document>(
  collection: Collection<TInput>,
  pipeline: Pipeline
): Collection<TOutput> {
  return Modash.aggregate(collection, pipeline);
}

// Custom document interfaces with nested objects
interface ProductSale extends Document {
  productId: string;
  customer: {
    id: number;
    name: string;
    email: string;
  };
  product: {
    name: string;
    category: string;
    price: number;
  };
  quantity: number;
  saleDate: Date;
  tags: string[];
}

// Complex aggregation with full type safety
const salesAnalysis = Modash.aggregate(sales, [
  {
    $match: {
      'product.category': { $in: ['electronics', 'computers'] },
      quantity: { $gte: 1 },
      saleDate: { $gte: new Date('2023-01-01') },
    },
  },
  {
    $addFields: {
      revenue: { $multiply: ['$product.price', '$quantity'] },
      customerEmail: '$customer.email',
      isHighValue: {
        $gte: [{ $multiply: ['$product.price', '$quantity'] }, 1000],
      },
      monthYear: {
        $concat: [
          { $toString: { $month: '$saleDate' } },
          '-',
          { $toString: { $year: '$saleDate' } },
        ],
      },
    },
  },
  {
    $group: {
      _id: {
        category: '$product.category',
        month: '$monthYear',
      },
      totalRevenue: { $sum: '$revenue' },
      avgOrderValue: { $avg: '$revenue' },
      customerCount: { $addToSet: '$customer.id' },
      highValueSales: { $sum: { $cond: ['$isHighValue', 1, 0] } },
      topProducts: { $push: '$product.name' },
    },
  },
]);
```

### Key TypeScript Features

- **Zero Build Step**: Direct execution with `tsx` - no compilation needed
- **Complete Type Coverage**: All 40+ operators with full type definitions
- **Generic Document Types**: Work with your custom interfaces seamlessly
- **Pipeline Type Safety**: Catch errors at compile-time before runtime
- **Expression Validation**: Ensure correct operator usage and field references
- **IntelliSense Support**: Full autocomplete for operators, fields, and options
- **Nested Object Support**: Type-safe access to embedded document fields
- **Union Types**: Support for complex data structures and conditional logic

## 🎯 Real-World Examples

### Advanced Array Processing

```javascript
const blogPosts = [
  {
    _id: 1,
    title: 'Getting Started with React',
    tags: ['react', 'javascript', 'frontend'],
    authors: ['Alice', 'Bob'],
    views: [100, 150, 200],
    metadata: { featured: true, difficulty: 'beginner' },
  },
  // ... more posts
];

// Complex array analysis
const tagAnalysis = Modash.aggregate(blogPosts, [
  // Filter featured posts only
  { $match: { 'metadata.featured': true } },

  // Add computed array fields
  {
    $addFields: {
      tagCount: { $size: '$tags' },
      authorCount: { $size: '$authors' },
      totalViews: { $sum: '$views' },
      avgViews: { $avg: '$views' },
      primaryTag: { $arrayElemAt: ['$tags', 0] },
      lastTwoTags: { $slice: ['$tags', -2] },
      allAuthorsUpper: {
        $map: {
          input: '$authors',
          in: { $toUpper: '$$this' },
        },
      },
      frontendTags: {
        $filter: {
          input: '$tags',
          cond: { $in: ['$$this', ['react', 'vue', 'angular', 'frontend']] },
        },
      },
    },
  },

  // Unwind tags for analysis
  { $unwind: '$tags' },

  // Group by tag with advanced metrics
  {
    $group: {
      _id: '$tags',
      postCount: { $sum: 1 },
      totalViews: { $sum: '$totalViews' },
      avgViewsPerPost: { $avg: '$totalViews' },
      posts: { $push: { title: '$title', views: '$totalViews' } },
      authors: { $addToSet: '$authors' },
      difficulties: { $addToSet: '$metadata.difficulty' },
    },
  },

  // Add computed fields for each tag
  {
    $addFields: {
      popularityScore: { $multiply: ['$postCount', '$avgViewsPerPost'] },
      authorDiversity: { $size: '$authors' },
      topPost: {
        $arrayElemAt: [
          {
            $filter: {
              input: '$posts',
              cond: { $eq: ['$$this.views', { $max: '$posts.views' }] },
            },
          },
          0,
        ],
      },
    },
  },

  { $sort: { popularityScore: -1 } },
  { $limit: 5 },
]);
```

### Data Joins and Relationships

```javascript
// Users and their posts with enhanced lookup
const userPostStats = Modash.aggregate(users, [
  // Join with posts
  {
    $lookup: {
      from: posts,
      localField: '_id',
      foreignField: 'authorId',
      as: 'posts',
    },
  },

  // Join with comments
  {
    $lookup: {
      from: comments,
      localField: '_id',
      foreignField: 'userId',
      as: 'comments',
    },
  },

  // Add comprehensive user metrics
  {
    $addFields: {
      postCount: { $size: '$posts' },
      commentCount: { $size: '$comments' },
      totalPostViews: { $sum: '$posts.views' },
      avgPostViews: { $avg: '$posts.views' },
      recentPosts: {
        $filter: {
          input: '$posts',
          cond: {
            $gte: [
              '$$this.createdAt',
              {
                $dateSubtract: {
                  startDate: new Date(),
                  unit: 'day',
                  amount: 30,
                },
              },
            ],
          },
        },
      },
      topCategories: {
        $slice: [
          {
            $map: {
              input: { $setUnion: ['$posts.categories', []] },
              in: '$$this',
            },
          },
          3,
        ],
      },
    },
  },
]);
```

## 🏗️ Development

This project uses TypeScript natively with zero build steps:

```bash
# Install dependencies
npm install

# Run tests (TypeScript executed directly via tsx)
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run performance measurement standalone
npm run test:performance

# Lint code (ESLint with TypeScript support)
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format

# Check formatting
npm run format:check

# Run all quality checks
npm run quality

# No build step needed - TypeScript runs directly!
npm run build  # Just echoes "No build step needed"
```

### Development Workflow

1. **Direct TypeScript Execution**: No compilation step - use `tsx` for direct TS execution
2. **Type-Safe Development**: Full TypeScript checking in your IDE
3. **Test-Driven Development**: Comprehensive test suite with 80+ tests
4. **Modern Tooling**: ESLint + Prettier for code quality

### 📊 Performance Tracking

The test suite includes automatic performance measurement and tracking:

- **Automatic Measurement**: `npm test` runs both unit tests and performance benchmarks
- **Historical Comparison**: Performance results are compared against first run and previous runs
- **Multiple Iterations**: Each benchmark runs multiple times and reports averages with standard deviation
- **CI-Safe**: In CI environments, performance is measured but not persisted to files

Performance results are saved in `performance-results/` as timestamped JSON files:

- `performance-{timestamp}.json` - Contains detailed benchmark data
- Includes comparisons showing percentage changes vs baseline and previous runs
- Memory usage tracking and scaling efficiency analysis

Example performance output:

```bash
📊 Measuring dataset size: 1,000 documents
  simpleFilter         :    120μs     ±0.2ms | 8,333,333 docs/sec
  vs First: -0.07ms (-36.84%) 📉
  vs Previous: -0.08ms (-40%) 📉
```

## 🔄 Migration from v0.7.x

The new v0.8.0 is a complete modernization with breaking changes:

- **ES Modules**: Now uses native ES modules instead of CommonJS
- **Modern API**: No more need to mixin with lodash
- **Node.js**: Requires Node.js 18+
- **Import Style**: Use `import Modash from 'modash'` instead of `_.mixin(Modash)`

### Before (v0.7.x)

```javascript
const _ = require('lodash');
const Modash = require('modash');
_.mixin(Modash);

const result = _(data).aggregate([...]).value();
```

### After (v0.8.0+ - TypeScript Native)

```typescript
import Modash from 'modash';

// Direct TypeScript execution - no build step needed
const result = Modash.aggregate(data, [...]);
```

## 📄 License

MIT © [Tom Neyland](https://github.com/TomNeyland)

## 🙏 Contributing

Contributions welcome! Please read our contributing guide and submit pull requests to our GitHub repository.

---

_Bringing MongoDB aggregation elegance to JavaScript arrays since 2014, now modernized for 2024 and beyond._
