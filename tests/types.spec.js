/**
 * Tests for TypeScript utility types and type guards
 */

import { expect } from 'chai';
import {
  isFieldPath,
  isSystemVariable,
  isNonEmptyArray,
} from '../src/modash/types.ts';

describe('TypeScript Utility Types and Functions', function () {
  describe('isFieldPath', function () {
    it('should return true for field paths starting with $', function () {
      expect(isFieldPath('$field')).to.be.true;
      expect(isFieldPath('$name')).to.be.true;
      expect(isFieldPath('$nested.field')).to.be.true;
      expect(isFieldPath('$a')).to.be.true;
    });

    it('should return false for system variables starting with $$', function () {
      expect(isFieldPath('$$ROOT')).to.be.false;
      expect(isFieldPath('$$NOW')).to.be.false;
      expect(isFieldPath('$$CURRENT')).to.be.false;
    });

    it('should return false for regular strings', function () {
      expect(isFieldPath('field')).to.be.false;
      expect(isFieldPath('name')).to.be.false;
      expect(isFieldPath('')).to.be.false;
      expect(isFieldPath('regular_string')).to.be.false;
    });
  });

  describe('isSystemVariable', function () {
    it('should return true for system variables starting with $$', function () {
      expect(isSystemVariable('$$ROOT')).to.be.true;
      expect(isSystemVariable('$$NOW')).to.be.true;
      expect(isSystemVariable('$$CURRENT')).to.be.true;
      expect(isSystemVariable('$$CUSTOM')).to.be.true;
    });

    it('should return false for field paths starting with $', function () {
      expect(isSystemVariable('$field')).to.be.false;
      expect(isSystemVariable('$name')).to.be.false;
      expect(isSystemVariable('$nested.field')).to.be.false;
    });

    it('should return false for regular strings', function () {
      expect(isSystemVariable('field')).to.be.false;
      expect(isSystemVariable('name')).to.be.false;
      expect(isSystemVariable('')).to.be.false;
      expect(isSystemVariable('regular_string')).to.be.false;
    });
  });

  describe('isNonEmptyArray', function () {
    it('should return true for arrays with elements', function () {
      expect(isNonEmptyArray([1])).to.be.true;
      expect(isNonEmptyArray([1, 2, 3])).to.be.true;
      expect(isNonEmptyArray(['a', 'b'])).to.be.true;
      expect(isNonEmptyArray([{}])).to.be.true;
    });

    it('should return false for empty arrays', function () {
      expect(isNonEmptyArray([])).to.be.false;
    });

    it('should work with type inference', function () {
      const maybeEmpty = [];
      const nonEmpty = ['a', 'b'];

      if (isNonEmptyArray(maybeEmpty)) {
        // This should not be reached
        expect.fail('Empty array should not be non-empty');
      }

      if (isNonEmptyArray(nonEmpty)) {
        // This should be reached and type should be narrowed
        expect(nonEmpty[0]).to.equal('a');
      } else {
        expect.fail('Non-empty array should be non-empty');
      }
    });
  });
});
