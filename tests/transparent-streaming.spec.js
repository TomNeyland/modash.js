import { expect } from 'chai';
import Modash, { createStreamingCollection } from '../src/index';

describe('Transparent Streaming Integration', () => {
  const sampleData = [
    { id: 1, name: 'Alice', age: 30, dept: 'engineering' },
    { id: 2, name: 'Bob', age: 25, dept: 'marketing' },
    { id: 3, name: 'Charlie', age: 35, dept: 'engineering' },
  ];

  const pipeline = [
    { $match: { dept: 'engineering' } },
    { $project: { name: 1, age: 1 } },
    { $sort: { age: 1 } },
  ];

  it('should work transparently with regular arrays', () => {
    const result = Modash.aggregate(sampleData, pipeline);

    expect(result).to.have.lengthOf(2);
    expect(result[0].name).to.equal('Alice');
    expect(result[1].name).to.equal('Charlie');
  });

  it('should work transparently with streaming collections', () => {
    const streamingCollection = createStreamingCollection(sampleData);
    const result = Modash.aggregate(streamingCollection, pipeline);

    expect(result).to.have.lengthOf(2);
    expect(result[0].name).to.equal('Alice');
    expect(result[1].name).to.equal('Charlie');

    streamingCollection.destroy();
  });

  it('should produce identical results for both approaches', () => {
    const arrayResult = Modash.aggregate(sampleData, pipeline);

    const streamingCollection = createStreamingCollection(sampleData);
    const streamingResult = Modash.aggregate(streamingCollection, pipeline);

    expect(streamingResult).to.deep.equal(arrayResult);

    streamingCollection.destroy();
  });

  it('should maintain backward compatibility - existing code should work unchanged', () => {
    // This is exactly how existing users would call it
    const result = Modash.aggregate(sampleData, [
      { $group: { _id: '$dept', count: { $sum: 1 } } },
    ]);

    expect(result).to.have.lengthOf(2);

    const engineeringGroup = result.find(r => r._id === 'engineering');
    const marketingGroup = result.find(r => r._id === 'marketing');

    expect(engineeringGroup.count).to.equal(2);
    expect(marketingGroup.count).to.equal(1);
  });

  it('should automatically enable streaming capabilities when needed', () => {
    // User can upgrade to streaming seamlessly
    const streamingCollection = createStreamingCollection(sampleData);

    // Same API, but now gets streaming benefits
    const initialResult = Modash.aggregate(streamingCollection, pipeline);
    expect(initialResult).to.have.lengthOf(2);

    // Add new data - this triggers streaming updates
    streamingCollection.add({
      id: 4,
      name: 'David',
      age: 28,
      dept: 'engineering',
    });

    // Same aggregate call now returns updated results
    const updatedResult = Modash.aggregate(streamingCollection, pipeline);
    expect(updatedResult).to.have.lengthOf(3);
    expect(updatedResult.map(r => r.name)).to.include('David');

    streamingCollection.destroy();
  });
});
