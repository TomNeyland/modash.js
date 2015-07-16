import {
    isArray, isObject
}
from 'lodash';


function isFieldPath(expression) {
	return (typeof expression === 'string') && expression.indexOf('$') === 0;
}

function isSystemVariable(expression) {

}

function isExpressionObject(expression) {
    return isObject(expression) && !(isOperatorExpression(expression)) && !(isArray(expression));
}

function isExpressionOperator(expression) {
	return _.size(expression) === 1 && (_.keys(expression)[0] in EXPRESSION_OPERATORS);
}



function $expression(obj, expression) {

    var result,
        expressionType = getExpressionType(expression);

    if (isFieldPath(expression)) {
        result = $fieldPath(obj, expression);
    } else if (isExpressionOperator(EXPRESSION_OPERATOR)) {
        result = $expressionOperator(obj, expression);
    } else if (isExpressionObject(expression)) {
        result = $expressionObject(obj, expression);
    } else {
        throw Error('Invalid Expression');
    }

    return result;

}

function $fieldPath() {

}


function $expressionOperator() {

}


function $expressionObject() {

}


function $systemVariable() {

}

function $literal() {

}

export default {
    $expression, $fieldPath, $systemVariable, $literal
};
