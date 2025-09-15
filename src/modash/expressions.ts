// Modern JavaScript - use our utility functions instead of lodash
import { get, set, merge, isObject } from './util';

import EXPRESSION_OPERATORS, { set$expression } from './operators';

// Basic value types that can appear in documents
// Basic value types
export type PrimitiveValue = string | number | boolean | Date | null | undefined;
export type DocumentValue =
  | PrimitiveValue
  | Document
  | readonly DocumentValue[]; // Recursive to allow nested arrays

// MongoDB document type - immutable by design
export interface Document {
  [key: string]: DocumentValue;
}

// Collection type - readonly array for immutable operations
export type Collection<T = Document> = T[];

// Expression types
export type FieldPath = `$${string}`;
export type SystemVariable = `$$${string}`;

// Import only the complex expression types from main index for now
import type { Expression } from '../index';

// Local type definitions for expression evaluation
type ExpressionOperatorObject = Record<string, Expression | Expression[]>;
type ExpressionValue = Expression | DocumentValue;

/**
 * Type guard to check if an expression represents a field path
 * @param expression - The expression to check
 * @returns `true` if the expression is a field path (starts with $ but not $$)
 * @example
 * ```typescript
 * isFieldPath('$name') // true
 * isFieldPath('$$ROOT') // false
 * isFieldPath('value') // false
 * ```
 */
function isFieldPath(expression: ExpressionValue): expression is FieldPath {
  return (
    typeof expression === 'string' &&
    expression.indexOf('$') === 0 &&
    expression.indexOf('$$') === -1
  );
}

/**
 * Type guard to check if an expression represents a system variable
 * @param expression - The expression to check
 * @returns `true` if the expression is a system variable (starts with $$)
 * @example
 * ```typescript
 * isSystemVariable('$$ROOT') // true
 * isSystemVariable('$name') // false
 * isSystemVariable('value') // false
 * ```
 */
function isSystemVariable(
  expression: ExpressionValue
): expression is SystemVariable {
  return typeof expression === 'string' && expression.indexOf('$$') === 0;
}

function isExpressionObject(
  expression: ExpressionValue
): expression is { [key: string]: Expression } {
  return isObject(expression) && !isExpressionOperator(expression);
}

function isExpressionOperator(
  expression: ExpressionValue
): expression is ExpressionOperatorObject {
  if (!isObject(expression)) return false;

  const expressionKeys = Object.keys(expression as Record<string, any>);
  return (
    expressionKeys.length === 1 && expressionKeys[0]! in EXPRESSION_OPERATORS
  );
}

/**
 * Evaluates an aggregation expression against a document.
 * @param obj - Document to evaluate against
 * @param expression - Expression to evaluate
 * @param root - Root document (defaults to obj)
 * @param context - Evaluation context for system variables like $$value, $$this
 * @param bindings - Variable bindings from $let or similar constructs
 * @returns Result of the expression
 */
function $expression(
  obj: Document,
  expression: Expression,
  root?: Document,
  context?: { [key: string]: DocumentValue },
  bindings?: Record<string, DocumentValue>
): DocumentValue {
  let result: DocumentValue;

  if (root === undefined) {
    root = obj;
  }

  if (isSystemVariable(expression)) {
    result = $systemVariable(obj, expression, root, context, bindings);
  } else if (isExpressionOperator(expression)) {
    result = $expressionOperator(obj, expression, root, context, bindings);
  } else if (isFieldPath(expression)) {
    result = $fieldPath(obj, expression);
  } else if (isExpressionObject(expression)) {
    result = $expressionObject(obj, expression, root, context, bindings);
  } else {
    result = expression as DocumentValue;
  }

  return result;
}

function $fieldPath(obj: Document, path: FieldPath): DocumentValue {
  // slice the $ and use the regular get
  const cleanPath = path.slice(1);
  // Optimize for simple property access - use direct access when no dots in path
  return cleanPath.includes('.') ? get(obj, cleanPath) : obj[cleanPath];
}

function $expressionOperator(
  obj: Document,
  operatorExpression: ExpressionOperatorObject,
  root: Document,
  context?: { [key: string]: DocumentValue },
  bindings?: Record<string, DocumentValue>
): DocumentValue {
  const [operator] = Object.keys(operatorExpression);
  let args = operatorExpression[operator!];
  const operatorFunction = EXPRESSION_OPERATORS[operator!];

  if (!operatorFunction) {
    throw new Error(`Unknown operator: ${operator}`);
  }

  // Special handling for operators that need document context
  if (operator === '$cond') {
    // Handle both array and object forms with lazy evaluation
    let condition, thenBranch, elseBranch;

    if (Array.isArray(args)) {
      // Array form: [condition, then, else]
      [condition, thenBranch, elseBranch] = args;
    } else if (typeof args === 'object' && args !== null) {
      // Object form: { if: condition, then: then, else: else }
      const condObj = args as {
        if: Expression;
        then: Expression;
        else: Expression;
      };
      condition = condObj.if;
      thenBranch = condObj.then;
      elseBranch = condObj.else;
    } else {
      throw new Error('Invalid $cond format');
    }

    // Lazy evaluation - only evaluate the taken branch
    const condResult = $expression(obj, condition, root, context, bindings);
    if (condResult) {
      return $expression(obj, thenBranch, root, context, bindings);
    } else {
      return $expression(obj, elseBranch, root, context, bindings);
    }
  }

  if (operator === '$switch') {
    const switchInput = args as any;
    const { branches, default: defaultValue } = switchInput;

    // Iterate through branches and return first truthy case
    for (const branch of branches) {
      const caseResult = $expression(obj, branch.case, root, context, bindings);
      if (caseResult) {
        return $expression(obj, branch.then, root, context, bindings);
      }
    }

    // Return default value if no cases match
    return defaultValue !== undefined
      ? $expression(obj, defaultValue, root, context, bindings)
      : null;
  }

  if (operator === '$reduce') {
    const reduceInput = args as any;
    const { input, initialValue, in: inExpression } = reduceInput;

    const arrayValue = $expression(
      obj,
      input,
      root,
      context,
      bindings
    ) as DocumentValue[];
    if (!Array.isArray(arrayValue)) {
      return null;
    }

    let accumulator = $expression(obj, initialValue, root, context, bindings);

    // Iterate through array elements with $$value and $$this context
    for (const element of arrayValue) {
      // Create context with $$value (current accumulator) and $$this (current element)
      const reduceContext = {
        ...context,
        $$value: accumulator,
        $$this: element,
      };

      // Evaluate the expression with the context and update accumulator
      accumulator = $expression(
        obj,
        inExpression,
        root,
        reduceContext,
        bindings
      );
    }

    return accumulator;
  }

  if (!Array.isArray(args)) {
    args = [args];
  }

  const evaluatedArgs = (args as Expression[]).map(
    argExpression => () =>
      $expression(obj, argExpression, root, context, bindings)
  );

  const result = operatorFunction(...evaluatedArgs);
  return result as DocumentValue;
}

function $expressionObject(
  obj: Document,
  specifications: { [key: string]: Expression },
  root?: Document,
  context?: { [key: string]: DocumentValue },
  bindings?: Record<string, DocumentValue>
): Document {
  const result: Document = {};

  if (root === undefined) {
    root = obj;
  }

  for (const path in specifications) {
    let target: Document | Document[] = root;
    let expression = specifications[path]!;

    if (path.indexOf('.') !== -1) {
      const pathParts = path.split('.');
      const headPath = pathParts.shift()!;
      // Optimize for simple property access when headPath doesn't contain dots
      const head = headPath.includes('.') ? get(obj, headPath) : obj[headPath];

      if (Array.isArray(head)) {
        const setResult = set(
          result,
          headPath,
          (head as Document[]).map(subtarget =>
            $expression(
              subtarget,
              { [pathParts.join('.')]: expression },
              root,
              context,
              bindings
            )
          )
        );
        Object.assign(result, setResult);
      } else {
        const mergeResult = merge(
          result,
          set(
            {},
            headPath,
            $expression(
              head as Document,
              { [pathParts.join('.')]: expression },
              root,
              context,
              bindings
            )
          )
        );
        Object.assign(result, mergeResult);
      }
    } else {
      if (expression === true || expression === 1) {
        // Simple passthrough of obj's path/field values
        target = obj;
        expression = `$${path}` as FieldPath;
      } else if (expression === false || expression === 0) {
        // Skip this field
        continue;
      } else if (typeof expression === 'string') {
        // Assume a pathspec, use root as the target
        target = root;
      } else if (
        typeof expression === 'object' &&
        !isExpressionOperator(expression)
      ) {
        // Check if this is a nested projection (field projection) or computed object (expression object)
        // Optimize for simple property access when path doesn't contain dots
        const fieldValue = path.includes('.') ? get(obj, path) : obj[path];
        const isFieldProjection = fieldValue && typeof fieldValue === 'object';

        if (isFieldProjection) {
          // This is a nested projection object - apply to the field's value
          if (Array.isArray(fieldValue)) {
            // Apply projection to each element in the array
            const mergeResult = merge(
              result,
              set(
                {},
                path,
                fieldValue.map(item =>
                  $expressionObject(
                    item,
                    expression as { [key: string]: Expression },
                    root,
                    context,
                    bindings
                  )
                )
              )
            );
            Object.assign(result, mergeResult);
          } else {
            // Apply projection to the object
            const mergeResult = merge(
              result,
              set(
                {},
                path,
                $expressionObject(
                  fieldValue as Document,
                  expression as { [key: string]: Expression },
                  root,
                  context,
                  bindings
                )
              )
            );
            Object.assign(result, mergeResult);
          }
        } else {
          // This is a computed object - each property is an expression
          target = obj;
        }

        if (isFieldProjection) {
          continue;
        }
      }

      if (Array.isArray(target)) {
        const mergeResult = merge(
          result,
          set(
            {},
            path,
            target.map(subtarget =>
              $expression(subtarget, expression, root, context, bindings)
            )
          )
        );
        Object.assign(result, mergeResult);
      } else {
        const mergeResult = merge(
          result,
          set(
            {},
            path,
            $expression(target as Document, expression, root, context, bindings)
          )
        );
        Object.assign(result, mergeResult);
      }
    }
  }

  return result;
}

function $systemVariable(
  obj: Document,
  variableName: SystemVariable,
  root: Document,
  context?: { [key: string]: DocumentValue },
  bindings?: Record<string, DocumentValue>
): DocumentValue {
  // Handle dot notation in system variables (e.g., $$this.price)
  const parts = variableName.split('.');
  const baseVariable = parts[0] as SystemVariable;
  const fieldPath = parts.slice(1).join('.');

  let baseValue: DocumentValue;

  // Check if this is a user-defined variable from bindings (e.g., $$building, $$avgTemp)
  if (bindings && baseVariable.startsWith('$$')) {
    const varName = baseVariable.slice(2); // Remove $$ prefix
    if (varName in bindings) {
      baseValue = bindings[varName];
      // If there's a field path, access the nested property
      if (fieldPath && baseValue && typeof baseValue === 'object') {
        return get(baseValue as Document, fieldPath);
      }
      return baseValue;
    }
  }

  switch (baseVariable) {
    case '$$ROOT':
      // C) $$ROOT resolution: Ensure we always return the root document
      if (root === undefined || root === null) {
        baseValue = obj;
      } else {
        baseValue = root;
      }
      break;
    case '$$CURRENT':
      baseValue = obj;
      break;
    case '$$NOW':
      baseValue = new Date();
      break;
    case '$$value':
      baseValue = context?.$$value ?? null;
      break;
    case '$$this':
      baseValue = context?.$$this ?? null;
      break;
    case '$$REMOVE':
      // Special marker for field removal in $project/$addFields
      // We use a Symbol but cast it to satisfy TypeScript
      return Symbol.for('$$REMOVE') as any;
    default:
      throw new Error(`Unsupported system variable: ${baseVariable}`);
  }

  // If there's a field path, access the nested property
  if (fieldPath && baseValue && typeof baseValue === 'object') {
    return get(baseValue as Document, fieldPath);
  }

  return baseValue;
}

/**
 * Returns a literal value without parsing or interpreting it
 * Used to include literal values that contain special characters
 * @param value - The literal value to return as-is
 * @returns The literal value unchanged
 */
function $literal(value: DocumentValue): DocumentValue {
  return value;
}

export {
  $expression,
  $fieldPath,
  $systemVariable,
  $literal,
  $expressionObject,
  isExpressionOperator,
  isExpressionObject,
};

// Initialize the circular dependency
set$expression($expression);

export default {
  $expression,
  $fieldPath,
  $systemVariable,
  $literal,
  $expressionObject,
  isExpressionOperator,
  isExpressionObject,
};
