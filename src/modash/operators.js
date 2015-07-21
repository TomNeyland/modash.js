import {
    every, some, partial, isEqual, isMatch, intersection, union, difference, gt, gte, lt, lte, chain
}
from 'lodash';


/*

Boolean Operators

*/


function $and(...values) {
    console.log('$and', values);
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


function $setEquals(...arrays) {

    var sets = arrays.map(function(array) {
        return chain(array).sortBy().uniq(true).value()
    });

    var head = sets[0];

    return every(sets, function(obj) {
    	return $eq(head, obj);
    });

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

Comparison Operators

*/


function $cmp(value1, value2) {
	console.log('cmp', value1, value2);
	if ($lt(value1, value2)) {
		return -1;
	} else if ($gt(value1, value2)) {
		return 1;
	} else if ($eq(value1, value2)) {
		return 0;
	} else {
		throw Error('Bad comparison?', value1, value2);
	}
}


function $eq(value1, value2) {
	return isEqual(value1, value2);
}


function $gt(value1, value2) {
	return gt(value1, value2);
}


function $gte(value1, value2) {
	return gte(value1, value2);
}


function $lt(value1, value2) {
	return lt(value1, value2);

}


function $lte(value1, value2) {
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

}
