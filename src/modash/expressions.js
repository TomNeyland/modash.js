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

import EXPRESSION_OPERATORS from './operators.js';

function isFieldPath(expression) {
  return (
    typeof expression === 'string' &&
    expression.indexOf('$') === 0 &&
    expression.indexOf('$$') === -1
  );
}

function isSystemVariable(expression) {
  return typeof expression === 'string' && expression.indexOf('$$') === 0;
}

function isExpressionObject(expression) {
  return (
    isObject(expression) &&
    !isExpressionOperator(expression) &&
    !isArray(expression) &&
    !isDate(expression)
  );
}

function isExpressionOperator(expression) {
  return size(expression) === 1 && keys(expression)[0] in EXPRESSION_OPERATORS;
}

function $expression(obj, expression, root) {
  let result;

  if (root === undefined) {
    root = obj;
  }

  if (isSystemVariable(expression)) {
    result = $systemVariable(obj, expression, root);
  } else if (isExpressionOperator(expression)) {
    result = $expressionOperator(root, expression, root);
  } else if (isFieldPath(expression)) {
    result = $fieldPath(obj, expression);
  } else if (isExpressionObject(expression)) {
    result = $expressionObject(obj, expression, root);
  } else {
    result = expression;
  }

  return result;
}

function $fieldPath(obj, path) {
  // slice the $ and use the regular get
  path = path.slice(1);
  return get(obj, path);
}

function $expressionOperator(obj, operatorExpression, root) {
  const [operator] = keys(operatorExpression);
  let args = operatorExpression[operator];
  const operatorFunction = EXPRESSION_OPERATORS[operator];

  if (!isArray(args)) {
    args = [args];
  }

  args = args.map(argExpression => () => $expression(obj, argExpression, root));

  const result = operatorFunction(...args);
  return result;
}

function $expressionObject(obj, specifications, root) {
  const result = {};

  if (root === undefined) {
    root = obj;
  }

  for (const path in specifications) {
    let target = root;
    let expression = specifications[path];

    if (path.indexOf('.') !== -1) {
      const pathParts = path.split('.');
      const headPath = pathParts.shift();
      const head = get(obj, headPath);

      if (isArray(head)) {
        set(
          result,
          headPath,
          head.map(subtarget =>
            $expression(subtarget, { [pathParts.join('.')]: expression }, root)
          )
        );
      } else {
        merge(
          result,
          set(
            {},
            headPath,
            $expression(head, { [pathParts.join('.')]: expression }, root)
          )
        );
      }
    } else {
      if (expression === true || expression === 1) {
        // Simple passthrough of obj's path/field values
        target = obj;
        expression = `$${path}`;
      } else if (expression === false || expression === 0) {
        // Skip this field
        continue;
      } else if (typeof expression === 'string') {
        // Assume a pathspec, use root as the target
        target = root;
      } else if (typeof expression === 'object') {
        target = get(obj, path);
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
        merge(result, set({}, path, $expression(target, expression, root)));
      }
    }
  }

  return result;
}

function $systemVariable(obj, variableName, root) {
  switch (variableName) {
    case '$$ROOT':
      return root;
    case '$$CURRENT':
      return obj;
    default:
      throw new Error('Unsupported system variable');
  }
}

function $literal() {
  // TODO: Implement literal expressions
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

export default {
  $expression,
  $fieldPath,
  $systemVariable,
  $literal,
  $expressionObject,
  isExpressionOperator,
  isExpressionObject,
};
