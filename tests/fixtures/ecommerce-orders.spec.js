import { expect } from 'chai';
import Aggo from '../../src/index.js';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  loadFixture,
  measurePerformance,
  assertCloseTo,
  formatPerformanceReport,
} from './test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('E-commerce Orders - Query Patterns & Metamorphic Testing', () => {
  let orders;
  let customers;
  const performanceResults = [];

  before(() => {
    // Load fixtures with deep date parsing
    const ordersPath = path.join(
      __dirname,
      '../../fixtures/ecommerce-orders.jsonl'
    );
    const customersPath = path.join(
      __dirname,
      '../../fixtures/ecommerce-customers.jsonl'
    );

    orders = loadFixture(ordersPath) || generateOrdersFixture(100);
    customers = loadFixture(customersPath) || generateCustomersFixture(20);
  });

  after(() => {
    // Print performance report
    if (performanceResults.length > 0) {
      console.log(formatPerformanceReport(performanceResults));
    }
  });

  describe('Basic Aggregations', () => {
    it('should calculate total revenue across all orders', () => {
      let result;
      const perf = measurePerformance('Total Revenue Aggregation', () => {
        result = Aggo.aggregate(orders, [
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$totalAmount' },
              orderCount: { $sum: 1 },
              avgOrderValue: { $avg: '$totalAmount' },
            },
          },
        ]);
      });
      performanceResults.push(perf);

      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.have.property('totalRevenue');
      expect(result[0].totalRevenue).to.be.a('number');
      expect(result[0].orderCount).to.equal(orders.length);
    });

    it('should group orders by status', () => {
      const result = Aggo.aggregate(orders, [
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalValue: { $sum: '$totalAmount' },
          },
        },
        { $sort: { count: -1 } },
      ]);

      const statuses = [
        'pending',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
      ];
      result.forEach(group => {
        expect(statuses).to.include(group._id);
        expect(group.count).to.be.at.least(0);
      });
    });
  });

  describe('Time-based Analytics', () => {
    it('should analyze orders by month', () => {
      const result = Aggo.aggregate(orders, [
        {
          $addFields: {
            orderMonth: { $month: '$orderDate' },
            orderYear: { $year: '$orderDate' },
          },
        },
        {
          $group: {
            _id: {
              year: '$orderYear',
              month: '$orderMonth',
            },
            orders: { $sum: 1 },
            revenue: { $sum: '$totalAmount' },
            avgOrderValue: { $avg: '$totalAmount' },
          },
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
      ]);

      result.forEach(period => {
        expect(period._id).to.have.property('year');
        expect(period._id).to.have.property('month');
        expect(period.orders).to.be.at.least(1);
      });
    });

    it('should find peak ordering hours', () => {
      const result = Aggo.aggregate(orders, [
        {
          $addFields: {
            orderHour: { $hour: '$orderDate' },
          },
        },
        {
          $group: {
            _id: '$orderHour',
            orderCount: { $sum: 1 },
            totalRevenue: { $sum: '$totalAmount' },
          },
        },
        { $sort: { orderCount: -1 } },
        { $limit: 5 },
      ]);

      expect(result.length).to.be.at.most(5);
      result.forEach(hour => {
        expect(hour._id).to.be.at.least(0).and.at.most(23);
      });
    });
  });

  describe('Customer Analytics', () => {
    it('should identify top customers by order value', () => {
      let result;
      const perf = measurePerformance('Top Customers Query', () => {
        result = Aggo.aggregate(orders, [
          {
            $group: {
              _id: '$customerId',
              totalSpent: { $sum: '$totalAmount' },
              orderCount: { $sum: 1 },
              avgOrderValue: { $avg: '$totalAmount' },
            },
          },
          { $sort: { totalSpent: -1 } },
          { $limit: 10 },
        ]);
      });
      performanceResults.push(perf);

      expect(result.length).to.be.at.most(10);
      if (result.length > 1) {
        expect(result[0].totalSpent).to.be.at.least(result[1].totalSpent);
      }
    });

    it('should join orders with customer data', () => {
      const result = Aggo.aggregate(orders, [
        { $limit: 5 },
        {
          $lookup: {
            from: customers,
            localField: 'customerId',
            foreignField: '_id',
            as: 'customerInfo',
          },
        },
        { $unwind: '$customerInfo' },
        {
          $project: {
            orderId: '$_id',
            customerName: '$customerInfo.name',
            customerTier: '$customerInfo.tier',
            orderAmount: '$totalAmount',
            orderStatus: '$status',
          },
        },
      ]);

      result.forEach(order => {
        expect(order).to.have.property('customerName');
        expect(order).to.have.property('customerTier');
        expect(['bronze', 'silver', 'gold', 'platinum']).to.include(
          order.customerTier
        );
      });
    });
  });

  describe('Product Analysis', () => {
    it('should find most popular product categories', () => {
      const result = Aggo.aggregate(orders, [
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.category',
            itemsSold: { $sum: '$items.quantity' },
            revenue: {
              $sum: { $multiply: ['$items.price', '$items.quantity'] },
            },
            uniqueProducts: { $addToSet: '$items.name' },
          },
        },
        {
          $addFields: {
            productVariety: { $size: '$uniqueProducts' },
          },
        },
        { $sort: { revenue: -1 } },
      ]);

      result.forEach(category => {
        expect(category).to.have.property('_id');
        expect(category.itemsSold).to.be.at.least(1);
        expect(category.productVariety).to.be.at.least(1);
      });
    });

    it('should calculate basket analysis metrics', () => {
      const result = Aggo.aggregate(orders, [
        {
          $addFields: {
            basketSize: { $size: '$items' },
            basketValue: '$totalAmount',
            avgItemPrice: { $divide: ['$totalAmount', { $size: '$items' }] },
          },
        },
        {
          $group: {
            _id: '$basketSize',
            orderCount: { $sum: 1 },
            avgBasketValue: { $avg: '$basketValue' },
            avgItemPrice: { $avg: '$avgItemPrice' },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      result.forEach(basket => {
        expect(basket._id).to.be.at.least(1);
        expect(basket.avgBasketValue).to.be.a('number');
      });
    });
  });

  describe('Shipping & Fulfillment', () => {
    it('should analyze shipping priorities and costs', () => {
      const result = Aggo.aggregate(orders, [
        {
          $group: {
            _id: '$priority',
            orderCount: { $sum: 1 },
            avgOrderValue: { $avg: '$totalAmount' },
            totalRevenue: { $sum: '$totalAmount' },
          },
        },
        {
          $addFields: {
            revenuePerOrder: { $divide: ['$totalRevenue', '$orderCount'] },
          },
        },
        { $sort: { revenuePerOrder: -1 } },
      ]);

      const priorities = ['standard', 'express', 'overnight'];
      result.forEach(priority => {
        expect(priorities).to.include(priority._id);
        expect(priority.orderCount).to.be.at.least(1);
      });
    });

    it('should identify geographic distribution', () => {
      const result = Aggo.aggregate(orders, [
        {
          $group: {
            _id: {
              country: '$shippingAddress.country',
              state: '$shippingAddress.state',
            },
            orderCount: { $sum: 1 },
            totalRevenue: { $sum: '$totalAmount' },
          },
        },
        { $sort: { orderCount: -1 } },
        { $limit: 10 },
      ]);

      result.forEach(location => {
        expect(location._id).to.have.property('country');
        expect(location._id).to.have.property('state');
      });
    });
  });

  describe('Metamorphic Properties', () => {
    it('should maintain invariant: sum of grouped revenues equals total revenue', () => {
      const totalRevenue = Aggo.aggregate(orders, [
        {
          $group: {
            _id: null,
            total: { $sum: '$totalAmount' },
          },
        },
      ])[0].total;

      const groupedByStatus = Aggo.aggregate(orders, [
        {
          $group: {
            _id: '$status',
            revenue: { $sum: '$totalAmount' },
          },
        },
      ]);

      const groupedRevenue = groupedByStatus.reduce(
        (sum, group) => sum + group.revenue,
        0
      );

      // Use reasonable tolerance for floating point arithmetic
      assertCloseTo(
        totalRevenue,
        groupedRevenue,
        0.1,
        'Sum of grouped revenues should equal total revenue'
      );
    });

    it('should preserve order count across transformations', () => {
      const originalCount = orders.length;

      const afterFilter = Aggo.aggregate(orders, [
        { $match: { totalAmount: { $gte: 0 } } },
      ]).length;

      const afterUnwindRegroup = Aggo.aggregate(orders, [
        { $unwind: '$items' },
        {
          $group: {
            _id: '$_id',
            order: { $first: '$$ROOT' },
          },
        },
      ]).length;

      expect(afterFilter).to.equal(originalCount);
      expect(afterUnwindRegroup).to.equal(originalCount);
    });

    it('should maintain consistency: filtering then grouping vs grouping then filtering', () => {
      const threshold = 100;

      // Filter then group
      const filterFirst = Aggo.aggregate(orders, [
        { $match: { totalAmount: { $gte: threshold } } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]);

      // Group then filter
      const groupFirst = Aggo.aggregate(orders, [
        {
          $group: {
            _id: { status: '$status', orderId: '$_id' },
            amount: { $first: '$totalAmount' },
          },
        },
        { $match: { amount: { $gte: threshold } } },
        {
          $group: {
            _id: '$_id.status',
            count: { $sum: 1 },
          },
        },
      ]);

      // Convert to maps for comparison
      const filterFirstMap = new Map(
        filterFirst.map(item => [item._id, item.count])
      );
      const groupFirstMap = new Map(
        groupFirst.map(item => [item._id, item.count])
      );

      filterFirstMap.forEach((count, status) => {
        expect(groupFirstMap.get(status)).to.equal(count);
      });
    });

    it('should satisfy additive property for revenue calculations', () => {
      const firstHalf = orders.slice(0, Math.floor(orders.length / 2));
      const secondHalf = orders.slice(Math.floor(orders.length / 2));

      const firstHalfRevenue =
        Aggo.aggregate(firstHalf, [
          {
            $group: {
              _id: null,
              total: { $sum: '$totalAmount' },
            },
          },
        ])[0]?.total || 0;

      const secondHalfRevenue =
        Aggo.aggregate(secondHalf, [
          {
            $group: {
              _id: null,
              total: { $sum: '$totalAmount' },
            },
          },
        ])[0]?.total || 0;

      const totalRevenue =
        Aggo.aggregate(orders, [
          {
            $group: {
              _id: null,
              total: { $sum: '$totalAmount' },
            },
          },
        ])[0]?.total || 0;

      expect(
        Math.abs(firstHalfRevenue + secondHalfRevenue - totalRevenue)
      ).to.be.lessThan(0.01);
    });
  });

  describe('Complex Business Queries', () => {
    it('should calculate customer lifetime value metrics', () => {
      const result = Aggo.aggregate(orders, [
        {
          $group: {
            _id: '$customerId',
            firstOrder: { $min: '$orderDate' },
            lastOrder: { $max: '$orderDate' },
            totalOrders: { $sum: 1 },
            totalSpent: { $sum: '$totalAmount' },
            avgOrderValue: { $avg: '$totalAmount' },
            orderStatuses: { $push: '$status' },
          },
        },
        {
          $addFields: {
            customerLifetimeDays: {
              $divide: [
                { $subtract: ['$lastOrder', '$firstOrder'] },
                1000 * 60 * 60 * 24,
              ],
            },
            hasReturned: { $gt: ['$totalOrders', 1] },
            cancelRate: {
              $divide: [
                {
                  $size: {
                    $filter: {
                      input: '$orderStatuses',
                      cond: { $eq: ['$$this', 'cancelled'] },
                    },
                  },
                },
                '$totalOrders',
              ],
            },
          },
        },
        { $sort: { totalSpent: -1 } },
        { $limit: 20 },
      ]);

      result.forEach(customer => {
        expect(customer).to.have.property('customerLifetimeDays');
        expect(customer.cancelRate).to.be.at.least(0).and.at.most(1);
        expect(customer.hasReturned).to.be.a('boolean');
      });
    });

    it('should identify cross-selling opportunities', () => {
      const result = Aggo.aggregate(orders, [
        { $unwind: '$items' },
        { $unwind: '$items' },
        {
          $group: {
            _id: {
              category1: '$items.category',
              orderId: '$_id',
            },
            categories: { $addToSet: '$items.category' },
          },
        },
        { $unwind: '$categories' },
        {
          $match: {
            $expr: { $ne: ['$_id.category1', '$categories'] },
          },
        },
        {
          $group: {
            _id: {
              from: '$_id.category1',
              to: '$categories',
            },
            frequency: { $sum: 1 },
          },
        },
        { $sort: { frequency: -1 } },
        { $limit: 10 },
      ]);

      result.forEach(pair => {
        expect(pair._id).to.have.property('from');
        expect(pair._id).to.have.property('to');
        expect(pair._id.from).to.not.equal(pair._id.to);
        expect(pair.frequency).to.be.at.least(1);
      });
    });
  });
});

// Helper functions to generate test data if fixtures don't exist
function generateOrdersFixture(count) {
  const statuses = [
    'pending',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
  ];
  const priorities = ['standard', 'express', 'overnight'];
  const paymentMethods = ['credit_card', 'debit_card', 'paypal', 'crypto'];

  return Array.from({ length: count }, (_, i) => ({
    _id: `ORD-${i + 1}`,
    customerId: Math.floor(Math.random() * 20) + 1,
    orderId: `order-${i + 1}`,
    items: Array.from({ length: Math.floor(Math.random() * 4) + 1 }, () => ({
      productId: `prod-${Math.floor(Math.random() * 100)}`,
      name: `Product ${Math.floor(Math.random() * 100)}`,
      price: Math.random() * 500 + 10,
      quantity: Math.floor(Math.random() * 5) + 1,
      category: ['Electronics', 'Clothing', 'Books', 'Home'][
        Math.floor(Math.random() * 4)
      ],
    })),
    totalAmount: Math.random() * 1000 + 50,
    status: statuses[Math.floor(Math.random() * statuses.length)],
    orderDate: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
    shippingAddress: {
      street: `${Math.floor(Math.random() * 9999)} Main St`,
      city: ['New York', 'Los Angeles', 'Chicago', 'Houston'][
        Math.floor(Math.random() * 4)
      ],
      state: ['NY', 'CA', 'IL', 'TX'][Math.floor(Math.random() * 4)],
      country: 'USA',
      zipCode: `${Math.floor(Math.random() * 90000) + 10000}`,
    },
    paymentMethod:
      paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
    priority: priorities[Math.floor(Math.random() * priorities.length)],
  }));
}

function generateCustomersFixture(count) {
  const tiers = ['bronze', 'silver', 'gold', 'platinum'];

  return Array.from({ length: count }, (_, i) => ({
    _id: i + 1,
    customerId: `cust-${i + 1}`,
    name: `Customer ${i + 1}`,
    email: `customer${i + 1}@example.com`,
    age: Math.floor(Math.random() * 50) + 20,
    registrationDate: new Date(
      Date.now() - Math.random() * 365 * 3 * 24 * 60 * 60 * 1000
    ),
    tier: tiers[Math.floor(Math.random() * tiers.length)],
    totalSpent: Math.random() * 10000,
    orderCount: Math.floor(Math.random() * 50),
    preferences: {
      newsletter: Math.random() > 0.5,
      notifications: Math.random() > 0.5,
      language: ['en', 'es', 'fr', 'de'][Math.floor(Math.random() * 4)],
    },
    address: {
      street: `${Math.floor(Math.random() * 9999)} Main St`,
      city: ['New York', 'Los Angeles', 'Chicago', 'Houston'][
        Math.floor(Math.random() * 4)
      ],
      state: ['NY', 'CA', 'IL', 'TX'][Math.floor(Math.random() * 4)],
      country: 'USA',
      zipCode: `${Math.floor(Math.random() * 90000) + 10000}`,
    },
    tags: [],
  }));
}
