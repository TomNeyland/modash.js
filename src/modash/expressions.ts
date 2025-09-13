import {
  isArray,
  isObject,
  isDate,
  get,
  set,
  merge,
  size,
  keys,
} from 'lodash-es';

import EXPRESSION_OPERATORS, { set$expression } from './operators.js';
import type {
  Document,
  Expression,
  DocumentValue,
  FieldPath,
  SystemVariable,
} from '../index.js';

// Local type definitions for expression evaluation
type ExpressionOperatorObject = Record<string, Expression | Expression[]>;
type ExpressionValue =
  | DocumentValue
  | FieldPath
  | SystemVariable
  | ExpressionOperatorObject
  | { [key: string]: Expression };

function isFieldPath(expression: ExpressionValue): expression is FieldPath {
  return (
    typeof expression === 'string' &&
    expression.indexOf('$') === 0 &&
    expression.indexOf('$$') === -1
  );
}

function isSystemVariable(
  expression: ExpressionValue
): expression is SystemVariable {
  return typeof expression === 'string' && expression.indexOf('$$') === 0;
}

function isExpressionObject(
  expression: ExpressionValue
): expression is { [key: string]: Expression } {
  return (
    isObject(expression) &&
    !isExpressionOperator(expression) &&
    !isArray(expression) &&
    !isDate(expression)
  );
}

function isExpressionOperator(
  expression: ExpressionValue
): expression is ExpressionOperatorObject {
  return (
    isObject(expression) &&
    size(expression) === 1 &&
    keys(expression)[0]! in EXPRESSION_OPERATORS
  );
}

/**
 * Evaluates an aggregation expression against a document.
 * @param obj - Document to evaluate against
 * @param expression - Expression to evaluate
 * @param root - Root document (defaults to obj)
 * @returns Result of the expression
 */
function $expression(
  obj: Document,
  expression: Expression,
  root?: Document
): DocumentValue {
  let result: DocumentValue;

  if (root === undefined) {
    root = obj;
  }

  if (isSystemVariable(expression)) {
    result = $systemVariable(obj, expression, root);
  } else if (isExpressionOperator(expression)) {
    result = $expressionOperator(obj, expression, root);
  } else if (isFieldPath(expression)) {
    result = $fieldPath(obj, expression);
  } else if (isExpressionObject(expression)) {
    result = $expressionObject(obj, expression, root);
  } else {
    result = expression as DocumentValue;
  }

  return result;
}

function $fieldPath(obj: Document, path: FieldPath): DocumentValue {
  // slice the $ and use the regular get
  const cleanPath = path.slice(1);
  return get(obj, cleanPath) as DocumentValue;
}

function $expressionOperator(
  obj: Document,
  operatorExpression: ExpressionOperatorObject,
  root: Document
): DocumentValue {
  const [operator] = keys(operatorExpression);
  let args = operatorExpression[operator!];
  const operatorFunction = EXPRESSION_OPERATORS[operator!];

  if (!operatorFunction) {
    throw new Error(`Unknown operator: ${operator}`);
  }

  if (!isArray(args)) {
    args = [args];
  }

  const evaluatedArgs = (args as Expression[]).map(
    argExpression => () => $expression(obj, argExpression, root)
  );

  const result = operatorFunction(...evaluatedArgs);
  return result as DocumentValue;
}

function $expressionObject(
  obj: Document,
  specifications: { [key: string]: Expression },
  root?: Document
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
      const head = get(obj, headPath);

      if (isArray(head)) {
        set(
          result,
          headPath,
          (head as Document[]).map(subtarget =>
            $expression(subtarget, { [pathParts.join('.')]: expression }, root)
          )
        );
      } else {
        merge(
          result,
          set(
            {},
            headPath,
            $expression(
              head as Document,
              { [pathParts.join('.')]: expression },
              root
            )
          )
        );
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
        const fieldValue = get(obj, path);
        const isFieldProjection = fieldValue && typeof fieldValue === 'object';

        if (isFieldProjection) {
          // This is a nested projection object - apply to the field's value
          if (isArray(fieldValue)) {
            // Apply projection to each element in the array
            merge(
              result,
              set(
                {},
                path,
                fieldValue.map(item =>
                  $expressionObject(
                    item,
                    expression as { [key: string]: Expression },
                    root
                  )
                )
              )
            );
          } else {
            // Apply projection to the object
            merge(
              result,
              set(
                {},
                path,
                $expressionObject(
                  fieldValue as Document,
                  expression as { [key: string]: Expression },
                  root
                )
              )
            );
          }
        } else {
          // This is a computed object - each property is an expression
          target = obj;
        }

        if (isFieldProjection) {
          continue;
        }
      }

      if (isArray(target)) {
        merge(
          result,
          set(
            {},
            path,
            target.map(subtarget => $expression(subtarget, expression, root))
          )
        );
      } else {
        merge(
          result,
          set({}, path, $expression(target as Document, expression, root))
        );
      }
    }
  }

  return result;
}

function $systemVariable(
  obj: Document,
  variableName: SystemVariable,
  root: Document
): Document {
  switch (variableName) {
    case '$$ROOT':
      return root;
    case '$$CURRENT':
      return obj;
    default:
      throw new Error(`Unsupported system variable: ${variableName}`);
  }
}

function $literal(): DocumentValue {
  // TODO: Implement literal expressions
  return null;
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
