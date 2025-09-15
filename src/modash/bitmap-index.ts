/**
 * Bitmap Index Implementation for Membership-Heavy Filtering
 * Optimizes crossfilter-style filtering with set operations
 * Target: 2x+ speedup for multiple $match stages with $in operations
 */

export class BitmapIndex {
  private indices: Map<string, Map<any, Set<number>>> = new Map();
  private documentCount: number = 0;

  /**
   * Build bitmap indices for high-cardinality fields
   * Only builds indices for fields that appear in $in operations
   */
  build(data: any[], fieldsToIndex: string[]): void {
    this.documentCount = data.length;
    
    for (const field of fieldsToIndex) {
      const fieldIndex = new Map<any, Set<number>>();
      
      for (let i = 0; i < data.length; i++) {
        const value = this.getFieldValue(data[i], field);
        if (value !== undefined) {
          if (!fieldIndex.has(value)) {
            fieldIndex.set(value, new Set<number>());
          }
          fieldIndex.get(value)!.add(i);
        }
      }
      
      this.indices.set(field, fieldIndex);
    }
  }

  /**
   * Fast membership check using bitmap intersection
   * Returns set of document indices that match the condition
   */
  findMatches(field: string, values: any[]): Set<number> | null {
    const fieldIndex = this.indices.get(field);
    if (!fieldIndex) {
      return null; // No index available, fall back to stream mode
    }

    let result: Set<number> | null = null;
    
    for (const value of values) {
      const matches = fieldIndex.get(value);
      if (matches) {
        if (result === null) {
          result = new Set(matches);
        } else {
          // Union operation for $in semantics
          for (const match of matches) {
            result.add(match);
          }
        }
      }
    }

    return result || new Set<number>();
  }

  /**
   * Check if optimization is worthwhile for given pipeline
   * Only optimize if multiple $match stages with $in operations detected
   */
  static shouldOptimize(pipeline: any[]): { optimize: boolean; fieldsToIndex: string[] } {
    let matchCount = 0;
    const fieldsToIndex: string[] = [];

    for (const stage of pipeline) {
      if (stage.$match) {
        matchCount++;
        this.extractInFields(stage.$match, fieldsToIndex);
      }
    }

    // Only optimize if we have multiple match stages with $in operations
    return {
      optimize: matchCount >= 2 && fieldsToIndex.length >= 2,
      fieldsToIndex
    };
  }

  private static extractInFields(query: any, fields: string[]): void {
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === 'object' && value !== null) {
        if (value.$in && Array.isArray(value.$in)) {
          if (!fields.includes(key)) {
            fields.push(key);
          }
        }
      }
    }
  }

  private getFieldValue(doc: any, field: string): any {
    const parts = field.split('.');
    let value = doc;
    
    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[part];
    }
    
    return value;
  }
}

/**
 * Apply bitmap optimization to pipeline
 * Returns optimized result set or null if optimization not applicable
 */
export function applyBitmapOptimization(
  data: any[], 
  pipeline: any[]
): { indices: Set<number>; remainingPipeline: any[] } | null {
  const { optimize, fieldsToIndex } = BitmapIndex.shouldOptimize(pipeline);
  
  if (!optimize || fieldsToIndex.length === 0) {
    return null;
  }

  const bitmapIndex = new BitmapIndex();
  bitmapIndex.build(data, fieldsToIndex);

  let resultIndices: Set<number> | null = null;
  const remainingPipeline: any[] = [];
  let processedMatchStages = 0;

  for (const stage of pipeline) {
    if (stage.$match && processedMatchStages < 3) { // Limit to first 3 match stages
      let stageOptimized = false;
      
      for (const [field, condition] of Object.entries(stage.$match)) {
        if (fieldsToIndex.includes(field) && 
            typeof condition === 'object' && 
            condition !== null && 
            (condition as any).$in) {
          
          const matches = bitmapIndex.findMatches(field, (condition as any).$in);
          if (matches !== null) {
            if (resultIndices === null) {
              resultIndices = matches;
            } else {
              // Intersection for AND semantics between match stages
              resultIndices = new Set([...resultIndices].filter(i => matches.has(i)));
            }
            stageOptimized = true;
          }
        }
      }
      
      if (stageOptimized) {
        processedMatchStages++;
      } else {
        remainingPipeline.push(stage);
      }
    } else {
      remainingPipeline.push(stage);
    }
  }

  if (resultIndices === null) {
    return null; // No optimization applied
  }

  return { indices: resultIndices, remainingPipeline };
}