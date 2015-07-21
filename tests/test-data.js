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
    }]
};
