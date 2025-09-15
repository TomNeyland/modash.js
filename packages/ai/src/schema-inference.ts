/**
 * Schema inference for JSON documents
 * Samples documents and produces a simplified schema representation for LLM consumption
 */

export interface SimplifiedSchema {
  [key: string]: string | SimplifiedSchema;
}

export interface SchemaInferenceOptions {
  /** Number of documents to sample for schema inference */
  sampleSize?: number;
  /** Maximum depth to analyze nested objects */
  maxDepth?: number;
}

/**
 * Infers a simplified schema from a collection of documents
 *
 * @param documents - Array of documents to analyze
 * @param options - Configuration options
 * @returns Simplified schema object
 */
export function inferSchema(
  documents: any[],
  options: SchemaInferenceOptions = {}
): SimplifiedSchema {
  const { sampleSize = 100, maxDepth = 5 } = options;

  if (documents.length === 0) {
    return {};
  }

  // Sample documents if we have more than sampleSize
  const sample =
    documents.length > sampleSize
      ? sampleDocuments(documents, sampleSize)
      : documents;

  const schema: SimplifiedSchema = {};
  const fieldTypes = new Map<string, Set<string>>();

  // Analyze each document in the sample
  for (const doc of sample) {
    if (doc && typeof doc === 'object') {
      collectFieldTypes(doc, fieldTypes, '', maxDepth);
    }
  }

  // Convert collected types to simplified schema
  for (const [path, types] of fieldTypes) {
    setNestedValue(schema, path, consolidateTypes(types));
  }

  return schema;
}

/**
 * Samples documents using a distributed approach to get representative data
 *
 * @param documents - Full document array
 * @param sampleSize - Number of documents to sample
 * @returns Sampled documents
 */
function sampleDocuments(documents: any[], sampleSize: number): any[] {
  if (documents.length <= sampleSize) {
    return documents;
  }

  const sample: any[] = [];
  const step = documents.length / sampleSize;

  for (let i = 0; i < sampleSize; i++) {
    const index = Math.floor(i * step);
    sample.push(documents[index]);
  }

  return sample;
}

/**
 * Recursively collects field types from a document
 *
 * @param obj - Object to analyze
 * @param fieldTypes - Map to collect field types
 * @param prefix - Current path prefix
 * @param maxDepth - Maximum recursion depth
 */
function collectFieldTypes(
  obj: any,
  fieldTypes: Map<string, Set<string>>,
  prefix: string,
  maxDepth: number
): void {
  if (maxDepth <= 0) return;

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (!fieldTypes.has(path)) {
      fieldTypes.set(path, new Set());
    }

    const types = fieldTypes.get(path)!;
    const valueType = getValueType(value);
    types.add(valueType);

    // Recurse into nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      collectFieldTypes(value, fieldTypes, path, maxDepth - 1);
    }
  }
}

/**
 * Determines the type of a value for schema purposes
 *
 * @param value - Value to analyze
 * @returns String representation of the type
 */
function getValueType(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  const baseType = typeof value;

  if (baseType === 'object') {
    if (Array.isArray(value)) {
      if (value.length === 0) return 'array';

      // Determine array element type
      const elementTypes = new Set(value.map(getValueType));
      if (elementTypes.size === 1) {
        return `array<${[...elementTypes][0]}>`;
      } else {
        return `array<mixed>`;
      }
    }
    return 'object';
  }

  if (baseType === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  }

  return baseType;
}

/**
 * Consolidates multiple types into a single representative type
 *
 * @param types - Set of observed types
 * @returns Consolidated type string
 */
function consolidateTypes(types: Set<string>): string {
  const typeArray = [...types].filter(t => t !== 'null' && t !== 'undefined');

  if (typeArray.length === 0) return 'unknown';
  if (typeArray.length === 1) return typeArray[0];

  // Handle numeric types
  if (typeArray.every(t => t === 'integer' || t === 'number')) {
    return 'number';
  }

  // Handle array types
  const arrayTypes = typeArray.filter(t => t.startsWith('array'));
  if (arrayTypes.length > 0) {
    return 'array';
  }

  return `union<${typeArray.join('|')}>`;
}

/**
 * Sets a nested value in an object using dot notation
 *
 * @param obj - Object to modify
 * @param path - Dot-separated path
 * @param value - Value to set
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Converts a document to a compact example representation for the LLM
 *
 * @param doc - Document to convert
 * @returns Compact string representation
 */
export function documentToExample(doc: any): string {
  if (!doc || typeof doc !== 'object') {
    return JSON.stringify(doc);
  }

  const compact: any = {};
  for (const [key, value] of Object.entries(doc)) {
    if (Array.isArray(value)) {
      compact[key] = value.length > 0 ? [value[0], '...'] : [];
    } else if (value && typeof value === 'object') {
      // Flatten nested objects for brevity
      compact[key] = '{...}';
    } else {
      compact[key] = value;
    }
  }

  return JSON.stringify(compact);
}

/**
 * Gets representative sample documents for LLM context
 *
 * @param documents - Full document array
 * @param count - Number of examples to return
 * @returns Array of sample documents
 */
export function getSampleDocuments(documents: any[], count: number = 3): any[] {
  if (documents.length <= count) {
    return documents;
  }

  const samples: any[] = [];
  const step = Math.max(1, Math.floor(documents.length / count));

  for (let i = 0; i < count && i * step < documents.length; i++) {
    samples.push(documents[i * step]);
  }

  return samples;
}
