const FIELD_PATH = 'FIELD_PATH',
      SYSTEM_VARIABLE = 'SYSTEM_VARIABLE',
      LITERAL = 'LITERAL',
      EXPRESSION_OBJECT = 'EXPRESSION_OBJECT',
      EXPRESSION_OPERATOR = 'EXPRESSION_OPERATOR';


function $expression(obj, expression) {

    if (expression.$literal) {
        return expression.$literal;
    }



}

function $fieldPath() {

}

function $systemVariable() {

}

function $literal() {

}

export default {
    $expression, $fieldPath, $systemVariable, $literal
};
