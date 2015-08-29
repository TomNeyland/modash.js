import {
    every, some, partial, isArray, isEqual, intersection, union, difference, gt, gte, lt, lte, unique, isDate
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
    }

    return resultAsDate ? new Date(result) : result;
}

function $subtract(value1, value2) {
    if (isDate(value1) && isDate(value2)) {
        return value1.getTime() - value2.getTime();
    } else if (isDate(value1) && !isDate(value2)) {
        return new Date(value1.getTime() - value2);
    } else if (!isDate(value1) && isDate(value2)) {
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

function $concat(...expressions) {
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
    $concat,
    $substr,
    $toLower,
    $toUpper,
    $strcasecmp,
    // Text Search Operators
    $meta,
    // Date Operators
    $dayOfYear,
    $dayOfMonth,
    $dayOfWeek,
    $year,
    $month,
    $week,
    $hour,
    $minute,
    $second,
    $millisecond,
    $dateToString
};
