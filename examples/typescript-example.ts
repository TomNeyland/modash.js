/**
 * TypeScript example demonstrating type-safe usage of modash.js
 */

import type { Document, Collection, Pipeline } from '../src/index.d.ts';

// Import the actual implementation
// In real usage, this would be: import Modash from 'modash';
// For this example, we'll simulate the module interface
declare const Modash: {
  aggregate<T extends Document = Document>(collection: Collection<T>, pipeline: Pipeline): Collection<T>;
  $match<T extends Document = Document>(collection: Collection<T>, query: any): Collection<T>;
  $project<T extends Document = Document>(collection: Collection<T>, specifications: any): Collection<T>;
  $lookup<T extends Document = Document>(collection: Collection<T>, lookupSpec: any): Collection<T>;
};

// Define a typed interface for your documents
interface Customer extends Document {
  _id: number;
  name: string;
  email: string;
  age: number;
  orders: Order[];
  registrationDate: Date;
}

interface Order extends Document {
  _id: string;
  customerId: number;
  items: OrderItem[];
  total: number;
  date: Date;
}

interface OrderItem extends Document {
  productId: string;
  quantity: number;
  price: number;
}

// Sample data with full type safety
const customers: Collection<Customer> = [
  {
    _id: 1,
    name: 'Alice Johnson',
    email: 'alice@example.com',
    age: 30,
    orders: [
      { _id: 'ord-1', customerId: 1, items: [], total: 150, date: new Date() }
    ],
    registrationDate: new Date('2023-01-15')
  },
  {
    _id: 2,
    name: 'Bob Smith',
    email: 'bob@example.com',
    age: 25,
    orders: [
      { _id: 'ord-2', customerId: 2, items: [], total: 200, date: new Date() },
      { _id: 'ord-3', customerId: 2, items: [], total: 75, date: new Date() }
    ],
    registrationDate: new Date('2023-03-20')
  }
];

// Type-safe aggregation pipeline
const pipeline: Pipeline = [
  // Filter customers over 25
  { 
    $match: { 
      age: { $gte: 25 },
      email: { $exists: true }
    } 
  },
  
  // Add computed fields
  {
    $addFields: {
      totalOrders: { $size: '$orders' },
      averageOrderValue: { $avg: '$orders.total' },
      isVip: { $gte: [{ $size: '$orders' }, 2] }
    }
  },
  
  // Sort by total orders descending
  { 
    $sort: { 
      totalOrders: -1, 
      name: 1 
    } 
  },
  
  // Project only needed fields
  {
    $project: {
      name: 1,
      email: 1,
      age: 1,
      totalOrders: 1,
      averageOrderValue: { $round: ['$averageOrderValue', 2] },
      isVip: 1,
      _id: 0
    }
  }
];

// Execute aggregation with full type safety
const result = Modash.aggregate(customers, pipeline);

// TypeScript knows the result type and provides IntelliSense
result.forEach(customer => {
  console.log(`Customer: ${customer.name}`);
  console.log(`Email: ${customer.email}`);
  console.log(`Age: ${customer.age}`);
  console.log(`Total Orders: ${customer.totalOrders}`);
  console.log(`Average Order Value: $${customer.averageOrderValue}`);
  console.log(`VIP Status: ${customer.isVip ? 'Yes' : 'No'}`);
  console.log('---');
});

// Individual stage operations are also type-safe
const matchedCustomers = Modash.$match(customers, { age: { $gte: 30 } });
const customerNames = Modash.$project(matchedCustomers, { 
  name: 1, 
  displayName: { $toUpper: '$name' },
  _id: 0 
});

// Example with $lookup for joins
const orders: Collection<Order> = [
  { _id: 'ord-1', customerId: 1, items: [], total: 150, date: new Date() },
  { _id: 'ord-2', customerId: 2, items: [], total: 200, date: new Date() }
];

const customersWithOrders = Modash.$lookup(customers, {
  from: orders,
  localField: '_id',
  foreignField: 'customerId',
  as: 'orderDetails'
});

export { customers, pipeline, result, customersWithOrders };
export type { Customer, Order, OrderItem };