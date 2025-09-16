import Aggo from '../src/index';
import { expect } from 'chai';

describe('Aggo Module Exports', () => {
  it('should export aggregate as a function', () => {
    expect(Aggo.aggregate).to.be.a('function');
  });

  it('should export count as a function', () => {
    expect(Aggo.count).to.be.a('function');
  });

  it('should export $group as a function', () => {
    expect(Aggo.$group).to.be.a('function');
  });

  it('should export $project as a function', () => {
    expect(Aggo.$project).to.be.a('function');
  });

  it('should export all expected functions', () => {
    // Modern approach: functions are directly available on Aggo
    expect(Aggo.aggregate).to.be.a('function');
    expect(Aggo.count).to.be.a('function');
    expect(Aggo.$group).to.be.a('function');
    expect(Aggo.$project).to.be.a('function');
    expect(Aggo.$expression).to.be.a('function');
  });
});
