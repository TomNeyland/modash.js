/**
 * TypeScript type definitions for modash.js
 * Modern MongoDB-inspired aggregation library for TypeScript
 */

// Re-export basic types from implementation modules where they are defined
export type {
  PrimitiveValue,
  DocumentValue,
  Document,
  Collection,
  FieldPath,
  SystemVariable,
} from './modash/expressions.js';

export type {
  ComparisonOperators,
  QueryOperators,
  QueryExpression,
} from './modash/aggregation.js';

// Expression type - used in $project, $addFields, etc.
export type Expression =
  | DocumentValue
  | FieldPath
  | SystemVariable
  | ArithmeticExpression
  | ArrayExpression
  | StringExpression
  | ComparisonExpression
  | BooleanExpression
  | ConditionalExpression
  | DateExpression
  | AccumulatorExpression
  | { [key: string]: Expression };

// Arithmetic expressions
export interface ArithmeticExpression {
  $add?: Expression[];
  $subtract?: [Expression, Expression];
  $multiply?: Expression[];
  $divide?: [Expression, Expression];
  $mod?: [Expression, Expression];
  $abs?: Expression;
  $ceil?: Expression;
  $floor?: Expression;
  $round?: [Expression] | [Expression, Expression];
  $sqrt?: Expression;
  $pow?: [Expression, Expression];
}

// Array expressions
export interface ArrayExpression {
  $size?: Expression;
  $arrayElemAt?: [Expression, Expression];
  $slice?: [Expression, Expression] | [Expression, Expression, Expression];
  $concatArrays?: Expression[];
  $in?: [Expression, Expression];
  $indexOfArray?:
    | [Expression, Expression]
    | [Expression, Expression, Expression]
    | [Expression, Expression, Expression, Expression];
  $reverseArray?: Expression;
  $filter?: {
    input: Expression;
    cond: Expression;
    as?: string;
  };
  $map?: {
    input: Expression;
    in: Expression;
    as?: string;
  };
}

// String expressions
export interface StringExpression {
  $concat?: Expression[];
  $substr?: [Expression, Expression, Expression];
  $toLower?: Expression;
  $toUpper?: Expression;
  $split?: [Expression, Expression];
  $strLen?: Expression;
  $trim?: Expression | { input: Expression; chars?: Expression };
  $ltrim?: Expression | { input: Expression; chars?: Expression };
  $rtrim?: Expression | { input: Expression; chars?: Expression };
}

// Comparison expressions
export interface ComparisonExpression {
  $cmp?: [Expression, Expression];
  $eq?: [Expression, Expression];
  $gt?: [Expression, Expression];
  $gte?: [Expression, Expression];
  $lt?: [Expression, Expression];
  $lte?: [Expression, Expression];
  $ne?: [Expression, Expression];
}

// Boolean expressions
export interface BooleanExpression {
  $and?: Expression[];
  $or?: Expression[];
  $not?: Expression[];
}

// Conditional expressions
export interface ConditionalExpression {
  $cond?:
    | [Expression, Expression, Expression]
    | {
        if: Expression;
        then: Expression;
        else: Expression;
      };
  $ifNull?: [Expression, Expression];
}

// Date expressions
export interface DateExpression {
  $dayOfYear?: Expression;
  $dayOfMonth?: Expression;
  $dayOfWeek?: Expression;
  $year?: Expression;
  $month?: Expression;
  $week?: Expression;
  $hour?: Expression;
  $minute?: Expression;
  $second?: Expression;
  $millisecond?: Expression;
}

// Accumulator expressions (can be used in $group or as expressions in $project/$addFields)
export interface AccumulatorExpression {
  $avg?: Expression;
  $sum?: Expression;
  $min?: Expression;
  $max?: Expression;
  $first?: Expression;
  $last?: Expression;
  $push?: Expression;
  $addToSet?: Expression;
}

// Aggregation pipeline stages
export interface MatchStage {
  $match: QueryExpression;
}

export interface ProjectStage {
  $project: {
    [key: string]: 1 | 0 | true | false | Expression;
  };
}

export interface GroupStage {
  $group: {
    _id: Expression | null;
    [key: string]: AccumulatorExpression | Expression;
  };
}

export interface SortStage {
  $sort: {
    [key: string]: 1 | -1;
  };
}

export interface LimitStage {
  $limit: number;
}

export interface SkipStage {
  $skip: number;
}

export interface UnwindStage {
  $unwind:
    | string
    | {
        path: string;
        includeArrayIndex?: string;
        preserveNullAndEmptyArrays?: boolean;
      };
}

export interface LookupStage {
  $lookup: {
    from: Collection;
    localField: string;
    foreignField: string;
    as: string;
  };
}

export interface AddFieldsStage {
  $addFields: {
    [key: string]: Expression;
  };
}

export interface SetStage {
  $set: {
    [key: string]: Expression;
  };
}

// Union of all pipeline stages
export type PipelineStage =
  | MatchStage
  | ProjectStage
  | GroupStage
  | SortStage
  | LimitStage
  | SkipStage
  | UnwindStage
  | LookupStage
  | AddFieldsStage
  | SetStage;

// Pipeline type
export type Pipeline = PipelineStage[];

// Main Modash interface
export interface ModashStatic {
  /**
   * Performs aggregation operation using the aggregation pipeline.
   * @param collection - Array of documents to process
   * @param pipeline - Array of pipeline stages
   * @returns Processed array of documents
   */
  aggregate<T extends Document = Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Collection<T>;

  /**
   * Returns the count of documents in the collection.
   * @param collection - Array of documents to count
   * @returns Number of documents
   */
  count<T extends Document = Document>(collection: Collection<T>): number;

  /**
   * Evaluates an aggregation expression against a document.
   * @param obj - Document to evaluate against
   * @param expression - Expression to evaluate
   * @returns Result of the expression
   */
  $expression(obj: Document, expression: Expression): DocumentValue;

  // Stage operators (can be used standalone)
  $group<T extends Document = Document>(
    collection: Collection<T>,
    specifications: GroupStage['$group']
  ): Collection<T>;
  $project<T extends Document = Document>(
    collection: Collection<T>,
    specifications: ProjectStage['$project']
  ): Collection<T>;
  $match<T extends Document = Document>(
    collection: Collection<T>,
    query: QueryExpression
  ): Collection<T>;
  $limit<T extends Document = Document>(
    collection: Collection<T>,
    count: number
  ): Collection<T>;
  $skip<T extends Document = Document>(
    collection: Collection<T>,
    count: number
  ): Collection<T>;
  $sort<T extends Document = Document>(
    collection: Collection<T>,
    sortSpec: SortStage['$sort']
  ): Collection<T>;
  $unwind<T extends Document = Document>(
    collection: Collection<T>,
    fieldPath: string
  ): Collection<T>;
  $lookup<T extends Document = Document>(
    collection: Collection<T>,
    lookupSpec: LookupStage['$lookup']
  ): Collection<T>;
  $addFields<T extends Document = Document>(
    collection: Collection<T>,
    fieldSpecs: AddFieldsStage['$addFields']
  ): Collection<T>;
  $set<T extends Document = Document>(
    collection: Collection<T>,
    fieldSpecs: SetStage['$set']
  ): Collection<T>;
}

// Re-export the main implementations from modash module
export {
  aggregate,
  count,
  $expression,
  $group,
  $project,
  $match,
  $limit,
  $skip,
  $sort,
  $unwind,
  $lookup,
  $addFields,
  $set,
  default,
} from './modash/index.js';
