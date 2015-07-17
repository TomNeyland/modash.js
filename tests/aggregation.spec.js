import _ from 'lodash';

import {
    $project, aggregate
}
from '../src/modash/aggregation';

import testData from './test-data';


describe('Modash Aggregation', function() {




    describe('$project', function() {

        it('should include specific fields in output documents', function() {
            var projection = $project(testData.BOOKS, {
                title: 1,
                author: 1
            }).first().value();

            expect(projection).to.deep.equal({
                "_id": 1,
                "title": "abc123",
                "author": {
                    "last": "zzz",
                    "first": "aaa"
                }
            });


        });

        it('should suppress _id field in the output documents', function() {
            var projection = $project(testData.BOOKS, {
                _id: 0,
                title: 1,
                author: 1
            }).first().value();

            expect(projection).to.deep.equal({
                "title": "abc123",
                "author": {
                    "last": "zzz",
                    "first": "aaa"
                }
            });
        });

    });

    // it('should include specific fields from embedded documents', function() {
    //     var projection = $project(testData.BOOKMARKS, {
    //         "stop.title": 1
    //     }).value();

    //     console.debug(projection)

    //     expect(projection).to.deep.equal([{
    //         "_id": 1,
    //         "stop": {
    //             "title": "book1"
    //         }
    //     }, {
    //         "_id": 2,
    //         "stop": [{
    //             "title": "book2"
    //         }, {
    //             "title": "book3"
    //         }]
    //     }]);
    // });



});
