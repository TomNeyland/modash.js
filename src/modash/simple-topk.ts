/**
 * Simplified Top-K Implementation 
 * Simple and correct implementation for sort + limit optimization
 */

export function applySimpleTopKOptimization(
  data: any[],
  pipeline: any[]
): any[] | null {
  // Find sort + limit pattern
  for (let i = 0; i < pipeline.length - 1; i++) {
    const currentStage = pipeline[i];
    const nextStage = pipeline[i + 1];
    
    if (currentStage.$sort && nextStage.$limit) {
      const limitValue = nextStage.$limit;
      if (typeof limitValue === 'number' && limitValue < 1000) {
        
        // Apply stages before sort
        let workingData = data;
        for (let j = 0; j < i; j++) {
          const stage = pipeline[j];
          if (stage.$match) {
            workingData = workingData.filter(doc => matchDocument(doc, stage.$match));
          } else if (stage.$project) {
            workingData = workingData.map(doc => projectDocument(doc, stage.$project));
          }
        }
        
        // Apply sort and limit
        const sortSpec = currentStage.$sort;
        const sorted = [...workingData].sort((a, b) => {
          for (const [field, direction] of Object.entries(sortSpec)) {
            const aVal = getFieldValue(a, field);
            const bVal = getFieldValue(b, field);
            
            let comparison = 0;
            if (aVal < bVal) comparison = -1;
            else if (aVal > bVal) comparison = 1;
            
            if (comparison !== 0) {
              return (direction as number) === 1 ? comparison : -comparison;
            }
          }
          return 0;
        });
        
        let results = sorted.slice(0, limitValue);
        
        // Apply stages after limit
        for (let j = i + 2; j < pipeline.length; j++) {
          const stage = pipeline[j];
          if (stage.$project) {
            results = results.map(doc => projectDocument(doc, stage.$project));
          } else if (stage.$match) {
            results = results.filter(doc => matchDocument(doc, stage.$match));
          }
        }
        
        return results;
      }
    }
  }
  
  return null;
}

function getFieldValue(doc: any, field: string): any {
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

function matchDocument(doc: any, matchSpec: any): boolean {
  for (const [field, condition] of Object.entries(matchSpec)) {
    const value = getFieldValue(doc, field);
    
    if (!matchesCondition(value, condition)) {
      return false;
    }
  }
  return true;
}

function matchesCondition(value: any, condition: any): boolean {
  if (typeof condition !== 'object' || condition === null) {
    return value === condition;
  }
  
  for (const [operator, operand] of Object.entries(condition)) {
    switch (operator) {
      case '$eq':
        if (value !== operand) return false;
        break;
      case '$ne':
        if (value === operand) return false;
        break;
      case '$gt':
        if (value <= operand) return false;
        break;
      case '$gte':
        if (value < operand) return false;
        break;
      case '$lt':
        if (value >= operand) return false;
        break;
      case '$lte':
        if (value > operand) return false;
        break;
      case '$in':
        if (!Array.isArray(operand) || !operand.includes(value)) return false;
        break;
      case '$nin':
        if (!Array.isArray(operand) || operand.includes(value)) return false;
        break;
      default:
        return false;
    }
  }
  
  return true;
}

function projectDocument(doc: any, projectSpec: any): any {
  const result: any = {};
  
  for (const [field, include] of Object.entries(projectSpec)) {
    if (include) {
      if (field === '_id' && include === 0) {
        // Skip _id
        continue;
      }
      result[field] = getFieldValue(doc, field);
    }
  }
  
  return result;
}