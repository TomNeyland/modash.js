import {
    isArray, isObject, isDate, get, set, merge, size, keys
}
from 'lodash';

import EXPRESSION_OPERATORS from './operators';


function isFieldPath(expression) {
    return (typeof expression === 'string') && expression.indexOf('$') === 0 && expression.indexOf('$$') === -1;
}

function isSystemVariable(expression) {
    return (typeof expression === 'string') && expression.indexOf('$$') === 0;
}

function isExpressionObject(expression) {
    return isObject(expression) && !(isExpressionOperator(expression)) && !(isArray(expression)) && !(isDate(expression));
}

function isExpressionOperator(expression) {
    return size(expression) === 1 && (keys(expression)[0] in EXPRESSION_OPERATORS);
}




function $expression(obj, expression, root) {

    var result;

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
    // this will need additional tweaks later
    path = path.slice(1);

    return get(obj, path);
}


function $expressionOperator(obj, operatorExpression, root) {

    var operator = keys(operatorExpression)[0],
        args = operatorExpression[operator],
        operatorFunction = EXPRESSION_OPERATORS[operator],
        result;

    if (!isArray(args)) {
        args = [args];
    }

    args = args.map(function(argExpression) {
        return $expression(obj, argExpression, root);
    });

    result = operatorFunction(...args);
    return result;
}


function $expressionObject(obj, specifications, root) {

    var result = {};

    if (root === undefined) {
        root = obj;
    }

    for (let path in specifications) {

        let target = root,
            expression = specifications[path];

        if (path.indexOf('.') !== -1) {

            var pathParts = path.split('.');
            let headPath = pathParts.shift();
            let head = get(obj, headPath);

            if (isArray(head)) {
                /*eslint-disable */
                // refactor this part soon...
                set(result, headPath, head.map(function(subtarget) {
                    return $expression(subtarget, {
                        [pathParts.join('.')]: expression
                    }, root);
                }));
                /*eslint-enable */
            } else {
                merge(result, set({}, headPath, $expression(head, {
                    [pathParts.join('.')]: expression
                }, root)));
            }

        } else {

            if (expression === true || expression === 1) {
                // Simple passthrough of obj's path/field values
                target = obj;
                expression = '$' + path;
            } else if (expression === false || expression === 0) {
                // we can go ahead and skip this all together
                continue;
            } else if (typeof expression === 'string') {
                // Assume a pathspec for now, meaning we use root as the target
                target = root;
            } else if (typeof expression === 'object') {
                target = get(obj, path);
            }
            if (isArray(target)) {
                /*eslint-disable */
                // refactor this part soon...
                merge(result, set({}, path, target.map(function(subtarget) {
                    return $expression(subtarget, expression, root);
                })));
                /*eslint-enable */

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
    }

    throw Error('Unsupported system variable');
}

function $literal() {

}

export default {
    $expression, $fieldPath, $systemVariable, $literal, $expressionObject, isExpressionOperator, isExpressionObject
};
