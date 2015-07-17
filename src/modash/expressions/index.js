import {
    chain, extend, isArray, isObject, get, set, merge, size, keys
}
from 'lodash';


const EXPRESSION_OPERATORS = {

}


function isFieldPath(expression) {
	return (typeof expression === 'string') && expression.indexOf('$') === 0;
}

function isSystemVariable(expression) {

}

function isExpressionObject(expression) {
    return isObject(expression) && !(isExpressionOperator(expression)) && !(isArray(expression));
}

function isExpressionOperator(expression) {
	return size(expression) === 1 && (keys(expression)[0] in EXPRESSION_OPERATORS);
}



function $expression(obj, expression, root) {

    var result;

    if (root === undefined) {
        root = obj;
    }
    
    console.debug('obj', obj);
    console.debug('expression', expression);

    if (isFieldPath(expression)) {
        result = $fieldPath(obj, expression, root);
    } else if (isExpressionOperator(EXPRESSION_OPERATORS)) {
        result = $expressionOperator(obj, expression, root);
    } else if (isExpressionObject(expression)) {
        result = $expressionObject(obj, expression, root);
    } else {
        throw Error('Invalid Expression: ' + JSON.stringify(expression));
    }

    console.debug('result', result);

    return result;

}

function $fieldPath(obj, path, root) {
    // slice the $ and use the regular get
    // this will need additional tweaks later
    return get(obj, path.slice(1));
}


function $expressionOperator() {

}


function $expressionObject(obj, specifications, root) {

    var result = {};

    if (root === undefined) {
        root = obj;
    }


    for (let field in specifications) {

            let target = root,
                expression = specifications[field];

            if (expression === true || expression === 1) {
                // Simple passthrough of obj's field/path values
                target = obj;
                expression = '$' + field;
            } else if (expression === false || expression === 0) {
                // we can go ahead and skip this all together
                continue;
            } else if (typeof expression === 'string') {
                // Assume a pathspec for now, meaning we use root as the target
                target = root;
            } else if (typeof expression === 'object') {
                target = get(obj, field);
            }

            merge(result, set({}, field, $expression(target, expression, root)));

        }

    return result;

}


function $systemVariable() {

}

function $literal() {

}

export default {
    $expression, $fieldPath, $systemVariable, $literal, $expressionObject
};
