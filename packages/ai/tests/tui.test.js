/**
 * TUI functionality tests
 */

import { expect } from 'chai';
import {
  evaluateJSONPath,
  formatValue,
  applyColorRules,
  getTerminalCapabilities,
  createFallbackTable,
  validateDataBinding,
} from '../src/tui-utils.js';

import { createDefaultPresentationSpec } from '../src/tui-integration.js';
import { NL2QueryAndUI } from '../src/schemas.js';

describe('TUI Utilities', function() {
  describe('evaluateJSONPath', function() {
    const testData = {
      rows: [
        { name: 'Alice', score: 85 },
        { name: 'Bob', score: 92 }
      ],
      meta: { count: 2 },
      series: { daily: [1, 2, 3] }
    };

    it('should handle root path $', function() {
      const result = evaluateJSONPath(testData, '$');
      expect(result).to.deep.equal(testData);
    });

    it('should handle simple paths like $.rows', function() {
      const result = evaluateJSONPath(testData, '$.rows');
      expect(result).to.deep.equal(testData.rows);
    });

    it('should handle nested paths like $.meta.count', function() {
      const result = evaluateJSONPath(testData, '$.meta.count');
      expect(result).to.equal(2);
    });

    it('should handle array indexing like $.rows[0]', function() {
      const result = evaluateJSONPath(testData, '$.rows[0]');
      expect(result).to.deep.equal({ name: 'Alice', score: 85 });
    });

    it('should return null for invalid paths', function() {
      const result = evaluateJSONPath(testData, '$.nonexistent.path');
      expect(result).to.be.null;
    });
  });

  describe('formatValue', function() {
    it('should format numbers with comma separators', function() {
      const result = formatValue(1234567, { number: '0,0' });
      expect(result).to.equal('1,234,567');
    });

    it('should format percentages', function() {
      const result = formatValue(0.85, { number: 'pct:1' });
      expect(result).to.equal('85.0%');
    });

    it('should truncate long strings', function() {
      const result = formatValue('This is a very long string', { truncate: 10 });
      expect(result).to.equal('This is a ...');
    });

    it('should handle null values', function() {
      const result = formatValue(null);
      expect(result).to.equal('null');
    });
  });

  describe('applyColorRules', function() {
    it('should apply color rules based on conditions', function() {
      const colorRules = [
        { when: 'value > 90', color: 'green' },
        { when: 'value > 80', color: 'yellow' },
        { when: 'value > 0', color: 'red' }
      ];

      expect(applyColorRules(95, colorRules)).to.equal('green');
      expect(applyColorRules(85, colorRules)).to.equal('yellow');
      expect(applyColorRules(50, colorRules)).to.equal('red');
    });

    it('should return default color when no rules match', function() {
      const colorRules = [{ when: 'value > 100', color: 'green' }];
      expect(applyColorRules(50, colorRules)).to.equal('white');
    });
  });

  describe('getTerminalCapabilities', function() {
    it('should detect terminal capabilities', function() {
      const caps = getTerminalCapabilities();
      expect(caps).to.have.property('hasColor');
      expect(caps).to.have.property('hasUnicode');
      expect(caps).to.have.property('width');
      expect(caps).to.have.property('height');
      expect(caps).to.have.property('isSmall');
    });
  });

  describe('createFallbackTable', function() {
    it('should create table from array data', async function() {
      const data = [
        { name: 'Alice', score: 85 },
        { name: 'Bob', score: 92 }
      ];
      const table = await createFallbackTable(data);
      expect(table).to.be.a('string');
      expect(table).to.include('Alice');
      expect(table).to.include('Bob');
    });

    it('should handle empty data', async function() {
      const table = await createFallbackTable([]);
      expect(table).to.equal('No data to display');
    });
  });

  describe('validateDataBinding', function() {
    it('should validate table widget data binding', function() {
      const widget = { kind: 'table', bind: { path: '$.rows' } };
      const data = { rows: [{ name: 'Alice' }] };
      const result = validateDataBinding(data, widget);
      expect(result.valid).to.be.true;
    });

    it('should detect invalid data binding', function() {
      const widget = { kind: 'table', bind: { path: '$.rows' } };
      const data = { rows: 'not an array' };
      const result = validateDataBinding(data, widget);
      expect(result.valid).to.be.false;
      expect(result.error).to.include('array data');
    });
  });
});

describe('TUI Integration', function() {
  describe('createDefaultPresentationSpec', function() {
    it('should create table spec for table type', function() {
      const data = [{ name: 'Alice', score: 85 }];
      const spec = createDefaultPresentationSpec('table', data);
      
      expect(spec).to.have.property('layout');
      expect(spec.layout.children).to.have.length(1);
      expect(spec.layout.children[0].kind).to.equal('table');
    });

    it('should create chart spec for chart type', function() {
      const data = [{ category: 'A', value: 10 }];
      const spec = createDefaultPresentationSpec('chart', data);
      
      expect(spec.layout.children).to.have.length(1);
      expect(spec.layout.children[0].kind).to.equal('chart.bar');
    });

    it('should create metric spec for metric type', function() {
      const data = [{ total: 100 }];
      const spec = createDefaultPresentationSpec('metric', data);
      
      expect(spec.layout.children).to.have.length(1);
      expect(spec.layout.children[0].kind).to.equal('metric');
    });
  });
});

describe('Schema Validation', function() {
  describe('NL2QueryAndUI Schema', function() {
    it('should validate complete structured output', function() {
      const validOutput = {
        intent: 'top_products_by_revenue',
        query_plan: {
          dialect: 'mongo_agg',
          pipeline: [
            { $group: { _id: '$category', total: { $sum: '$revenue' } } },
            { $sort: { total: -1 } },
            { $limit: 5 }
          ]
        },
        presentation_spec: {
          layout: {
            direction: 'row',
            children: [
              {
                id: 'main-table',
                kind: 'table',
                title: 'Top Products',
                bind: { path: '$.rows' }
              }
            ]
          }
        }
      };

      const result = NL2QueryAndUI.safeParse(validOutput);
      expect(result.success).to.be.true;
    });

    it('should reject invalid structured output', function() {
      const invalidOutput = {
        intent: 'test',
        // Missing required query_plan and presentation_spec
      };

      const result = NL2QueryAndUI.safeParse(invalidOutput);
      expect(result.success).to.be.false;
    });

    it('should validate widget types', function() {
      const validWidget = {
        id: 'test',
        kind: 'table',
        bind: { path: '$.rows' }
      };

      const invalidWidget = {
        id: 'test',
        kind: 'invalid_widget_type', // Should fail validation
        bind: { path: '$.rows' }
      };

      // Test as part of a complete spec
      const validSpec = {
        intent: 'test',
        query_plan: { dialect: 'mongo_agg', pipeline: [] },
        presentation_spec: {
          layout: {
            direction: 'row',
            children: [validWidget]
          }
        }
      };

      const invalidSpec = {
        intent: 'test',
        query_plan: { dialect: 'mongo_agg', pipeline: [] },
        presentation_spec: {
          layout: {
            direction: 'row',
            children: [invalidWidget]
          }
        }
      };

      expect(NL2QueryAndUI.safeParse(validSpec).success).to.be.true;
      expect(NL2QueryAndUI.safeParse(invalidSpec).success).to.be.false;
    });
  });
});