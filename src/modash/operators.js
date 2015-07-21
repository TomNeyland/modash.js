import {
    all, any, partial, isEqual, intersection, union, difference, gt, gte, lt, lte
}
from 'lodash';


/*

Boolean Operators

*/


function $and(...values) {
    console.log('$and', values);
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

    return all(sets, partial(isEqual, [head])).value();

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
