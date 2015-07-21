export default {
    BOOKS: [{
        "_id": 1,
        title: "abc123",
        isbn: "0001122223334",
        author: {
            last: "zzz",
            first: "aaa"
        },
        copies: 5
    }],
    BOOKMARKS: [{
        _id: 1,
        user: "1234",
        stop: {
            title: "book1",
            author: "xyz",
            page: 32
        }
    }, {
        _id: 2,
        user: "7890",
        stop: [{
            title: "book2",
            author: "abc",
            page: 5
        }, {
            title: "book3",
            author: "ijk",
            page: 100
        }]
    }],
    inventory: [{
        "_id": 1,
        "item": "abc1",
        description: "product 1",
        qty: 300
    }, {
        "_id": 2,
        "item": "abc2",
        description: "product 2",
        qty: 200
    }, {
        "_id": 3,
        "item": "xyz1",
        description: "product 3",
        qty: 250
    }, {
        "_id": 4,
        "item": "VWZ1",
        description: "product 4",
        qty: 300
    }, {
        "_id": 5,
        "item": "VWZ2",
        description: "product 5",
        qty: 180
    }],
    experiments: [{
        "_id": 1,
        "A": ["red", "blue"],
        "B": ["red", "blue"]
    }, {
        "_id": 2,
        "A": ["red", "blue"],
        "B": ["blue", "red", "blue"]
    }, {
        "_id": 3,
        "A": ["red", "blue"],
        "B": ["red", "blue", "green"]
    }, {
        "_id": 4,
        "A": ["red", "blue"],
        "B": ["green", "red"]
    }, {
        "_id": 5,
        "A": ["red", "blue"],
        "B": []
    }, {
        "_id": 6,
        "A": ["red", "blue"],
        "B": [
            ["red"],
            ["blue"]
        ]
    }, {
        "_id": 7,
        "A": ["red", "blue"],
        "B": [
            ["red", "blue"]
        ]
    }, {
        "_id": 8,
        "A": [],
        "B": []
    }, {
        "_id": 9,
        "A": [],
        "B": ["red"]
    }],
    survey: [{
        "_id": 1,
        "responses": [true]
    }, {
        "_id": 2,
        "responses": [true, false]
    }, {
        "_id": 3,
        "responses": []
    }, {
        "_id": 4,
        "responses": [1, true, "seven"]
    }, {
        "_id": 5,
        "responses": [0]
    }, {
        "_id": 6,
        "responses": [
            []
        ]
    }, {
        "_id": 7,
        "responses": [
            [0]
        ]
    }, {
        "_id": 8,
        "responses": [
            [false]
        ]
    }, {
        "_id": 9,
        "responses": [null]
    }, {
        "_id": 10,
        "responses": [undefined]
    }]
};
