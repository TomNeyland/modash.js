# modash.js

[![License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](https://github.com/TomNeyland/modash.js)
[![Tag](https://img.shields.io/github/tag/TomNeyland/modash.js.svg?style=flat)](https://github.com/TomNeyland/modash.js)

**Modern MongoDB-inspired aggregation library for TypeScript**

A clean, elegant API for processing JavaScript arrays using MongoDB aggregation pipeline syntax and operators. Built TypeScript-first with full type safety and modern language features.

## ✨ Features

- **Complete MongoDB Aggregation Pipeline**: Full support for `$match`, `$project`, `$group`, `$sort`, `$limit`, `$skip`, `$unwind`, `$lookup`, `$addFields`
- **Rich Expression Operators**: 40+ operators including boolean, comparison, arithmetic, string, date, array, and set operations
- **Enhanced Query Operators**: Advanced `$match` with `$regex`, `$exists`, `$elemMatch`, `$all`, `$and`, `$or`, `$nor`
- **Array Manipulation**: Comprehensive array operators like `$arrayElemAt`, `$filter`, `$map`, `$slice`, `$concatArrays`
- **TypeScript-First**: Built with TypeScript for complete type safety and excellent developer experience
- **Modern ES2022+**: Native modules, latest JavaScript features, compiled output for maximum compatibility
- **Zero Security Vulnerabilities**: Completely modernized dependency tree
- **Production Ready**: 66+ comprehensive tests, battle-tested implementations

## 🚀 Installation

```bash
npm install modash
```

## 📖 Usage

### Quick Start

```javascript
import Modash from 'modash';

const sales = [
  { item: 'laptop', price: 1000, quantity: 2, date: new Date('2023-01-15') },
  { item: 'mouse', price: 25, quantity: 10, date: new Date('2023-01-15') },
  { item: 'keyboard', price: 75, quantity: 5, date: new Date('2023-01-16') },
];

// Calculate total revenue by date
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

### TypeScript Example

```typescript
import Modash, { type Document, type Collection } from 'modash';

interface Sale extends Document {
  item: string;
  price: number;
  quantity: number;
  date: Date;
}

interface DailyRevenue extends Document {
  _id: number;
  totalRevenue: number;
  itemCount: number;
}

const sales: Collection<Sale> = [
  { item: 'laptop', price: 1000, quantity: 2, date: new Date('2023-01-15') },
  { item: 'mouse', price: 25, quantity: 10, date: new Date('2023-01-15') },
  { item: 'keyboard', price: 75, quantity: 5, date: new Date('2023-01-16') },
];

// TypeScript provides full type safety and intellisense
const revenueByDate: Collection<DailyRevenue> = Modash.aggregate(sales, [
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

Modash.js includes comprehensive TypeScript definitions for excellent developer experience:

```typescript
import Modash, { type Collection, type Pipeline, type Document } from 'modash';

// Define your document types
interface Customer extends Document {
  _id: number;
  name: string;
  email: string;
  age: number;
  orders: Order[];
}

interface Order extends Document {
  _id: string;
  total: number;
  items: string[];
}

// Type-safe collections
const customers: Collection<Customer> = [
  { _id: 1, name: 'Alice', email: 'alice@example.com', age: 30, orders: [] },
];

// Type-safe pipelines with IntelliSense
const pipeline: Pipeline = [
  { $match: { age: { $gte: 25 } } },
  {
    $addFields: {
      orderCount: { $size: '$orders' },
      isVip: { $gte: [{ $size: '$orders' }, 5] },
    },
  },
  { $sort: { orderCount: -1 } },
];

// Fully typed results
const result = Modash.aggregate(customers, pipeline);
// TypeScript knows: result is Collection<Customer & { orderCount: number, isVip: boolean }>
```

### Key TypeScript Features

- **Complete type coverage** for all 40+ operators
- **Generic document types** - work with your custom interfaces
- **Pipeline type safety** - catch errors at compile time
- **Expression validation** - ensure correct operator usage
- **IntelliSense support** - autocomplete for all operators and options

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

```bash
# Install dependencies
npm install

# Run tests
npm test

# Lint code
npm run lint

# Build
npm run build
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

### After (v0.8.0+)

```javascript
import Modash from 'modash';

const result = Modash.aggregate(data, [...]);
```

## 📄 License

MIT © [Tom Neyland](https://github.com/TomNeyland)

## 🙏 Contributing

Contributions welcome! Please read our contributing guide and submit pull requests to our GitHub repository.

---

_Bringing MongoDB aggregation elegance to JavaScript arrays since 2014, now modernized for 2024 and beyond._
