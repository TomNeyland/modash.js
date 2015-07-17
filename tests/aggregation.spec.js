import _ from 'lodash';

import {
    $project, aggregate
}
from '../src/modash/aggregation';


describe('Modash Aggregation', function() {

    const sampleData = [{
        "_id": 1,
        title: "abc123",
        isbn: "0001122223334",
        author: {
            last: "zzz",
            first: "aaa"
        },
        copies: 5
    }];

    describe('$project', function() {

        it('should include the _id and city fields', function() {
            var projection = $project(sampleData, {
                _id: 1,
                city: 1,
            }).value();

            expect(projection[0]).to.deep.equal({
                '_id': '01001',
                'city': 'AGAWAM'
            });


        });

        it('should project values into subobjects', function() {
            var projection = $project(sampleData, {
                'stats': {
                    'loc': '$loc',
                    'fake': 1,
                    'locObj.lat': 1 // technically not valid...
                },
                'stats.locObj.lng': 1,
            }).first().value();

            console.log(projection[0].stats);

            expect(projection[0]).to.deep.equal({
                'stats' {
                    'fake': 'value',
                    'loc': [-72.622739, 42.070206],
                    'locObj': {
                        lat: -72.622739,
                        lng: 42.070206
                    }
                }
            });
        });

    });



});
