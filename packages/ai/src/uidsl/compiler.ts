/**
 * UIDSL v1 Compiler - Converts UIDSL AST to Ink components
 * 
 * Transforms parsed UIDSL into React Ink components for terminal rendering
 * Handles responsive layouts, streaming updates, and component lifecycle
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { UIAst, UIComponent, UIProps } from './parser.js';
import type { Document } from 'aggo';

// Import UI renderers
import { TableRenderer } from '../ui/renderers/table.js';
import { ListRenderer } from '../ui/renderers/list.js';
import { TreeRenderer } from '../ui/renderers/tree.js';
import { StatRenderer } from '../ui/renderers/stat.js';
import { SparklineRenderer } from '../ui/renderers/sparkline.js';
import { BarRenderer } from '../ui/renderers/bar.js';
import { JsonRenderer } from '../ui/renderers/json.js';

export interface CompilerContext {
  data: Document[];
  width: number;
  height: number;
  isStreaming: boolean;
  emitInterval?: number;
}

export interface RendererProps {
  component: UIComponent;
  context: CompilerContext;
  children?: React.ReactNode;
}

export class UIDSLCompileError extends Error {
  constructor(message: string, public component?: UIComponent) {
    super(`UIDSL Compile Error: ${message}`);
    this.name = 'UIDSLCompileError';
  }
}

/**
 * JSONPath-lite evaluator for extracting data
 */
export function evaluateJSONPath(data: Document[], path: string): any[] {
  if (!path || path === '$') return data;
  
  try {
    // Simple JSONPath implementation for common cases
    if (path.startsWith('$.')) {
      const field = path.substring(2);
      if (field.includes('.')) {
        // Nested path like $.user.name
        const parts = field.split('.');
        return data.map(doc => {
          let value = doc;
          for (const part of parts) {
            value = value?.[part];
          }
          return value;
        }).filter(v => v !== undefined);
      } else {
        // Simple field like $.name
        return data.map(doc => doc[field]).filter(v => v !== undefined);
      }
    }
    
    // More complex paths would need a proper JSONPath library
    return data;
  } catch (error) {
    console.warn(`JSONPath evaluation failed for ${path}:`, error);
    return data;
  }
}

/**
 * Parse column specification for tables
 * Format: Header:path[:align[:width]]
 */
export function parseColumns(columnSpec: string) {
  return columnSpec.split('|').map(col => {
    const parts = col.split(':');
    return {
      header: parts[0] || 'Column',
      path: parts[1] || '$',
      align: (parts[2] as 'l' | 'r' | 'c') || 'l',
      width: parts[3] ? parseInt(parts[3], 10) : undefined
    };
  });
}

/**
 * Parse sort specification
 * Format: field:order (asc|desc)
 */
export function parseSort(sortSpec: string) {
  const parts = sortSpec.split(':');
  return {
    field: parts[0],
    order: (parts[1] as 'asc' | 'desc') || 'asc'
  };
}

/**
 * Responsive layout helper - decides when to flip Row/Column based on width
 */
export function getResponsiveDirection(
  direction: 'R' | 'C' | undefined,
  width: number
): 'row' | 'column' {
  if (!direction) return 'row';
  
  // Auto-flip to column when width is narrow
  if (direction === 'R' && width < 80) {
    return 'column';
  }
  
  return direction === 'R' ? 'row' : 'column';
}

/**
 * Compile individual component to Ink element
 */
export function compileComponent(
  component: UIComponent,
  context: CompilerContext
): React.ReactElement {
  const { type, props, children } = component;
  
  try {
    switch (type) {
      case 'g': // Grid container
        return React.createElement(
          Box,
          {
            key: props.i || `grid-${Math.random()}`,
            flexDirection: getResponsiveDirection(props.dr, context.width),
            gap: props.gp || 1,
          },
          children?.map((child, index) => 
            compileComponent(child, context)
          )
        );
        
      case 'tb': // Tabs container
        return React.createElement(
          'div', // Will be replaced with actual TabRenderer
          {
            key: props.i || `tabs-${Math.random()}`,
            titles: props.ti?.split(',') || ['Tab'],
          },
          children?.map((child, index) => 
            compileComponent(child, context)
          )
        );
        
      case 't': // Table
        return React.createElement(TableRenderer, {
          key: props.i || `table-${Math.random()}`,
          component,
          context
        });
        
      case 'li': // List
        return React.createElement(ListRenderer, {
          key: props.i || `list-${Math.random()}`,
          component,
          context
        });
        
      case 'tr': // Tree
        return React.createElement(TreeRenderer, {
          key: props.i || `tree-${Math.random()}`,
          component,
          context
        });
        
      case 'st': // Stat
        return React.createElement(StatRenderer, {
          key: props.i || `stat-${Math.random()}`,
          component,
          context
        });
        
      case 'sk': // Sparkline
        return React.createElement(SparklineRenderer, {
          key: props.i || `sparkline-${Math.random()}`,
          component,
          context
        });
        
      case 'br': // Bar chart
        return React.createElement(BarRenderer, {
          key: props.i || `bar-${Math.random()}`,
          component,
          context
        });
        
      case 'js': // JSON
        return React.createElement(JsonRenderer, {
          key: props.i || `json-${Math.random()}`,
          component,
          context
        });
        
      default:
        throw new UIDSLCompileError(`Unknown component type: ${type}`, component);
    }
  } catch (error) {
    // Render error component instead of crashing
    return React.createElement(
      Box,
      { 
        key: `error-${Math.random()}`,
        borderStyle: 'round',
        borderColor: 'red',
        padding: 1 
      },
      React.createElement(Text, { color: 'red' }, 
        `Error rendering ${type}: ${error instanceof Error ? error.message : error}`
      )
    );
  }
}

/**
 * Compile complete UIDSL AST to Ink component tree
 */
export function compileUIDSL(
  ast: UIAst,
  data: Document[],
  terminalDimensions: { width: number; height: number } = { width: 80, height: 24 },
  streaming: { isStreaming: boolean; emitInterval?: number } = { isStreaming: false }
): React.ReactElement {
  const context: CompilerContext = {
    data,
    width: terminalDimensions.width,
    height: terminalDimensions.height,
    isStreaming: streaming.isStreaming,
    emitInterval: streaming.emitInterval
  };
  
  try {
    return compileComponent(ast.root, context);
  } catch (error) {
    // Return safe fallback on compilation error
    return React.createElement(
      Box,
      { padding: 1 },
      React.createElement(
        Text,
        { color: 'red' },
        `UIDSL Compilation Error: ${error instanceof Error ? error.message : error}`
      ),
      React.createElement(
        Text,
        {},
        '\nFalling back to JSON view...'
      ),
      React.createElement(JsonRenderer, {
        component: {
          type: 'js',
          props: { f: '$', st: 'json' },
          position: { line: 1, column: 1 }
        },
        context
      })
    );
  }
}

/**
 * Utility to get terminal dimensions with fallback
 */
export function getTerminalDimensions() {
  return {
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24
  };
}