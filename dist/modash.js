(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports["default"] = function () {};

module.exports = exports["default"];

},{}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
	value: true
});

var _lodash = require('lodash');

function count(collection) {
	return (0, _lodash.size)(collection);
}

exports['default'] = count;
module.exports = exports['default'];

},{"lodash":undefined}],3:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports["default"] = function () {};

module.exports = exports["default"];

},{}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});
var FIELD_PATH = 'FIELD_PATH',
    SYSTEM_VARIABLE = 'SYSTEM_VARIABLE',
    LITERAL = 'LITERAL',
    EXPRESSION_OBJECT = 'EXPRESSION_OBJECT',
    EXPRESSION_OPERATOR = 'EXPRESSION_OPERATOR';

function $expression(obj, expression) {

    if (expression.$literal) {
        return expression.$literal;
    }
}

function $fieldPath() {}

function $systemVariable() {}

function $literal() {}

exports['default'] = {
    $expression: $expression, $fieldPath: $fieldPath, $systemVariable: $systemVariable, $literal: $literal
};
module.exports = exports['default'];

},{}],5:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports["default"] = function () {};

module.exports = exports["default"];

},{}],6:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports["default"] = function () {};

module.exports = exports["default"];

},{}],7:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _aggregate = require('./aggregate');

var _aggregate2 = _interopRequireDefault(_aggregate);

var _count = require('./count');

var _count2 = _interopRequireDefault(_count);

var _distinct = require('./distinct');

var _distinct2 = _interopRequireDefault(_distinct);

var _group = require('./group');

var _group2 = _interopRequireDefault(_group);

var _mapReduce = require('./mapReduce');

var _mapReduce2 = _interopRequireDefault(_mapReduce);

var _expression = require('./expression');

/*
    Core Modash Object
 */

var Modash = {
    aggregate: _aggregate2['default'],
    count: _count2['default'],
    distinct: _distinct2['default'],
    group: _group2['default'],
    mapReduce: _mapReduce2['default']
};

// Export the module
exports['default'] = Modash;
module.exports = exports['default'];

},{"./aggregate":1,"./count":2,"./distinct":3,"./expression":4,"./group":5,"./mapReduce":6}]},{},[7]);
