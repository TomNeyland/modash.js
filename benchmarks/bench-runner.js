#!/usr/bin/env node
/**
 * Main benchmark runner for modash.js performance testing
 * Supports running operator micro-benchmarks, pipeline benchmarks, and delta tests
 */

import { runOperatorBenchmarks } from './operators.js';
import { runDeltaBenchmarks } from './delta-batching.js';
import { runPipelineBenchmarks } from './pipelines.js';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0] || 'all';

async function main() {
  console.log('🚀 Modash.js Performance Benchmark Suite');
  console.log('==========================================\n');
  
  const startTime = performance.now();
  let success = true;
  
  try {
    switch (command) {
      case 'operators':
        console.log('Running operator micro-benchmarks only...\n');
        await runOperatorBenchmarks();
        break;
        
      case 'pipelines':
        console.log('Running pipeline benchmarks only...\n');
        const pipelineResult = await runPipelineBenchmarks();
        success = pipelineResult.success;
        break;
        
      case 'delta':
        console.log('Running delta batching benchmarks only...\n');
        await runDeltaBenchmarks();
        break;
        
      case 'all':
        console.log('Running comprehensive benchmark suite...\n');
        
        console.log('Phase 1: Operator Micro-benchmarks');
        await runOperatorBenchmarks();
        console.log('\n' + '='.repeat(80) + '\n');
        
        console.log('Phase 2: Pipeline Benchmarks');
        const result = await runPipelineBenchmarks();
        success = result.success;
        console.log('\n' + '='.repeat(80) + '\n');
        
        console.log('Phase 3: Delta Batching Benchmarks');
        await runDeltaBenchmarks();
        break;
        
      default:
        console.error(`Unknown command: ${command}`);
        console.error('Usage: npm run bench [operators|pipelines|delta|all]');
        process.exit(1);
    }
    
    const endTime = performance.now();
    const totalDuration = (endTime - startTime) / 1000;
    
    console.log('\n' + '='.repeat(80));
    console.log('🏁 Benchmark Suite Completed');
    console.log(`   Total Duration: ${totalDuration.toFixed(2)} seconds`);
    
    if (success) {
      console.log('   Result: ✅ All performance targets met');
      process.exit(0);
    } else {
      console.log('   Result: ❌ Performance targets not met');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Benchmark suite failed:', error);
    process.exit(1);
  }
}

// Handle process signals gracefully
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Benchmark suite interrupted');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n\n⏹️  Benchmark suite terminated');
  process.exit(143);
});

// Run the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});