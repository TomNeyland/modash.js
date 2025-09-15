/**
 * Test to verify that Modash.aggregate() now uses StreamingCollection by default
 */

import { expect } from 'chai';
import Modash from '../src/index.js';
import { StreamingCollection } from '../src/modash/streaming.js';

describe('Streaming Default Behavior', () => {
  const testData = [
    { name: 'Alice', age: 30, department: 'Engineering' },
    { name: 'Bob', age: 25, department: 'Marketing' },
    { name: 'Charlie', age: 35, department: 'Engineering' },
    { name: 'Diana', age: 28, department: 'Marketing' }
  ];

  it('should produce identical results between streaming-default and explicit StreamingCollection', () => {
    const pipeline = [
      { $match: { age: { $gte: 28 } } },
      { $group: { _id: '$department', avgAge: { $avg: '$age' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ];

    // Use Modash.aggregate (now streaming by default)
    const streamingDefaultResult = Modash.aggregate(testData, pipeline);

    // Use explicit StreamingCollection
    const explicitStreamingCollection = new StreamingCollection(testData);
    const explicitStreamingResult = explicitStreamingCollection.stream(pipeline);

    expect(streamingDefaultResult).to.deep.equal(explicitStreamingResult);
  });

  it('should still work with existing StreamingCollection instances', () => {
    const pipeline = [{ $match: { age: { $gte: 30 } } }];
    
    const streamingCollection = new StreamingCollection(testData);
    const result = Modash.aggregate(streamingCollection, pipeline);
    
    expect(result).to.have.lengthOf(2);
    expect(result[0]).to.include({ name: 'Alice', age: 30 });
    expect(result[1]).to.include({ name: 'Charlie', age: 35 });
  });

  it('should maintain backward compatibility for simple operations', () => {
    const pipeline = [{ $match: { department: 'Engineering' } }];
    
    const result = Modash.aggregate(testData, pipeline);
    
    expect(result).to.have.lengthOf(2);
    expect(result[0].name).to.equal('Alice');
    expect(result[1].name).to.equal('Charlie');
  });

  it('should handle empty collections correctly', () => {
    const pipeline = [{ $match: { age: { $gt: 100 } } }];
    
    const result = Modash.aggregate(testData, pipeline);
    
    expect(result).to.be.an('array');
    expect(result).to.have.lengthOf(0);
  });

  it('should handle complex pipelines with aggregations', () => {
    const pipeline = [
      { $group: { _id: '$department', totalAge: { $sum: '$age' }, names: { $push: '$name' } } },
      { $project: { department: '$_id', totalAge: 1, nameCount: { $size: '$names' } } },
      { $sort: { department: 1 } }
    ];

    const result = Modash.aggregate(testData, pipeline);
    
    expect(result).to.have.lengthOf(2);
    
    const engineering = result.find(r => r.department === 'Engineering');
    expect(engineering).to.exist;
    expect(engineering.totalAge).to.equal(65); // Alice (30) + Charlie (35)
    expect(engineering.nameCount).to.equal(2);
    
    const marketing = result.find(r => r.department === 'Marketing');
    expect(marketing).to.exist;
    expect(marketing.totalAge).to.equal(53); // Bob (25) + Diana (28)
    expect(marketing.nameCount).to.equal(2);
  });

  it('should produce identical results to the previous transparent aggregate approach', async () => {
    // Import the legacy transparent aggregate for comparison
    const { aggregateTransparent } = await import('../src/modash/index.js');
    
    const pipeline = [
      { $match: { age: { $lt: 32 } } },
      { $project: { name: 1, age: 1 } },
      { $sort: { age: -1 } }
    ];

    const streamingResult = Modash.aggregate(testData, pipeline);
    const legacyResult = aggregateTransparent(testData, pipeline);

    expect(streamingResult).to.deep.equal(legacyResult);
  });
});