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
    BOOKMARKS: [
        {
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
                title: "b",
                author: "ijk",
                page: 100
            }]
        }
    ]
};
