/**
 * Performance benchmark setup and data generation
 */

export function generateTestData(size, options = {}) {
  const {
    includeArrays = true,
    includeDates = true,
    includeNestedObjects = true,
  } = options;

  const categories = ['electronics', 'furniture', 'clothing', 'books', 'tools'];
  const items = ['laptop', 'mouse', 'keyboard', 'monitor', 'chair', 'desk', 'shirt', 'book', 'hammer'];
  const regions = ['north', 'south', 'east', 'west', 'central'];
  
  const data = [];
  
  for (let i = 0; i < size; i++) {
    const doc = {
      _id: i + 1,
      item: items[i % items.length],
      category: categories[i % categories.length],
      region: regions[i % regions.length],
      price: Math.round((Math.random() * 1000 + 10) * 100) / 100,
      quantity: Math.floor(Math.random() * 100) + 1,
      active: Math.random() > 0.3,
      priority: Math.floor(Math.random() * 5) + 1,
    };

    if (includeDates) {
      doc.date = new Date(2023, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
    }

    if (includeArrays) {
      doc.tags = categories.slice(0, Math.floor(Math.random() * 3) + 1);
      doc.ratings = Array.from({ length: Math.floor(Math.random() * 5) + 1 }, 
        () => Math.floor(Math.random() * 5) + 1);
    }

    if (includeNestedObjects) {
      doc.vendor = {
        name: `Vendor ${i % 50}`,
        location: regions[i % regions.length],
        rating: Math.round(Math.random() * 5 * 100) / 100,
      };
    }

    data.push(doc);
  }
  
  return data;
}

export const BENCHMARK_PIPELINES = {
  simpleFilter: [
    { $match: { category: 'electronics', active: true } },
  ],

  groupAndAggregate: [
    {
      $group: {
        _id: '$category',
        totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
        avgPrice: { $avg: '$price' },
        itemCount: { $sum: 1 },
      },
    },
    { $sort: { totalRevenue: -1 } },
  ],

  complexPipeline: [
    { $match: { active: true, quantity: { $gt: 0 } } },
    {
      $project: {
        item: 1,
        category: 1,
        revenue: { $multiply: ['$price', '$quantity'] },
        isPremium: { $gte: ['$price', 200] },
        month: { $month: '$date' },
      },
    },
    {
      $group: {
        _id: { category: '$category', month: '$month' },
        totalRevenue: { $sum: '$revenue' },
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: 10 },
  ],
};

export const DATA_SIZES = {
  small: 100,
  medium: 1000,
  large: 10000,
};