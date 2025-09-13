import { expect } from 'chai';
import { EventEmitter } from 'events';
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

  afterEach(() => {
    // Clean up after each test
    if (streamingCollection && typeof streamingCollection.destroy === 'function') {
      streamingCollection.destroy();
    }
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
      empty.destroy();
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

    it('should properly destroy and clean up resources', () => {
      const mockSource = new EventEmitter();
      
      // Set up event consumer
      const consumerId = streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'test-event',
      });

      expect(streamingCollection.getEventConsumers()).to.have.length(1);

      // Destroy should clean up everything
      streamingCollection.destroy();
      
      expect(streamingCollection.count()).to.equal(0);
      expect(streamingCollection.getEventConsumers()).to.have.length(0);
      
      // Should not crash when emitting to disconnected source
      expect(() => mockSource.emit('test-event', { id: 999 })).to.not.throw();
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

    it('should emit transform-error event when transform function fails', done => {
      const mockSource = new EventEmitter();
      
      streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'test-event',
        transform: () => {
          throw new Error('Transform failed');
        },
      });

      streamingCollection.once('transform-error', event => {
        expect(event).to.have.property('error');
        expect(event).to.have.property('originalEvent');
        expect(event).to.have.property('eventName', 'test-event');
        expect(event.error.message).to.equal('Transform failed');
        done();
      });

      mockSource.emit('test-event', { some: 'data' });
    });
  });

  describe('Event Source Integration', () => {
    let mockSource;

    beforeEach(() => {
      mockSource = new EventEmitter();
    });

    afterEach(() => {
      mockSource.removeAllListeners();
    });

    it('should connect to external event source without transform', done => {
      const originalCount = streamingCollection.count();

      streamingCollection.once('data-added', event => {
        expect(event.newDocuments).to.have.length(1);
        expect(event.newDocuments[0]).to.deep.equal({ 
          id: 4, 
          name: 'External', 
          type: 'external' 
        });
        expect(streamingCollection.count()).to.equal(originalCount + 1);
        done();
      });

      const consumerId = streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'new-document',
      });

      expect(consumerId).to.be.a('string');
      expect(streamingCollection.getEventConsumers()).to.have.length(1);

      // Emit event
      mockSource.emit('new-document', { 
        id: 4, 
        name: 'External', 
        type: 'external' 
      });
    });

    it('should connect to external event source with transform', done => {
      const originalCount = streamingCollection.count();

      streamingCollection.once('data-added', event => {
        expect(event.newDocuments).to.have.length(1);
        expect(event.newDocuments[0]).to.deep.equal({
          id: 4,
          name: 'Transformed User',
          age: 25,
          dept: 'external',
          salary: 50000,
        });
        expect(streamingCollection.count()).to.equal(originalCount + 1);
        done();
      });

      streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'user-created',
        transform: (eventData, eventName) => {
          expect(eventName).to.equal('user-created');
          return {
            id: eventData.userId,
            name: eventData.displayName,
            age: eventData.age,
            dept: 'external',
            salary: 50000,
          };
        },
      });

      // Emit event with different structure
      mockSource.emit('user-created', {
        userId: 4,
        displayName: 'Transformed User',
        age: 25,
        email: 'user@example.com',
      });
    });

    it('should handle transform returning array of documents', done => {
      let addedCount = 0;
      
      streamingCollection.on('data-added', event => {
        addedCount += event.newDocuments.length;
        
        if (addedCount === 2) {
          expect(streamingCollection.count()).to.equal(5); // 3 original + 2 new
          
          const docs = streamingCollection.getDocuments();
          const newDocs = docs.slice(-2);
          
          expect(newDocs[0]).to.deep.equal({
            id: 4,
            name: 'User 1',
            age: 25,
            dept: 'bulk',
            salary: 60000,
          });
          expect(newDocs[1]).to.deep.equal({
            id: 5,
            name: 'User 2',
            age: 30,
            dept: 'bulk',
            salary: 70000,
          });
          
          done();
        }
      });

      streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'bulk-users',
        transform: (eventData) => {
          return eventData.users.map((user, index) => ({
            id: user.id || (4 + index),
            name: user.name,
            age: user.age,
            dept: 'bulk',
            salary: 60000 + (index * 10000),
          }));
        },
      });

      // Emit bulk event
      mockSource.emit('bulk-users', {
        users: [
          { name: 'User 1', age: 25 },
          { name: 'User 2', age: 30 },
        ],
      });
    });

    it('should handle transform returning null/undefined (skip event)', () => {
      const originalCount = streamingCollection.count();

      streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'conditional-event',
        transform: (eventData) => {
          // Only process events with status 'active'
          return eventData.status === 'active' ? eventData : null;
        },
      });

      // Emit events - inactive should be skipped
      mockSource.emit('conditional-event', { 
        id: 4, 
        name: 'Inactive', 
        status: 'inactive' 
      });
      
      expect(streamingCollection.count()).to.equal(originalCount);

      // Active should be processed
      mockSource.emit('conditional-event', { 
        id: 5, 
        name: 'Active', 
        status: 'active' 
      });
      
      expect(streamingCollection.count()).to.equal(originalCount + 1);
    });

    it('should disconnect event source', () => {
      const consumerId = streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'test-event',
      });

      expect(streamingCollection.getEventConsumers()).to.have.length(1);

      streamingCollection.disconnectEventSource(consumerId);

      expect(streamingCollection.getEventConsumers()).to.have.length(0);

      // Should not receive events after disconnect
      const originalCount = streamingCollection.count();
      mockSource.emit('test-event', { id: 999 });
      expect(streamingCollection.count()).to.equal(originalCount);
    });

    it('should manage multiple event sources', done => {
      const source1 = new EventEmitter();
      const source2 = new EventEmitter();
      
      let receivedEvents = 0;
      
      streamingCollection.on('data-added', () => {
        receivedEvents++;
        
        if (receivedEvents === 2) {
          expect(streamingCollection.count()).to.equal(5); // 3 original + 2 new
          expect(streamingCollection.getEventConsumers()).to.have.length(2);
          done();
        }
      });

      // Connect multiple sources
      streamingCollection.connectEventSource({
        source: source1,
        eventName: 'event1',
        transform: (data) => ({ ...data, source: 'source1' }),
      });

      streamingCollection.connectEventSource({
        source: source2,
        eventName: 'event2',
        transform: (data) => ({ ...data, source: 'source2' }),
      });

      // Emit from both sources
      source1.emit('event1', { id: 4, name: 'From Source 1' });
      source2.emit('event2', { id: 5, name: 'From Source 2' });
    });

    it('should handle autoStart: false option', () => {
      const consumerId = streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'manual-event',
        autoStart: false,
      });

      expect(streamingCollection.getEventConsumers()).to.have.length(1);

      // Should not receive events initially
      const originalCount = streamingCollection.count();
      mockSource.emit('manual-event', { id: 999 });
      expect(streamingCollection.count()).to.equal(originalCount);

      // Start manually
      streamingCollection.startEventConsumer(consumerId);
      mockSource.emit('manual-event', { id: 1000 });
      expect(streamingCollection.count()).to.equal(originalCount + 1);
    });

    it('should stop and restart event consumers', () => {
      const consumerId = streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'stop-start-event',
      });

      const originalCount = streamingCollection.count();

      // Should receive events initially
      mockSource.emit('stop-start-event', { id: 1001 });
      expect(streamingCollection.count()).to.equal(originalCount + 1);

      // Stop consumer
      streamingCollection.stopEventConsumer(consumerId);
      mockSource.emit('stop-start-event', { id: 1002 });
      expect(streamingCollection.count()).to.equal(originalCount + 1); // No change

      // Restart consumer
      streamingCollection.startEventConsumer(consumerId);
      mockSource.emit('stop-start-event', { id: 1003 });
      expect(streamingCollection.count()).to.equal(originalCount + 2);
    });

    it('should throw error for invalid consumer ID operations', () => {
      expect(() => {
        streamingCollection.startEventConsumer('invalid-id');
      }).to.throw('Event consumer invalid-id not found');
      
      // Should not throw for stopping invalid consumer
      expect(() => {
        streamingCollection.stopEventConsumer('invalid-id');
      }).to.not.throw();
      
      // Should not throw for disconnecting invalid consumer
      expect(() => {
        streamingCollection.disconnectEventSource('invalid-id');
      }).to.not.throw();
    });

    it('should filter out null/undefined documents from arrays', done => {
      streamingCollection.once('data-added', event => {
        expect(event.newDocuments).to.have.length(1);
        expect(event.newDocuments[0].name).to.equal('Valid User');
        done();
      });

      streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'mixed-array',
        transform: () => [
          null,
          { id: 4, name: 'Valid User' },
          undefined,
          null
        ],
      });

      mockSource.emit('mixed-array', {});
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

    it('should handle complex pipelines with event sources', done => {
      const mockSource = new EventEmitter();
      
      // Set up complex analytics pipeline
      const pipeline = [
        { $match: { salary: { $gte: 80000 } } },
        {
          $group: {
            _id: '$dept',
            avgSalary: { $avg: '$salary' },
            count: { $sum: 1 },
            employees: { $push: '$name' }
          },
        },
        { $sort: { avgSalary: -1 } },
      ];

      // Start streaming
      const initialResult = streamingCollection.stream(pipeline);
      expect(initialResult).to.have.length(2);

      let updateCount = 0;
      streamingCollection.on('result-updated', (event) => {
        updateCount++;
        
        if (updateCount === 2) {
          const engineeringGroup = event.result.find(g => g._id === 'engineering');
          expect(engineeringGroup.count).to.equal(3); // Alice, Charlie, David
          expect(engineeringGroup.employees).to.include.members(['Alice', 'Charlie', 'David']);
          done();
        }
      });

      // Connect event source
      streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'new-hire',
        transform: (eventData) => ({
          id: eventData.employeeId,
          name: eventData.fullName,
          age: eventData.age,
          dept: eventData.department,
          salary: eventData.annualSalary,
        }),
      });

      // Add new employees via events
      mockSource.emit('new-hire', {
        employeeId: 4,
        fullName: 'David',
        age: 29,
        department: 'engineering',
        annualSalary: 115000,
      });

      mockSource.emit('new-hire', {
        employeeId: 5,
        fullName: 'Eve',
        age: 26,
        department: 'marketing',
        annualSalary: 75000, // Below threshold, should not appear in results
      });
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

    it('should handle live updates from event sources with streaming pipelines', done => {
      const mockSource = new EventEmitter();
      
      const pipeline = [
        { $match: { dept: 'engineering' } },
        { $project: { name: 1, salary: 1, age: 1 } }
      ];

      // Start streaming
      const initialResult = streamingCollection.stream(pipeline);
      expect(initialResult).to.have.length(2);

      streamingCollection.once('result-updated', event => {
        expect(event.result).to.have.length(3);
        const newEmployee = event.result.find(emp => emp.name === 'Frank');
        expect(newEmployee).to.exist;
        expect(newEmployee.salary).to.equal(125000);
        done();
      });

      // Connect event source
      streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'employee-hired',
        transform: (data) => ({
          id: data.id,
          name: data.name,
          age: data.age,
          dept: data.department,
          salary: data.salary,
        }),
      });

      // Emit new engineering hire
      mockSource.emit('employee-hired', {
        id: 4,
        name: 'Frank',
        age: 31,
        department: 'engineering',
        salary: 125000,
      });
    });
  });

  describe('Memory Management', () => {
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

    it('should handle memory cleanup with many event sources', () => {
      const sources = [];
      const consumerIds = [];

      // Create many event sources
      for (let i = 0; i < 10; i++) {
        const source = new EventEmitter();
        sources.push(source);
        
        const consumerId = streamingCollection.connectEventSource({
          source: source,
          eventName: `event-${i}`,
          transform: (data) => ({ ...data, sourceIndex: i }),
        });
        consumerIds.push(consumerId);
      }

      expect(streamingCollection.getEventConsumers()).to.have.length(10);

      // Disconnect half of them
      for (let i = 0; i < 5; i++) {
        streamingCollection.disconnectEventSource(consumerIds[i]);
      }

      expect(streamingCollection.getEventConsumers()).to.have.length(5);

      // Clear should remove the rest
      streamingCollection.clear();
      expect(streamingCollection.getEventConsumers()).to.have.length(0);
    });

    it('should handle rapid event bursts without memory leaks', done => {
      const mockSource = new EventEmitter();
      let processedEvents = 0;
      
      streamingCollection.on('data-added', () => {
        processedEvents++;
        
        if (processedEvents === 100) {
          expect(streamingCollection.count()).to.equal(103); // 3 original + 100 new
          done();
        }
      });

      streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'burst-event',
        transform: (data, eventName) => ({
          id: data.sequence,
          name: `Burst User ${data.sequence}`,
          eventName: eventName,
        }),
      });

      // Emit 100 rapid events
      for (let i = 1; i <= 100; i++) {
        setImmediate(() => {
          mockSource.emit('burst-event', { sequence: i });
        });
      }
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

  describe('Edge Cases and Error Handling', () => {
    it('should handle event sources that emit non-object data', done => {
      const mockSource = new EventEmitter();
      
      streamingCollection.once('data-added', event => {
        expect(event.newDocuments[0]).to.deep.equal({
          value: 'simple string',
          processed: true,
        });
        done();
      });

      streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'string-event',
        transform: (data) => ({
          value: data,
          processed: true,
        }),
      });

      mockSource.emit('string-event', 'simple string');
    });

    it('should handle transform functions that return empty arrays', () => {
      const mockSource = new EventEmitter();
      const originalCount = streamingCollection.count();

      streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'empty-array-event',
        transform: () => [],
      });

      mockSource.emit('empty-array-event', { some: 'data' });
      expect(streamingCollection.count()).to.equal(originalCount);
    });

    it('should handle circular references in event data gracefully', () => {
      const mockSource = new EventEmitter();
      
      // Create circular reference
      const circularData = { name: 'Circular' };
      circularData.self = circularData;

      expect(() => {
        streamingCollection.connectEventSource({
          source: mockSource,
          eventName: 'circular-event',
          transform: (data) => ({
            id: 999,
            name: data.name,
            // Don't include the circular reference
          }),
        });

        mockSource.emit('circular-event', circularData);
      }).to.not.throw();
    });

    it('should handle multiple transforms on the same event type', done => {
      const mockSource = new EventEmitter();
      let addedCount = 0;

      streamingCollection.on('data-added', () => {
        addedCount++;
        
        if (addedCount === 2) {
          expect(streamingCollection.count()).to.equal(5); // 3 original + 2 new
          done();
        }
      });

      // Connect two different transforms for similar events
      streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'user-action',
        transform: (data) => data.type === 'login' ? {
          id: data.userId,
          name: `User ${data.userId}`,
          action: 'login',
        } : null,
      });

      streamingCollection.connectEventSource({
        source: mockSource,
        eventName: 'user-action',
        transform: (data) => data.type === 'signup' ? {
          id: data.userId,
          name: `New User ${data.userId}`,
          action: 'signup',
        } : null,
      });

      // Emit events
      mockSource.emit('user-action', { userId: 100, type: 'login' });
      mockSource.emit('user-action', { userId: 101, type: 'signup' });
      mockSource.emit('user-action', { userId: 102, type: 'logout' }); // Should be ignored
    });

    it('should maintain event source isolation', () => {
      const source1 = new EventEmitter();
      const source2 = new EventEmitter();
      
      let source1Events = 0;
      let source2Events = 0;

      streamingCollection.connectEventSource({
        source: source1,
        eventName: 'test',
        transform: (data) => {
          source1Events++;
          return { ...data, source: 1 };
        },
      });

      streamingCollection.connectEventSource({
        source: source2,
        eventName: 'test',
        transform: (data) => {
          source2Events++;
          return { ...data, source: 2 };
        },
      });

      source1.emit('test', { id: 1 });
      source1.emit('test', { id: 2 });
      source2.emit('test', { id: 3 });

      expect(source1Events).to.equal(2);
      expect(source2Events).to.equal(1);
    });
  });
});
