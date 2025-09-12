# modash.js

[![License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](https://github.com/TomNeyland/modash.js)
[![Tag](https://img.shields.io/github/tag/TomNeyland/modash.js.svg?style=flat)](https://github.com/TomNeyland/modash.js)

**Modern MongoDB-inspired aggregation library for JavaScript**

A clean, elegant API for processing JavaScript arrays using MongoDB aggregation pipeline syntax and operators. Now fully modernized with ES2022+ support, zero security vulnerabilities, and a comprehensive set of aggregation operators.

## ✨ Features

- **Full MongoDB Aggregation Pipeline**: Complete support for `$match`, `$project`, `$group`, `$sort`, `$limit`, `$skip`, `$unwind`
- **Rich Expression Operators**: Boolean, comparison, arithmetic, string, date, and set operations
- **Modern ES2022+**: Native modules, latest JavaScript features, no transpilation needed
- **Zero Dependencies Footprint**: Only lodash-es for utility functions
- **TypeScript Ready**: Clean, well-typed interfaces (coming soon)
- **Elegant API**: Designed for real-world use cases with simplicity in mind

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
// Complex aggregation with multiple stages
const results = Modash.aggregate(inventory, [
  // Filter high-value items
  { $match: { price: { $gte: 100 } } },
  
  // Add computed fields
  { 
    $project: { 
      item: 1,
      price: 1,
      category: { $concat: ['premium-', '$item'] },
      discounted: { $multiply: ['$price', 0.9] }
    } 
  },
  
  // Group by category
  {
    $group: {
      _id: '$category',
      avgPrice: { $avg: '$price' },
      items: { $push: '$item' },
      count: { $sum: 1 }
    }
  },
  
  // Sort by average price
  { $sort: { avgPrice: -1 } },
  
  // Limit results
  { $limit: 5 }
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

- **`$match`** - Filter documents
- **`$project`** - Reshape documents, add computed fields
- **`$group`** - Group documents and apply aggregations
- **`$sort`** - Sort documents
- **`$limit`** - Limit number of documents
- **`$skip`** - Skip documents
- **`$unwind`** - Deconstruct arrays

### Expression Operators

#### Arithmetic
- `$add`, `$subtract`, `$multiply`, `$divide`, `$mod`

#### Comparison
- `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$cmp`

#### Boolean
- `$and`, `$or`, `$not`

#### String
- `$concat`, `$substr`, `$toLower`, `$toUpper`

#### Date
- `$year`, `$month`, `$dayOfMonth`, `$dayOfYear`, `$dayOfWeek`, `$hour`, `$minute`, `$second`

#### Set Operations  
- `$setEquals`, `$setIntersection`, `$setUnion`, `$setDifference`, `$setIsSubset`
- `$anyElementTrue`, `$allElementsTrue`

### Accumulator Operators

- **`$sum`** - Sum values
- **`$avg`** - Average values
- **`$min`**, **`$max`** - Minimum/maximum values
- **`$first`**, **`$last`** - First/last values
- **`$push`** - Collect values into array
- **`$addToSet`** - Collect unique values

## 🎯 Real-World Examples

### E-commerce Analytics

```javascript
const orders = [
  { customerId: 1, products: [{ name: 'laptop', price: 1000 }], date: new Date() },
  // ... more orders
];

// Customer analysis
const customerStats = Modash.aggregate(orders, [
  { $unwind: '$products' },
  {
    $group: {
      _id: '$customerId',
      totalSpent: { $sum: '$products.price' },
      productCount: { $sum: 1 },
      avgOrderValue: { $avg: '$products.price' }
    }
  },
  { $match: { totalSpent: { $gte: 500 } } },
  { $sort: { totalSpent: -1 } }
]);
```

### Data Processing

```javascript
// Clean and transform data
const cleaned = Modash.aggregate(rawData, [
  { $match: { status: 'active' } },
  {
    $project: {
      id: 1,
      name: { $toUpper: '$name' },
      email: { $toLower: '$email' },
      fullName: { $concat: ['$firstName', ' ', '$lastName'] },
      age: { $subtract: [2024, { $year: '$birthDate' }] }
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

