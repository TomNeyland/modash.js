/**
 * Phase 6: Enhanced APIs Tests
 */

import { expect } from 'chai';
import { explain, benchmark, fromJSONL } from '../src/index.js';
import { Readable } from 'stream';

describe('Phase 6: Enhanced APIs', function() {
  
  describe('explain() API', function() {
    
    it('should analyze a simple match pipeline', function() {
      const pipeline = [{ $match: { status: 'active' } }];
      const analysis = explain(pipeline);
      
      expect(analysis).to.have.property('stages');
      expect(analysis.stages).to.have.length(1);
      expect(analysis.stages[0]).to.include({
        operation: 'Document filtering',
        canUseIndexes: true,
        memoryImpact: 'low'
      });
      
      expect(analysis.hotPathEligible).to.be.true;
      expect(analysis.estimatedComplexity).to.equal('O(n)');
      expect(analysis.warnings).to.be.an('array');
    });

    it('should detect sort + limit fusion opportunity', function() {
      const pipeline = [
        { $match: { category: 'electronics' } },
        { $sort: { price: -1 } },
        { $limit: 10 }
      ];
      const analysis = explain(pipeline);
      
      expect(analysis.optimizations).to.have.length.greaterThan(0);
      const fusion = analysis.optimizations.find(opt => opt.type === 'fusion');
      expect(fusion).to.exist;
      expect(fusion.description).to.include('$sort + $limit');
      expect(fusion.description).to.include('$topK');
    });

    it('should detect complexity changes with sort operations', function() {
      const pipeline = [
        { $match: { active: true } },
        { $sort: { createdAt: -1 } }
      ];
      const analysis = explain(pipeline);
      
      expect(analysis.estimatedComplexity).to.equal('O(n log n)');
    });

    it('should provide warnings for long pipelines', function() {
      const pipeline = Array(6).fill({ $match: { field: 'value' } });
      const analysis = explain(pipeline);
      
      const hasLongPipelineWarning = analysis.warnings.some(warning => 
        warning.includes('Long pipeline')
      );
      expect(hasLongPipelineWarning).to.be.true;
    });

    it('should warn about missing early $match', function() {
      const pipeline = [
        { $project: { name: 1 } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ];
      const analysis = explain(pipeline);
      
      const hasEarlyMatchWarning = analysis.warnings.some(warning => 
        warning.includes('Consider adding $match')
      );
      expect(hasEarlyMatchWarning).to.be.true;
    });
  });

  describe('benchmark() API', function() {
    
    it('should benchmark a simple aggregation pipeline', async function() {
      const data = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        category: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C',
        value: Math.random() * 100
      }));
      
      const pipeline = [
        { $match: { value: { $gte: 50 } } },
        { $group: { _id: '$category', avgValue: { $avg: '$value' } } }
      ];
      
      const results = await benchmark(data, pipeline, { iterations: 3, warmupRuns: 1 });
      
      expect(results).to.have.property('duration');
      expect(results.duration.total).to.be.a('number').and.greaterThan(0);
      expect(results.duration.perDocument).to.be.a('number').and.greaterThan(0);
      
      expect(results).to.have.property('memory');
      expect(results.memory.peak).to.be.a('number');
      expect(results.memory.delta).to.be.a('number');
      expect(results.memory.efficiency).to.be.a('number').and.at.least(0).and.at.most(100);
      
      expect(results).to.have.property('throughput');
      expect(results.throughput.documentsPerSecond).to.be.a('number').and.greaterThan(0);
      
      expect(results).to.have.property('dataset');
      expect(results.dataset.inputDocuments).to.equal(100);
      expect(results.dataset.outputDocuments).to.be.greaterThan(0);
      expect(results.dataset.reductionRatio).to.be.a('number').and.at.most(1);
    });

    it('should provide stage-level performance metrics', async function() {
      const data = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Charlie', age: 35 }
      ];
      
      const pipeline = [
        { $match: { age: { $gte: 25 } } },
        { $project: { name: 1 } }
      ];
      
      const results = await benchmark(data, pipeline);
      
      expect(results.duration.perStage).to.have.length(2);
      expect(results.throughput.stageThroughput).to.have.length(2);
      
      // Each stage should have positive timing
      results.duration.perStage.forEach(timing => {
        expect(timing).to.be.a('number').and.greaterThan(0);
      });
    });
  });

  describe('fromJSONL() API', function() {
    
    it('should parse JSONL stream correctly', async function() {
      const jsonlData = `{"name": "Alice", "age": 30}
{"name": "Bob", "age": 25}
{"name": "Charlie", "age": 35}`;
      
      const stream = Readable.from([jsonlData]);
      const documents = [];
      
      for await (const doc of fromJSONL(stream)) {
        documents.push(doc);
      }
      
      expect(documents).to.have.length(3);
      expect(documents[0]).to.deep.equal({ name: 'Alice', age: 30 });
      expect(documents[1]).to.deep.equal({ name: 'Bob', age: 25 });
      expect(documents[2]).to.deep.equal({ name: 'Charlie', age: 35 });
    });

    it('should handle empty lines gracefully', async function() {
      const jsonlData = `{"name": "Alice", "age": 30}

{"name": "Bob", "age": 25}
  
{"name": "Charlie", "age": 35}`;
      
      const stream = Readable.from([jsonlData]);
      const documents = [];
      
      for await (const doc of fromJSONL(stream)) {
        documents.push(doc);
      }
      
      expect(documents).to.have.length(3);
    });

    it('should handle batch processing with onBatch callback', async function() {
      const jsonlData = Array.from({ length: 5 }, (_, i) => 
        `{"id": ${i}, "value": ${i * 10}}`
      ).join('\n');
      
      const stream = Readable.from([jsonlData]);
      const batches = [];
      const documents = [];
      
      for await (const doc of fromJSONL(stream, {
        batchSize: 2,
        onBatch: (batch, batchNumber) => {
          batches.push({ batch: [...batch], batchNumber });
        }
      })) {
        documents.push(doc);
      }
      
      expect(documents).to.have.length(5);
      expect(batches.length).to.be.greaterThan(1);
      
      // First batch should have 2 items
      expect(batches[0].batch).to.have.length(2);
      expect(batches[0].batchNumber).to.equal(0);
    });

    it('should skip invalid JSON lines by default', async function() {
      const jsonlData = `{"name": "Alice", "age": 30}
invalid json line
{"name": "Bob", "age": 25}`;
      
      const stream = Readable.from([jsonlData]);
      const documents = [];
      
      for await (const doc of fromJSONL(stream)) {
        documents.push(doc);
      }
      
      expect(documents).to.have.length(2);
      expect(documents[0]).to.deep.equal({ name: 'Alice', age: 30 });
      expect(documents[1]).to.deep.equal({ name: 'Bob', age: 25 });
    });

    it('should stop on error when errorStrategy is "stop"', async function() {
      const jsonlData = `{"name": "Alice", "age": 30}
invalid json line
{"name": "Bob", "age": 25}`;
      
      const stream = Readable.from([jsonlData]);
      
      try {
        const documents = [];
        for await (const doc of fromJSONL(stream, { errorStrategy: 'stop' })) {
          documents.push(doc);
        }
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to parse JSON line');
      }
    });
  });

  describe('Integration: Enhanced APIs with Core Functionality', function() {
    
    it('should use explain() results to optimize pipeline execution', function() {
      const pipeline = [
        { $match: { category: 'electronics' } },
        { $project: { name: 1, price: 1 } },
        { $sort: { price: -1 } },
        { $limit: 5 }
      ];
      
      const analysis = explain(pipeline);
      
      // Should detect sort + limit fusion opportunity
      const hasFusion = analysis.optimizations.some(opt => 
        opt.type === 'fusion' && opt.description.includes('$topK')
      );
      expect(hasFusion).to.be.true;
      
      // Should be hot path eligible due to early $match
      expect(analysis.hotPathEligible).to.be.true;
    });

    it('should benchmark different pipeline variations', async function() {
      const data = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        category: i % 2 === 0 ? 'A' : 'B',
        value: i
      }));
      
      // Pipeline without early filtering
      const inefficientPipeline = [
        { $project: { category: 1, value: 1 } },
        { $match: { category: 'A' } }
      ];
      
      // Pipeline with early filtering
      const efficientPipeline = [
        { $match: { category: 'A' } },
        { $project: { category: 1, value: 1 } }
      ];
      
      const [inefficientResults, efficientResults] = await Promise.all([
        benchmark(data, inefficientPipeline, { iterations: 2 }),
        benchmark(data, efficientPipeline, { iterations: 2 })
      ]);
      
      // Both should produce same reduction ratio
      expect(inefficientResults.dataset.reductionRatio).to.be.closeTo(
        efficientResults.dataset.reductionRatio, 0.01
      );
      
      // Both should have positive throughput
      expect(inefficientResults.throughput.documentsPerSecond).to.be.greaterThan(0);
      expect(efficientResults.throughput.documentsPerSecond).to.be.greaterThan(0);
    });
  });
});