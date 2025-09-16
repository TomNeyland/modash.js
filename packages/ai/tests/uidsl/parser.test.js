/**
 * UIDSL Parser Tests
 * 
 * Test the parsing of UIDSL strings into AST
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { parseUIDSL, parseUIDSLSafe } from '../../src/uidsl/parser.js';

describe('UIDSL Parser', () => {
  describe('Basic parsing', () => {
    it('should parse simple table component', () => {
      const input = 'ui:v1;t(f=$,c=Name:$.name|Score:$.score:r,pg=10)';
      const result = parseUIDSL(input);
      
      expect(result.version).to.equal('v1');
      expect(result.root.type).to.equal('t');
      expect(result.root.props.f).to.equal('$');
      expect(result.root.props.c).to.equal('Name:$.name|Score:$.score:r');
      expect(result.root.props.pg).to.equal(10);
    });

    it('should parse grid container with children', () => {
      const input = 'ui:v1;g(dr=R,gp=2)[t(f=$,c=Name:$.name),st(lb=Total,v=$.count)]';
      const result = parseUIDSL(input);
      
      expect(result.root.type).to.equal('g');
      expect(result.root.props.dr).to.equal('R');
      expect(result.root.props.gp).to.equal(2);
      expect(result.root.children).to.have.length(2);
      expect(result.root.children[0].type).to.equal('t');
      expect(result.root.children[1].type).to.equal('st');
    });

    it('should parse sparkline component', () => {
      const input = 'ui:v1;sk(f=$.series,lb=Trend,v=$.value,u=req/s)';
      const result = parseUIDSL(input);
      
      expect(result.root.type).to.equal('sk');
      expect(result.root.props.lb).to.equal('Trend');
      expect(result.root.props.u).to.equal('req/s');
    });

    it('should parse JSON component with style', () => {
      const input = 'ui:v1;js(f=$,st=compact)';
      const result = parseUIDSL(input);
      
      expect(result.root.type).to.equal('js');
      expect(result.root.props.st).to.equal('compact');
    });
  });

  describe('Error handling', () => {
    it('should throw error on invalid version', () => {
      const input = 'ui:v2;t(f=$)';
      expect(() => parseUIDSL(input)).to.throw('Expected version "v1"');
    });

    it('should throw error on invalid component type', () => {
      const input = 'ui:v1;invalid(f=$)';
      expect(() => parseUIDSL(input)).to.throw('Invalid component type: invalid');
    });

    it('should throw error on malformed syntax', () => {
      const input = 'ui:v1;t(f=$,missing_value)';
      expect(() => parseUIDSL(input)).to.throw();
    });
  });

  describe('Safe parsing', () => {
    it('should return fallback on parse error', () => {
      const input = 'completely invalid';
      const result = parseUIDSLSafe(input);
      
      expect(result.version).to.equal('v1');
      expect(result.root.type).to.equal('js');
      expect(result.root.props.f).to.equal('$');
      expect(result.root.props.st).to.equal('json');
    });

    it('should return valid parse on correct input', () => {
      const input = 'ui:v1;t(f=$,c=Name:$.name)';
      const result = parseUIDSLSafe(input);
      
      expect(result.root.type).to.equal('t');
    });
  });

  describe('Complex examples', () => {
    it('should parse complex dashboard layout', () => {
      const input = 'ui:v1;g(dr=R,gp=1)[t(i=top,f=$.items,c=Endpoint:$.endpoint|p95:$.lat.p95:r,s=$.lat.p95:desc,pg=20),g(dr=C)[st(lb=Req/min,v=$.meta.rpm),sk(i=trend,f=$.meta.rpmSeries)]]';
      const result = parseUIDSL(input);
      
      expect(result.root.type).to.equal('g');
      expect(result.root.children).to.have.length(2);
      
      const table = result.root.children[0];
      expect(table.props.i).to.equal('top');
      expect(table.props.c).to.include('Endpoint:$.endpoint');
      
      const rightPanel = result.root.children[1];
      expect(rightPanel.type).to.equal('g');
      expect(rightPanel.children).to.have.length(2);
    });
  });
});