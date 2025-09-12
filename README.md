# modash.js

[![License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](https://github.com/TomNeyland/modash.js)
[![Tag](https://img.shields.io/github/tag/TomNeyland/modash.js.svg?style=flat)](https://github.com/TomNeyland/modash.js)

**Modern MongoDB-inspired aggregation library for JavaScript**

A clean, elegant API for processing JavaScript arrays using MongoDB aggregation pipeline syntax and operators. Now fully modernized with ES2022+ support, zero security vulnerabilities, and a comprehensive set of aggregation operators.

## ✨ Features

- **Complete MongoDB Aggregation Pipeline**: Full support for `$match`, `$project`, `$group`, `$sort`, `$limit`, `$skip`, `$unwind`, `$lookup`, `$addFields`
- **Rich Expression Operators**: 40+ operators including boolean, comparison, arithmetic, string, date, array, and set operations
- **Enhanced Query Operators**: Advanced `$match` with `$regex`, `$exists`, `$elemMatch`, `$all`, `$and`, `$or`, `$nor`
- **Array Manipulation**: Comprehensive array operators like `$arrayElemAt`, `$filter`, `$map`, `$slice`, `$concatArrays`
- **Modern ES2022+**: Native modules, latest JavaScript features, no transpilation needed
- **TypeScript Support**: Complete type definitions for excellent developer experience
- **Zero Security Vulnerabilities**: Completely modernized dependency tree
- **Production Ready**: 68 comprehensive tests, battle-tested implementations

## 🚀 Installation

```bash
npm install modash
```

## 📖 Usage

### Basic Example

```javascript
import Modash from 'modash';

const sales = [
  { item: 'laptop', price: 1000, quantity: 2, date: new Date('2023-01-15') },
  { item: 'mouse', price: 25, quantity: 10, date: new Date('2023-01-15') },
  { item: 'keyboard', price: 75, quantity: 5, date: new Date('2023-01-16') }
];

// Calculate total revenue by date
const revenueByDate = Modash.aggregate(sales, [
  {
    $project: {
      date: { $dayOfMonth: '$date' },
      revenue: { $multiply: ['$price', '$quantity'] }
    }
  },
  {
    $group: {
      _id: '$date',
      totalRevenue: { $sum: '$revenue' },
      itemCount: { $sum: 1 }
    }
  }
]);

console.log(revenueByDate);
// [
//   { _id: 15, totalRevenue: 2250, itemCount: 2 },
//   { _id: 16, totalRevenue: 375, itemCount: 1 }
// ]
```

### Advanced Pipeline Example

```javascript
// E-commerce customer analytics with enhanced operators
const customerStats = Modash.aggregate(orders, [
  // Enhanced filtering with multiple conditions
  { 
    $match: { 
      $and: [
        { price: { $gte: 100 } },
        { status: { $regex: '^(shipped|delivered)$', $options: 'i' } },
        { tags: { $exists: true, $size: { $gte: 1 } } }
      ]
    }
  },
  
  // Join with customer data
  {
    $lookup: {
      from: customers,
      localField: 'customerId',
      foreignField: '_id',
      as: 'customer'
    }
  },
  
  // Add computed fields with array operations
  { 
    $addFields: { 
      customerName: { $arrayElemAt: ['$customer.name', 0] },
      totalValue: { $multiply: ['$price', '$quantity'] },
      discountedPrice: { $round: [{ $multiply: ['$price', 0.9] }, 2] },
      isHighValue: { $gte: [{ $multiply: ['$price', '$quantity'] }, 1000] },
      firstTag: { $arrayElemAt: ['$tags', 0] },
      tagCount: { $size: '$tags' }
    }
  },
  
  // Group by customer with advanced accumulators
  {
    $group: {
      _id: '$customerId',
      customerName: { $first: '$customerName' },
      totalOrders: { $sum: 1 },
      totalSpent: { $sum: '$totalValue' },
      avgOrderValue: { $avg: '$totalValue' },
      highValueOrders: { $sum: { $cond: ['$isHighValue', 1, 0] } },
      allTags: { $addToSet: '$firstTag' },
      orderValues: { $push: '$totalValue' }
    }
  },
  
  // Enhanced sorting with multiple fields
  { $sort: { totalSpent: -1, totalOrders: -1 } },
  
  // Final projection with string operations
  {
    $project: {
      customerName: { $toUpper: '$customerName' },
      totalOrders: 1,
      totalSpent: { $round: ['$totalSpent', 2] },
      avgOrderValue: { $round: ['$avgOrderValue', 2] },
      topOrderValue: { $max: '$orderValues' },
      customerTier: { 
        $cond: [
          { $gte: ['$totalSpent', 5000] }, 'Premium',
          { $cond: [{ $gte: ['$totalSpent', 1000] }, 'Gold', 'Standard'] }
        ]
      },
      tagSummary: { $concatArrays: [['customer'], '$allTags'] },
      _id: 0
    }
  },
  
  { $limit: 10 }
]);
```

### Working with Arrays

```javascript
const blogPosts = [
  { title: 'Post 1', tags: ['javascript', 'react'] },
  { title: 'Post 2', tags: ['node', 'express'] }
];

// Unwind tags and group by tag
const tagStats = Modash.aggregate(blogPosts, [
  { $unwind: '$tags' },
  { 
    $group: {
      _id: '$tags',
      postCount: { $sum: 1 },
      posts: { $push: '$title' }
    }
  },
  { $sort: { postCount: -1 } }
]);
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
  { _id: 1, name: 'Alice', email: 'alice@example.com', age: 30, orders: [] }
];

// Type-safe pipelines with IntelliSense
const pipeline: Pipeline = [
  { $match: { age: { $gte: 25 } } },
  { $addFields: { 
    orderCount: { $size: '$orders' },
    isVip: { $gte: [{ $size: '$orders' }, 5] }
  }},
  { $sort: { orderCount: -1 } }
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
    metadata: { featured: true, difficulty: 'beginner' }
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
          in: { $toUpper: '$$this' }
        }
      },
      frontendTags: {
        $filter: {
          input: '$tags',
          cond: { $in: ['$$this', ['react', 'vue', 'angular', 'frontend']] }
        }
      }
    }
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
      difficulties: { $addToSet: '$metadata.difficulty' }
    }
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
              cond: { $eq: ['$$this.views', { $max: '$posts.views' }] }
            }
          },
          0
        ]
      }
    }
  },
  
  { $sort: { popularityScore: -1 } },
  { $limit: 5 }
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
      as: 'posts'
    }
  },
  
  // Join with comments  
  {
    $lookup: {
      from: comments,
      localField: '_id',
      foreignField: 'userId',
      as: 'comments'
    }
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
              { $dateSubtract: { startDate: new Date(), unit: 'day', amount: 30 } }
            ]
          }
        }
      },
      topCategories: {
        $slice: [
          {
            $map: {
              input: { $setUnion: ['$posts.categories', []] },
              in: '$$this'
            }
          },
          3
        ]
      }
    }
  }
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

*Bringing MongoDB aggregation elegance to JavaScript arrays since 2014, now modernized for 2024 and beyond.*

