import {
    isArray, isObject, get, set, merge, size, keys, pluck
}
from 'lodash';


const EXPRESSION_OPERATORS = {

};


function isFieldPath(expression) {
    return (typeof expression === 'string') && expression.indexOf('$') === 0 && expression.indexOf('$$') === -1;
}

function isSystemVariable(expression) {
    return (typeof expression === 'string') && expression.indexOf('$$') === 0;
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

    if (isExpressionOperator(EXPRESSION_OPERATORS)) {
        result = $expressionOperator(obj, expression, root);
    } else if (isFieldPath(expression)) {
        result = $fieldPath(obj, expression);
    } else if (isExpressionObject(expression)) {
        result = $expressionObject(obj, expression, root);
    } else if (isSystemVariable(expression)) {
        throw Error('System Variables are not currently supported');
    } else {
        throw Error('Invalid Expression: ' + JSON.stringify(expression));
    }

    return result;

}

function $fieldPath(obj, path) {
    // slice the $ and use the regular get
    // this will need additional tweaks later
    path = path.slice(1);

    if (path.indexOf('.') !== -1) {
        path = path.split('.');
        let headPath = path.shift();
        let head = get(obj, headPath);

        if (isArray(head)) {


            return pluck(head, path);
        } else {
            return get(head, path);
        }

    }


    return get(obj, path);
}


function $expressionOperator() {

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


function $systemVariable() {

}

function $literal() {

}

export default {
    $expression, $fieldPath, $systemVariable, $literal, $expressionObject
};
