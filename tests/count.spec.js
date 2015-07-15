import count from '../src/count';

describe('Modash Count', function() {

    it('should report the correct size', function() {
        expect(count([1])).to.equal(1);
        expect(count([1, 2])).to.equal(2);
        expect(count([1, 2, 3])).to.equal(3);
    });

});
