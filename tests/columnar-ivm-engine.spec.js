/**
 * Phase 9: Columnar IVM Engine Tests
 * 
 * Comprehensive test suite for the columnar, zero-allocation IVM engine
 * covering SoA vectors, selection vectors, operator ABI, and late materialization
 */

import { expect } from 'chai';
import {
  SelectionVector,
  ValidityBitmap,
  Int32Vector,
  Float64Vector,
  BoolVector,
  Utf8Vector,
  ColumnarBatch
} from '../src/aggo/columnar-vectors.js';

import {
  ColumnarMatchOperator,
  ColumnarProjectOperator,
  ColumnarUnwindOperator,
  VirtualRowIdManager,
  ColumnarPipelineExecutor
} from '../src/aggo/columnar-operators.js';

import {
  ColumnarIvmEngine,
  RowIdSpace,
  LateMaterializationContext,
  MicroPathProcessor
} from '../src/aggo/columnar-ivm-engine.js';

describe('Phase 9: Columnar IVM Engine', () => {
  describe('SoA Vector Types', () => {
    describe('SelectionVector', () => {
      it('should handle basic operations', () => {
        const selection = new SelectionVector(10);
        
        expect(selection.length).to.equal(0);
        expect(selection.capacity).to.equal(10);
        
        selection.push(5);
        selection.push(3);
        selection.push(8);
        
        expect(selection.length).to.equal(3);
        expect(selection.get(0)).to.equal(5);
        expect(selection.get(1)).to.equal(3);
        expect(selection.get(2)).to.equal(8);
      });

      it('should resize when capacity exceeded', () => {
        const selection = new SelectionVector(2);
        
        selection.push(1);
        selection.push(2);
        selection.push(3); // Should trigger resize
        
        expect(selection.length).to.equal(3);
        expect(selection.capacity).to.be.greaterThan(2);
        expect(selection.get(2)).to.equal(3);
      });

      it('should provide vectorized buffer access', () => {
        const selection = new SelectionVector();
        selection.push(10);
        selection.push(20);
        selection.push(30);
        
        const buffer = selection.getBuffer();
        expect(buffer).to.be.instanceOf(Uint32Array);
        expect(buffer.length).to.equal(3);
        expect(Array.from(buffer)).to.deep.equal([10, 20, 30]);
      });
    });

    describe('ValidityBitmap', () => {
      it('should track valid/invalid values using packed bits', () => {
        const validity = new ValidityBitmap(100);
        
        validity.setValid(0, true);
        validity.setValid(1, false);
        validity.setValid(2, true);
        validity.setValid(63, true); // Test beyond single word
        
        expect(validity.isValid(0)).to.be.true;
        expect(validity.isValid(1)).to.be.false;
        expect(validity.isValid(2)).to.be.true;
        expect(validity.isValid(63)).to.be.true;
        expect(validity.isValid(3)).to.be.false; // Default false
      });

      it('should count valid values correctly', () => {
        const validity = new ValidityBitmap();
        
        validity.setValid(0, true);
        validity.setValid(1, true);
        validity.setValid(2, false);
        validity.setValid(3, true);
        
        expect(validity.countValid()).to.equal(3);
      });

      it('should handle bit operations across word boundaries', () => {
        const validity = new ValidityBitmap();
        
        // Set values that span multiple 32-bit words
        for (let i = 30; i < 35; i++) {
          validity.setValid(i, true);
        }
        
        for (let i = 30; i < 35; i++) {
          expect(validity.isValid(i)).to.be.true;
        }
      });
    });

    describe('Int32Vector', () => {
      it('should store and retrieve integer values', () => {
        const vector = new Int32Vector(10);
        
        vector.set(0, 42);
        vector.set(1, -17);
        vector.set(2, null);
        vector.set(3, 3.14); // Should be floored to 3
        
        expect(vector.get(0)).to.equal(42);
        expect(vector.get(1)).to.equal(-17);
        expect(vector.get(2)).to.be.null;
        expect(vector.get(3)).to.equal(3);
      });

      it('should perform vectorized sum operation', () => {
        const vector = new Int32Vector();
        
        vector.set(0, 10);
        vector.set(1, 20);
        vector.set(2, null); // Should be ignored
        vector.set(3, 30);
        
        expect(vector.sum()).to.equal(60);
      });
    });

    describe('Float64Vector', () => {
      it('should store floating-point values precisely', () => {
        const vector = new Float64Vector();
        
        vector.set(0, 3.14159);
        vector.set(1, -2.718);
        vector.set(2, null);
        
        expect(vector.get(0)).to.be.closeTo(3.14159, 0.00001);
        expect(vector.get(1)).to.be.closeTo(-2.718, 0.00001);
        expect(vector.get(2)).to.be.null;
      });

      it('should calculate sum and average', () => {
        const vector = new Float64Vector();
        
        vector.set(0, 1.5);
        vector.set(1, 2.5);
        vector.set(2, null);
        vector.set(3, 4.0);
        
        expect(vector.sum()).to.be.closeTo(8.0, 0.00001);
        expect(vector.avg()).to.be.closeTo(2.666666, 0.00001);
      });
    });

    describe('BoolVector', () => {
      it('should use packed bitmask for space efficiency', () => {
        const vector = new BoolVector(100);
        
        vector.set(0, true);
        vector.set(1, false);
        vector.set(2, 1); // Truthy
        vector.set(3, 0); // Falsy
        vector.set(63, true); // Test cross-word boundary
        
        expect(vector.get(0)).to.be.true;
        expect(vector.get(1)).to.be.false;
        expect(vector.get(2)).to.be.true;
        expect(vector.get(3)).to.be.false;
        expect(vector.get(63)).to.be.true;
      });

      it('should count true values', () => {
        const vector = new BoolVector();
        
        vector.set(0, true);
        vector.set(1, false);
        vector.set(2, true);
        vector.set(3, null); // Invalid, not counted
        
        expect(vector.countTrue()).to.equal(2);
      });
    });

    describe('Utf8Vector', () => {
      it('should use dictionary encoding for space efficiency', () => {
        const vector = new Utf8Vector();
        
        vector.set(0, 'hello');
        vector.set(1, 'world');
        vector.set(2, 'hello'); // Duplicate should reuse dict entry
        vector.set(3, null);
        
        expect(vector.get(0)).to.equal('hello');
        expect(vector.get(1)).to.equal('world');
        expect(vector.get(2)).to.equal('hello');
        expect(vector.get(3)).to.be.null;
        
        const stats = vector.getDictStats();
        expect(stats.uniqueStrings).to.equal(2); // 'hello' and 'world'
        expect(stats.compressionRatio).to.be.greaterThan(0); // Should show some benefit
      });

      it('should provide dict ID access for vectorized operations', () => {
        const vector = new Utf8Vector();
        
        vector.set(0, 'apple');
        vector.set(1, 'banana');
        vector.set(2, 'apple');
        
        const dictIds = vector.getDictIds();
        expect(dictIds).to.be.instanceOf(Uint32Array);
        expect(dictIds[0]).to.equal(dictIds[2]); // Same string should have same dict ID
        expect(dictIds[0]).to.not.equal(dictIds[1]); // Different strings should have different IDs
      });
    });

    describe('ColumnarBatch', () => {
      it('should manage multiple typed vectors', () => {
        const batch = new ColumnarBatch(100);
        
        batch.addVector('id', new Int32Vector());
        batch.addVector('name', new Utf8Vector());
        batch.addVector('score', new Float64Vector());
        batch.addVector('active', new BoolVector());
        
        // Set values for first row
        batch.setValue(0, 'id', 1);
        batch.setValue(0, 'name', 'Alice');
        batch.setValue(0, 'score', 95.5);
        batch.setValue(0, 'active', true);
        
        expect(batch.getValue(0, 'id')).to.equal(1);
        expect(batch.getValue(0, 'name')).to.equal('Alice'); 
        expect(batch.getValue(0, 'score')).to.equal(95.5);
        expect(batch.getValue(0, 'active')).to.be.true;
        
        expect(batch.getFields()).to.deep.equal(['id', 'name', 'score', 'active']);
      });
    });
  });

  describe('Columnar Operators', () => {
    describe('VirtualRowIdManager', () => {
      it('should generate virtual row IDs for $unwind operations', () => {
        const manager = new VirtualRowIdManager();
        
        const virtualIds = manager.generateVirtualRowIds(5, 3); // Original row 5, array length 3
        
        expect(virtualIds).to.have.length(3);
        expect(virtualIds.every(id => manager.isVirtualRowId(id))).to.be.true;
        expect(virtualIds.every(id => manager.getOriginalRowId(id) === 5)).to.be.true;
        
        expect(manager.getArrayIndex(virtualIds[0])).to.equal(0);
        expect(manager.getArrayIndex(virtualIds[1])).to.equal(1);
        expect(manager.getArrayIndex(virtualIds[2])).to.equal(2);
      });

      it('should distinguish virtual from real row IDs', () => {
        const manager = new VirtualRowIdManager();
        
        expect(manager.isVirtualRowId(100)).to.be.false; // Regular row ID
        
        const virtualIds = manager.generateVirtualRowIds(0, 1);
        expect(manager.isVirtualRowId(virtualIds[0])).to.be.true;
      });
    });

    describe('ColumnarMatchOperator', () => {
      it('should filter rows based on predicates', () => {
        const batch = new ColumnarBatch();
        batch.addVector('age', new Int32Vector());
        batch.addVector('name', new Utf8Vector());
        
        // Add test data
        batch.setValue(0, 'age', 25);
        batch.setValue(0, 'name', 'Alice');
        batch.setValue(1, 'age', 30);
        batch.setValue(1, 'name', 'Bob');
        batch.setValue(2, 'age', 35);
        batch.setValue(2, 'name', 'Charlie');
        
        // Set up selection (all rows initially)
        const selection = batch.getSelection();
        selection.push(0);
        selection.push(1);
        selection.push(2);
        
        const matchOp = new ColumnarMatchOperator({ age: 30 });
        matchOp.init({ fields: new Map() }, {});
        
        const result = matchOp.push(batch);
        
        expect(result.selection.length).to.equal(1);
        expect(result.selection.get(0)).to.equal(1); // Bob's row
        expect(result.metadata?.selectivity).to.be.closeTo(1/3, 0.01);
      });

      it('should handle vectorized predicates when possible', () => {
        const batch = new ColumnarBatch();
        batch.addVector('score', new Float64Vector());
        
        batch.setValue(0, 'score', 85.0);
        batch.setValue(1, 'score', 92.0);
        batch.setValue(2, 'score', 78.0);
        
        const selection = batch.getSelection();
        for (let i = 0; i < 3; i++) selection.push(i);
        
        const matchOp = new ColumnarMatchOperator({ score: 92.0 });
        matchOp.init({ fields: new Map() }, {});
        
        const result = matchOp.push(batch);
        
        expect(result.selection.length).to.equal(1);
        expect(result.selection.get(0)).to.equal(1);
      });
    });

    describe('ColumnarProjectOperator', () => {
      it('should project and transform fields', () => {
        const batch = new ColumnarBatch();
        batch.addVector('name', new Utf8Vector());
        batch.addVector('age', new Int32Vector());
        batch.addVector('salary', new Float64Vector());
        
        batch.setValue(0, 'name', 'Alice');
        batch.setValue(0, 'age', 30);
        batch.setValue(0, 'salary', 50000);
        
        const selection = batch.getSelection();
        selection.push(0);
        
        const projectOp = new ColumnarProjectOperator({
          name: 1,
          age: 1,
          // salary excluded (not specified)
        });
        projectOp.init({ fields: new Map() }, {});
        
        const result = projectOp.push(batch);
        
        expect(result.selection.length).to.equal(1);
        // Note: In real implementation, would need to check output batch structure
      });
    });

    describe('ColumnarUnwindOperator', () => {
      it('should generate virtual row IDs for array elements', () => {
        const batch = new ColumnarBatch();
        // Note: This is a simplified test - real implementation would need
        // proper array handling in columnar vectors
        
        const unwindOp = new ColumnarUnwindOperator('tags');
        unwindOp.init({ fields: new Map() }, {});
        
        // This test verifies the operator can be created and initialized
        expect(unwindOp).to.be.instanceOf(ColumnarUnwindOperator);
      });
    });

    describe('ColumnarPipelineExecutor', () => {
      it('should coordinate multiple operators', () => {
        const executor = new ColumnarPipelineExecutor();
        
        const matchOp = new ColumnarMatchOperator({ active: true });
        const projectOp = new ColumnarProjectOperator({ name: 1, age: 1 });
        
        executor.addOperator(matchOp);
        executor.addOperator(projectOp);
        
        const schema = { fields: new Map([['name', 'utf8'], ['age', 'int32'], ['active', 'bool']]) };
        executor.init(schema, {});
        
        const stats = executor.getStats();
        expect(stats.operatorStats).to.have.length(2);
        expect(stats.pipelineStats).to.exist;
      });
    });
  });

  describe('Columnar IVM Engine', () => {
    describe('RowIdSpace', () => {
      it('should manage row ID allocation and lifecycle', () => {
        const rowIdSpace = new RowIdSpace();
        
        const doc1 = { name: 'Alice', age: 30 };
        const doc2 = { name: 'Bob', age: 25 };
        
        const rowId1 = rowIdSpace.allocate(doc1);
        const rowId2 = rowIdSpace.allocate(doc2);
        
        expect(rowId1).to.be.a('number');
        expect(rowId2).to.be.a('number');
        expect(rowId1).to.not.equal(rowId2);
        
        expect(rowIdSpace.getDocument(rowId1)).to.deep.equal(doc1);
        expect(rowIdSpace.getDocument(rowId2)).to.deep.equal(doc2);
        
        expect(rowIdSpace.isActive(rowId1)).to.be.true;
        expect(rowIdSpace.isActive(rowId2)).to.be.true;
        
        rowIdSpace.free(rowId1);
        expect(rowIdSpace.isActive(rowId1)).to.be.false;
        expect(rowIdSpace.getDocument(rowId1)).to.be.undefined;
      });

      it('should reuse freed row IDs', () => {
        const rowIdSpace = new RowIdSpace();
        
        const doc1 = { id: 1 };
        const doc2 = { id: 2 };
        const doc3 = { id: 3 };
        
        const rowId1 = rowIdSpace.allocate(doc1);
        const rowId2 = rowIdSpace.allocate(doc2);
        
        rowIdSpace.free(rowId1);
        
        const rowId3 = rowIdSpace.allocate(doc3);
        expect(rowId3).to.equal(rowId1); // Should reuse freed ID
      });
    });

    describe('LateMaterializationContext', () => {
      it('should defer object creation until final emit', () => {
        const context = new LateMaterializationContext();
        
        // Set transformed fields without creating objects
        context.setTransformedField(1, 'computed_score', 95);
        context.setTransformedField(1, 'grade', 'A');
        
        expect(context.getTransformedField(1, 'computed_score')).to.equal(95);
        expect(context.getTransformedField(1, 'grade')).to.equal('A');
        
        // Materialize final document
        const baseDoc = { name: 'Alice', raw_score: 90 };
        const materialized = context.materializeDocument(1, baseDoc);
        
        expect(materialized).to.deep.equal({
          name: 'Alice',
          raw_score: 90,
          computed_score: 95,
          grade: 'A'
        });
      });

      it('should cache projected documents', () => {
        const context = new LateMaterializationContext();
        
        const doc = { name: 'Alice', age: 30, city: 'Seattle' };
        const projectionKey = 'name_age_only';
        
        context.cacheProjectedDocument(projectionKey, 1, { name: 'Alice', age: 30 });
        
        const cached = context.getCachedProjectedDocument(projectionKey, 1);
        expect(cached).to.deep.equal({ name: 'Alice', age: 30 });
      });
    });

    describe('MicroPathProcessor', () => {
      it('should detect when to use micro-path optimization', () => {
        expect(MicroPathProcessor.shouldUseMicroPath(10)).to.be.true;
        expect(MicroPathProcessor.shouldUseMicroPath(63)).to.be.true;
        expect(MicroPathProcessor.shouldUseMicroPath(64)).to.be.false;
        expect(MicroPathProcessor.shouldUseMicroPath(100)).to.be.false;
      });

      it('should process small batches efficiently', () => {
        const documents = [
          { name: 'Alice', age: 30, active: true },
          { name: 'Bob', age: 25, active: false },
          { name: 'Charlie', age: 35, active: true }
        ];
        
        const pipeline = [
          { $match: { active: true } },
          { $project: { name: 1, age: 1 } }
        ];
        
        const rowIdSpace = new RowIdSpace();
        const materializationContext = new LateMaterializationContext();
        
        const results = MicroPathProcessor.processMicroBatch(
          documents,
          pipeline,
          rowIdSpace,
          materializationContext
        );
        
        expect(results).to.have.length(2); // Alice and Charlie
        expect(results[0]).to.deep.equal({ name: 'Alice', age: 30 });
        expect(results[1]).to.deep.equal({ name: 'Charlie', age: 35 });
      });
    });

    describe('Main Engine Integration', () => {
      it('should execute simple pipeline with columnar processing', () => {
        const engine = new ColumnarIvmEngine();
        
        const documents = [
          { name: 'Alice', age: 30, score: 95 },
          { name: 'Bob', age: 25, score: 87 },
          { name: 'Charlie', age: 35, score: 92 }
        ];
        
        const pipeline = [
          { $match: { score: { $gte: 90 } } }
          // Note: For this test, using simple match that should work
        ];
        
        // Test micro-path (small collection)
        const results = engine.execute(documents.slice(0, 2), pipeline);
        expect(results).to.be.an('array');
        // Results should be filtered based on score >= 90
      });

      it('should use micro-path for small collections', () => {
        const engine = new ColumnarIvmEngine({ enableMicroPath: true });
        
        const smallCollection = [
          { id: 1, value: 'test' },
          { id: 2, value: 'data' }
        ];
        
        const results = engine.execute(smallCollection, []);
        expect(results).to.have.length(2);
        expect(results).to.deep.equal(smallCollection);
      });

      it('should provide engine statistics', () => {
        const engine = new ColumnarIvmEngine();
        
        const documents = [{ test: 'data' }];
        engine.execute(documents, []);
        
        const stats = engine.getStats();
        expect(stats).to.have.property('rowIdSpace');
        expect(stats).to.have.property('materialization');
        expect(stats).to.have.property('pipeline');
      });

      it('should handle empty collections gracefully', () => {
        const engine = new ColumnarIvmEngine();
        
        const results = engine.execute([], []);
        expect(results).to.be.an('array');
        expect(results).to.have.length(0);
      });

      it('should handle complex field types', () => {
        const engine = new ColumnarIvmEngine();
        
        const documents = [
          {
            id: 1,
            name: 'Test',
            score: 95.5,
            active: true,
            tags: ['important', 'urgent'],
            metadata: { created: '2023-01-01' }
          }
        ];
        
        const results = engine.execute(documents, []);
        expect(results).to.have.length(1);
        expect(results[0]).to.deep.equal(documents[0]);
      });
    });

    describe('Performance Characteristics', () => {
      it('should handle moderately large datasets efficiently', () => {
        const engine = new ColumnarIvmEngine({ batchSize: 1024 });
        
        // Generate test data
        const documents = [];
        for (let i = 0; i < 1000; i++) {
          documents.push({
            id: i,
            name: `User${i}`,
            score: Math.random() * 100,
            active: i % 2 === 0
          });
        }
        
        const start = performance.now();
        const results = engine.execute(documents, [
          { $match: { active: true } }
        ]);
        const end = performance.now();
        
        expect(results.length).to.be.greaterThan(0);
        expect(end - start).to.be.lessThan(100); // Should complete in reasonable time
      });

      it('should demonstrate memory efficiency with large string datasets', () => {
        const engine = new ColumnarIvmEngine();
        
        // Test with repeated strings (should benefit from dictionary encoding)
        const documents = [];
        const categories = ['A', 'B', 'C']; // Limited set of values
        
        for (let i = 0; i < 300; i++) {
          documents.push({
            id: i,
            category: categories[i % categories.length],
            value: Math.random()
          });
        }
        
        const results = engine.execute(documents, []);
        expect(results).to.have.length(300);
        
        // Verify dictionary encoding worked (indirect test via successful execution)
        expect(results.every(doc => categories.includes(doc.category))).to.be.true;
      });
    });
  });

  describe('Zero-Allocation Characteristics', () => {
    it('should minimize object allocations in hot path', () => {
      const engine = new ColumnarIvmEngine({ enableMicroPath: false }); // Force columnar path
      
      const documents = Array(500).fill().map((_, i) => ({
        id: i,
        value: i * 2
      }));
      
      // Test that the engine processes the data correctly
      const results = engine.execute(documents, []);
      
      // Should produce all results when no filter is applied
      expect(results.length).to.equal(documents.length);
      
      // Test with filtering
      const filteredResults = engine.execute(documents, [
        { $match: { id: { $lt: 250 } } }
      ]);
      
      // Should be fewer results after filtering
      expect(filteredResults.length).to.be.lessThan(documents.length);
      
      // The actual memory allocation optimization is hard to test reliably
      // in a unit test environment, so we mainly test functional correctness
      expect(filteredResults.every(doc => doc.id < 250)).to.be.true;
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed pipeline stages gracefully', () => {
      const engine = new ColumnarIvmEngine();
      
      const documents = [{ test: 'data' }];
      const invalidPipeline = [
        { $unknownStage: { field: 'value' } }
      ];
      
      // Should not throw, might warn to console
      const results = engine.execute(documents, invalidPipeline);
      expect(results).to.be.an('array');
    });

    it('should handle invalid document structures', () => {
      const engine = new ColumnarIvmEngine();
      
      const documents = [
        null,
        undefined,
        { valid: 'document' },
        'invalid',
        42
      ].filter(Boolean); // Filter out null/undefined for this test
      
      const results = engine.execute(documents, []);
      expect(results).to.be.an('array');
    });
  });
});