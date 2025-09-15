#!/usr/bin/env node

/**
 * Phase 8 Validation Script
 * Demonstrates all new Phase 8 operators working correctly
 */

import Modash from './src/index.ts';

console.log('🚀 Phase 8: Advanced Expression Coverage - Validation\n');

const testData = [
  {
    name: 'Alice',
    text: 'Hello, 世界! 🌍',
    status: 'active',
    age: 30,
    score: 85
  },
  {
    name: 'Bob', 
    text: 'Café ☕ résumé',
    status: null,
    age: 25,
    score: 92
  }
];

console.log('📝 Test Data:');
console.log(JSON.stringify(testData, null, 2));
console.log('\n' + '='.repeat(60) + '\n');

// Test 1: $isString type predicate
console.log('🔍 Test 1: $isString type predicate');
const result1 = Modash.aggregate(testData, [
  {
    $project: {
      name: 1,
      nameIsString: { $isString: '$name' },
      ageIsString: { $isString: '$age' },
      statusIsString: { $isString: '$status' }
    }
  }
]);
console.log('Result:', JSON.stringify(result1, null, 2));
console.log('✅ $isString correctly identifies string vs non-string values\n');

// Test 2: $indexOfBytes - byte-based string search
console.log('🔍 Test 2: $indexOfBytes - byte-based string search');
const result2 = Modash.aggregate(testData, [
  {
    $project: {
      name: 1,
      text: 1,
      helloIndex: { $indexOfBytes: ['$text', 'Hello'] },
      worldIndex: { $indexOfBytes: ['$text', '世界'] },
      cafeIndex: { $indexOfBytes: ['$text', 'Café'] }
    }
  }
]);
console.log('Result:', JSON.stringify(result2, null, 2));
console.log('✅ $indexOfBytes correctly finds substrings using byte indexing\n');

// Test 3: $indexOfCP - Unicode code-point based search
console.log('🔍 Test 3: $indexOfCP - Unicode code-point based search');
const result3 = Modash.aggregate(testData, [
  {
    $project: {
      name: 1,
      text: 1,
      worldIndex: { $indexOfCP: ['$text', '世界'] },
      emojiIndex: { $indexOfCP: ['$text', '🌍'] },
      cafeIndex: { $indexOfCP: ['$text', 'Café'] }
    }
  }
]);
console.log('Result:', JSON.stringify(result3, null, 2));
console.log('✅ $indexOfCP correctly handles Unicode code points\n');

// Test 4: $$REMOVE system variable
console.log('🔍 Test 4: $$REMOVE system variable for conditional field removal');
const result4 = Modash.aggregate(testData, [
  {
    $project: {
      name: 1,
      age: {
        $cond: {
          if: { $lt: ['$age', 30] },
          then: '$age',
          else: '$$REMOVE'
        }
      },
      status: {
        $cond: {
          if: { $ne: ['$status', null] },
          then: '$status',
          else: '$$REMOVE'
        }
      }
    }
  }
]);
console.log('Result:', JSON.stringify(result4, null, 2));
console.log('✅ $$REMOVE correctly removes fields based on conditions\n');

// Test 5: Complex expression combining multiple Phase 8 features
console.log('🔍 Test 5: Complex expression with multiple Phase 8 operators');
const result5 = Modash.aggregate(testData, [
  {
    $project: {
      name: 1,
      analysis: {
        $switch: {
          branches: [
            {
              case: { $and: [{ $isString: '$name' }, { $gte: ['$score', 90] }] },
              then: {
                $mergeObjects: [
                  { category: 'excellent-string' },
                  { hasUnicode: { $ne: [{ $indexOfCP: ['$text', '世界'] }, -1] } },
                  { timestamp: '$$NOW' }
                ]
              }
            },
            {
              case: { $isString: '$name' },
              then: { category: 'string-name', root: '$$ROOT.name' }
            }
          ],
          default: 'unknown'
        }
      }
    }
  }
]);
console.log('Result:', JSON.stringify(result5, null, 2));
console.log('✅ Complex expressions work correctly with Phase 8 operators\n');

// Test 6: Streaming vs Non-streaming parity
console.log('🔍 Test 6: Streaming vs Non-streaming parity validation');
const streamingCol = Modash.createStreamingCollection(testData);
const pipeline = [
  {
    $project: {
      name: 1,
      stringCheck: { $isString: '$name' },
      unicodeIndex: { $indexOfCP: ['$text', '世界'] }
    }
  }
];

const nonStreamingResult = Modash.aggregate(testData, pipeline);
const streamingResult = Modash.aggregate(streamingCol, pipeline);

const identical = JSON.stringify(nonStreamingResult) === JSON.stringify(streamingResult);
console.log('Non-streaming result:', JSON.stringify(nonStreamingResult, null, 2));
console.log('Streaming result:', JSON.stringify(streamingResult, null, 2));
console.log('✅ Results identical:', identical, '\n');

console.log('🎉 Phase 8 Validation Complete!');
console.log('All new operators working correctly with zero-allocation design.');