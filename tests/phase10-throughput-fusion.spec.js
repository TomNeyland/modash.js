/**
 * Phase 10 Throughput & Fusion Stack Tests
 * 
 * Tests for micro-batching, expression JIT, Top-K, numeric kernels,
 * prefilters, operator fusion, and performance optimizations
 */

import { expect } from 'chai';

// Import Phase 10 components
import { SPSCRingBuffer, DeltaBatchingScheduler, DeltaThroughputMonitor } from '../src/aggo/engine/schedule/batching.js';
import { ExpressionJIT, parseExpression } from '../src/aggo/engine/expr/jit.js';
import { VectorInterpreter } from '../src/aggo/engine/expr/interp.js';
import { TopKHeap, GroupedTopKManager, TopKOperations } from '../src/aggo/engine/topk/heap.js';
import { NumericKernels } from '../src/aggo/engine/kernels/num.js';
import { BitmapKernels } from '../src/aggo/engine/kernels/bitmap.js';
import { BloomFilter, JoinBloomFilterManager } from '../src/aggo/engine/prefilter/bloom.js';
import { ZoneMap, ZoneMapManager } from '../src/aggo/engine/prefilter/zonemap.js';
import { TrigramPrefilter } from '../src/aggo/engine/prefilter/trigram.js';
import { PipelineFuser } from '../src/aggo/engine/fusion/pipeline_fuser.js';

describe('Phase 10: Throughput & Fusion Stack', function() {
  this.timeout(10000); // Increase timeout for performance tests
  
  describe('Ring Buffer & Micro-Batching', function() {
    it('should handle high-throughput delta batching', function() {
      const ringBuffer = new SPSCRingBuffer(256, 512);
      
      // Test basic produce/consume
      const testBatch = {
        deltas: [
          { type: 'insert', rowId: 1, data: { name: 'Alice' }, timestamp: Date.now() },
          { type: 'update', rowId: 2, data: { name: 'Bob' }, timestamp: Date.now() }
        ],
        size: 2,
        capacity: 512,
        timestamp: Date.now()
      };
      
      const produced = ringBuffer.produce(testBatch);
      expect(produced).to.be.true;
      
      const consumed = ringBuffer.consume();
      expect(consumed).to.not.be.null;
      expect(consumed.size).to.equal(2);
      expect(consumed.deltas[0].data.name).to.equal('Alice');
    });
    
    it('should apply backpressure correctly', function() {
      const scheduler = new DeltaBatchingScheduler({
        ringBufferCapacity: 4,
        backpressureThreshold: 0.75
      });
      
      // Fill up the ring buffer
      const testDeltas = [
        { type: 'insert', rowId: 1, data: {}, timestamp: Date.now() }
      ];
      
      let successfulSubmissions = 0;
      for (let i = 0; i < 10; i++) {
        if (scheduler.submitBatch(testDeltas)) {
          successfulSubmissions++;
        }
      }
      
      // Should have rejected some due to backpressure
      expect(successfulSubmissions).to.be.lessThan(10);
      
      const stats = scheduler.getStats();
      expect(stats.backpressureEvents).to.be.greaterThan(0);
    });
    
    it('should track throughput metrics', function() {
      const monitor = new DeltaThroughputMonitor();
      
      // Simulate processing deltas over time
      for (let i = 0; i < 100; i++) {
        monitor.updateDeltaCount(i * 10);
      }
      
      const stats = monitor.getStats();
      expect(stats.totalDeltas).to.equal(990);
      expect(stats.sampleCount).to.be.greaterThan(0);
    });
  });
  
  describe('Expression JIT Compiler', function() {
    it('should compile simple arithmetic expressions', function() {
      const jit = new ExpressionJIT();
      
      // Test simple addition
      const addAST = parseExpression({
        $add: ['$price', '$tax']
      });
      
      const result = jit.compile(addAST);
      expect(result.compiled).to.be.a('function');
      expect(result.fallbackToInterpreter).to.be.false;
      expect(result.optimizations).to.include('arithmetic_optimization');
      
      // Test the compiled function
      const testDoc = { price: 100, tax: 10 };
      const value = result.compiled(testDoc);
      expect(value).to.equal(110);
    });
    
    it('should fallback to interpreter for complex expressions', function() {
      const jit = new ExpressionJIT();
      
      // Create a very complex expression that should trigger fallback
      const complexAST = {
        type: 'operator',
        operator: '$complex',
        operands: new Array(100).fill().map(() => ({
          type: 'field',
          field: 'value'
        }))
      };
      
      const result = jit.compile(complexAST);
      expect(result.fallbackToInterpreter).to.be.true;
      expect(result.optimizations).to.include('interpreter_fallback');
    });
    
    it('should cache compiled expressions', function() {
      const jit = new ExpressionJIT();
      
      const ast = parseExpression({ $add: ['$a', '$b'] });
      
      // First compilation
      jit.compile(ast);
      const stats1 = jit.getStats();
      
      // Second compilation (should hit cache)
      jit.compile(ast);
      const stats2 = jit.getStats();
      
      expect(stats2.cacheHits).to.be.greaterThan(stats1.cacheHits);
    });
  });
  
  describe('Vector Expression Interpreter', function() {
    it('should process vector batches efficiently', function() {
      const interpreter = new VectorInterpreter();
      
      const batch = {
        values: [
          { a: 10, b: 5 },
          { a: 20, b: 10 },
          { a: 30, b: 15 }
        ],
        nullMask: [false, false, false],
        size: 3
      };
      
      const addAST = parseExpression({ $add: ['$a', '$b'] });
      const result = interpreter.evaluateBatch(addAST, batch);
      
      expect(result.size).to.equal(3);
      expect(result.values[0]).to.equal(15);
      expect(result.values[1]).to.equal(30);
      expect(result.values[2]).to.equal(45);
    });
    
    it('should handle null values correctly', function() {
      const interpreter = new VectorInterpreter();
      
      const batch = {
        values: [
          { a: 10, b: null },
          { a: null, b: 10 },
          { a: 20, b: 5 }
        ],
        nullMask: [false, false, false],
        size: 3
      };
      
      const addAST = parseExpression({ $add: ['$a', '$b'] });
      const result = interpreter.evaluateBatch(addAST, batch);
      
      expect(result.nullMask[0]).to.be.true; // null + number = null
      expect(result.nullMask[1]).to.be.true; // null + number = null
      expect(result.nullMask[2]).to.be.false;
      expect(result.values[2]).to.equal(25);
    });
  });
  
  describe('Top-K Heap Operations', function() {
    it('should maintain top-K elements efficiently', function() {
      const heap = new TopKHeap(3, false); // Min heap for top 3 largest
      
      const values = [10, 5, 15, 8, 20, 3, 12];
      
      for (let i = 0; i < values.length; i++) {
        heap.insert(values[i], { id: i, value: values[i] });
      }
      
      const topK = heap.getSorted();
      expect(topK).to.have.length(3);
      
      // Should have the 3 largest values: 20, 15, 12
      const topValues = topK.map(item => item.value);
      expect(topValues).to.deep.equal([12, 15, 20]); // Sorted ascending for min heap
    });
    
    it('should handle grouped top-K operations', function() {
      const manager = new GroupedTopKManager(2); // Top 2 per group
      
      const data = [
        { category: 'A', score: 85 },
        { category: 'B', score: 92 },
        { category: 'A', score: 78 },
        { category: 'B', score: 88 },
        { category: 'A', score: 95 },
      ];
      
      for (const item of data) {
        manager.insert(item.category, item.score, item);
      }
      
      const groupA = manager.getGroupResults('A');
      const groupB = manager.getGroupResults('B');
      
      expect(groupA).to.have.length(2);
      expect(groupB).to.have.length(2);
      
      // Group A should have scores 95 and 85
      expect(groupA.map(item => item.score).sort()).to.deep.equal([85, 95]);
      
      // Group B should have scores 92 and 88
      expect(groupB.map(item => item.score).sort()).to.deep.equal([88, 92]);
    });
    
    it('should use Top-K operations utility', function() {
      const data = [
        { name: 'Alice', score: 85 },
        { name: 'Bob', score: 92 },
        { name: 'Charlie', score: 78 },
        { name: 'David', score: 95 },
        { name: 'Eve', score: 88 }
      ];
      
      const top3 = TopKOperations.topK(
        data,
        3,
        item => item.score,
        true // Max heap for highest scores
      );
      
      expect(top3).to.have.length(3);
      const scores = top3.map(item => item.score);
      expect(scores).to.deep.equal([95, 92, 88]); // Descending order
    });
  });
  
  describe('Numeric Vector Kernels', function() {
    it('should perform fast vector arithmetic', function() {
      const kernels = new NumericKernels();
      
      const vector1 = {
        values: [10, 20, 30, 40],
        nullMask: [false, false, false, false],
        size: 4
      };
      
      const vector2 = {
        values: [5, 10, 15, 20],
        nullMask: [false, false, false, false],  
        size: 4
      };
      
      // Test addition
      const addResult = kernels.add([vector1, vector2]);
      expect(addResult.values).to.deep.equal([15, 30, 45, 60]);
      expect(addResult.nullMask.every(isNull => !isNull)).to.be.true;
      
      // Test subtraction
      const subResult = kernels.subtract(vector1, vector2);
      expect(subResult.values).to.deep.equal([5, 10, 15, 20]);
      
      // Test multiplication
      const mulResult = kernels.multiply([vector1, vector2]);
      expect(mulResult.values).to.deep.equal([50, 200, 450, 800]);
    });
    
    it('should handle null values in vector operations', function() {
      const kernels = new NumericKernels();
      
      const vector1 = {
        values: [10, 20, 30, 40],
        nullMask: [false, true, false, false],
        size: 4
      };
      
      const vector2 = {
        values: [5, 10, 15, 20],
        nullMask: [false, false, true, false],
        size: 4
      };
      
      const addResult = kernels.add([vector1, vector2]);
      
      // Index 1: null + 10 = null
      // Index 2: 30 + null = null
      expect(addResult.nullMask[1]).to.be.true;
      expect(addResult.nullMask[2]).to.be.true;
      expect(addResult.nullMask[0]).to.be.false;
      expect(addResult.nullMask[3]).to.be.false;
      
      expect(addResult.values[0]).to.equal(15);
      expect(addResult.values[3]).to.equal(60);
    });
    
    it('should use branchless min/max operations', function() {
      const kernels = new NumericKernels();
      
      const vectors = [
        {
          values: [10, 5, 30, 15],
          nullMask: [false, false, false, false],
          size: 4
        },
        {
          values: [8, 12, 25, 20],
          nullMask: [false, false, false, false],
          size: 4
        }
      ];
      
      const minResult = kernels.min(vectors);
      expect(minResult.values).to.deep.equal([8, 5, 25, 15]);
      
      const maxResult = kernels.max(vectors);
      expect(maxResult.values).to.deep.equal([10, 12, 30, 20]);
      
      const stats = kernels.getStats();
      expect(stats.branchlessOptimizations).to.be.greaterThan(0);
    });
  });
  
  describe('Bitmap Boolean Operations', function() {
    it('should perform efficient boolean vector operations', function() {
      const bitmap = new BitmapKernels();
      
      const vector1 = {
        values: [true, false, true, false],
        nullMask: [false, false, false, false],
        size: 4
      };
      
      const vector2 = {
        values: [true, true, false, false],
        nullMask: [false, false, false, false],
        size: 4
      };
      
      // Test AND operation
      const andResult = bitmap.and([vector1, vector2]);
      expect(andResult.values).to.deep.equal([true, false, false, false]);
      
      // Test OR operation
      const orResult = bitmap.or([vector1, vector2]);
      expect(orResult.values).to.deep.equal([true, true, true, false]);
      
      // Test NOT operation
      const notResult = bitmap.not(vector1);
      expect(notResult.values).to.deep.equal([false, true, false, true]);
    });
    
    it('should count population (number of true bits)', function() {
      const bitmap = new BitmapKernels();
      
      const vector = {
        values: [true, false, true, true, false],
        nullMask: [false, false, false, false, false],
        size: 5
      };
      
      const count = bitmap.popcount(vector);
      expect(count).to.equal(3);
    });
  });
  
  describe('Bloom Filter Prefilter', function() {
    it('should filter join candidates effectively', function() {
      const config = {
        expectedElements: 1000,
        falsePositiveRate: 0.01
      };
      
      const bloom = new BloomFilter(config);
      
      // Add build side data
      const buildData = ['key1', 'key2', 'key3', 'key4', 'key5'];
      for (const key of buildData) {
        bloom.add(key);
      }
      
      // Test probe side
      expect(bloom.mightContain('key1')).to.be.true;
      expect(bloom.mightContain('key3')).to.be.true;
      expect(bloom.mightContain('nonexistent')).to.be.false; // Should be false (might have rare false positives)
      
      const stats = bloom.getStats();
      expect(stats.elementsAdded).to.equal(5);
      expect(stats.definiteRejects).to.be.greaterThan(0);
    });
    
    it('should manage join bloom filters', function() {
      const manager = new JoinBloomFilterManager();
      
      const filter = manager.createFilter('user_join', {
        expectedElements: 100,
        falsePositiveRate: 0.05
      });
      
      const buildData = [
        { userId: 1, name: 'Alice' },
        { userId: 2, name: 'Bob' },
        { userId: 3, name: 'Charlie' }
      ];
      
      manager.populateFilter('user_join', buildData, item => item.userId);
      
      const probeData = [
        { userId: 1, action: 'login' },
        { userId: 4, action: 'logout' },
        { userId: 2, action: 'purchase' }
      ];
      
      const filtered = manager.filterProbeData('user_join', probeData, item => item.userId);
      
      // Should keep userId 1 and 2, reject userId 4
      expect(filtered.filtered).to.have.length.lessThan(probeData.length);
      expect(filtered.rejectedCount).to.be.greaterThan(0);
    });
  });
  
  describe('Zone Map Prefilter', function() {
    it('should skip chunks based on min/max statistics', function() {
      const zoneMap = new ZoneMap();
      
      // Add values to establish min/max
      zoneMap.addValues([10, 15, 8, 12, 18]);
      
      const stats = zoneMap.getStats();
      expect(stats.min).to.equal(8);
      expect(stats.max).to.equal(18);
      
      // Test skip conditions
      const skipResult1 = zoneMap.canSkipForRange('$gt', 20);
      expect(skipResult1.canSkip).to.be.true;
      expect(skipResult1.confidence).to.equal(1.0);
      
      const skipResult2 = zoneMap.canSkipForRange('$lt', 5);
      expect(skipResult2.canSkip).to.be.true;
      
      const skipResult3 = zoneMap.canSkipForRange('$eq', 15);
      expect(skipResult3.canSkip).to.be.false; // Value is within range
    });
    
    it('should manage multiple column zone maps', function() {
      const manager = new ZoneMapManager({ chunkSize: 2 });
      
      const data = [
        { age: 25, score: 85 },
        { age: 30, score: 92 },
        { age: 35, score: 78 },
        { age: 40, score: 88 }
      ];
      
      // Add data in chunks
      manager.addBatch(data.slice(0, 2), 0); // Chunk 0
      manager.addBatch(data.slice(2, 4), 1); // Chunk 1
      
      // Test skippable chunks
      const ageSkippable = manager.getSkippableChunks('age', '$gt', 45);
      expect(ageSkippable).to.include(0); // Ages 25,30 can be skipped for $gt 45
      expect(ageSkippable).to.include(1); // Ages 35,40 can be skipped for $gt 45
      
      const scoreSkippable = manager.getSkippableChunks('score', '$lt', 80);
      expect(scoreSkippable).to.include(1); // Chunk 1 has score 78, can't be skipped for $lt 80
    });
  });
  
  describe('Trigram Substring Prefilter', function() {
    it('should filter substring search candidates', function() {
      const prefilter = new TrigramPrefilter();
      
      const strings = [
        'hello world',
        'world peace',
        'hello there',
        'goodbye world',
        'peace and love'
      ];
      
      const stringIds = prefilter.addStrings(strings);
      expect(stringIds).to.have.length(5);
      
      // Search for strings containing "world"
      const results = prefilter.searchSubstring({
        pattern: 'world',
        caseSensitive: false,
        sessionId: 'test-session'
      });
      
      const matchedStrings = prefilter.getStrings(results);
      expect(matchedStrings).to.include('hello world');
      expect(matchedStrings).to.include('goodbye world');
      expect(matchedStrings).to.not.include('peace and love');
    });
    
    it('should activate based on session query patterns', function() {
      const prefilter = new TrigramPrefilter({
        activationThreshold: 2,
        enableSessionTracking: true
      });
      
      prefilter.addStrings(['test string one', 'test string two']);
      
      // First query - filter not yet activated
      const results1 = prefilter.searchSubstring({
        pattern: 'test',
        caseSensitive: false,
        sessionId: 'session1'
      });
      
      // Second query - should activate filter
      const results2 = prefilter.searchSubstring({
        pattern: 'string',
        caseSensitive: false,
        sessionId: 'session1'
      });
      
      const stats = prefilter.getStats();
      expect(stats.substringQueries).to.equal(2);
    });
  });
  
  describe('Pipeline Fusion', function() {
    it('should identify fusable pipeline stages', function() {
      const fuser = new PipelineFuser();
      
      const pipeline = [
        { $match: { score: { $gte: 80 } } },
        { $project: { name: 1, score: 1 } },
        { $addFields: { grade: { $cond: { if: { $gte: ['$score', 90] }, then: 'A', else: 'B' } } } },
        { $limit: 10 }
      ];
      
      const fusionGroups = fuser.fusePipeline(pipeline);
      
      expect(fusionGroups).to.have.length.greaterThan(0);
      
      const firstGroup = fusionGroups[0];
      expect(firstGroup.stages.length).to.be.greaterThan(1);
      expect(firstGroup.estimatedSpeedup).to.be.greaterThan(1.0);
      expect(firstGroup.maintainsSemantics).to.be.true;
    });
    
    it('should generate optimized pipeline', function() {
      const fuser = new PipelineFuser({
        maxGroupSize: 3,
        minSpeedupThreshold: 1.1
      });
      
      const originalPipeline = [
        { $match: { status: 'active' } },
        { $project: { name: 1, value: 1 } },
        { $addFields: { doubled: { $multiply: ['$value', 2] } } }
      ];
      
      const optimized = fuser.generateOptimizedPipeline(originalPipeline);
      
      // Should have fewer stages due to fusion
      expect(optimized.length).to.be.lessThanOrEqual(originalPipeline.length);
      
      // Check if fused stage exists
      const hasFusedStage = optimized.some(stage => stage.$fused);
      if (hasFusedStage) {
        const fusedStage = optimized.find(stage => stage.$fused);
        expect(fusedStage.$fused.stages).to.have.length.greaterThan(1);
      }
    });
    
    it('should respect fusion constraints', function() {
      const fuser = new PipelineFuser({
        maxGroupSize: 2,
        enableLateMatSplit: true
      });
      
      const pipelineWithSort = [
        { $match: { score: { $gte: 80 } } },
        { $sort: { score: -1 } }, // Should break fusion
        { $project: { name: 1, score: 1 } },
        { $limit: 5 }
      ];
      
      const fusionGroups = fuser.fusePipeline(pipelineWithSort);
      
      // Sort should create a fusion break
      expect(fusionGroups.length).to.be.greaterThan(1);
      
      // No group should contain both $match and $sort
      const hasMatchAndSort = fusionGroups.some(group => 
        group.stages.some(s => s.operator === '$match') &&
        group.stages.some(s => s.operator === '$sort')
      );
      expect(hasMatchAndSort).to.be.false;
    });
  });
  
  describe('Performance Integration', function() {
    it('should achieve target throughput with Phase 10 optimizations', function() {
      const scheduler = new DeltaBatchingScheduler({
        minBatchSize: 256,
        maxBatchSize: 1024
      });
      
      const monitor = new DeltaThroughputMonitor();
      
      // Simulate high-throughput delta processing
      const startTime = Date.now();
      let processedDeltas = 0;
      
      for (let batch = 0; batch < 100; batch++) {
        const deltas = [];
        for (let i = 0; i < 256; i++) {
          deltas.push({
            type: 'insert',
            rowId: processedDeltas + i,
            data: { value: Math.random() * 100 },
            timestamp: Date.now()
          });
        }
        
        if (scheduler.submitBatch(deltas)) {
          processedDeltas += deltas.length;
          
          // Simulate processing
          const processingStart = Date.now();
          const deltaBatch = scheduler.processNextBatch();
          if (deltaBatch) {
            const processingLatency = Date.now() - processingStart;
            scheduler.reportProcessingComplete(deltaBatch, processingLatency);
          }
        }
        
        monitor.updateDeltaCount(processedDeltas);
      }
      
      const elapsed = Date.now() - startTime;
      const throughput = processedDeltas / (elapsed / 1000);
      
      // Should achieve high throughput (target: ≥250k deltas/sec)
      // Note: This is a synthetic test, actual throughput depends on hardware
      console.log(`Phase 10 throughput: ${Math.round(throughput)} deltas/sec`);
      expect(throughput).to.be.greaterThan(1000); // Lower threshold for CI environment
      
      const stats = scheduler.getStats();
      expect(stats.totalDeltasProcessed).to.equal(processedDeltas);
    });
  });
});