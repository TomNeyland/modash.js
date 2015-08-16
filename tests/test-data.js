export default {
    BOOKS: [{
        '_id': 1,
        title: 'abc123',
        isbn: '0001122223334',
        author: {
            last: 'zzz',
            first: 'aaa'
        },
        copies: 5
    }],
    BOOKMARKS: [{
        _id: 1,
        user: '1234',
        stop: {
            title: 'book1',
            author: 'xyz',
            page: 32
        }
    }, {
        _id: 2,
        user: '7890',
        stop: [{
            title: 'book2',
            author: 'abc',
            page: 5
        }, {
            title: 'book3',
            author: 'ijk',
            page: 100
        }]
    }],
    inventory: [{
        '_id': 1,
        'item': 'abc1',
        description: 'product 1',
        qty: 300
    }, {
        '_id': 2,
        'item': 'abc2',
        description: 'product 2',
        qty: 200
    }, {
        '_id': 3,
        'item': 'xyz1',
        description: 'product 3',
        qty: 250
    }, {
        '_id': 4,
        'item': 'VWZ1',
        description: 'product 4',
        qty: 300
    }, {
        '_id': 5,
        'item': 'VWZ2',
        description: 'product 5',
        qty: 180
    }],
    experiments: [{
        '_id': 1,
        'A': ['red', 'blue'],
        'B': ['red', 'blue']
    }, {
        '_id': 2,
        'A': ['red', 'blue'],
        'B': ['blue', 'red', 'blue']
    }, {
        '_id': 3,
        'A': ['red', 'blue'],
        'B': ['red', 'blue', 'green']
    }, {
        '_id': 4,
        'A': ['red', 'blue'],
        'B': ['green', 'red']
    }, {
        '_id': 5,
        'A': ['red', 'blue'],
        'B': []
    }, {
        '_id': 6,
        'A': ['red', 'blue'],
        'B': [
            ['red'],
            ['blue']
        ]
    }, {
        '_id': 7,
        'A': ['red', 'blue'],
        'B': [
            ['red', 'blue']
        ]
    }, {
        '_id': 8,
        'A': [],
        'B': []
    }, {
        '_id': 9,
        'A': [],
        'B': ['red']
    }],
    survey: [{
        '_id': 1,
        'responses': [true]
    }, {
        '_id': 2,
        'responses': [true, false]
    }, {
        '_id': 3,
        'responses': []
    }, {
        '_id': 4,
        'responses': [1, true, 'seven']
    }, {
        '_id': 5,
        'responses': [0]
    }, {
        '_id': 6,
        'responses': [
            []
        ]
    }, {
        '_id': 7,
        'responses': [
            [0]
        ]
    }, {
        '_id': 8,
        'responses': [
            [false]
        ]
    }, {
        '_id': 9,
        'responses': [null]
    }, {
        '_id': 10,
        'responses': [undefined]
    }],
    sales: [{
        '_id': 1,
        'item': 'abc',
        'price': 10,
        'fee': 2,
        'quantity': 2,
        'discount': 5,
        date: new Date('2014-03-01T08:00:00Z')
    }, {
        '_id': 2,
        'item': 'jkl',
        'price': 20,
        'fee': 1,
        'quantity': 1,
        'discount': 2,
        date: new Date('2014-03-01T09:00:00Z')
    }, {
        '_id': 3,
        'item': 'xyz',
        'price': 5,
        'fee': 0,
        'quantity': 10,
        'discount': 0,
        date: new Date('2014-03-15T09:00:00Z')
    }],
    sales2: [{
        '_id': 1,
        'item': 'abc',
        'price': 10,
        'quantity': 2,
        'date': new Date('2014-03-01T08:00:00Z')
    }, {
        '_id': 2,
        'item': 'jkl',
        'price': 20,
        'quantity': 1,
        'date': new Date('2014-03-01T09:00:00Z')
    }, {
        '_id': 3,
        'item': 'xyz',
        'price': 5,
        'quantity': 10,
        'date': new Date('2014-03-15T09:00:00Z')
    }, {
        '_id': 4,
        'item': 'xyz',
        'price': 5,
        'quantity': 20,
        'date': new Date('2014-04-04T11:21:39.736Z')
    }, {
        '_id': 5,
        'item': 'abc',
        'price': 10,
        'quantity': 10,
        'date': new Date('2014-04-04T21:23:13.331Z')
    }],
    planning: [{
        '_id': 1,
        'name': 'A',
        'hours': 80,
        'tasks': 7,
        'resources': 7
    }, {
        '_id': 2,
        'name': 'B',
        'hours': 40,
        'tasks': 4,
        'resources': 4
    }],
    books2: [{
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
    }, {
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
};
