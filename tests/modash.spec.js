import Modash from '../src/modash';
import _ from 'lodash';

describe('Modash Module Exports', function() {

    it('should export aggregate as a function', function() {
        expect(Modash.aggregate).to.be.a('function');
    });

    it('should export count as a function', function() {
        expect(Modash.count).to.be.a('function');
    });

    // it('should export distinct as a function', function() {
    //     expect(Modash.distinct).to.be.a('function');
    // });

    it('should export $group as a function', function() {
        expect(Modash.$group).to.be.a('function');
    });

    it('should export $project as a function', function() {
        expect(Modash.$project).to.be.a('function');
    });

    it('should mix with lodash', function(){
        _.mixin(Modash);
        _(Modash).functions().map((func) => expect(_[func]).to.be.a('function')).commit();
    });

    // it('should export mapReduce as a function', function() {
    //     expect(Modash.mapReduce).to.be.a('function');
    // });

});
