import { count } from '../dist/modash/count.js';
import { expect } from 'chai';

describe('Modash Count', () => {
  it('should report the correct size', () => {
    expect(count([1])).to.equal(1);
    expect(count([1, 2])).to.equal(2);
    expect(count([1, 2, 3])).to.equal(3);
  });
});
