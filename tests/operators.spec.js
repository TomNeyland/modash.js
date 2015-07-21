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

            console.log(projection);

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

    describe('$setIntersection', function() {

        it('should correctly intersect sets', function() {

            var projection = $project(testData.experiments, {
                A: 1,
                B: 1,
                commonToBoth: {
                    $setIntersection: ["$A", "$B"]
                },
                _id: 0
            }).value();

            console.log(projection[0]);

            expect(projection).to.deep.equal([{
                "A": ["red", "blue"],
                "B": ["red", "blue"],
                "commonToBoth": ["blue", "red"]
            }, {
                "A": ["red", "blue"],
                "B": ["blue", "red", "blue"],
                "commonToBoth": ["blue", "red"]
            }, {
                "A": ["red", "blue"],
                "B": ["red", "blue", "green"],
                "commonToBoth": ["blue", "red"]
            }, {
                "A": ["red", "blue"],
                "B": ["green", "red"],
                "commonToBoth": ["red"]
            }, {
                "A": ["red", "blue"],
                "B": [],
                "commonToBoth": []
            }, {
                "A": ["red", "blue"],
                "B": [
                    ["red"],
                    ["blue"]
                ],
                "commonToBoth": []
            }, {
                "A": ["red", "blue"],
                "B": [
                    ["red", "blue"]
                ],
                "commonToBoth": []
            }, {
                "A": [],
                "B": [],
                "commonToBoth": []
            }, {
                "A": [],
                "B": ["red"],
                "commonToBoth": []
            }]);
        });
    });


    describe('$setUnion', function() {

        it('should correctly union sets', function() {

            var projection = $project(testData.experiments, {
                A: 1,
                B: 1,
                allValues: {
                    $setUnion: ["$A", "$B"]
                },
                _id: 0
            }).value();

            expect(projection).to.deep.equal([{
                "A": ["red", "blue"],
                "B": ["red", "blue"],
                "allValues": ["blue", "red"]
            }, {
                "A": ["red", "blue"],
                "B": ["blue", "red", "blue"],
                "allValues": ["blue", "red"]
            }, {
                "A": ["red", "blue"],
                "B": ["red", "blue", "green"],
                "allValues": ["blue", "red", "green"]
            }, {
                "A": ["red", "blue"],
                "B": ["green", "red"],
                "allValues": ["blue", "red", "green"]
            }, {
                "A": ["red", "blue"],
                "B": [],
                "allValues": ["blue", "red"]
            }, {
                "A": ["red", "blue"],
                "B": [
                    ["red"],
                    ["blue"]
                ],
                "allValues": ["blue", "red", ["red"],
                    ["blue"]
                ]
            }, {
                "A": ["red", "blue"],
                "B": [
                    ["red", "blue"]
                ],
                "allValues": ["blue", "red", ["red", "blue"]]
            }, {
                "A": [],
                "B": [],
                "allValues": []
            }, {
                "A": [],
                "B": ["red"],
                "allValues": ["red"]
            }]);
        });
    });


    describe('$setDifference', function() {

        it('should correctly difference sets', function() {

            var projection = $project(testData.experiments, {
                A: 1,
                B: 1,
                inBOnly: {
                    $setDifference: ["$B", "$A"]
                },
                _id: 0
            }).value();

            expect(projection).to.deep.equal([{
                "A": ["red", "blue"],
                "B": ["red", "blue"],
                "inBOnly": []
            }, {
                "A": ["red", "blue"],
                "B": ["blue", "red", "blue"],
                "inBOnly": []
            }, {
                "A": ["red", "blue"],
                "B": ["red", "blue", "green"],
                "inBOnly": ["green"]
            }, {
                "A": ["red", "blue"],
                "B": ["green", "red"],
                "inBOnly": ["green"]
            }, {
                "A": ["red", "blue"],
                "B": [],
                "inBOnly": []
            }, {
                "A": ["red", "blue"],
                "B": [
                    ["red"],
                    ["blue"]
                ],
                "inBOnly": [
                    ["red"],
                    ["blue"]
                ]
            }, {
                "A": ["red", "blue"],
                "B": [
                    ["red", "blue"]
                ],
                "inBOnly": [
                    ["red", "blue"]
                ]
            }, {
                "A": [],
                "B": [],
                "inBOnly": []
            }, {
                "A": [],
                "B": ["red"],
                "inBOnly": ["red"]
            }]);
        });
    });


    describe('$setIsSubset', function() {

        it('should correctly detect subsets', function() {

            var projection = $project(testData.experiments, {
                A: 1,
                B: 1,
                AisSubset: {
                    $setIsSubset: ["$A", "$B"]
                },
                _id: 0
            }).value();

            expect(projection).to.deep.equal([{
                "A": ["red", "blue"],
                "B": ["red", "blue"],
                "AisSubset": true
            }, {
                "A": ["red", "blue"],
                "B": ["blue", "red", "blue"],
                "AisSubset": true
            }, {
                "A": ["red", "blue"],
                "B": ["red", "blue", "green"],
                "AisSubset": true
            }, {
                "A": ["red", "blue"],
                "B": ["green", "red"],
                "AisSubset": false
            }, {
                "A": ["red", "blue"],
                "B": [],
                "AisSubset": false
            }, {
                "A": ["red", "blue"],
                "B": [
                    ["red"],
                    ["blue"]
                ],
                "AisSubset": false
            }, {
                "A": ["red", "blue"],
                "B": [
                    ["red", "blue"]
                ],
                "AisSubset": false
            }, {
                "A": [],
                "B": [],
                "AisSubset": true
            }, {
                "A": [],
                "B": ["red"],
                "AisSubset": true
            }]);
        });
    });


    describe('$anyElementTrue', function() {

        it('should correctly OR the elements of an array', function() {

            var projection = $project(testData.survey, {
                responses: 1,
                isAnyTrue: {
                    $anyElementTrue: ["$responses"]
                },
                _id: 0
            }).value();

            console.log(projection);

            expect(projection).to.deep.equal([{
                "responses": [true],
                "isAnyTrue": true
            }, {
                "responses": [true, false],
                "isAnyTrue": true
            }, {
                "responses": [],
                "isAnyTrue": false
            }, {
                "responses": [1, true, "seven"],
                "isAnyTrue": true
            }, {
                "responses": [0],
                "isAnyTrue": false
            }, {
                "responses": [
                    []
                ],
                "isAnyTrue": true
            }, {
                "responses": [
                    [0]
                ],
                "isAnyTrue": true
            }, {
                "responses": [
                    [false]
                ],
                "isAnyTrue": true
            }, {
                "responses": [null],
                "isAnyTrue": false
            }, {
                "responses": [undefined],
                "isAnyTrue": false
            }]);
        });
    });

    describe('$allElementsTrue', function() {

        it('should correctly AND the elements of an array', function() {

            var projection = $project(testData.survey, {
                responses: 1,
                isAllTrue: {
                    $allElementsTrue: ["$responses"]
                },
                _id: 0
            }).value();

            console.log(projection);

            expect(projection).to.deep.equal([{
                "responses": [true],
                "isAllTrue": true
            }, {
                "responses": [true, false],
                "isAllTrue": false
            }, {
                "responses": [],
                "isAllTrue": true
            }, {
                "responses": [1, true, "seven"],
                "isAllTrue": true
            }, {
                "responses": [0],
                "isAllTrue": false
            }, {
                "responses": [
                    []
                ],
                "isAllTrue": true
            }, {
                "responses": [
                    [0]
                ],
                "isAllTrue": true
            }, {
                "responses": [
                    [false]
                ],
                "isAllTrue": true
            }, {
                "responses": [null],
                "isAllTrue": false
            }, {
                "responses": [undefined],
                "isAllTrue": false
            }]);
        });
    });

});
