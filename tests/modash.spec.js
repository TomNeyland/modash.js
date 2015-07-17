import Modash from '../src/modash';


describe('Modash', function() {

    it('should export aggregate as a function', function() {
        expect(Modash.aggregate).to.be.a('function');
    });

    it('should export count as a function', function() {
        expect(Modash.count).to.be.a('function');
    });

    // it('should export distinct as a function', function() {
    //     expect(Modash.distinct).to.be.a('function');
    // });

    // it('should export group as a function', function() {
    //     expect(Modash.group).to.be.a('function');
    // });

    // it('should export mapReduce as a function', function() {
    //     expect(Modash.mapReduce).to.be.a('function');
    // });

});
