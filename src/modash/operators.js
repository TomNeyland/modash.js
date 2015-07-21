import {
    every, some, partial, isArray, isEqual, intersection, union, difference, gt, gte, lt, lte, unique, sum, isDate
}
from 'lodash';


/*

Boolean Operators

*/

function $and(...values) {
    return every(values);
}

function $or(...values) {
    return some(values);
}

function $not(...values) {
    return !some(values);
}


/*

Set Operators

*/

function $asSet(array) {
    return unique(array).sort($cmp);
}

function $setEquals(...arrays) {

    var sets = arrays.map($asSet),
        firstSet = sets.shift();

    return every(sets, partial(isEqual, firstSet));
}

function $setIntersection(...arrays) {
    return $asSet(intersection(...arrays));
}

function $setUnion(...arrays) {
    return union(...arrays.map($asSet));
}

function $setDifference(...arrays) {
    return difference(...arrays.map($asSet));
}

function $setIsSubset(subset, superset) {
    return isEqual($asSet(intersection(subset, superset)), $asSet(subset));
}

function $anyElementTrue(values) {

    if (!isArray(values)) {
        throw Error(`values must be an array, got ${typeof values}`);
    }

    return $or(...values);
}

function $allElementsTrue(values) {

    if (!isArray(values)) {
        throw Error(`values must be an array, got ${typeof values}`);
    }

    return $and(...values);
}


/*

Comparison Operators

*/

function $cmp(value1, value2) {

    if (isArray(value1) && isArray(value2)) {
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
    return isEqual(value1, value2);
}

function $gt(value1, value2) {

    if (isArray(value2) && !isArray(value1)) {
        return false;
    } else if (isArray(value1) && !isArray(value2)) {
        return true;
    }

    return gt(value1, value2);
}

function $gte(value1, value2) {

    if (isArray(value2) && !isArray(value1)) {
        return false;
    } else if (isArray(value1) && !isArray(value2)) {
        return true;
    }

    return gte(value1, value2);
}

function $lt(value1, value2) {

    if (isArray(value2) && !isArray(value1)) {
        return true;
    } else if (isArray(value1) && !isArray(value2)) {
        return false;
    }

    return lt(value1, value2);

}

function $lte(value1, value2) {

    if (isArray(value2) && !isArray(value1)) {
        return true;
    } else if (isArray(value1) && !isArray(value2)) {
        return false;
    }

    return lte(value1, value2);

}

function $ne(value1, value2) {
    return !$eq(value1, value2);
}


/*

Arithmetic Operators

*/

function $add(...values) {

    var result = values.shift(),
        resultAsDate = false;

    if (isDate(result)) {
    	resultAsDate = true;
    	result = result.getTime();
    }

    for (let i = values.length - 1; i >= 0; i--) {
        let value = values[i];
        if (isDate(value)) {
            resultAsDate = true;
            value = value.getTime();
        }
        result += value;
    };

    return resultAsDate ? new Date(result) : result;
}

function $subtract(value1, value2) {
    if (isDate(value1) && isDate(value2)) {

    	return value1.getTime() - value2.getTime();
    } else if (isDate(value1) && !isDate(value2)) {
    	return new Date(value1.getTime() - value2);
    } else if (!isDate(value1) && isDate(value2)) {
	console.log(value1, value2);

    	return new Date(value1 - value2.getTime())
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

function $substr(string, start, len) {
    return string.slice(start, start + len);
}



export default {
    // Boolean Operators
    $and,
    $or,
    $not,
    // Set Operators
    $setEquals,
    $setIntersection,
    $setUnion,
    $setDifference,
    $setIsSubset,
    $anyElementTrue,
    $allElementsTrue,
    // Comparison Operators
    $cmp,
    $eq,
    $gt,
    $gte,
    $lt,
    $lte,
    $ne,
    // Arithmetic Operators
    $add,
    $subtract,
    $divide,
    $multiply,
    $mod,
    // String Operators
    $substr
};
