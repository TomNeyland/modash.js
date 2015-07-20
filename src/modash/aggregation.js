import {
    chain, isArray
}
from 'lodash';

import {
    $expressionObject
}
from './expressions';


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

    return chain(collection)
        .map(function(obj) {
            return $expressionObject(obj, specifications, obj);
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
function $match(collection, query) {

}


/**
 * Reshapes each document in the stream by restricting the content for each
 * document based on information stored in the documents themselves.
 * @param  {[Array]} collection [description]
 * @param  {[type]} expression [description]
 * @return {[Array]}            [description]
 */
function $redact(collection, expression) {

}


/**
 * Limits the number of documents passed to the next stage in the pipeline.
 * @param  {[Array]} collection [description]
 * @param  {[type]} count      [description]
 * @return {[Array]}            [description]
 */
function $limit(collection, count) {

}


/**
 * Skips the first n documents where n is the specified skip number and passes
 * the remaining documents unmodified to the pipeline
 * @param  {[Array]} collection [description]
 * @param  {[type]} count      [description]
 * @return {[Array]}            [description]
 */
function $skip(collection, count) {

}


/**
 * Deconstructs an array field from the input documents to output a document
 * for each element.
 * @param  {[Array]} collection [description]
 * @param  {[type]} fieldPath  [description]
 * @return {[Array]}            [description]
 */
function $unwind(collection, fieldPath) {

}


/**
 * Groups input documents by a specified identifier expression and applies the
 * accumulator expression(s), if specified, to each group.
 * @param  {[Array]} collection     [description]
 * @param  {[Object]} specifications [description]
 * @return {[Array]}                [description]
 */
function $group(collection, specifications) {

}


/**
 * Reorders the document stream by a specified sort key.
 * @param  {[Array]} collection     [description]
 * @param  {[Object]} specifications [description]
 * @return {[Array]}                [description]
 */
function $sort(collection, specifications) {

}


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

    if (!isArray(pipeline)) {
        pipeline = [pipeline];
    }

    collection = chain(collection);

    for (let i = pipeline.length - 1; i < pipeline.length; i++) {
        let stage = pipeline[i];

        if (stage.$project) {
			collection = $project(collection, stage.$project);
        }

    }

    return collection;
}



export default { aggregate, $project };
