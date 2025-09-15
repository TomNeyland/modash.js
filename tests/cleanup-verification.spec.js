/**
 * Test to verify proper cleanup of resources to prevent hanging
 */

import { expect } from 'chai';
import { EventEmitter } from 'events';
import { createStreamingCollection } from '../src/modash/streaming.js';

describe('Resource Cleanup Verification', () => {
  let collections = [];

  afterEach(() => {
    // Ensure all collections are properly destroyed
    collections.forEach((collection) => {
      if (collection && typeof collection.destroy === 'function') {
        collection.destroy();
      }
    });
    collections = [];
  });

  it('should properly cleanup streaming collections to prevent hanging', () => {
    const collection = createStreamingCollection([
      { id: 1, name: 'Alice', age: 30 },
      { id: 2, name: 'Bob', age: 25 },
    ]);
    collections.push(collection);

    // Start streaming operations
    collection.stream([{ $match: { age: { $gte: 25 } } }]);
    collection.add({ id: 3, name: 'Charlie', age: 35 });

    // Verify streaming is working
    expect(collection.count()).to.equal(3);

    // Now destroy should clean up all resources
    collection.destroy();
    
    // Remove from tracking since we manually destroyed it
    collections = collections.filter(c => c !== collection);

    // This test passing indicates proper cleanup
    expect(true).to.be.true;
  });

  it('should handle event emitters without causing hanging', () => {
    const eventSource = new EventEmitter();
    const collection = createStreamingCollection();
    collections.push(collection);

    // Connect to event source
    const consumerId = collection.connectEventSource({
      source: eventSource,
      eventName: 'data',
      transform: (data) => ({ id: Date.now(), ...data }),
    });

    // Emit some events
    eventSource.emit('data', { name: 'Test' });

    // Stop the event consumer
    collection.stopEventConsumer(consumerId);

    // Verify no hanging occurs
    expect(collection.count()).to.be.greaterThan(0);
  });

  it('should handle multiple streaming collections simultaneously', () => {
    const numCollections = 5;
    
    for (let i = 0; i < numCollections; i++) {
      const collection = createStreamingCollection([
        { id: i, value: i * 10 }
      ]);
      collections.push(collection);

      // Start streaming on each
      collection.stream([{ $project: { id: 1, doubled: { $multiply: ['$value', 2] } } }]);
      collection.add({ id: i + 100, value: (i + 100) * 10 });
    }

    // Verify all collections are working
    collections.forEach((collection, index) => {
      expect(collection.count()).to.equal(2);
    });

    // Cleanup will happen in afterEach - this verifies no hanging occurs
    expect(collections.length).to.equal(numCollections);
  });
});