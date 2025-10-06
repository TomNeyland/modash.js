/**
 * Basic TUI functionality tests
 */

import { expect } from 'chai';
import {
  validatePlan,
  Plan,
  evaluateJSONPath,
  extractArrayItems,
  interpolateTemplate,
  createTheme,
  validateUISpec
} from '../dist/index.js';

describe('AI TUI 3 Core Functionality', () => {
  
  describe('Plan Schema Validation', () => {
    it('should validate a correct plan', () => {
      const validPlan = {
        query: {
          pipeline: [{ $match: { active: true } }]
        },
        uiSpec: {
          layout: {
            type: 'table',
            id: 'test-table',
            from: '$',
            columns: [
              { header: 'Name', path: '$.name' }
            ]
          }
        }
      };

      const result = validatePlan(JSON.stringify(validPlan));
      expect(result.valid).to.be.true;
      expect(result.errors).to.be.empty;
      expect(result.plan).to.exist;
    });

    it('should reject invalid plans', () => {
      const invalidPlan = {
        query: {}, // Missing pipeline
        uiSpec: {
          layout: {
            type: 'invalid-type', // Invalid component type
            id: 'test'
          }
        }
      };

      const result = validatePlan(JSON.stringify(invalidPlan));
      expect(result.valid).to.be.false;
      expect(result.errors).to.not.be.empty;
    });
  });

  describe('JSONPath Data Binding', () => {
    const testData = {
      items: [
        { name: 'Alice', score: 95 },
        { name: 'Bob', score: 87 }
      ],
      meta: {
        total: 2,
        avg: 91
      }
    };

    it('should evaluate simple paths', () => {
      expect(evaluateJSONPath(testData, '$.meta.total')).to.equal(2);
      expect(evaluateJSONPath(testData, '$.meta.avg')).to.equal(91);
    });

    it('should extract array items', () => {
      const items = extractArrayItems(testData, '$.items');
      expect(items).to.have.length(2);
      expect(items[0].name).to.equal('Alice');
    });

    it('should handle missing paths gracefully', () => {
      expect(evaluateJSONPath(testData, '$.missing')).to.be.undefined;
      expect(extractArrayItems(testData, '$.missing')).to.be.empty;
    });

    it('should interpolate templates', () => {
      const template = '{name} scored {score} points';
      const result = interpolateTemplate(template, testData.items[0]);
      expect(result).to.equal('Alice scored 95 points');
    });
  });

  describe('Theme System', () => {
    it('should create theme with defaults', () => {
      const theme = createTheme();
      expect(theme).to.exist;
      expect(theme.getTerminalSize()).to.have.property('width');
      expect(theme.getTerminalSize()).to.have.property('height');
    });

    it('should format numbers correctly', () => {
      const theme = createTheme();
      expect(theme.formatNumber(1000)).to.equal('1.0K');
      expect(theme.formatNumber(1000000)).to.equal('1.0M');
      expect(theme.formatNumber(500)).to.equal('500');
    });

    it('should truncate text correctly', () => {
      const theme = createTheme();
      expect(theme.truncateText('Hello World', 5)).to.equal('Hell…');
      expect(theme.truncateText('Hi', 10)).to.equal('Hi');
    });
  });

  describe('UI Spec Validation', () => {
    it('should validate correct UI specs', () => {
      const validSpec = {
        layout: {
          type: 'table',
          id: 'test-table',
          from: '$.data',
          columns: [
            { header: 'Name', path: '$.name' },
            { header: 'Value', path: '$.value' }
          ]
        }
      };

      const result = validateUISpec(validSpec);
      expect(result.valid).to.be.true;
      expect(result.errors).to.be.empty;
    });

    it('should reject invalid UI specs', () => {
      const invalidSpec = {
        layout: {
          type: 'table',
          // Missing required fields
        }
      };

      const result = validateUISpec(invalidSpec);
      expect(result.valid).to.be.false;
      expect(result.errors).to.not.be.empty;
    });

    it('should validate grid components recursively', () => {
      const gridSpec = {
        layout: {
          type: 'grid',
          id: 'main-grid',
          children: [
            {
              type: 'stat',
              id: 'stat1',
              label: 'Total',
              value: '$.total'
            },
            {
              type: 'table',
              // Missing required columns
              id: 'table1',
              from: '$.data'
            }
          ]
        }
      };

      const result = validateUISpec(gridSpec);
      expect(result.valid).to.be.false;
      expect(result.errors.some(e => e.includes('columns'))).to.be.true;
    });
  });

  describe('Component Types', () => {
    it('should support all required component types', () => {
      const componentTypes = [
        'table', 'list', 'stat', 'json', 'sparkline', 'grid'
      ];

      componentTypes.forEach(type => {
        const spec = {
          layout: {
            type,
            id: `test-${type}`,
            from: '$.data',
            ...(type === 'table' ? { columns: [{ header: 'Test', path: '$.test' }] } : {}),
            ...(type === 'list' ? { template: '{name}' } : {}),
            ...(type === 'stat' ? { label: 'Test', value: '$.value' } : {}),
            ...(type === 'grid' ? { children: [] } : {})
          }
        };

        // Should not throw validation errors for supported types
        const result = validateUISpec(spec);
        if (type === 'grid') {
          // Grid with empty children is invalid, but type is recognized
          expect(result.errors.some(e => e.includes('children'))).to.be.true;
        }
      });
    });
  });
});