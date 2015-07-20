import {
    all, any
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
    // String Operators
    $substr

}
