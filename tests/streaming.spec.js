import { expect } from 'chai';
import {
  StreamingCollection,
  createStreamingCollection,
  aggregateStreaming,
} from '../src/modash/streaming.js';

describe('Streaming Collection', () => {
  let streamingCollection;

  const sampleData = [
    { id: 1, name: 'Alice', age: 30, dept: 'engineering', salary: 100000 },
    { id: 2, name: 'Bob', age: 25, dept: 'marketing', salary: 80000 },
    { id: 3, name: 'Charlie', age: 35, dept: 'engineering', salary: 120000 },
  ];

  beforeEach(() => {
    streamingCollection = createStreamingCollection(sampleData);
  });

  describe('Basic Functionality', () => {
    it('should create a streaming collection with initial data', () => {
      expect(streamingCollection).to.be.instanceOf(StreamingCollection);
      expect(streamingCollection.count()).to.equal(3);
      expect(streamingCollection.getDocuments()).to.have.length(3);
    });

    it('should create an empty streaming collection', () => {
      const empty = createStreamingCollection();
      expect(empty.count()).to.equal(0);
      expect(empty.getDocuments()).to.have.length(0);
    });

    it('should add single documents', () => {
      const newDoc = {
        id: 4,
        name: 'David',
        age: 28,
        dept: 'marketing',
        salary: 75000,
      };
      streamingCollection.add(newDoc);

      expect(streamingCollection.count()).to.equal(4);
      const docs = streamingCollection.getDocuments();
      expect(docs[3]).to.deep.equal(newDoc);
    });

    it('should add multiple documents in bulk', () => {
      const newDocs = [
        { id: 4, name: 'David', age: 28, dept: 'marketing', salary: 75000 },
        { id: 5, name: 'Eve', age: 32, dept: 'engineering', salary: 110000 },
      ];

      streamingCollection.addBulk(newDocs);

      expect(streamingCollection.count()).to.equal(5);
      const docs = streamingCollection.getDocuments();
      expect(docs.slice(-2)).to.deep.equal(newDocs);
    });

    it('should handle empty bulk additions gracefully', () => {
      const originalCount = streamingCollection.count();
      streamingCollection.addBulk([]);
      expect(streamingCollection.count()).to.equal(originalCount);
    });
  });

  describe('Event Emission', () => {
    it('should emit data-added event when documents are added', done => {
      const newDoc = {
        id: 4,
        name: 'David',
        age: 28,
        dept: 'marketing',
        salary: 75000,
      };

      streamingCollection.once('data-added', event => {
        expect(event).to.have.property('newDocuments');
        expect(event).to.have.property('totalCount', 4);
        expect(event.newDocuments).to.have.length(1);
        expect(event.newDocuments[0]).to.deep.equal(newDoc);
        done();
      });

      streamingCollection.add(newDoc);
    });

    it('should emit result-updated event when streaming aggregations update', done => {
      // Start streaming
      const pipeline = [{ $match: { dept: 'engineering' } }];
      streamingCollection.stream(pipeline);

      streamingCollection.once('result-updated', event => {
        expect(event).to.have.property('result');
        expect(event).to.have.property('pipeline');
        expect(event.result).to.have.length(3); // 2 original + 1 new engineering
        done();
      });

      // Add new engineering document
      streamingCollection.add({
        id: 4,
        name: 'David',
        age: 28,
        dept: 'engineering',
        salary: 115000,
      });
    });
  });

  describe('Streaming Aggregation', () => {
    it('should return initial aggregation results', () => {
      const pipeline = [
        { $match: { dept: 'engineering' } },
        { $project: { name: 1, salary: 1 } },
      ];

      const result = streamingCollection.stream(pipeline);

      expect(result).to.have.length(2);
      expect(result[0]).to.have.property('name', 'Alice');
      expect(result[1]).to.have.property('name', 'Charlie');
    });

    it('should handle complex aggregation pipelines', () => {
      const pipeline = [
        {
          $group: {
            _id: '$dept',
            avgSalary: { $avg: '$salary' },
            count: { $sum: 1 },
          },
        },
        { $sort: { avgSalary: -1 } },
      ];

      const result = streamingCollection.stream(pipeline);

      expect(result).to.have.length(2);
      expect(result[0]._id).to.equal('engineering');
      expect(result[0].avgSalary).to.equal(110000);
      expect(result[0].count).to.equal(2);
      expect(result[1]._id).to.equal('marketing');
    });

    it('should get streaming results for registered pipeline', () => {
      const pipeline = [{ $match: { age: { $gte: 30 } } }];

      // Start streaming
      const initialResult = streamingCollection.stream(pipeline);
      expect(initialResult).to.have.length(2);

      // Get the same result via getStreamingResult
      const streamingResult = streamingCollection.getStreamingResult(pipeline);
      expect(streamingResult).to.deep.equal(initialResult);
    });

    it('should return null for unregistered pipelines', () => {
      const pipeline = [{ $match: { age: { $gte: 30 } } }];
      const result = streamingCollection.getStreamingResult(pipeline);
      expect(result).to.be.null;
    });

    it('should handle multiple concurrent streaming pipelines', () => {
      const pipeline1 = [{ $match: { dept: 'engineering' } }];
      const pipeline2 = [{ $match: { age: { $lt: 30 } } }]; // Different condition

      const result1 = streamingCollection.stream(pipeline1);
      const result2 = streamingCollection.stream(pipeline2);

      expect(result1).to.have.length(2); // Alice and Charlie (engineering)
      expect(result2).to.have.length(1); // Bob (age 25 < 30)

      // Results should be different
      expect(result1).to.not.deep.equal(result2);
    });

    it('should stop streaming when unstream is called', () => {
      const pipeline = [{ $match: { dept: 'engineering' } }];

      // Start streaming
      streamingCollection.stream(pipeline);
      expect(streamingCollection.getStreamingResult(pipeline)).to.not.be.null;

      // Stop streaming
      streamingCollection.unstream(pipeline);
      expect(streamingCollection.getStreamingResult(pipeline)).to.be.null;
    });
  });

  describe('Live Updates', () => {
    it('should update streaming results when new data is added', done => {
      const pipeline = [{ $match: { dept: 'engineering' } }];

      // Start streaming
      const initialResult = streamingCollection.stream(pipeline);
      expect(initialResult).to.have.length(2);

      // Listen for updates
      streamingCollection.once('result-updated', event => {
        expect(event.result).to.have.length(3);

        // Verify the streaming result is also updated
        const updatedResult = streamingCollection.getStreamingResult(pipeline);
        expect(updatedResult).to.have.length(3);
        done();
      });

      // Add new engineering document
      streamingCollection.add({
        id: 4,
        name: 'David',
        age: 28,
        dept: 'engineering',
        salary: 115000,
      });
    });

    it('should handle group aggregations with live updates', done => {
      const pipeline = [
        {
          $group: {
            _id: '$dept',
            count: { $sum: 1 },
            avgSalary: { $avg: '$salary' },
          },
        },
      ];

      // Start streaming
      const initialResult = streamingCollection.stream(pipeline);
      expect(initialResult).to.have.length(2);

      const engineeringGroup = initialResult.find(g => g._id === 'engineering');
      expect(engineeringGroup.count).to.equal(2);
      expect(engineeringGroup.avgSalary).to.equal(110000);

      // Listen for updates
      streamingCollection.once('result-updated', event => {
        const updatedEngineering = event.result.find(
          g => g._id === 'engineering'
        );
        expect(updatedEngineering.count).to.equal(3);
        // New average: (100000 + 120000 + 115000) / 3 = 111666.67
        expect(updatedEngineering.avgSalary).to.be.closeTo(111666.67, 0.01);
        done();
      });

      // Add new engineering document
      streamingCollection.add({
        id: 4,
        name: 'David',
        age: 28,
        dept: 'engineering',
        salary: 115000,
      });
    });
  });

  describe('Memory Management', () => {
    it('should clear all data and state', () => {
      const pipeline = [{ $match: { dept: 'engineering' } }];

      // Start streaming
      streamingCollection.stream(pipeline);
      expect(streamingCollection.count()).to.equal(3);
      expect(streamingCollection.getStreamingResult(pipeline)).to.not.be.null;

      // Clear everything
      streamingCollection.clear();

      expect(streamingCollection.count()).to.equal(0);
      expect(streamingCollection.getStreamingResult(pipeline)).to.be.null;
    });

    it('should handle errors in aggregation updates gracefully', () => {
      // Create a pipeline that might cause issues
      const pipeline = [{ $project: { invalidField: { $divide: [1, 0] } } }];

      // This should not throw
      expect(() => {
        streamingCollection.stream(pipeline);
        streamingCollection.add({
          id: 4,
          name: 'Test',
          age: 30,
          dept: 'test',
          salary: 50000,
        });
      }).to.not.throw();
    });
  });

  describe('aggregateStreaming Function', () => {
    it('should work with regular collections', () => {
      const regularCollection = [
        { id: 1, name: 'Alice', value: 10 },
        { id: 2, name: 'Bob', value: 20 },
      ];

      const pipeline = [{ $match: { value: { $gte: 15 } } }];
      const result = aggregateStreaming(regularCollection, pipeline);

      expect(result).to.have.length(1);
      expect(result[0].name).to.equal('Bob');
    });

    it('should work with streaming collections', () => {
      const pipeline = [{ $match: { age: { $gte: 30 } } }];
      const result = aggregateStreaming(streamingCollection, pipeline);

      expect(result).to.have.length(2);
      expect(result.map(d => d.name)).to.include.members(['Alice', 'Charlie']);
    });
  });
});
