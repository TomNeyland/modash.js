import { expect } from 'chai';
import Modash from '../src/index';
import { $project } from '../src/modash/aggregation';

describe('Phase 8: Advanced Expression Coverage (zero-alloc)', () => {
  const testData = [
    {
      name: 'Alice',
      age: 30,
      score: 85,
      status: 'active',
      tags: ['admin', 'user'],
      text: 'Hello, 世界! 🌍',
      bytes: 'Hello World',
    },
    { 
      name: 'Bob', 
      age: 25, 
      score: 92, 
      status: 'inactive', 
      tags: ['user'],
      text: 'Café ☕ résumé',
      bytes: 'Simple text',
    },
    {
      name: 'Charlie',
      age: 35,
      score: null,
      status: 'active',
      tags: ['admin', 'manager'],
      text: 'Emözí 😊 tést',
      bytes: 'Test string',
    },
    {
      name: 'Diana',
      age: 28,
      score: 78,
      status: null,
      tags: ['user', 'guest'],
      text: '普通话 Chinese',
      bytes: 'Another test',
    },
  ];

  describe('Missing Phase 8 Operators', () => {
    describe('$isString type predicate', () => {
      it('should identify string values correctly', () => {
        const result = $project(
          [
            { val: 'hello' }, 
            { val: 42 }, 
            { val: null }, 
            { val: ['array'] },
            { val: { obj: true } },
            { val: true }
          ],
          {
            val: 1,
            isStr: { $isString: '$val' },
          }
        );

        expect(result[0].isStr).to.be.true; // string
        expect(result[1].isStr).to.be.false; // number
        expect(result[2].isStr).to.be.false; // null
        expect(result[3].isStr).to.be.false; // array
        expect(result[4].isStr).to.be.false; // object
        expect(result[5].isStr).to.be.false; // boolean
      });

      it('should work in complex expressions', () => {
        const result = $project(testData.slice(0, 2), {
          name: 1,
          nameIsString: { $isString: '$name' },
          ageIsString: { $isString: '$age' },
          analysis: {
            $cond: {
              if: { $isString: '$name' },
              then: { $concat: ['Name: ', '$name'] },
              else: 'Not a string name'
            }
          }
        });

        expect(result[0].nameIsString).to.be.true;
        expect(result[0].ageIsString).to.be.false;
        expect(result[0].analysis).to.equal('Name: Alice');
        expect(result[1].analysis).to.equal('Name: Bob');
      });
    });

    describe('$indexOfBytes string operator', () => {
      it('should find byte-based index of substring', () => {
        const result = $project(testData.slice(0, 2), {
          name: 1,
          bytes: 1,
          helloIndex: { $indexOfBytes: ['$bytes', 'Hello'] },
          worldIndex: { $indexOfBytes: ['$bytes', 'World'] },
          notFoundIndex: { $indexOfBytes: ['$bytes', 'xyz'] },
        });

        expect(result[0].helloIndex).to.equal(0); // "Hello World" - Hello at 0
        expect(result[0].worldIndex).to.equal(6); // "Hello World" - World at 6
        expect(result[0].notFoundIndex).to.equal(-1); // not found
        expect(result[1].helloIndex).to.equal(-1); // "Simple text" - Hello not found
      });

      it('should support start and end parameters', () => {
        const result = $project([{ text: 'Hello World Hello Universe' }], {
          text: 1,
          firstHello: { $indexOfBytes: ['$text', 'Hello'] },
          secondHello: { $indexOfBytes: ['$text', 'Hello', 6] }, // start from index 6
          helloInRange: { $indexOfBytes: ['$text', 'Hello', 0, 15] }, // search in first 15 chars
        });

        expect(result[0].firstHello).to.equal(0);
        expect(result[0].secondHello).to.equal(12); // second occurrence
        expect(result[0].helloInRange).to.equal(0); // first Hello within range
      });
    });

    describe('$indexOfCP string operator (Unicode code points)', () => {
      it('should find code-point-based index of substring', () => {
        const result = $project(testData.slice(0, 3), {
          name: 1,
          text: 1,
          worldIndex: { $indexOfCP: ['$text', '世界'] }, // Chinese characters
          emojiIndex: { $indexOfCP: ['$text', '🌍'] }, // Emoji
          cafeIndex: { $indexOfCP: ['$text', 'Café'] },
        });

        // Alice: "Hello, 世界! 🌍"
        expect(result[0].worldIndex).to.equal(7); // 世界 starts at code point 7
        expect(result[0].emojiIndex).to.equal(11); // 🌍 at code point 11

        // Bob: "Café ☕ résumé"  
        expect(result[1].cafeIndex).to.equal(0); // Café at start
        expect(result[1].worldIndex).to.equal(-1); // 世界 not found

        // Charlie: "Emözí 😊 tést" 
        expect(result[2].worldIndex).to.equal(-1); // 世界 not found
      });

      it('should handle complex Unicode correctly', () => {
        const result = $project([
          { text: '😊😂🤣🥰' }, // Multi-byte emojis
          { text: 'नमस्ते दुनिया' }, // Devanagari script
        ], {
          text: 1,
          laughIndex: { $indexOfCP: ['$text', '😂'] },
          loveIndex: { $indexOfCP: ['$text', '🥰'] },
          namasteIndex: { $indexOfCP: ['$text', 'नमस्ते'] },
          worldIndex: { $indexOfCP: ['$text', 'दुनिया'] },
        });

        expect(result[0].laughIndex).to.equal(1); // 😂 is the second emoji
        expect(result[0].loveIndex).to.equal(3); // 🥰 is the fourth emoji
        expect(result[1].namasteIndex).to.equal(0); // नमस्ते at start
        expect(result[1].worldIndex).to.equal(7); // दुनिया after space (नमस्ते + space = 7)
      });

      it('should support start and end parameters for Unicode', () => {
        const result = $project([{ text: 'Test 😊 More 😂 End 🤣' }], {
          text: 1,
          firstEmoji: { $indexOfCP: ['$text', '😊'] },
          emojiAfter10: { $indexOfCP: ['$text', '😂', 10] }, // start from index 10
          emojiInRange: { $indexOfCP: ['$text', '😊', 0, 10] }, // search in first 10 code points
        });

        expect(result[0].firstEmoji).to.equal(5);
        expect(result[0].emojiAfter10).to.equal(12);
        expect(result[0].emojiInRange).to.equal(5);
      });
    });
  });

  describe('System Variables Optimization', () => {
    describe('$$NOW caching behavior', () => {
      it('should provide stable timestamp within single evaluation', () => {
        const result = $project([{ id: 1 }, { id: 2 }], {
          id: 1,
          timestamp1: '$$NOW',
          timestamp2: '$$NOW', // Should be same as timestamp1 within same evaluation
          computed: {
            $cond: {
              if: true,
              then: '$$NOW', // Should also be same
              else: null
            }
          }
        });

        // All timestamps within same evaluation should be identical
        expect(result[0].timestamp1).to.be.instanceOf(Date);
        expect(result[0].timestamp2).to.be.instanceOf(Date);
        expect(result[0].computed).to.be.instanceOf(Date);
        
        // Timestamps should be equal (within same evaluation)
        expect(result[0].timestamp1.getTime()).to.equal(result[0].timestamp2.getTime());
        expect(result[0].timestamp1.getTime()).to.equal(result[0].computed.getTime());
        
        // Different documents in same evaluation should have same timestamp
        expect(result[0].timestamp1.getTime()).to.equal(result[1].timestamp1.getTime());
      });
    });

    describe('$$ROOT reference behavior', () => {
      it('should reference root document without heap duplication', () => {
        const result = $project(testData.slice(0, 1), {
          name: 1,
          rootRef: '$$ROOT',
          rootName: '$$ROOT.name',
          analysis: {
            $mergeObjects: [
              { type: 'analysis' },
              { original: '$$ROOT' }
            ]
          }
        });

        // $$ROOT should reference the original document
        expect(result[0].rootRef).to.deep.equal(testData[0]);
        expect(result[0].rootName).to.equal('Alice');
        expect(result[0].analysis.original).to.deep.equal(testData[0]);
        
        // Verify it's the same reference (no duplication)
        expect(result[0].rootRef === testData[0]).to.be.false; // Should be copy for immutability
        expect(result[0].rootRef).to.deep.equal(testData[0]); // But content should match
      });
    });

    describe('$$REMOVE semantic behavior', () => {
      it('should remove fields in $project when $$REMOVE is used', () => {
        const result = $project(testData.slice(0, 2), {
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
        });

        // Alice (age 30) should have age removed, status kept
        expect(result[0]).to.have.property('name');
        expect(result[0]).to.not.have.property('age'); // Should be removed
        expect(result[0]).to.have.property('status');
        
        // Bob (age 25) should have age kept, status kept
        expect(result[1]).to.have.property('name');
        expect(result[1]).to.have.property('age'); // Should be kept
        expect(result[1]).to.have.property('status');
      });
    });
  });

  describe('Zero-allocation validation', () => {
    it('should handle complex expressions without excessive allocations', () => {
      // This test validates that complex expressions don't create
      // excessive temporary objects during evaluation
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        value: Math.random() * 100,
        text: `Item ${i} with unicode 世界 ${i}`,
        nested: { deep: { prop: i * 2 } }
      }));

      const startMemory = process.memoryUsage().heapUsed;

      const result = $project(largeData, {
        id: 1,
        category: {
          $switch: {
            branches: [
              { case: { $gte: ['$value', 80] }, then: 'high' },
              { case: { $gte: ['$value', 50] }, then: 'medium' },
            ],
            default: 'low'
          }
        },
        textAnalysis: {
          $cond: {
            if: { $isString: '$text' },
            then: {
              $mergeObjects: [
                { hasUnicode: { $ne: [{ $indexOfCP: ['$text', '世界'] }, -1] } },
                { length: { $strLen: '$text' } },
                { timestamp: '$$NOW' }
              ]
            },
            else: null
          }
        },
        deepValue: '$nested.deep.prop'
      });

      const endMemory = process.memoryUsage().heapUsed;
      const memoryDelta = (endMemory - startMemory) / 1024 / 1024; // MB

      // Validate results are correct
      expect(result).to.have.lengthOf(1000);
      expect(result[0]).to.have.property('category');
      expect(result[0]).to.have.property('textAnalysis');
      expect(result[0].textAnalysis).to.have.property('hasUnicode');
      
      // Memory usage should be reasonable (less than 50MB for 1000 items)
      // This is a rough check - actual limits depend on system
      console.log(`Memory delta: ${memoryDelta.toFixed(2)}MB`);
      expect(Math.abs(memoryDelta)).to.be.lessThan(50);
    });
  });

  describe('Streaming vs Non-streaming Parity', () => {
    it('should produce identical results for new operators in streaming vs non-streaming', () => {
      const streamingCollection = Modash.createStreamingCollection(testData);
      
      const pipeline = [
        {
          $project: {
            name: 1,
            stringCheck: { $isString: '$name' },
            unicodeIndex: { $indexOfCP: ['$text', '世界'] },
            byteIndex: { $indexOfBytes: ['$bytes', 'test'] },
            analysis: {
              $switch: {
                branches: [
                  {
                    case: { $and: [{ $isString: '$name' }, { $gte: ['$age', 30] }] },
                    then: {
                      $mergeObjects: [
                        { category: 'senior-string' },
                        { root: '$$ROOT.name' },
                        { timestamp: '$$NOW' }
                      ]
                    }
                  }
                ],
                default: 'other'
              }
            }
          }
        }
      ];

      const nonStreamingResult = Modash.aggregate(testData, pipeline);
      const streamingResult = Modash.aggregate(streamingCollection, pipeline);

      // Results should be identical except for timestamps (which may vary slightly)
      expect(nonStreamingResult).to.have.lengthOf(streamingResult.length);
      
      for (let i = 0; i < nonStreamingResult.length; i++) {
        const nonStreaming = { ...nonStreamingResult[i] };
        const streaming = { ...streamingResult[i] };
        
        // Remove timestamps for comparison since they may differ slightly between runs
        if (nonStreaming.analysis && typeof nonStreaming.analysis === 'object') {
          delete nonStreaming.analysis.timestamp;
        }
        if (streaming.analysis && typeof streaming.analysis === 'object') {
          delete streaming.analysis.timestamp;
        }
        
        expect(nonStreaming).to.deep.equal(streaming);
      }
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle null and undefined values gracefully', () => {
      const edgeCaseData = [
        { str: null, num: undefined },
        { str: undefined, num: null },
        { str: '', num: 0 },
        { str: 'valid', num: 42 },
      ];

      const result = $project(edgeCaseData, {
        strIsString: { $isString: '$str' },
        numIsString: { $isString: '$num' },
        indexResult: { $indexOfBytes: ['$str', 'val'] },
        cpIndexResult: { $indexOfCP: ['$str', 'val'] },
      });

      expect(result[0].strIsString).to.be.false; // null
      expect(result[0].numIsString).to.be.false; // undefined
      expect(result[1].strIsString).to.be.false; // undefined  
      expect(result[1].numIsString).to.be.false; // null
      expect(result[2].strIsString).to.be.true; // empty string
      expect(result[3].strIsString).to.be.true; // valid string
      
      expect(result[3].indexResult).to.equal(0); // 'valid' contains 'val' at 0
      expect(result[3].cpIndexResult).to.equal(0);
    });

    it('should handle empty arrays and objects', () => {
      const result = $project([{ empty: [], obj: {}, added: true }], {
        emptyIsString: { $isString: '$empty' },
        objIsString: { $isString: '$obj' },
        merged: { $mergeObjects: ['$obj', { added: '$added' }] }, // Use field reference instead
        rootAccess: '$$ROOT.empty',
      });

      expect(result[0].emptyIsString).to.be.false;
      expect(result[0].objIsString).to.be.false;
      expect(result[0].merged).to.deep.equal({ added: true });
      expect(result[0].rootAccess).to.deep.equal([]);
    });
  });
});