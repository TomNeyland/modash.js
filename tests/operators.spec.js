import EXPRESSION_OPERATORS from '../src/modash/operators';
import {
    $project
}
from '../src/modash/aggregation';
import testData from './test-data';


describe('Modash Boolean Operator', function() {

    describe('$and', function() {

        it('should apply a boolean AND to its arguments', function() {

            var projection = $project(testData.inventory, {
                item: 1,
                result: {
                    $and: [{
                        $gt: ["$qty", 100]
                    }, {
                        $lt: ["$qty", 250]
                    }]
                }
            }).value();

            expect(projection).to.deep.equal([{
                "_id": 1,
                "item": "abc1",
                "result": false
            }, {
                "_id": 2,
                "item": "abc2",
                "result": true
            }, {
                "_id": 3,
                "item": "xyz1",
                "result": false
            }, {
                "_id": 4,
                "item": "VWZ1",
                "result": false
            }, {
                "_id": 5,
                "item": "VWZ2",
                "result": true
            }]);
        });

    });

    describe('$or', function() {

        it('should apply a boolean OR to its arguments', function() {

            var projection = $project(testData.inventory, {
                item: 1,
                result: {
                    $or: [{
                        $gt: ["$qty", 250]
                    }, {
                        $lt: ["$qty", 200]
                    }]
                }
            }).value();

            expect(projection).to.deep.equal([{
                "_id": 1,
                "item": "abc1",
                "result": true
            }, {
                "_id": 2,
                "item": "abc2",
                "result": false
            }, {
                "_id": 3,
                "item": "xyz1",
                "result": false
            }, {
                "_id": 4,
                "item": "VWZ1",
                "result": true
            }, {
                "_id": 5,
                "item": "VWZ2",
                "result": true
            }]);
        });

    });


    describe('$not', function() {

        it('should apply a boolean NOT to its arguments', function() {

            var projection = $project(testData.inventory, {
                item: 1,
                result: {
                    $not: [{
                        $gt: ["$qty", 250]
                    }]
                }
            }).value();

            expect(projection).to.deep.equal([{
                "_id": 1,
                "item": "abc1",
                "result": false
            }, {
                "_id": 2,
                "item": "abc2",
                "result": true
            }, {
                "_id": 3,
                "item": "xyz1",
                "result": true
            }, {
                "_id": 4,
                "item": "VWZ1",
                "result": false
            }, {
                "_id": 5,
                "item": "VWZ2",
                "result": true
            }]);
        });

    });




});



describe('Modash Set Operator', function() {

    describe('$setEquals', function() {

        it('should correctly compare sets', function() {

            var projection = $project(testData.experiments, {
                A: 1,
                B: 1,
                sameElements: {
                    $setEquals: ["$A", "$B"]
                },
                _id: 0
            }).value();

            console.log(projection[0]);

            expect(projection).to.deep.equal([{
                "A": ["red", "blue"],
                "B": ["red", "blue"],
                "sameElements": true
            }, {
                "A": ["red", "blue"],
                "B": ["blue", "red", "blue"],
                "sameElements": true
            }, {
                "A": ["red", "blue"],
                "B": ["red", "blue", "green"],
                "sameElements": false
            }, {
                "A": ["red", "blue"],
                "B": ["green", "red"],
                "sameElements": false
            }, {
                "A": ["red", "blue"],
                "B": [],
                "sameElements": false
            }, {
                "A": ["red", "blue"],
                "B": [
                    ["red"],
                    ["blue"]
                ],
                "sameElements": false
            }, {
                "A": ["red", "blue"],
                "B": [
                    ["red", "blue"]
                ],
                "sameElements": false
            }, {
                "A": [],
                "B": [],
                "sameElements": true
            }, {
                "A": [],
                "B": ["red"],
                "sameElements": false
            }]);
        });
    });

});
