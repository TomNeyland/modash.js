import _ from 'lodash';
import Modash from '../src/modash';
import testData from './test-data';
import {
    expect
}
from 'chai';

var db;

beforeEach(function() {
    _.mixin(Modash);
    db = _.mapValues(testData, _.chain);
});

describe('Modash Aggregation', function() {

    describe('$group', function() {

        var groupingConfig = {
                _id: {
                    month: {
                        $month: '$date'
                    },
                    day: {
                        $dayOfMonth: '$date'
                    },
                    year: {
                        $year: '$date'
                    }
                },
                totalPrice: {
                    $sum: {
                        $multiply: ['$price', '$quantity']
                    }
                },
                averageQuantity: {
                    $avg: '$quantity'
                },
                count: {
                    $sum: 1
                }
            },
            nullGroupingConfig = _.extend({}, groupingConfig, {
                _id: null
            }),
            distinctConfig = {
                _id: '$item'
            },
            titleByAuthorConfig = {
                _id: '$author',
                books: {
                    $push: '$title'
                }
            };

        it('should group the documents by the month, day, and year and calculate the total price and the average quantity as well as counts the documents per each group',
            function() {

                var grouping = db.sales2.aggregate([{
                    $group: groupingConfig
                }]).value();

                expect(grouping).to.deep.equal([{
                    '_id': {
                        'month': 3,
                        'day': 1,
                        'year': 2014
                    },
                    'totalPrice': 40,
                    'averageQuantity': 1.5,
                    'count': 2
                }, {
                    '_id': {
                        'month': 3,
                        'day': 15,
                        'year': 2014
                    },
                    'totalPrice': 50,
                    'averageQuantity': 10,
                    'count': 1
                }, {
                    '_id': {
                        'month': 4,
                        'day': 4,
                        'year': 2014
                    },
                    'totalPrice': 200,
                    'averageQuantity': 15,
                    'count': 2
                }]);

            });

        it('should calculate the total price and the average quantity as well as counts for all documents in the collection', function() {

            var nullGrouping = db.sales2.aggregate([{
                $group: nullGroupingConfig
            }]).value();

            expect(nullGrouping).to.deep.equal([{
                '_id': null,
                'totalPrice': 290,
                'averageQuantity': 8.6,
                'count': 5
            }]);


        });

        it('should group the documents by the item to retrieve the distinct item values', function() {

            var distinctGrouping = db.sales2.aggregate([{
                $group: distinctConfig
            }]).value();

            expect(distinctGrouping).to.deep.equal([{
                '_id': 'abc'
            }, {
                '_id': 'jkl'
            }, {
                '_id': 'xyz'
            }]);

        });


        it('should pivot the data in the books collection to have titles grouped by authors', function() {

            var pivotGrouping = db.books2.aggregate([{
                $group: titleByAuthorConfig
            }]).value().reverse();
            expect(pivotGrouping).to.deep.equal([{
                '_id': 'Homer',
                'books': ['The Odyssey', 'Iliad']
            }, {
                '_id': 'Dante',
                'books': ['The Banquet', 'Divine Comedy', 'Eclogues']
            }]);

        });

        it('should use the $$ROOT system variable to group the documents by authors.', function() {

            var pivotGrouping = db.books2.aggregate([{
                $group: {
                    _id: '$author',
                    books: {
                        $push: '$$ROOT'
                    }
                }
            }]).reverse().value();

            expect(pivotGrouping).to.deep.equal([{
                '_id': 'Homer',
                'books': [{
                    '_id': 7000,
                    'title': 'The Odyssey',
                    'author': 'Homer',
                    'copies': 10
                }, {
                    '_id': 7020,
                    'title': 'Iliad',
                    'author': 'Homer',
                    'copies': 10
                }]
            }, {
                '_id': 'Dante',
                'books': [{
                    '_id': 8751,
                    'title': 'The Banquet',
                    'author': 'Dante',
                    'copies': 2
                }, {
                    '_id': 8752,
                    'title': 'Divine Comedy',
                    'author': 'Dante',
                    'copies': 1
                }, {
                    '_id': 8645,
                    'title': 'Eclogues',
                    'author': 'Dante',
                    'copies': 2
                }]
            }]);

        });

    });


    describe('$project', function() {

        it('should include specific fields in output documents', function() {
            var projection = db.BOOKS.aggregate({
                $project: {
                    title: 1,
                    author: 1
                }
            }).first().value();

            expect(projection).to.deep.equal({
                '_id': 1,
                'title': 'abc123',
                'author': {
                    'last': 'zzz',
                    'first': 'aaa'
                }
            });


        });

        it('should suppress _id field in the output documents', function() {
            var projection = db.BOOKS.aggregate({
                $project: {
                    _id: 0,
                    title: 1,
                    author: 1
                }
            }).first().value();

            expect(projection).to.deep.equal({
                'title': 'abc123',
                'author': {
                    'last': 'zzz',
                    'first': 'aaa'
                }
            });
        });


        it('should include specific fields from embedded documents using dot notation', function() {
            var projection = db.BOOKMARKS.aggregate({
                $project: {
                    'stop.title': 1
                }
            }).value();

            expect(projection).to.deep.equal([{
                '_id': 1,
                'stop': {
                    'title': 'book1'
                }
            }, {
                '_id': 2,
                'stop': [{
                    'title': 'book2'
                }, {
                    'title': 'book3'
                }]
            }]);
        });

        it('should include specific fields from embedded documents using object notation', function() {
            var projection = db.BOOKMARKS.aggregate({
                $project: {
                    'stop': {
                        'title': 1
                    }
                }
            }).value();

            expect(projection).to.deep.equal([{
                '_id': 1,
                'stop': {
                    'title': 'book1'
                }
            }, {
                '_id': 2,
                'stop': [{
                    'title': 'book2'
                }, {
                    'title': 'book3'
                }]
            }]);
        });


        it('should include computed fields', function() {

            var projection = db.BOOKS.aggregate({
                $project: {
                    title: 1,
                    isbn: {
                        prefix: {
                            $substr: ['$isbn', 0, 3]
                        },
                        group: {
                            $substr: ['$isbn', 3, 2]
                        },
                        publisher: {
                            $substr: ['$isbn', 5, 4]
                        },
                        title: {
                            $substr: ['$isbn', 9, 3]
                        },
                        checkDigit: {
                            $substr: ['$isbn', 12, 1]
                        }
                    },
                    lastName: '$author.last',
                    copiesSold: '$copies'
                }
            }).first().value();

            expect(projection).to.deep.equal({
                '_id': 1,
                'title': 'abc123',
                'isbn': {
                    'prefix': '000',
                    'group': '11',
                    'publisher': '2222',
                    'title': '333',
                    'checkDigit': '4'
                },
                'lastName': 'zzz',
                'copiesSold': 5
            });

        });

    });

});
