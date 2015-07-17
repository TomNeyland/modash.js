(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _lodash = require('lodash');

var _expressions = require('./expressions');

/*

Stage Operators

*/

/**
 * Reshapes each document in the stream, such as by adding new fields or
 * removing existing fields. For each input document, outputs one document.
 * @param  {[Array]} collection     [description]
 * @param  {[Object]} specifications [description]
 * @return {[Array]}                [description]
 */
function $project(collection, specifications) {

  if (!('_id' in specifications)) {
    specifications._id = 1;
  }

  return (0, _lodash.chain)(collection).map(function (obj) {
    return (0, _expressions.$expressionObject)(obj, specifications, obj);
  });
}

/*eslint-disable */
/**
 * Filters the document stream to allow only matching documents to pass
 * unmodified into the next pipeline stage.
 * @param  {[Array]} collection [description]
 * @param  {[type]} query      [description]
 * @return {[Array]}            [description]
 */
function $match(collection, query) {}

/**
 * Reshapes each document in the stream by restricting the content for each
 * document based on information stored in the documents themselves.
 * @param  {[Array]} collection [description]
 * @param  {[type]} expression [description]
 * @return {[Array]}            [description]
 */
function $redact(collection, expression) {}

/**
 * Limits the number of documents passed to the next stage in the pipeline.
 * @param  {[Array]} collection [description]
 * @param  {[type]} count      [description]
 * @return {[Array]}            [description]
 */
function $limit(collection, count) {}

/**
 * Skips the first n documents where n is the specified skip number and passes
 * the remaining documents unmodified to the pipeline
 * @param  {[Array]} collection [description]
 * @param  {[type]} count      [description]
 * @return {[Array]}            [description]
 */
function $skip(collection, count) {}

/**
 * Deconstructs an array field from the input documents to output a document
 * for each element.
 * @param  {[Array]} collection [description]
 * @param  {[type]} fieldPath  [description]
 * @return {[Array]}            [description]
 */
function $unwind(collection, fieldPath) {}

/**
 * Groups input documents by a specified identifier expression and applies the
 * accumulator expression(s), if specified, to each group.
 * @param  {[Array]} collection     [description]
 * @param  {[Object]} specifications [description]
 * @return {[Array]}                [description]
 */
function $group(collection, specifications) {}

/**
 * Reorders the document stream by a specified sort key.
 * @param  {[Array]} collection     [description]
 * @param  {[Object]} specifications [description]
 * @return {[Array]}                [description]
 */
function $sort(collection, specifications) {}

/**
 * Returns an ordered stream of documents based on the proximity to a geospatial point.
 * @param  {[Array]} collection [description]
 * @param  {[type]} options    [description]
 * @return {[Array]}            [description]
 */
function $geoNear(collection, options) {
  throw Error('Not Implemented');
}

/**
 * Writes the resulting documents of the aggregation pipeline to a collection.
 * @param  {[Array]} collection       [description]
 * @param  {[type]} outputCollection [description]
 * @return {[Array]}                  [description]
 */
function $out(collection, outputCollection) {
  throw Error('Not Implemented');
}
/*eslint-enable */

/*
 Public Aggregation Function
 */

/**
 * Performs aggregation operation using the aggregation pipeline. The pipeline allows users
 * to process data from a collection with a sequence of stage-based manipulations.
 * @param  {[Array]}  collection    [description]
 * @param  {[Array|Object]}  pipeline     [description]
 * @param  {Boolean} explain      Not Implemented
 * @param  {Boolean} allowDiskUse Not Implemented
 * @param  {Boolean} cursor       Not Implemented
 * @return {[Array]}               [description]
 */
function aggregate(collection, pipeline) {

  if (!(0, _lodash.isArray)(pipeline)) {
    pipeline = [pipeline];
  }

  collection = (0, _lodash.chain)(collection);

  for (var i = pipeline.length - 1; i < pipeline.length; i++) {
    var stage = pipeline[i];

    if (stage.$project) {
      collection = $project(collection, stage.$project);
    }
  }

  return collection;
}

exports['default'] = { aggregate: aggregate, $project: $project };
module.exports = exports['default'];

},{"./expressions":3,"lodash":undefined}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
	value: true
});

var _lodash = require('lodash');

function count(collection) {
	return (0, _lodash.size)(collection);
}

exports['default'] = { count: count };
module.exports = exports['default'];

},{"lodash":undefined}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _lodash = require('lodash');

var EXPRESSION_OPERATORS = {};

function isFieldPath(expression) {
    return typeof expression === 'string' && expression.indexOf('$') === 0 && expression.indexOf('$$') === -1;
}

function isSystemVariable(expression) {
    return typeof expression === 'string' && expression.indexOf('$$') === 0;
}

function isExpressionObject(expression) {
    return (0, _lodash.isObject)(expression) && !isExpressionOperator(expression) && !(0, _lodash.isArray)(expression);
}

function isExpressionOperator(expression) {
    return (0, _lodash.size)(expression) === 1 && (0, _lodash.keys)(expression)[0] in EXPRESSION_OPERATORS;
}

function $expression(obj, expression, root) {

    var result;

    if (root === undefined) {
        root = obj;
    }

    console.debug('obj', obj);
    console.debug('expression', expression);

    if (isFieldPath(expression)) {
        result = $fieldPath(obj, expression);
    } else if (isExpressionOperator(EXPRESSION_OPERATORS)) {
        result = $expressionOperator(obj, expression, root);
    } else if (isExpressionObject(expression)) {
        result = $expressionObject(obj, expression, root);
    } else if (isSystemVariable(expression)) {
        throw Error('System Variables are not currently supported');
    } else {
        throw Error('Invalid Expression: ' + JSON.stringify(expression));
    }

    console.debug('result', result);

    return result;
}

function $fieldPath(obj, path) {
    // slice the $ and use the regular get
    // this will need additional tweaks later
    path = path.slice(1);

    if ((0, _lodash.isArray)(obj)) {
        return (0, _lodash.pluck)(obj, path);
    }

    return (0, _lodash.get)(obj, path);
}

function $expressionOperator() {}

function $expressionObject(obj, specifications, root) {

    var result = {};

    if (root === undefined) {
        root = obj;
    }

    for (var field in specifications) {

        var target = root,
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
            target = (0, _lodash.get)(obj, field);
        }

        (0, _lodash.merge)(result, (0, _lodash.set)({}, field, $expression(target, expression, root)));
    }

    return result;
}

function $systemVariable() {}

function $literal() {}

exports['default'] = {
    $expression: $expression, $fieldPath: $fieldPath, $systemVariable: $systemVariable, $literal: $literal, $expressionObject: $expressionObject
};
module.exports = exports['default'];

},{"lodash":undefined}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _aggregation = require('./aggregation');

var _count = require('./count');

// import distinct from './distinct';
// import group from './group';
// import mapReduce from './mapReduce';

var _expressions = require('./expressions');

/*
    Core Modash Object
 */

var Modash = {
    aggregate: _aggregation.aggregate,
    count: _count.count,
    $expression: _expressions.$expression
    // distinct,
    // group,
    // mapReduce
};

// Export the module
exports['default'] = Modash;
module.exports = exports['default'];

},{"./aggregation":1,"./count":2,"./expressions":3}]},{},[4]);
