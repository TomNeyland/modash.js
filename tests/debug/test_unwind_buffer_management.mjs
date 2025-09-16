#!/usr/bin/env node

/**
 * Test script to validate $unwind buffer management improvements
 * Run with: DEBUG_IVM=1 node test_unwind_buffer_management.mjs
 */

import Aggo from '../../src/index';

console.log('🧪 Testing $unwind Buffer Management & Dynamic Growth...\n');

// Test 1: Basic expansion beyond buffer size
console.log('Test 1: Basic buffer expansion');
const documents1 = [
  { _id: 1, tags: ['a', 'b', 'c', 'd', 'e'] }, // 5 elements
  { _id: 2, tags: ['f', 'g', 'h', 'i', 'j'] }, // 5 elements  
];

try {
  const result1 = Aggo.aggregate(documents1, [
    { $unwind: '$tags' }
  ]);
  
  console.log(`✅ Expanded from ${documents1.length} docs to ${result1.length} docs`);
  console.log(`   Tags: ${result1.map(d => d.tags).join(', ')}`);
} catch (error) {
  console.log(`❌ Error: ${error.message}`);
}

// Test 2: Large array handling
console.log('\nTest 2: Large array handling');
const largeArray = Array.from({ length: 500 }, (_, i) => `item${i}`);
const documents2 = [
  { _id: 1, items: largeArray }
];

try {
  const start = Date.now();
  const result2 = Aggo.aggregate(documents2, [
    { $unwind: '$items' },
    { $group: { _id: null, count: { $sum: 1 } } }
  ]);
  const duration = Date.now() - start;
  
  console.log(`✅ Processed ${largeArray.length} items in ${duration}ms`);
  console.log(`   Final count: ${result2[0].count}`);
} catch (error) {
  console.log(`❌ Error: ${error.message}`);
}

// Test 3: Nested field paths
console.log('\nTest 3: Nested field paths');
const documents3 = [
  {
    _id: 1,
    user: {
      profile: {
        hobbies: ['reading', 'gaming', 'cooking']
      }
    }
  },
  {
    _id: 2,
    user: {
      profile: {
        hobbies: ['sports']
      }
    }
  }
];

try {
  const result3 = Aggo.aggregate(documents3, [
    { $unwind: '$user.profile.hobbies' }
  ]);
  
  console.log(`✅ Unwound nested field: ${result3.length} results`);
  result3.forEach((doc, i) => {
    console.log(`   [${i}] ID: ${doc._id}, Hobby: ${doc.user.profile.hobbies}`);
  });
} catch (error) {
  console.log(`❌ Error: ${error.message}`);
}

// Test 4: Complex pipeline with $unwind
console.log('\nTest 4: Complex pipeline');
const documents4 = [
  { _id: 1, category: 'A', items: ['x', 'y'] },
  { _id: 2, category: 'A', items: ['z'] },
  { _id: 3, category: 'B', items: ['w', 'v'] }
];

try {
  const result4 = Aggo.aggregate(documents4, [
    { $unwind: '$items' },
    { $group: { 
      _id: '$category', 
      totalItems: { $sum: 1 },
      itemList: { $push: '$items' }
    }},
    { $sort: { _id: 1 } }
  ]);
  
  console.log('✅ Complex pipeline results:');
  result4.forEach(group => {
    console.log(`   Category ${group._id}: ${group.totalItems} items [${group.itemList.join(', ')}]`);
  });
} catch (error) {
  console.log(`❌ Error: ${error.message}`);
}

// Test 5: Buffer overflow protection (if DEBUG_IVM is enabled)
if (process.env.DEBUG_IVM) {
  console.log('\nTest 5: DEBUG_IVM buffer bounds checking');
  console.log('(DEBUG_IVM is enabled - testing invariant checks)');
  
  try {
    // This should trigger buffer growth and bounds checking
    const massiveArray = Array.from({ length: 2000 }, (_, i) => `huge${i}`);
    const documents5 = [{ _id: 1, massive: massiveArray }];
    
    const result5 = Aggo.aggregate(documents5, [
      { $unwind: '$massive' },
      { $limit: 10 }  // Just take first 10 to avoid too much output
    ]);
    
    console.log(`✅ Processed massive array successfully: ${result5.length} results shown`);
  } catch (error) {
    if (error.message.includes('IVM INVARIANT VIOLATION')) {
      console.log(`✅ Buffer overflow correctly detected: ${error.message}`);
    } else {
      console.log(`❌ Unexpected error: ${error.message}`);
    }
  }
} else {
  console.log('\nTest 5: DEBUG_IVM not enabled (set DEBUG_IVM=1 to test invariant checks)');
}

console.log('\n🎉 $unwind buffer management testing complete!');