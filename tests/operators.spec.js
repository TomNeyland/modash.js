import _ from 'lodash';
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

        it('should compare sets', function() {

            var projection = $project(testData.experiments, {
                A: 1,
                B: 1,
                sameElements: {
                    $setEquals: ["$A", "$B"]
                },
                _id: 0
            }).value();

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

        it('should intersect sets', function() {

            var projection = $project(testData.experiments, {
                A: 1,
                B: 1,
                commonToBoth: {
                    $setIntersection: ["$A", "$B"]
                },
                _id: 0
            }).value();

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

        it('should union sets', function() {

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

        it('should difference sets', function() {

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

        it('should detect subsets', function() {

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

        it('should OR the elements of an array', function() {

            var projection = $project(testData.survey, {
                responses: 1,
                isAnyTrue: {
                    $anyElementTrue: ["$responses"]
                },
                _id: 0
            }).value();

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

        it('should AND the elements of an array', function() {

            var projection = $project(testData.survey, {
                responses: 1,
                isAllTrue: {
                    $allElementsTrue: ["$responses"]
                },
                _id: 0
            }).value();

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


describe('Modash Comparison Operator', function() {

    describe('$cmp', function() {

        it('should return -1, 0, 1 based on mongodb\'s comparison rules', function() {

            var projection = $project(testData.inventory, {
                item: 1,
                qty: 1,
                cmpTo250: {
                    $cmp: ["$qty", 250]
                },
                _id: 0
            }).value();

            expect(projection).to.deep.equal([{
                "item": "abc1",
                "qty": 300,
                "cmpTo250": 1
            }, {
                "item": "abc2",
                "qty": 200,
                "cmpTo250": -1
            }, {
                "item": "xyz1",
                "qty": 250,
                "cmpTo250": 0
            }, {
                "item": "VWZ1",
                "qty": 300,
                "cmpTo250": 1
            }, {
                "item": "VWZ2",
                "qty": 180,
                "cmpTo250": -1
            }]);

        });

    });

    describe('$eq', function() {

        it('should return compare two values for equality', function() {

            var projection = $project(testData.inventory, {
                item: 1,
                qty: 1,
                qtyEq250: {
                    $eq: ["$qty", 250]
                },
                _id: 0
            }).value();

            expect(projection).to.deep.equal([{
                "item": "abc1",
                "qty": 300,
                "qtyEq250": false
            }, {
                "item": "abc2",
                "qty": 200,
                "qtyEq250": false
            }, {
                "item": "xyz1",
                "qty": 250,
                "qtyEq250": true
            }, {
                "item": "VWZ1",
                "qty": 300,
                "qtyEq250": false
            }, {
                "item": "VWZ2",
                "qty": 180,
                "qtyEq250": false
            }]);

        });

    });

    describe('$gt', function() {

        it('should check if the first argument is greater than the second argument', function() {

            var projection = $project(testData.inventory, {
                item: 1,
                qty: 1,
                qtyGt250: {
                    $gt: ["$qty", 250]
                },
                _id: 0
            }).value();

            expect(projection).to.deep.equal([{
                "item": "abc1",
                "qty": 300,
                "qtyGt250": true
            }, {
                "item": "abc2",
                "qty": 200,
                "qtyGt250": false
            }, {
                "item": "xyz1",
                "qty": 250,
                "qtyGt250": false
            }, {
                "item": "VWZ1",
                "qty": 300,
                "qtyGt250": true
            }, {
                "item": "VWZ2",
                "qty": 180,
                "qtyGt250": false
            }]);

        });

    });

    describe('$gte', function() {

        it('should check if the first argument is greater than or equal to the second argument', function() {

            var projection = $project(testData.inventory, {
                item: 1,
                qty: 1,
                qtyGte250: {
                    $gte: ["$qty", 250]
                },
                _id: 0
            }).value();

            expect(projection).to.deep.equal([{
                "item": "abc1",
                "qty": 300,
                "qtyGte250": true
            }, {
                "item": "abc2",
                "qty": 200,
                "qtyGte250": false
            }, {
                "item": "xyz1",
                "qty": 250,
                "qtyGte250": true
            }, {
                "item": "VWZ1",
                "qty": 300,
                "qtyGte250": true
            }, {
                "item": "VWZ2",
                "qty": 180,
                "qtyGte250": false
            }]);

        });

    });

    describe('$lt', function() {

        it('should check if the first argument is less than the second argument', function() {

            var projection = $project(testData.inventory, {
                item: 1,
                qty: 1,
                qtyLt250: {
                    $lt: ["$qty", 250]
                },
                _id: 0
            }).value();

            expect(projection).to.deep.equal([{
                "item": "abc1",
                "qty": 300,
                "qtyLt250": false
            }, {
                "item": "abc2",
                "qty": 200,
                "qtyLt250": true
            }, {
                "item": "xyz1",
                "qty": 250,
                "qtyLt250": false
            }, {
                "item": "VWZ1",
                "qty": 300,
                "qtyLt250": false
            }, {
                "item": "VWZ2",
                "qty": 180,
                "qtyLt250": true
            }]);

        });

    });

    describe('$lte', function() {

        it('should check if the first argument is less than or equal to the second argument', function() {

            var projection = $project(testData.inventory, {
                item: 1,
                qty: 1,
                qtyLte250: {
                    $lte: ["$qty", 250]
                },
                _id: 0
            }).value();

            expect(projection).to.deep.equal([{
                "item": "abc1",
                "qty": 300,
                "qtyLte250": false
            }, {
                "item": "abc2",
                "qty": 200,
                "qtyLte250": true
            }, {
                "item": "xyz1",
                "qty": 250,
                "qtyLte250": true
            }, {
                "item": "VWZ1",
                "qty": 300,
                "qtyLte250": false
            }, {
                "item": "VWZ2",
                "qty": 180,
                "qtyLte250": true
            }]);

        });

    });

    describe('$ne', function() {

        it('should check if the first argument is less than or equal to the second argument', function() {

            var projection = $project(testData.inventory, {
                item: 1,
                qty: 1,
                qtyNe250: {
                    $ne: ["$qty", 250]
                },
                _id: 0
            }).value();

            expect(projection).to.deep.equal([{
                "item": "abc1",
                "qty": 300,
                "qtyNe250": true
            }, {
                "item": "abc2",
                "qty": 200,
                "qtyNe250": true
            }, {
                "item": "xyz1",
                "qty": 250,
                "qtyNe250": false
            }, {
                "item": "VWZ1",
                "qty": 300,
                "qtyNe250": true
            }, {
                "item": "VWZ2",
                "qty": 180,
                "qtyNe250": true
            }]);

        });

    });

});


describe('Modash Arithmetic Operator', function() {

    describe('$add', function() {

        it('should add all of its arguments', function() {

            var projection = $project(testData.sales, {
                item: 1,
                total: {
                    $add: ["$price", "$fee"]
                }
            }).value();

            expect(projection).to.deep.equal([{
                "_id": 1,
                "item": "abc",
                "total": 12
            }, {
                "_id": 2,
                "item": "jkl",
                "total": 21
            }, {
                "_id": 3,
                "item": "xyz",
                "total": 5
            }]);

        });

        it('should return an offset date when adding numbers and dates', function() {

            var projection = $project(testData.sales, {
                item: 1,
                billing_date: {
                    $add: ["$date", 3 * 24 * 60 * 60000]
                }
            }).value();

            expect(projection).to.deep.equal([{
                "_id": 1,
                "item": "abc",
                "billing_date": new Date("2014-03-04T08:00:00Z")
            }, {
                "_id": 2,
                "item": "jkl",
                "billing_date": new Date("2014-03-04T09:00:00Z")
            }, {
                "_id": 3,
                "item": "xyz",
                "billing_date": new Date("2014-03-18T09:00:00Z")
            }]);

        });

    });

    describe('$subtract', function() {

        it('should subtract its second argument from its first argument', function() {

            var projection = $project(testData.sales, {
                item: 1,
                total: {
                    $subtract: [{
                        $add: ["$price", "$fee"]
                    }, "$discount"]
                }
            }).value();

            expect(projection).to.deep.equal([{
                "_id": 1,
                "item": "abc",
                "total": 7
            }, {
                "_id": 2,
                "item": "jkl",
                "total": 19
            }, {
                "_id": 3,
                "item": "xyz",
                "total": 5
            }]);

        });

        it('should return an timedelta in miliseconds when subtracting two dates', function() {
            var projection = $project(testData.sales, {
                item: 1,
                dateDifference: {
                    $subtract: [new Date("2014-03-01T08:00:00Z"), "$date"]
                }
            }).value();

            expect(projection).to.deep.equal([{
                "_id": 1,
                "item": "abc",
                "dateDifference": 0
            }, {
                "_id": 2,
                "item": "jkl",
                "dateDifference": -3600000,
            }, {
                "item": 'xyz',
                "dateDifference": -1213200000,
                "_id": 3
            }]);

        });

        it('should subtact miliseconds from a date', function() {
            var projection = $project(testData.sales, {
                item: 1,
                dateDifference: {
                    $subtract: ["$date", 5 * 60 * 1000]
                }
            }).value();

            expect(projection).to.deep.equal([{
                "_id": 1,
                "item": "abc",
                "dateDifference": new Date("2014-03-01T07:55:00Z")
            }, {
                "_id": 2,
                "item": "jkl",
                "dateDifference": new Date("2014-03-01T08:55:00Z")
            }, {
                "item": 'xyz',
                "dateDifference": new Date("2014-03-15T08:55:00Z"),
                "_id": 3
            }]);

        });

    });

    describe('$multiply', function() {

        it('should multiply all of its arguments', function() {

            var projection = $project(testData.sales, {
                date: 1,
                item: 1,
                total: {
                    $multiply: ["$price", "$quantity"]
                }
            }).value();

            expect(projection).to.deep.equal([{
                "_id": 1,
                "item": "abc",
                "date": new Date("2014-03-01T08:00:00Z"),
                "total": 20
            }, {
                "_id": 2,
                "item": "jkl",
                "date": new Date("2014-03-01T09:00:00Z"),
                "total": 20
            }, {
                "_id": 3,
                "item": "xyz",
                "date": new Date("2014-03-15T09:00:00Z"),
                "total": 50
            }]);

        });

    });

    describe('$divide', function() {

        it('should divide its first argument by its second argument', function() {

            var projection = $project(testData.planning, {
                name: 1,
                workdays: {
                    $divide: ["$hours", 8]
                }
            }).value();

            expect(projection).to.deep.equal([{
                "_id": 1,
                "name": "A",
                "workdays": 10
            }, {
                "_id": 2,
                "name": "B",
                "workdays": 5
            }]);

        });

    });

    describe('$mod', function() {

        it('should divide its first argument by its second argument and return the remainder', function() {

            var projection = $project(testData.planning, {
                remainder: {
                    $mod: ["$hours", "$tasks"]
                }
            }).value();

            expect(projection).to.deep.equal([{
                "_id": 1,
                "remainder": 3
            }, {
                "_id": 2,
                "remainder": 0
            }]);

        });

    });

});
