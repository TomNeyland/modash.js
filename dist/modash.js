(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _lodash = require('lodash');

var _expressions = require('./expressions');

var ACCUMULATORS = {
    $accumulate: $accumulate,
    $sum: $sum,
    $avg: $avg,
    $first: $first,
    $last: $last,
    $min: $min,
    $max: $max,
    $push: $push,
    $addToSet: $addToSet
};

function isAccumulatorExpression(expression) {
    return (0, _lodash.size)(expression) === 1 && (0, _lodash.keys)(expression)[0] in ACCUMULATORS;
}

/*

Accumulators

 */

function $accumulate(collection, operatorExpression) {
    if (isAccumulatorExpression(operatorExpression)) {
        var operator = (0, _lodash.keys)(operatorExpression)[0],
            args = operatorExpression[operator],
            accumulatorFunction = ACCUMULATORS[operator];

        var result = accumulatorFunction(collection, args);
        return result;
    }
}

function $sum(collection, spec) {

    if (spec === 1) {
        return (0, _lodash.size)(collection);
    }

    return (0, _lodash.sum)(collection, function (obj) {
        return (0, _expressions.$expression)(obj, spec);
    });
}

function $avg(collection, spec) {
    return $sum(collection, spec) / (0, _lodash.size)(collection);
}

function $first(collection, spec) {
    return (0, _expressions.$expression)((0, _lodash.first)(collection), spec);
}

function $last(collection, spec) {
    return (0, _expressions.$expression)((0, _lodash.last)(collection), spec);
}

function $max(collection, spec) {
    return (0, _lodash.max)(collection, function (obj) {
        return (0, _expressions.$expression)(obj, spec);
    });
}

function $min(collection, spec) {
    return (0, _lodash.min)(collection, function (obj) {
        return (0, _expressions.$expression)(obj, spec);
    });
}

function $push(collection, spec) {
    return (0, _lodash.map)(collection, function (obj) {
        return (0, _expressions.$expression)(obj, spec);
    });
}

function $addToSet(collection, spec) {
    console.debug('Please find a more efficient way to do this');
    return (0, _lodash.unique)($push(collection, spec), function (obj) {
        return JSON.stringify(obj);
    });
}

exports['default'] = ACCUMULATORS;
exports.$accumulate = $accumulate;

},{"./expressions":4,"lodash":undefined}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _lodash = require('lodash');

var _expressions = require('./expressions');

var _accumulators = require('./accumulators');

/*

Stage Operators

*/

/**
 * Reshapes each document in the stream, such as by adding new fields or
 * removing existing fields. For each input document, outputs one document.
 * @param  {Array} collection     [description]
 * @param  {Object} specifications [description]
 * @return {Array}                [description]
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
 * @param  {Array} collection [description]
 * @param  {type} query      [description]
 * @return {Array}            [description]
 */
function $match(collection, query) {

    var result = [];

    for (var i = 0; i < collection.length; i++) {
        var item = collection[i],
            itemMatched = true;

        for (param in query) {
            var expression = query[param],
                expressionValue = (0, _expressions.$expressionObject)(item, expression);

            if (expression === false) {
                itemMatched = false;
                break;
            }
        }

        if (itemMatched) {
            result.push(item);
        }
    };

    return result;
}

/**
 * Reshapes each document in the stream by restricting the content for each
 * document based on information stored in the documents themselves.
 * @param  {Array} collection [description]
 * @param  {type} expression [description]
 * @return {Array}            [description]
 */
function $redact(collection, expression) {}

/**
 * Limits the number of documents passed to the next stage in the pipeline.
 * @param  {Array} collection [description]
 * @param  {type} count      [description]
 * @return {Array}            [description]
 */
function $limit(collection, count) {
    return (0, _lodash.first)(collection, count);
}

/**
 * Skips the first n documents where n is the specified skip number and passes
 * the remaining documents unmodified to the pipeline
 * @param  {Array} collection [description]
 * @param  {type} count      [description]
 * @return {Array}            [description]
 */
function $skip(collection, count) {}

/**
 * Deconstructs an array field from the input documents to output a document
 * for each element.
 * @param  {Array} collection [description]
 * @param  {type} fieldPath  [description]
 * @return {Array}            [description]
 */
function $unwind(collection, fieldPath) {}

/**
 * Groups input documents by a specified identifier expression and applies the
 * accumulator expression(s), if specified, to each group.
 * @param  {Array} collection     [description]
 * @param  {Object} specifications [description]
 * @return {Array}                [description]
 */
function $group(collection) {
    var specifications = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    var _idSpec = specifications._id;

    var groups = (0, _lodash.chain)(collection).groupBy(function (obj) {
        return _idSpec ? JSON.stringify((0, _expressions.$expression)(obj, _idSpec)) : null;
    });

    return groups.map(function (members, key, group) {
        return (0, _lodash.mapValues)(specifications, function (fieldSpec, field) {
            if (field === '_id') {
                return fieldSpec ? (0, _expressions.$expression)(members[0], _idSpec) : null;
            } else {
                return (0, _accumulators.$accumulate)(members, fieldSpec);
            }
        });
    });
}

/**
 * Reorders the document stream by a specified sort key.
 * @param  {Array} collection     [description]
 * @param  {Object} specifications [description]
 * @return {Array}                [description]
 */
function $sort(collection, specifications) {
    throw Error('Not Implemented');
}

/**
 * Returns an ordered stream of documents based on the proximity to a geospatial point.
 * @param  {Array} collection [description]
 * @param  {type} options    [description]
 * @return {Array}            [description]
 */
function $geoNear(collection, options) {
    throw Error('Not Implemented');
}

/**
 * Writes the resulting documents of the aggregation pipeline to a collection.
 * @param  {Array} collection       [description]
 * @param  {type} outputCollection [description]
 * @return {Array}                  [description]
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
 * @param  {Array}  collection    [description]
 * @param  {Array|Object}  pipeline     [description]
 * @param  {Boolean} explain      Not Implemented
 * @param  {Boolean} allowDiskUse Not Implemented
 * @param  {Boolean} cursor       Not Implemented
 * @return {Array}               [description]
 */
function aggregate(collection, pipeline) {

    if (!(0, _lodash.isArray)(pipeline)) {
        pipeline = [pipeline];
    }
    collection = (0, _lodash.chain)(collection);

    // collection = chain(collection);

    for (var i = 0; i < pipeline.length; i++) {
        var stage = pipeline[i];

        if (stage.$project) {
            collection = $project(collection, stage.$project);
        }
        if (stage.$group) {
            collection = $group(collection, stage.$group);
        }
    }

    return collection.value();
}

exports['default'] = {
    aggregate: aggregate, $project: $project, $group: $group
};
module.exports = exports['default'];

},{"./accumulators":1,"./expressions":4,"lodash":undefined}],3:[function(require,module,exports){
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

},{"lodash":undefined}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var _lodash = require('lodash');

var _operators = require('./operators');

var _operators2 = _interopRequireDefault(_operators);

function isFieldPath(expression) {
    return typeof expression === 'string' && expression.indexOf('$') === 0 && expression.indexOf('$$') === -1;
}

function isSystemVariable(expression) {
    return typeof expression === 'string' && expression.indexOf('$$') === 0;
}

function isExpressionObject(expression) {
    return (0, _lodash.isObject)(expression) && !isExpressionOperator(expression) && !(0, _lodash.isArray)(expression) && !(0, _lodash.isDate)(expression);
}

function isExpressionOperator(expression) {
    return (0, _lodash.size)(expression) === 1 && (0, _lodash.keys)(expression)[0] in _operators2['default'];
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

    return (0, _lodash.get)(obj, path);
}

function $expressionOperator(obj, operatorExpression, root) {

    var operator = (0, _lodash.keys)(operatorExpression)[0],
        args = operatorExpression[operator],
        operatorFunction = _operators2['default'][operator],
        result;

    if (!(0, _lodash.isArray)(args)) {
        args = [args];
    }

    args = args.map(function (argExpression) {
        return $expression(obj, argExpression, root);
    });

    result = operatorFunction.apply(undefined, _toConsumableArray(args));
    return result;
}

function $expressionObject(obj, specifications, root) {

    var result = {};

    if (root === undefined) {
        root = obj;
    }

    var _loop = function (path) {

        var target = root,
            expression = specifications[path];

        if (path.indexOf('.') !== -1) {
            pathParts = path.split('.');

            var headPath = pathParts.shift();
            var head = (0, _lodash.get)(obj, headPath);

            if ((0, _lodash.isArray)(head)) {
                /*eslint-disable */
                // refactor this part soon...
                (0, _lodash.set)(result, headPath, head.map(function (subtarget) {
                    return $expression(subtarget, _defineProperty({}, pathParts.join('.'), expression), root);
                }));
                /*eslint-enable */
            } else {
                    (0, _lodash.merge)(result, (0, _lodash.set)({}, headPath, $expression(head, _defineProperty({}, pathParts.join('.'), expression), root)));
                }
        } else {

            if (expression === true || expression === 1) {
                // Simple passthrough of obj's path/field values
                target = obj;
                expression = '$' + path;
            } else if (expression === false || expression === 0) {
                // we can go ahead and skip this all together
                return 'continue';
            } else if (typeof expression === 'string') {
                // Assume a pathspec for now, meaning we use root as the target
                target = root;
            } else if (typeof expression === 'object') {
                target = (0, _lodash.get)(obj, path);
            }
            if ((0, _lodash.isArray)(target)) {
                /*eslint-disable */
                // refactor this part soon...
                (0, _lodash.merge)(result, (0, _lodash.set)({}, path, target.map(function (subtarget) {
                    return $expression(subtarget, expression, root);
                })));
                /*eslint-enable */
            } else {

                    (0, _lodash.merge)(result, (0, _lodash.set)({}, path, $expression(target, expression, root)));
                }
        }
    };

    for (var path in specifications) {
        var pathParts;

        var _ret = _loop(path);

        if (_ret === 'continue') continue;
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

function $literal() {}

exports['default'] = {
    $expression: $expression, $fieldPath: $fieldPath, $systemVariable: $systemVariable, $literal: $literal, $expressionObject: $expressionObject, isExpressionOperator: isExpressionOperator, isExpressionObject: isExpressionObject
};
module.exports = exports['default'];

},{"./operators":5,"lodash":undefined}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } }

var _lodash = require('lodash');

/*

Boolean Operators

*/

function $and() {
    for (var _len = arguments.length, values = Array(_len), _key = 0; _key < _len; _key++) {
        values[_key] = arguments[_key];
    }

    return (0, _lodash.every)(values);
}

function $or() {
    for (var _len2 = arguments.length, values = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        values[_key2] = arguments[_key2];
    }

    return (0, _lodash.some)(values);
}

function $not() {
    for (var _len3 = arguments.length, values = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
        values[_key3] = arguments[_key3];
    }

    return !(0, _lodash.some)(values);
}

/*

Set Operators

*/

function $asSet(array) {
    return (0, _lodash.unique)(array).sort($cmp);
}

function $setEquals() {
    for (var _len4 = arguments.length, arrays = Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
        arrays[_key4] = arguments[_key4];
    }

    var sets = arrays.map($asSet),
        firstSet = sets.shift();

    return (0, _lodash.every)(sets, (0, _lodash.partial)(_lodash.isEqual, firstSet));
}

function $setIntersection() {
    return $asSet(_lodash.intersection.apply(undefined, arguments));
}

function $setUnion() {
    for (var _len5 = arguments.length, arrays = Array(_len5), _key5 = 0; _key5 < _len5; _key5++) {
        arrays[_key5] = arguments[_key5];
    }

    return _lodash.union.apply(undefined, _toConsumableArray(arrays.map($asSet)));
}

function $setDifference() {
    for (var _len6 = arguments.length, arrays = Array(_len6), _key6 = 0; _key6 < _len6; _key6++) {
        arrays[_key6] = arguments[_key6];
    }

    return _lodash.difference.apply(undefined, _toConsumableArray(arrays.map($asSet)));
}

function $setIsSubset(subset, superset) {
    return (0, _lodash.isEqual)($asSet((0, _lodash.intersection)(subset, superset)), $asSet(subset));
}

function $anyElementTrue(values) {

    if (!(0, _lodash.isArray)(values)) {
        throw Error('values must be an array, got ' + typeof values);
    }

    return $or.apply(undefined, _toConsumableArray(values));
}

function $allElementsTrue(values) {

    if (!(0, _lodash.isArray)(values)) {
        throw Error('values must be an array, got ' + typeof values);
    }

    return $and.apply(undefined, _toConsumableArray(values));
}

/*

Comparison Operators

*/

function $cmp(value1, value2) {

    if ((0, _lodash.isArray)(value1) && (0, _lodash.isArray)(value2)) {
        return 0;
    }

    if ($lt(value1, value2)) {
        return -1;
    } else if ($gt(value1, value2)) {
        return 1;
    }
    return 0;
}

function $eq(value1, value2) {
    return (0, _lodash.isEqual)(value1, value2);
}

function $gt(value1, value2) {

    if ((0, _lodash.isArray)(value2) && !(0, _lodash.isArray)(value1)) {
        return false;
    } else if ((0, _lodash.isArray)(value1) && !(0, _lodash.isArray)(value2)) {
        return true;
    }

    return (0, _lodash.gt)(value1, value2);
}

function $gte(value1, value2) {

    if ((0, _lodash.isArray)(value2) && !(0, _lodash.isArray)(value1)) {
        return false;
    } else if ((0, _lodash.isArray)(value1) && !(0, _lodash.isArray)(value2)) {
        return true;
    }

    return (0, _lodash.gte)(value1, value2);
}

function $lt(value1, value2) {

    if ((0, _lodash.isArray)(value2) && !(0, _lodash.isArray)(value1)) {
        return true;
    } else if ((0, _lodash.isArray)(value1) && !(0, _lodash.isArray)(value2)) {
        return false;
    }

    return (0, _lodash.lt)(value1, value2);
}

function $lte(value1, value2) {

    if ((0, _lodash.isArray)(value2) && !(0, _lodash.isArray)(value1)) {
        return true;
    } else if ((0, _lodash.isArray)(value1) && !(0, _lodash.isArray)(value2)) {
        return false;
    }

    return (0, _lodash.lte)(value1, value2);
}

function $ne(value1, value2) {
    return !$eq(value1, value2);
}

/*

Arithmetic Operators

*/

function $add() {
    for (var _len7 = arguments.length, values = Array(_len7), _key7 = 0; _key7 < _len7; _key7++) {
        values[_key7] = arguments[_key7];
    }

    var result = values.shift(),
        resultAsDate = false;

    if ((0, _lodash.isDate)(result)) {
        resultAsDate = true;
        result = result.getTime();
    }

    for (var i = values.length - 1; i >= 0; i--) {
        var value = values[i];
        if ((0, _lodash.isDate)(value)) {
            resultAsDate = true;
            value = value.getTime();
        }
        result += value;
    }

    return resultAsDate ? new Date(result) : result;
}

function $subtract(value1, value2) {
    if ((0, _lodash.isDate)(value1) && (0, _lodash.isDate)(value2)) {
        return value1.getTime() - value2.getTime();
    } else if ((0, _lodash.isDate)(value1) && !(0, _lodash.isDate)(value2)) {
        return new Date(value1.getTime() - value2);
    } else if (!(0, _lodash.isDate)(value1) && (0, _lodash.isDate)(value2)) {
        return new Date(value1 - value2.getTime());
    } else {
        return value1 - value2;
    }
}

function $multiply(value1, value2) {
    return value1 * value2;
}

function $divide(value1, value2) {
    return value1 / value2;
}

function $mod(value1, value2) {
    return value1 % value2;
}

/*

String Operators

*/

function $concat() {
    for (var _len8 = arguments.length, expressions = Array(_len8), _key8 = 0; _key8 < _len8; _key8++) {
        expressions[_key8] = arguments[_key8];
    }

    return expressions.join('');
}

function $substr(string, start, len) {
    return string.slice(start, start + len);
}

function $toLower(string) {
    return string.toLowerCase();
}

function $toUpper(string) {
    return string.toUpperCase();
}

function $strcasecmp(string1, string2) {
    string1 = string1.toLowerCase();
    string2 = string2.toLowerCase();

    if (string1 === string2) {
        return 0;
    } else if (string1 > string2) {
        return 1;
    } else if (string1 < string2) {
        return -1;
    } else {
        throw new Error('Error comparing values: ' + string1 + ' and ' + string2);
    }
}

/*

Text Search Operators

*/

function $meta(metaDataKeyword) {
    throw new Error('Not Implemented');
}

/*

Array Operators

*/

/*

Variable Operators

*/

/*

Literal Operators

*/

/*

Date Operators

 */

function $dayOfYear(date) {
    var start = new Date(date.getFullYear(), 0, 0);
    var diff = date - start;
    var oneDay = 1000 * 60 * 60 * 24;
    var day = Math.floor(diff / oneDay);
    return day;
}

function $dayOfMonth(date) {
    return date ? date.getDate() : null;
}

function $dayOfWeek(date) {
    return date ? date.getDay() : null;
}

function $year(date) {
    return date ? date.getFullYear() : null;
}

function $month(date) {
    return date ? date.getMonth() + 1 : null;
}

// https://gist.github.com/dblock/1081513
function $week(date) {

    // Create a copy of this date object
    var target = new Date(date.valueOf());

    // ISO week date weeks start on monday
    // so correct the day number
    var dayNr = (date.getDay() + 6) % 7;

    // Set the target to the thursday of this week so the
    // target date is in the right year
    target.setDate(target.getDate() - dayNr + 3);

    // ISO 8601 states that week 1 is the week
    // with january 4th in it
    var jan4 = new Date(target.getFullYear(), 0, 4);

    // Number of days between target date and january 4th
    var dayDiff = (target - jan4) / 86400000;

    // Calculate week number: Week 1 (january 4th) plus the
    // number of weeks between target date and january 4th
    var weekNr = 1 + Math.ceil(dayDiff / 7);

    return weekNr;
}

function $hour(date) {
    return date.getHours();
}

function $minute(date) {
    return date.getMinutes();
}

function $second(date) {
    return date.getSeconds();
}

function $millisecond(date) {
    return date.getMilliseconds();
}

function $dateToString(date) {
    return date.toString();
}

/*

Conditional Aggregation Operators

 */

exports['default'] = {
    // Boolean Operators
    $and: $and,
    $or: $or,
    $not: $not,
    // Set Operators
    $setEquals: $setEquals,
    $setIntersection: $setIntersection,
    $setUnion: $setUnion,
    $setDifference: $setDifference,
    $setIsSubset: $setIsSubset,
    $anyElementTrue: $anyElementTrue,
    $allElementsTrue: $allElementsTrue,
    // Comparison Operators
    $cmp: $cmp,
    $eq: $eq,
    $gt: $gt,
    $gte: $gte,
    $lt: $lt,
    $lte: $lte,
    $ne: $ne,
    // Arithmetic Operators
    $add: $add,
    $subtract: $subtract,
    $divide: $divide,
    $multiply: $multiply,
    $mod: $mod,
    // String Operators
    $concat: $concat,
    $substr: $substr,
    $toLower: $toLower,
    $toUpper: $toUpper,
    $strcasecmp: $strcasecmp,
    // Text Search Operators
    $meta: $meta,
    // Date Operators
    $dayOfYear: $dayOfYear,
    $dayOfMonth: $dayOfMonth,
    $dayOfWeek: $dayOfWeek,
    $year: $year,
    $month: $month,
    $week: $week,
    $hour: $hour,
    $minute: $minute,
    $second: $second,
    $millisecond: $millisecond,
    $dateToString: $dateToString
};
module.exports = exports['default'];

},{"lodash":undefined}],6:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _aggregation = require('./aggregation');

var _count = require('./count');

// import distinct from './distinct';
// import $group from './group';
// import mapReduce from './mapReduce';

var _expressions = require('./expressions');

/*
    Core Modash Object
 */

var Modash = {
    aggregate: _aggregation.aggregate,
    count: _count.count,
    $expression: _expressions.$expression,
    // distinct,
    $group: _aggregation.$group,
    $project: _aggregation.$project
    // mapReduce
};

// Export the module
exports['default'] = Modash;
module.exports = exports['default'];

},{"./aggregation":2,"./count":3,"./expressions":4}]},{},[6]);
