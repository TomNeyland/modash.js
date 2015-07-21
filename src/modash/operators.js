import {
    every, some, partial, isArray, isEqual, intersection, union, difference, gt, gte, lt, lte, unique
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
        head = sets[0];

    return every(sets, partial(isEqual, head));
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
    return $or(...values);
}


function $allElementsTrue(values) {
    return $and(...values);
}


/*

Comparison Operators

*/


function $cmp(value1, value2) {
    console.log('cmp', value1, value2);

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
    console.log('$eq', arguments[0], arguments[1]);
    return isEqual(value1, value2);
}


function $gt(value1, value2) {
    console.log('$gt', arguments[0], arguments[1]);

    if (isArray(value2) && !isArray(value1)) {
        return false;
    } else if (isArray(value1) && !isArray(value2)) {
        return true;
    }

    return gt(value1, value2);
}


function $gte(value1, value2) {
    console.log('$gte', arguments[0], arguments[1]);

    if (isArray(value2) && !isArray(value1)) {
        return false;
    } else if (isArray(value1) && !isArray(value2)) {
        return true;
    }

    return gte(value1, value2);
}


function $lt(value1, value2) {
    console.log('$lt', arguments[0], arguments[1]);

    if (isArray(value2) && !isArray(value1)) {
        return true;
    } else if (isArray(value1) && !isArray(value2)) {
        return false;
    }

    return lt(value1, value2);

}


function $lte(value1, value2) {
    console.log('$lte', arguments[0], arguments[1]);

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
    $gt,
    $gte,
    $lt,
    $lte,
    $ne,
    // String Operators
    $substr

};
