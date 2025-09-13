import Modash from '../dist/index.js';
import { expect } from 'chai';

describe('Modash Module Exports', () => {
  it('should export aggregate as a function', () => {
    expect(Modash.aggregate).to.be.a('function');
  });

  it('should export count as a function', () => {
    expect(Modash.count).to.be.a('function');
  });

  it('should export $group as a function', () => {
    expect(Modash.$group).to.be.a('function');
  });

  it('should export $project as a function', () => {
    expect(Modash.$project).to.be.a('function');
  });

  it('should mix with lodash', () => {
    // Modern approach: functions are directly available on Modash
    expect(Modash.aggregate).to.be.a('function');
    expect(Modash.count).to.be.a('function');
    expect(Modash.$group).to.be.a('function');
    expect(Modash.$project).to.be.a('function');
    expect(Modash.$expression).to.be.a('function');
  });
});
