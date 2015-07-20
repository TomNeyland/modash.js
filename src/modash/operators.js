import {
    all, any, partial, isEqual, intersection, union, difference
}
from 'lodash';


/*

Boolean Operators

*/


function $and(...values) {
    return all(values);
}


function $or(...values) {
    return any(values);
}


function $not(...values) {
    return !any(values);
}


/*

Set Operators

*/


function $setEquals(...arrays) {

    var sets = arrays.map(function(array) {
        return _(array).sortBy().uniq(true).value()
    });

    head = sets[0];

    return all(sets, partial(isEqual, head)).value();

}


function $setIntersection(...arrays) {
    return intersection(...arrays);
}


function $setUnion(...arrays) {
    return union(...arrays);
}


function $setDifference(...arrays) {
    return difference(...arrays);
}


function $setIsSubset(subset, superset) {
	return isEqual(intersection(subset, superset), subset);
}


function $anyElementTrue(values) {
	return $or(...values);
}


function $allElementsTrue(values) {
	return $and(...values);
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
    $setIntersetion,
    $setUnion,
    $setDifference,
    $setIsSubset,
    $anyElementTrue,
    $allElementsTrue,
    // String Operators
    $substr

}
