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


        it('should include specific fields from embedded documents using dot notation', function() {
            var projection = $project(testData.BOOKMARKS, {
                "stop.title": 1
            }).value();

            expect(projection).to.deep.equal([{
                "_id": 1,
                "stop": {
                    "title": "book1"
                }
            }, {
                "_id": 2,
                "stop": [{
                    "title": "book2"
                }, {
                    "title": "book3"
                }]
            }]);
        });

        it('should include specific fields from embedded documents using object notation', function() {
            var projection = $project(testData.BOOKMARKS, {
                "stop": {
                    "title": 1
                }
            }).value();

            expect(projection).to.deep.equal([{
                "_id": 1,
                "stop": {
                    "title": "book1"
                }
            }, {
                "_id": 2,
                "stop": [{
                    "title": "book2"
                }, {
                    "title": "book3"
                }]
            }]);
        });


        it('should include computed fields', function() {

            var projection = $project(testData.BOOKS, {
                title: 1,
                isbn: {
                    prefix: {
                        $substr: ["$isbn", 0, 3]
                    },
                    group: {
                        $substr: ["$isbn", 3, 2]
                    },
                    publisher: {
                        $substr: ["$isbn", 5, 4]
                    },
                    title: {
                        $substr: ["$isbn", 9, 3]
                    },
                    checkDigit: {
                        $substr: ["$isbn", 12, 1]
                    }
                },
                lastName: "$author.last",
                copiesSold: "$copies"
            }).first().value();

            expect(projection).to.deep.equal({
                "_id": 1,
                "title": "abc123",
                "isbn": {
                    "prefix": "000",
                    "group": "11",
                    "publisher": "2222",
                    "title": "333",
                    "checkDigit": "4"
                },
                "lastName": "zzz",
                "copiesSold": 5
            });

        });

    });

});
